/**
 * [Why/Intent] 拡張機能のWebviewパネル上部に表示するタブナビゲーションコンポーネント。
 * App.tsx の肥大化を防ぎ、タブ切り替えロジックとスタイルを分離するために独立したコンポーネントとして定義する。
 */
import React from 'react';

/** [Why/Intent] Webview内で切り替え可能なタブ種別のユニオン型定義 */
export type TabType = 'code' | 'settings' | 'dashboard' | 'learning' | 'learning-debug';

/**
 * [Why/Intent] TabBarが受け取るプロパティ。
 * - activeTab: 現在選択されているタブの状態。UIのハイライト表示に使用する。
 * - onTabChange: タブがクリックされた際に親コンポーネント(App)に状態変更を通知するコールバック。
 */
interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

/**
 * [Why/Intent] 各タブボタンのインラインスタイルを生成するヘルパー
 */
function getTabStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    backgroundColor: isActive ? 'var(--vscode-tab-activeBackground)' : 'transparent',
    color: isActive ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)',
    border: 'none',
    borderTop: isActive ? '1px solid var(--vscode-tab-activeBorderTop)' : '1px solid transparent',
    cursor: 'pointer',
    outline: 'none',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  };
}

/**
 * [Why/Intent] Code、Settings、Dashboard、学習支援、AI推論デバッグを切り替えるためのUIを提供する。
 */
export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: 'var(--vscode-editorGroupHeader-tabsBackground)',
        borderBottom: '1px solid var(--vscode-editorGroupHeader-tabsBorder)',
        overflowX: 'auto',
      }}
    >
      <button onClick={() => onTabChange('code')} style={getTabStyle(activeTab === 'code')}>
        [💻 Code]
      </button>
      <button onClick={() => onTabChange('learning')} style={getTabStyle(activeTab === 'learning')}>
        [🎓 学習支援]
      </button>
      <button onClick={() => onTabChange('dashboard')} style={getTabStyle(activeTab === 'dashboard')}>
        [📊 Dashboard]
      </button>
      <button onClick={() => onTabChange('settings')} style={getTabStyle(activeTab === 'settings')}>
        [⚙️ Settings]
      </button>
      <button
        onClick={() => onTabChange('learning-debug')}
        style={getTabStyle(activeTab === 'learning-debug')}
      >
        [🐞 AI推論デバッグ]
      </button>
    </div>
  );
};
