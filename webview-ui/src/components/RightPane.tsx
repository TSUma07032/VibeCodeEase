import type { Settings } from '../types/index';

interface RightPaneProps {
  isOpen: boolean;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onToggle: () => void;
}

export function RightPane({ isOpen, settings, onSettingsChange, onToggle }: RightPaneProps) {
  if (!isOpen) return <div className="right-pane collapsed" />;

  return (
    <div className="pane right-pane">
      <div className="settings-header">
        <span>Settings</span>
        <button className="secondary" onClick={onToggle} style={{ padding: '4px 8px' }}>✕</button>
      </div>

      <div className="settings-group">
        <label>🔑 LLM API Key</label>
        <input 
          type="password" 
          className="vscode-input"
          placeholder="sk-..." 
          value={settings.llmApiKey || ''}
          onChange={(e) => onSettingsChange({ ...settings, llmApiKey: e.target.value })}
        />
        <div style={{ fontSize: '0.75em', marginTop: '4px', opacity: 0.7 }}>
          Required for generating advanced proposals.
        </div>
      </div>

      <div className="settings-group">
        <label>🎚️ AI Trigger Mode</label>
        <select
          className="vscode-select"
          value={settings.triggerMode}
          onChange={(e) => onSettingsChange({ ...settings, triggerMode: e.target.value as 'on-save' | 'interval-10s' | 'disabled' })}
          style={{ width: '100%', padding: '4px', marginTop: '4px' }}
        >
          <option value="on-save">On Save</option>
          <option value="interval-10s">Interval (10s)</option>
          <option value="disabled">Disabled</option>
        </select>
        <div style={{ fontSize: '0.75em', opacity: 0.7, marginTop: '4px' }}>
          Choose when AI should analyze your code.
        </div>
      </div>

      <div className="settings-group">
        <label>🧠 Personalization Trend (LLM 2)</label>
        <div className="trend-box">
          {settings.personalizationTrend}
        </div>
      </div>
      
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: '0.7em', opacity: 0.5, textAlign: 'center' }}>
        VibeCodeEase Core v0.7
      </div>
    </div>
  );
}

