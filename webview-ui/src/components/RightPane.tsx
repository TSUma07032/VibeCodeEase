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
        <label>🎚️ AI Intervention Level ({settings.interventionLevel}%)</label>
        <input 
          type="range" 
          min="0" 
          max="100" 
          className="vscode-slider"
          value={settings.interventionLevel}
          onChange={(e) => onSettingsChange({ ...settings, interventionLevel: Number(e.target.value) })}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', opacity: 0.7, marginTop: '4px' }}>
          <span>Silent</span>
          <span>Aggressive</span>
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

