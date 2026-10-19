/**
 * [Why/Intent] APIキー未設定やネットワークエラー時に理由を表示し、再試行ボタンを提供するエラー画面。
 */
import React from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * エラー表示文言および再試行コールバックを受け取る。
 */
interface ErrorStateViewProps {
  /** [Why/Intent] 発生したエラーメッセージ */
  errorMessage?: string;
  /** [Why/Intent] セッション再開を試行するコールバック */
  onRetry: () => void;
}

/**
 * [Why/Intent] エラーメッセージと再試行ボタンを描画する。
 */
export const ErrorStateView: React.FC<ErrorStateViewProps> = ({ errorMessage, onRetry }) => {
  return (
    <div style={{ padding: '20px', color: 'var(--vscode-errorForeground)' }}>
      <h3 style={{ margin: 0, marginBottom: '8px' }}>⚠️ AI見守りサービス エラー</h3>
      <p>{errorMessage}</p>
      <button onClick={onRetry} style={{ padding: '6px 14px', cursor: 'pointer' }}>
        🔄 再試行
      </button>
    </div>
  );
};
