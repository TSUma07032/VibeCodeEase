/**
 * [Why/Intent] AI完成形予想図の準備中に表示するローディング画面。安全にセッション終了が可能。
 */
import React from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * ローディング中のセッション中断コールバックを保持する。
 */
interface LoadingStateViewProps {
  /** [Why/Intent] セッション停止を通知するコールバック */
  onStopSession: () => void;
}

/**
 * [Why/Intent] 準備中メッセージとセッション終了ボタンを描画する。
 */
export const LoadingStateView: React.FC<LoadingStateViewProps> = ({ onStopSession }) => {
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>🎯 学習セッション: 準備中</h3>
        <button onClick={onStopSession} style={{ padding: '4px 8px', cursor: 'pointer' }}>
          🔄 セッション終了
        </button>
      </div>
      <div>⏳ AIがあなたのコードから完成形の予想図を準備しています...</div>
    </div>
  );
};
