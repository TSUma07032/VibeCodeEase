/**
 * [Why/Intent] セッション未開始時に課題と学習目標を入力させ、見守り学習を開始するEmpty画面。
 */
import React, { useState } from 'react';

/**
 * [Why/Intent] 親コンポーネント LearningScaffoldingPanel から授受されるProps定義。
 * ユーザーが入力した課題・学習目標を受け取り、セッション開始を発火するコールバックを保持する。
 */
interface EmptyStateViewProps {
  /** [Why/Intent] 課題と学習目標を渡してセッション開始を通知するコールバック */
  onStartSession: (task: string, goal: string) => void;
}

/**
 * [Why/Intent] 課題・学習目標の入力フォームと開始ボタンを描画する。
 */
export const EmptyStateView: React.FC<EmptyStateViewProps> = ({ onStartSession }) => {
  const [task, setTask] = useState('');
  const [goal, setGoal] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartSession(task, goal);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '15px' }}>🎯 学習セッションの開始</h3>
      <div>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
          課題 (何を作りますか？):
        </label>
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="例: Reactでカスタムフックを使ったカウンターコンポーネント"
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          required
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
          学習目標 (何を理解したいですか？):
        </label>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="例: useEffectのクリーンアップ関数の挙動を理解する"
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          required
        />
      </div>
      <button
        type="submit"
        style={{
          padding: '10px 16px',
          backgroundColor: 'var(--vscode-button-background, #0e639c)',
          color: 'var(--vscode-button-foreground, #ffffff)',
          border: 'none',
          borderRadius: '2px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        🚀 見守り学習を開始する
      </button>
      <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
        ℹ️ 学習中はAIが勝手にコードを書き換えることはありません。行き詰まったときだけ段階的ヒントを得られます。
      </div>
    </form>
  );
};
