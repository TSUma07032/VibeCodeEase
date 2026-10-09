/**
 * [Why/Intent] 拡張機能のWebviewパネル上部に表示するタブナビゲーションコンポーネント。
 * App.tsx の肥大化を防ぎ、タブ切り替えロジックとスタイルを分離するために独立したコンポーネントとして定義する。
 */
import React from 'react';

/**
 * [Why/Intent] TabBarが受け取るプロパティ。
 * - activeTab: 現在選択されているタブの状態。UIのハイライト表示に使用する。
 * - onTabChange: タブがクリックされた際に親コンポーネント(App)に状態変更を通知するコールバック。
 */
interface TabBarProps {
  activeTab: 'code' | 'settings';
  onTabChange: (tab: 'code' | 'settings') => void;
}

/**
 * [Why/Intent] Code表示とSettings表示を切り替えるためのUIを提供する。
 */
export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div style={{ 
      display: 'flex', 
      backgroundColor: 'var(--vscode-editorGroupHeader-tabsBackground)',
      borderBottom: '1px solid var(--vscode-editorGroupHeader-tabsBorder)'
    }}>
      <button 
        onClick={() => onTabChange('code')}
        style={{
          padding: '8px 16px',
          backgroundColor: activeTab === 'code' ? 'var(--vscode-tab-activeBackground)' : 'transparent',
          color: activeTab === 'code' ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)',
          border: 'none',
          borderTop: activeTab === 'code' ? '1px solid var(--vscode-tab-activeBorderTop)' : '1px solid transparent',
          cursor: 'pointer',
          outline: 'none'
        }}
      >
        [💻 Code]
      </button>
      <button 
        onClick={() => onTabChange('settings')}
        style={{
          padding: '8px 16px',
          backgroundColor: activeTab === 'settings' ? 'var(--vscode-tab-activeBackground)' : 'transparent',
          color: activeTab === 'settings' ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)',
          border: 'none',
          borderTop: activeTab === 'settings' ? '1px solid var(--vscode-tab-activeBorderTop)' : '1px solid transparent',
          cursor: 'pointer',
          outline: 'none'
        }}
      >
        [⚙️ Settings]
      </button>
    </div>
  );
};
