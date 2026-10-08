import type { Settings, InterventionMode } from '../types/index';
import { getVSCodeAPI } from '../vscode';

interface RightPaneProps {
  isOpen: boolean;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onToggle: () => void;
}

/**
 * @AI_AGENT_NOTE RightPane Component
 * ROLE: Manages the configuration of the AI Workspace, acting as the control panel for the AI collaborator's behavior.
 * 
 * WHY: Provides standard settings (API Key, Model) but crucially includes `Intervention Mode` and `AI Trigger Mode`.
 * These settings dictate *when* the AI pushes to the CenterPane (e.g., 'on-save' or 'interval-10s') 
 * and *how aggressively* it modifies code (Hinting, Silent Fixer, Architect).
 * 
 * HINTS FOR FUTURE AGENTS:
 * - When adding new settings, ensure they are also updated in `Settings` type and handled by the VS Code extension host (`updateSettings` command).
 * - `handleReflectSettings` triggers the extension to send the latest settings back, maintaining state sync.
 */
export function RightPane({ isOpen, settings, onSettingsChange, onToggle }: RightPaneProps) {
  if (!isOpen) return <div className="right-pane collapsed" />;

  const handleSaveSettings = () => {
    getVSCodeAPI().postMessage({ command: 'updateSettings', settings });
  };

  const handleReflectSettings = () => {
    getVSCodeAPI().postMessage({ command: 'webviewReady' }); // triggers loadSettings
  };

  const MODELS = [
    { value: 'auto', label: 'Auto (Recommended)' },
    { value: 'antigravity-preview-latest', label: 'Antigravity Preview (Latest)' },
    { value: 'deep-research-max-preview-04-2026', label: 'Deep Research Max' },
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { value: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
    { value: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemma-4-31b-it', label: 'Gemma 4 (31B IT)' }
  ];

  return (
    <div className="pane right-pane">
      <div className="settings-header">
        <span>Settings</span>
        <button className="secondary" onClick={onToggle} style={{ padding: '4px 8px' }}>?</button>
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
        <label>🤖 LLM Model</label>
        <select
          className="vscode-select"
          value={settings.llmModel || 'auto'}
          onChange={(e) => onSettingsChange({ ...settings, llmModel: e.target.value })}
          style={{ width: '100%', padding: '4px', marginTop: '4px', backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <label>⚡ AI Trigger Mode</label>
        <select
          className="vscode-select"
          value={settings.triggerMode}
          onChange={(e) => onSettingsChange({ ...settings, triggerMode: e.target.value as 'on-save' | 'interval-10s' | 'disabled' })}
          style={{ width: '100%', padding: '4px', marginTop: '4px', backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        >
          <option value="on-save">On Save</option>
          <option value="interval-10s">Interval (10s)</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      <div className="settings-group">
        <label>🛠️ Intervention Mode</label>
        <select
          className="vscode-select"
          value={settings.interventionMode || 'silent_fixer'}
          onChange={(e) => onSettingsChange({ ...settings, interventionMode: e.target.value as InterventionMode })}
          style={{ width: '100%', padding: '4px', marginTop: '4px', backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
        >
          <option value="hinting">Hinting Mode</option>
          <option value="silent_fixer">Silent Fixer Mode</option>
          <option value="architect">Architect Mode</option>
        </select>
        <div style={{ fontSize: '0.75em', opacity: 0.7, marginTop: '4px' }}>
          Controls the behavior of AI proposals.
        </div>
      </div>

      <div className="settings-group" style={{ display: 'flex', gap: '10px' }}>
        <button onClick={handleSaveSettings} style={{ flex: 1 }}>💾 Save</button>
        <button onClick={handleReflectSettings} className="secondary" style={{ flex: 1 }}>🔄 Reflect</button>
      </div>

      <div className="settings-group">
        <label>🧠 Personalization Trend (LLM 2)</label>
        <div className="trend-box">
          {settings.personalizationTrend}
        </div>
      </div>
      
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: '0.7em', opacity: 0.5, textAlign: 'center' }}>
        VibeCodeEase Core v0.8
      </div>
    </div>
  );
}
