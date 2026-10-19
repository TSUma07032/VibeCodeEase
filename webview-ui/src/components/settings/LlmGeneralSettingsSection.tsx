/**
 * [Why/Intent] 既存の全般・推敲設定（APIキー・モデル・推敲レベル・頻度・手動実行）のUIを提供するセクションコンポーネント。
 */
import React, { useState } from 'react';
import type { AiInterventionLevel } from '../../types';
import { vscode } from '../../utils/vscode';

const GEMINI_MODELS = [
  'gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.8-live-extended-thinking',
  'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'
];

/**
 * [Why/Intent] 親コンポーネント SettingsPanel から授受されるProps定義。
 * 推敲用APIキー有無、介入レベル、同期頻度、インターバル秒数、モデル設定、および各種更新ハンドラを受け取る。
 */
export interface LlmGeneralSettingsSectionProps {
  /** [Why/Intent] 実キーを秘匿したAPIキー設定有無フラグ */
  hasApiKey: boolean;
  /** [Why/Intent] マスク表示用の既存キー文字長 */
  apiKeyLength?: number;
  /** [Why/Intent] 自動推敲の介入レベル */
  aiInterventionLevel: AiInterventionLevel;
  /** [Why/Intent] 自動推敲の実行トリガーモード */
  frequency: 'manual' | 'onSave' | 'interval';
  /** [Why/Intent] 定期同期間隔（秒） */
  intervalSeconds: number;
  /** [Why/Intent] 推敲用Geminiモデル名 */
  model: string;
  /** [Why/Intent] APIキー更新ハンドラ */
  onUpdateApiKey: (key: string) => void;
  /** [Why/Intent] 介入レベル更新ハンドラ */
  onUpdateLevel: (level: AiInterventionLevel) => void;
  /** [Why/Intent] 手動推敲の即時実行ハンドラ */
  onForceAnalyze: () => void;
}

/** [Why/Intent] LLM全般設定セクションの実装 */
export const LlmGeneralSettingsSection: React.FC<LlmGeneralSettingsSectionProps> = ({
  hasApiKey, apiKeyLength = 0, aiInterventionLevel, frequency, intervalSeconds, model,
  onUpdateApiKey, onUpdateLevel, onForceAnalyze,
}) => {
  const mask = hasApiKey && apiKeyLength > 0 ? '*'.repeat(apiKeyLength) : '********';
  const [editedApiKey, setEditedApiKey] = useState<string | null>(null);
  const [editedInterval, setEditedInterval] = useState<number | null>(null);
  const [editedModel, setEditedModel] = useState<string | null>(null);

  const apiKeyInput = editedApiKey !== null ? editedApiKey : (hasApiKey ? mask : '');
  const localInterval = editedInterval ?? intervalSeconds;
  const localModel = editedModel ?? model;

  const send = (f: typeof frequency, i: number, m: string) => {
    vscode.postMessage({ command: 'update_llm_config', frequency: f, intervalSeconds: i, model: m });
  };

  const handleApiKeyBlur = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setEditedApiKey(null);
      return;
    }
    if (apiKeyInput !== mask) {
      onUpdateApiKey(trimmed);
    }
    setEditedApiKey(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h4 style={{ margin: '0 0 4px 0' }}>API Key</h4>
        <input
          type="password" placeholder={hasApiKey ? mask : 'Enter API Key'} value={apiKeyInput}
          onChange={(e) => setEditedApiKey(e.target.value)}
          onFocus={() => { if (apiKeyInput === mask) setEditedApiKey(''); }}
          onBlur={handleApiKeyBlur}
          style={{ width: '100%', padding: '6px' }}
        />
        {hasApiKey && <div style={{ marginTop: '2px', color: 'var(--vscode-charts-green)', fontSize: '11px' }}>✅ APIキー設定済み</div>}
      </div>

      <div>
        <h4 style={{ margin: '0 0 4px 0' }}>AI Intervention Level</h4>
        <select value={aiInterventionLevel} onChange={(e) => onUpdateLevel(e.target.value as AiInterventionLevel)} style={{ width: '100%', padding: '6px' }}>
          <option value="Level 1 (Typo/Bug Fix)">Level 1 (Typo/Bug Fix)</option>
          <option value="Level 2 (Refactoring)">Level 2 (Refactoring)</option>
          <option value="Level 3 (Architecture Optimization)">Level 3 (Architecture Optimization)</option>
        </select>
      </div>

      <div>
        <h4 style={{ margin: '0 0 4px 0' }}>Model</h4>
        <select value={localModel} onChange={(e) => { setEditedModel(e.target.value); send(frequency, localInterval, e.target.value); }} style={{ width: '100%', padding: '6px' }}>
          {GEMINI_MODELS.map((m) => (<option key={m} value={m}>{m}</option>))}
        </select>
      </div>

      <div>
        <h4 style={{ margin: '0 0 4px 0' }}>Sync Frequency</h4>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(['manual', 'onSave', 'interval'] as const).map((freq) => (
            <label key={freq} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="radio" name="frequency" value={freq} checked={frequency === freq} onChange={() => send(freq, localInterval, localModel)} />
              {freq === 'manual' ? 'Manual' : freq === 'onSave' ? 'On Save' : 'Interval'}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 4px 0' }}>Interval (Seconds)</h4>
        <input type="number" value={localInterval} onChange={(e) => setEditedInterval(Number(e.target.value))} onBlur={() => send(frequency, localInterval, localModel)} style={{ width: '100%', padding: '6px' }} />
      </div>

      <div>
        <button onClick={onForceAnalyze} style={{ padding: '8px 16px', background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', cursor: 'pointer' }}>
          🚀 今すぐコードを推敲する (Analyze Now)
        </button>
      </div>
    </div>
  );
};
