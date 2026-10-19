/**
 * [Why/Intent] 学習者の停滞を検知した際に非侵入的なバナーを表示し、ヒント要求・スヌーズ・非表示を選択させる。
 */
import React from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * 停滞通知バナーのアクション（ヒント要求・スヌーズ・非表示）ハンドラを受け取る。
 */
interface StagnationAlertBannerProps {
  /** [Why/Intent] ヒント表示を要求するコールバック */
  onRequestHint: () => void;
  /** [Why/Intent] 指定分数のスヌーズ待機を要求するコールバック */
  onSnooze: (minutes: number) => void;
  /** [Why/Intent] 今日の通知を不要として非表示にするコールバック */
  onDismiss: () => void;
}

/**
 * [Why/Intent] 停滞通知バナーとアクションボタン群（ヒントを見る・自力で続ける・今日は不要）を描画する。
 */
export const StagnationAlertBanner: React.FC<StagnationAlertBannerProps> = ({
  onRequestHint, onSnooze, onDismiss,
}) => {
  return (
    <div
      style={{
        margin: '12px 16px',
        padding: '12px',
        backgroundColor: 'var(--vscode-inputValidation-warningBackground, #3a2e00)',
        border: '1px solid var(--vscode-inputValidation-warningBorder, #b89500)',
        borderRadius: '4px',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
        💡 少し手が止まっているようです。ヒントを活用してみませんか？
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--vscode-descriptionForeground)',
          marginBottom: '10px',
        }}
      >
        あなたのペースで学習を進められます。
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={onRequestHint}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: 'var(--vscode-button-background, #0e639c)',
            color: 'var(--vscode-button-foreground, #ffffff)',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          💡 ヒントを見る
        </button>
        <button
          onClick={() => onSnooze(3)}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: 'var(--vscode-button-secondaryBackground, #3a3d41)',
            color: 'var(--vscode-button-secondaryForeground, #ffffff)',
            border: 'none',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          ⏳ 自力で続ける (3分)
        </button>
        <button
          onClick={onDismiss}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: 'transparent',
            color: 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-button-secondaryBackground, #3a3d41)',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          ✕ 今日は不要
        </button>
      </div>
    </div>
  );
};
