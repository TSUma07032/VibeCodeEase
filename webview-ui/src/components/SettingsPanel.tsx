/**
 * [Why/Intent] WebviewのSettingsタブに表示するコンポーネント。
 * APIキーの入力、AI推敲レベルの選択、手動推敲実行のUIを提供する責務を持つ。
 */
import React, { useState } from 'react';
import type { AiInterventionLevel } from '../types';

/**
 * [Why/Intent] SettingsPanelが受け取るプロパティ。
 * - hasApiKey: セキュリティ上平文キーを持たず、設定済みかどうかのみを受け取る。
 * - aiInterventionLevel: 現在の推敲レベル。
 * - onUpdateApiKey: APIキー更新時のハンドラ。
 * - onUpdateLevel: 推敲レベル変更時のハンドラ。
 * - onForceAnalyze: 手動推敲実行のハンドラ。
 */
interface SettingsPanelProps {
  hasApiKey: boolean;
  aiInterventionLevel: AiInterventionLevel;
  onUpdateApiKey: (key: string) => void;
  onUpdateLevel: (level: AiInterventionLevel) => void;
  onForceAnalyze: () => void;
}

/**
 * [Why/Intent] ユーザーが各種設定を直感的に行えるようにするためのコンポーネント。
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  hasApiKey,
  aiInterventionLevel,
  onUpdateApiKey,
  onUpdateLevel,
  onForceAnalyze,
}) => {
  const [apiKeyValue, setApiKeyValue] = useState('');

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3>API Key</h3>
        <input 
          type="password" 
          placeholder="Enter API Key"
          value={apiKeyValue}
          onChange={(e) => setApiKeyValue(e.target.value)}
          /** 
           * [Why/Intent] onChangeではなくonBlurを採用しているのは、
           * 一文字入力するたびにIPC通信・ストレージ書き込みが発生し負荷がかかるのを防止するため。
           */
          onBlur={() => onUpdateApiKey(apiKeyValue)}
          style={{ width: '100%', padding: '4px' }}
        />
        {hasApiKey && <div style={{ marginTop: '4px', color: 'var(--vscode-charts-green)' }}>✅ APIキー設定済み</div>}
      </div>

      <div>
        <h3>AI Intervention Level</h3>
        <select 
          value={aiInterventionLevel} 
          onChange={(e) => onUpdateLevel(e.target.value as AiInterventionLevel)}
          style={{ width: '100%', padding: '4px' }}
        >
          <option value="Level 1 (Typo/Bug Fix)">Level 1 (Typo/Bug Fix)</option>
          <option value="Level 2 (Refactoring)">Level 2 (Refactoring)</option>
          <option value="Level 3 (Architecture Optimization)">Level 3 (Architecture Optimization)</option>
        </select>
      </div>

      <div>
        <button 
          onClick={onForceAnalyze}
          style={{ 
            padding: '8px 16px', 
            background: 'var(--vscode-button-background)', 
            color: 'var(--vscode-button-foreground)', 
            border: 'none', 
            cursor: 'pointer' 
          }}
        >
          🚀 今すぐコードを推敲する (Analyze Now)
        </button>
      </div>
    </div>
  );
};
