/**
 * [Why/Intent] 設定タブの親コンテナ。全般設定と学習支援設定のカテゴリ切り替えタブを提供する。
 */
import React, { useState } from 'react';
import type { AiInterventionLevel } from '../types';
import { LearningSettingsPanel } from './settings/LearningSettingsPanel';
import { LlmGeneralSettingsSection } from './settings/LlmGeneralSettingsSection';

/**
 * [Why/Intent] App.tsx から親コンテナ SettingsPanel へ渡されるProps定義。
 * 既存の自動推敲設定状態および各種更新ハンドラを受け取り、子コンポーネントへ分配する。
 */
export interface SettingsPanelProps {
  /** [Why/Intent] APIキーが設定済みかどうかのフラグ（実キーはWebviewに渡さないセキュリティ保護） */
  hasApiKey: boolean;
  /** [Why/Intent] 入力済みAPIキーの文字長（マスク表示用） */
  apiKeyLength?: number;
  /** [Why/Intent] AI介入レベル（HINT, SUGGESTION, SILENT等） */
  aiInterventionLevel: AiInterventionLevel;
  /** [Why/Intent] 自動推敲の実行トリガー（手動, onSave, 定期インターバル） */
  frequency: 'manual' | 'onSave' | 'interval';
  /** [Why/Intent] 定期インターバル実行時の間隔秒数 */
  intervalSeconds: number;
  /** [Why/Intent] 使用する推敲用LLMモデル識別子 */
  model: string;
  /** [Why/Intent] 新規APIキー保存コールバック */
  onUpdateApiKey: (key: string) => void;
  /** [Why/Intent] 介入レベル変更コールバック */
  onUpdateLevel: (level: AiInterventionLevel) => void;
  /** [Why/Intent] 手動推敲実行トリガーコールバック */
  onForceAnalyze: () => void;
}

/** [Why/Intent] 全般および学習支援のタブ切り替え親コンポーネント */
export const SettingsPanel: React.FC<SettingsPanelProps> = (props) => {
  const [activeCategory, setActiveCategory] = useState<'general' | 'learning'>('general');

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    border: 'none',
    borderBottom: isActive ? '2px solid var(--vscode-panelTitle-activeBorder, #007acc)' : '2px solid transparent',
    background: 'transparent',
    color: isActive ? 'var(--vscode-panelTitle-activeForeground, #ffffff)' : 'var(--vscode-panelTitle-inactiveForeground, #888888)',
    cursor: 'pointer',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '12px',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '8px 16px', borderBottom: '1px solid var(--vscode-panel-border, #333)' }}>
        <span style={{ fontSize: '12px', alignSelf: 'center', color: 'var(--vscode-descriptionForeground)' }}>設定カテゴリ:</span>
        <button type="button" style={tabStyle(activeCategory === 'general')} onClick={() => setActiveCategory('general')}>
          🔧 全般・自動推敲
        </button>
        <button type="button" style={tabStyle(activeCategory === 'learning')} onClick={() => setActiveCategory('learning')}>
          🎓 学習支援設定
        </button>
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        {activeCategory === 'general' ? <LlmGeneralSettingsSection {...props} /> : <LearningSettingsPanel />}
      </div>
    </div>
  );
};
