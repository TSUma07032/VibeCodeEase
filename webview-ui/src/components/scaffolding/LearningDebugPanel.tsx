/**
 * [Why/Intent] 開発者および教育者向けに、AIの裏側の予測完成形・進捗計算内訳・停滞判定メトリクスを可視化する。
 */
import React from 'react';
import type { LearningSessionState } from '../../types';

/**
 * [Why/Intent] App.tsx から LearningDebugPanel へ授受されるProps定義。
 * AI推論デバッグインスペクタに表示するためのセッション状態とvscode通信ラッパーを受け取る。
 */
export interface LearningDebugPanelProps {
  /** [Why/Intent] 表示対象の学習支援セッション最新状態 (未開始時はnull) */
  state: LearningSessionState | null;
  /** [Why/Intent] Extension側とのIPC通信オブジェクト */
  vscode: { postMessage: (msg: unknown) => void };
}

/**
 * [Why/Intent] AI推論デバッグインスペクタ画面を描画する。
 */
export const LearningDebugPanel: React.FC<LearningDebugPanelProps> = ({ state }) => {
  if (!state || state.status === 'empty' || !state.latestPrediction) {
    return (
      <div style={{ padding: '20px', color: 'var(--vscode-descriptionForeground)' }}>
        🐞 AI推論デバッグインスペクタ
        <p>
          ℹ️ 現在アクティブな学習セッション、またはAI推論結果が存在しません。「🎓 学習支援」タブからセッションを開始してください。
        </p>
      </div>
    );
  }

  const { latestPrediction, assessment, snoozeUntilTimestamp, lastUpdatedTimestamp, history } = state;
  const isSnoozed =
    snoozeUntilTimestamp !== null && snoozeUntilTimestamp >= lastUpdatedTimestamp;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
      <div style={{ borderBottom: '1px solid var(--vscode-widget-border)', paddingBottom: '8px' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '14px' }}>🐞 AI推論デバッグインスペクタ (Debug Inspector)</h3>
        <div>セッションID: {state.taskId}</div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>📊 AIの計算結果・メトリクス</div>
        <div>・推定進捗度: {latestPrediction.estimatedProgress}% (エラー減点: {latestPrediction.diagnosticPenalty}%)</div>
        <div>・停滞判定: {assessment.reason} (確信度: {assessment.confidence})</div>
        <div>・スヌーズ状態: {isSnoozed ? 'スヌーズ中' : 'なし (アクティブ)'}</div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>【マイルストーン達成状況】</div>
        {latestPrediction.milestones.map((m) => (
          <div key={m.id}>
            [{m.status === 'COMPLETED' ? '✓' : m.status === 'IN_PROGRESS' ? '~' : ' '}] {m.title} ({m.weight}%) - {m.status}
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>【直近の進捗履歴】</div>
        {history.map((h, i) => (
          <div key={h.timestamp}>
            #{i + 1}: {h.estimatedProgress}pt | {h.codeHash} | Diags: {h.diagnosticsCount}
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>🧠 AIが予想した完成形コード</div>
        <pre
          style={{
            margin: 0,
            padding: '8px',
            backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
            border: '1px solid var(--vscode-widget-border)',
            overflowX: 'auto',
          }}
        >
          {latestPrediction.predictedCompleteCode}
        </pre>
      </div>
    </div>
  );
};
