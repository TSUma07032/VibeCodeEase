/**
 * [Why/Intent] 課題名・学習目標・進捗率バー・見守り状態を表示するセッションヘッダーコンポーネント。
 */
import React, { useState } from 'react';
import type { MilestoneTask } from '../../types';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * 課題情報、学習目標、推定進捗スコア、マイルストーン一覧、およびセッション終了コールバックを受け取る。
 */
interface SessionHeaderProps {
  /** [Why/Intent] 学習課題の説明文 */
  taskDescription: string;
  /** [Why/Intent] ユーザーが理解したい学習目標 */
  learningGoal: string;
  /** [Why/Intent] 推定進捗スコア (0-100%) */
  progress: number;
  /** [Why/Intent] マイルストーン評価タスク一覧 */
  milestones?: MilestoneTask[];
  /** [Why/Intent] セッション停止通知コールバック */
  onStopSession: () => void;
}

const stopBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '11px',
  backgroundColor: 'transparent',
  color: 'var(--vscode-errorForeground, #f48771)',
  border: '1px solid var(--vscode-errorForeground, #f48771)',
  borderRadius: '3px',
  cursor: 'pointer',
};

/**
 * [Why/Intent] 課題、目標、進捗率、セッション終了ボタンを描画する。
 */
export const SessionHeader: React.FC<SessionHeaderProps> = ({
  taskDescription,
  learningGoal,
  progress,
  milestones = [],
  onStopSession,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const completedCount = milestones.filter((m) => m.status === 'COMPLETED').length;
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div style={{ padding: '12px 16px', backgroundColor: 'var(--vscode-sideBar-background)', borderBottom: '1px solid var(--vscode-sideBar-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>🟢 見守り中</span>
          <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
            ({completedCount}/{milestones.length} 完了)
          </span>
        </div>
        <button onClick={onStopSession} style={stopBtnStyle}>🔄 セッション終了</button>
      </div>

      <div style={{ marginTop: '8px' }}>
        <div onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
          🎯 課題: {taskDescription} {isOpen ? '▲' : '▼'}
        </div>
        {isOpen && (
          <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginTop: '4px', paddingLeft: '12px' }}>
            目標: {learningGoal}
          </div>
        )}
      </div>

      <div style={{ marginTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
          <span>進捗度</span>
          <span>{clampedProgress}%</span>
        </div>
        <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--vscode-progressBar-background, #333)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${clampedProgress}%`, backgroundColor: 'var(--vscode-button-background, #0e639c)', transition: 'width 0.3s ease' }} />
        </div>
      </div>
    </div>
  );
};
