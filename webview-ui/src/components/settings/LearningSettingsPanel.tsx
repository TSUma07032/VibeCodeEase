/**
 * [Why/Intent] 学習支援設定のメインコンテナ。IPC同期、4状態管理、バリデーション制御を担う。
 */
import React, { useState, useEffect } from 'react';
import type { UserLearningConfig } from '../../types';
import { vscode as defaultVscode } from '../../utils/vscode';
import { BehaviorSettingsSection } from './BehaviorSettingsSection';
import { StagnationSettingsSection } from './StagnationSettingsSection';
import { TimingSettingsSection } from './TimingSettingsSection';

/** [Why/Intent] リアルタイム入力検証ルール */
function validate(f: string, v: number): string | undefined {
  if (!Number.isFinite(v)) return '⚠️ 有効な数値を入力してください';
  if (f === 'intervalSeconds' && (v < 10 || v > 300)) return '⚠️ 10秒〜300秒の範囲で指定してください (Gemini無料枠保護)';
  if (f === 'debounceSeconds' && (v < 2 || v > 15)) return '⚠️ 2秒〜15秒の範囲で指定してください';
  if (f === 'thresholdN' && (v < 2 || v > 10)) return '⚠️ 2回〜10回の範囲で指定してください';
  if (f === 'deltaThreshold' && (v < 1 || v > 20)) return '⚠️ 1%〜20%の範囲で指定してください';
  return undefined;
}

/**
 * [Why/Intent] 親コンポーネント SettingsPanel から授受されるProps定義。
 * テスト時のモック注入やVS Code通信ラッパーの差し替えを可能にする。
 */
export interface LearningSettingsPanelProps {
  /** [Why/Intent] postMessage機能を提供するVS Code API通信オブジェクト（テスト注入可能） */
  vscode?: { postMessage: (msg: unknown) => void };
}

/** [Why/Intent] 学習支援設定親コンポーネント */
export const LearningSettingsPanel: React.FC<LearningSettingsPanelProps> = ({ vscode = defaultVscode }) => {
  const [config, setConfig] = useState<UserLearningConfig | null>(null);
  const [debounceSec, setDebounceSec] = useState(5);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusState, setStatusState] = useState<'idle' | 'saving' | 'saved' | 'save_error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    vscode.postMessage({ type: 'REQUEST_LEARNING_CONFIG' });
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'SYNC_LEARNING_CONFIG') {
        setConfig(d.payload);
        setDebounceSec(Math.round(d.payload.debounceMs / 1000));
        setErrors({});
      } else if (d.type === 'NOTIFY_CONFIG_SAVED') {
        setStatusState(d.payload.success ? 'saved' : 'save_error');
        setStatusMsg(d.payload.message || (d.payload.success ? '設定を保存しました' : '保存失敗'));
        if (d.payload.success) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setStatusState('idle'), 3000);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('message', onMsg);
      if (timer) clearTimeout(timer);
    };
  }, [vscode]);

  if (!config) return <div data-testid="settings-skeleton" style={{ padding: '16px' }}>⏳ 学習支援設定を読み込んでいます...</div>;

  const hasErr = Object.keys(errors).length > 0;
  const updateErr = (k: string, err?: string) => setErrors((prev) => {
    const next = { ...prev };
    if (err) next[k] = err; else delete next[k];
    return next;
  });

  const onTiming = (f: 'intervalSeconds' | 'debounceSeconds', v: number) => {
    updateErr(f, validate(f, v));
    if (f === 'intervalSeconds') setConfig({ ...config, intervalSeconds: v });
    else setDebounceSec(v);
  };
  const onStag = (f: 'thresholdN' | 'deltaThreshold', v: number) => {
    updateErr(f, validate(f, v));
    if (f === 'thresholdN') setConfig({ ...config, stagnationThresholdN: v });
    else setConfig({ ...config, progressDeltaThreshold: v });
  };
  const onBehav = (f: 'snoozeMinutes' | 'defaultDisclosureMode' | 'pauseExistingAnalysis', v: unknown) => {
    if (f === 'snoozeMinutes') setConfig({ ...config, snoozeMinutes: v as number });
    else if (f === 'defaultDisclosureMode') setConfig({ ...config, defaultDisclosureMode: v as 'stepByStep' | 'direct' });
    else setConfig({ ...config, pauseExistingAnalysisDuringLearning: Boolean(v) });
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ margin: 0 }}>🎓 学習支援システム設定 (Learning Assistance Settings)</h3>
      <TimingSettingsSection intervalSeconds={config.intervalSeconds} debounceSeconds={debounceSec} errors={errors} onChange={onTiming} />
      <StagnationSettingsSection thresholdN={config.stagnationThresholdN} deltaThreshold={config.progressDeltaThreshold} errors={errors} onChange={onStag} />
      <BehaviorSettingsSection snoozeMinutes={config.snoozeMinutes} defaultDisclosureMode={config.defaultDisclosureMode} pauseExistingAnalysis={config.pauseExistingAnalysisDuringLearning} onChange={onBehav} />
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={() => { setStatusState('saving'); vscode.postMessage({ type: 'UPDATE_LEARNING_CONFIG', payload: { ...config, debounceMs: debounceSec * 1000 } }); }} disabled={hasErr || statusState === 'saving'} style={{ padding: '8px 16px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}>💾 設定を保存する</button>
        <button onClick={() => vscode.postMessage({ type: 'RESET_LEARNING_CONFIG' })} disabled={statusState === 'saving'} style={{ padding: '8px 16px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}>🔄 デフォルト設定に戻す</button>
      </div>
      <div style={{ fontSize: '13px', color: hasErr || statusState === 'save_error' ? 'var(--vscode-errorForeground, #f48771)' : statusState === 'saved' ? 'var(--vscode-testing-iconPassed, #73c991)' : 'var(--vscode-descriptionForeground)' }}>
        状態: {hasErr ? '⚠️ 入力内容にエラーがあります。修正してください。' : statusState === 'saving' ? '⏳ 設定をストレージに書き込んでいます...' : statusState === 'save_error' ? `⚠️ ${statusMsg}` : statusState === 'saved' ? `✅ ${statusMsg}` : '✅ 設定は保存されています'}
      </div>
    </div>
  );
};
