/**
 * [Why/Intent] WebviewのSettingsタブに表示するコンポーネント。
 * APIキーの入力、AI推敲レベルの選択、手動推敲実行のUIを提供する責務を持つ。
 */
import React, { useState, useEffect } from 'react';
import type { AiInterventionLevel } from '../types';
import { vscode } from '../utils/vscode';

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Extending SettingsPanel to include frequency, intervalSeconds, model without breaking existing layout.
interface SettingsPanelProps {
  hasApiKey: boolean;
  apiKeyLength?: number;
  aiInterventionLevel: AiInterventionLevel;
  frequency: 'manual' | 'onSave' | 'interval';
  intervalSeconds: number;
  model: string;
  onUpdateApiKey: (key: string) => void;
  onUpdateLevel: (level: AiInterventionLevel) => void;
  onForceAnalyze: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  hasApiKey,
  apiKeyLength = 0,
  aiInterventionLevel,
  frequency,
  intervalSeconds,
  model,
  onUpdateApiKey,
  onUpdateLevel,
  onForceAnalyze,
}) => {
  const maskString = hasApiKey && apiKeyLength > 0 ? '*'.repeat(apiKeyLength) : '********';
  const [apiKeyValue, setApiKeyValue] = useState(hasApiKey ? maskString : '');
  const [localInterval, setLocalInterval] = useState(intervalSeconds);
  const [localModel, setLocalModel] = useState(model);
  const [localFrequency, setLocalFrequency] = useState(frequency);

  useEffect(() => {
    setLocalInterval(intervalSeconds);
  }, [intervalSeconds]);

  useEffect(() => {
    setLocalModel(model);
  }, [model]);

  useEffect(() => {
    setLocalFrequency(frequency);
  }, [frequency]);

  useEffect(() => {
    if (hasApiKey && !apiKeyValue) {
      setApiKeyValue(maskString);
    }
  }, [hasApiKey, maskString]);

  const handleConfigChange = (newFreq: typeof frequency, newInt: number, newModel: string) => {
    setLocalFrequency(newFreq);
    setLocalModel(newModel);
    vscode.postMessage({
      command: 'update_llm_config',
      frequency: newFreq,
      intervalSeconds: newInt,
      model: newModel
    });
  };

  const models = [
    'gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.8-live-extended-thinking', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.5-live-translate-preview', 'gemini-3.1-flash-live-preview', 'gemini-3.1-flash-tts-preview', 'gemini-omni-1.1-flash', 'gemini-3.5-transcribe', 'gemini-3.5-transcribe-live', 'gemini-2.5-flash', 'gemini-2.5-flash-image', 'gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-lite'
  ];

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3>API Key</h3>
        <input 
          type="password" 
          placeholder={hasApiKey ? maskString : 'Enter API Key'}
          value={apiKeyValue}
          onChange={(e) => setApiKeyValue(e.target.value)}
          onFocus={() => { if (apiKeyValue === maskString) setApiKeyValue(''); }}
          onBlur={() => { if (apiKeyValue !== maskString) onUpdateApiKey(apiKeyValue); }}
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
        <h3>Model</h3>
        <select 
          value={localModel} 
          onChange={(e) => handleConfigChange(localFrequency, localInterval, e.target.value)}
          style={{ width: '100%', padding: '4px' }}
        >
          {models.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div>
        <h3>Sync Frequency</h3>
        <div>
          <label>
            <input type="radio" name="frequency" value="manual" checked={localFrequency === 'manual'} onChange={() => handleConfigChange('manual', localInterval, localModel)} />
            Manual
          </label>
          <label style={{ marginLeft: '12px' }}>
            <input type="radio" name="frequency" value="onSave" checked={localFrequency === 'onSave'} onChange={() => handleConfigChange('onSave', localInterval, localModel)} />
            On Save
          </label>
          <label style={{ marginLeft: '12px' }}>
            <input type="radio" name="frequency" value="interval" checked={localFrequency === 'interval'} onChange={() => handleConfigChange('interval', localInterval, localModel)} />
            Interval
          </label>
        </div>
      </div>

      <div>
        <h3>Interval (Seconds)</h3>
        <input 
          type="number"
          value={localInterval}
          onChange={(e) => setLocalInterval(Number(e.target.value))}
          onBlur={() => handleConfigChange(localFrequency, localInterval, localModel)}
          style={{ width: '100%', padding: '4px' }}
        />
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
