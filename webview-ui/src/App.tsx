import './App.css';
import { useEffect, useState } from 'react';
import { AIReviewScreen } from './components/AIReviewScreen';
import type {
  PresetMode,
  SettingsPayload,
  LlmConfig,
  LlmProvider,
  LlmTriggerMode,
  AiWorkspaceState
} from './types';
import { PersonalizationPanel } from './components/PersonalizationPanel';

// VS Code API を取得するための宣言
declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

function App() {
  const [currentView, setCurrentView] = useState<'REVIEW' | 'SETTINGS'>('REVIEW');
  const [presetMode, setPresetMode] = useState<PresetMode>('HINT');
  
  // LLMトリガーモード
  const [llmTriggerMode, setLlmTriggerMode] = useState<LlmTriggerMode>('on-save');
  
  // LLM / API Key State
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({ provider: 'gemini', model: 'gemini-3.6-flash' });
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState<boolean>(false);
  const [apiKeyValue, setApiKeyValue] = useState<string>('');
  const [isEditingApiKey, setIsEditingApiKey] = useState<boolean>(false);
  const [isPersonalizedMode, setIsPersonalizedMode] = useState<boolean>(true);

  // Personalization State
  const [pzProfile, setPzProfile] = useState<any>(null);
  const [pzMetrics, setPzMetrics] = useState<any>(null);
  const [pzCandidates, setPzCandidates] = useState<any[]>([]);
  const [pzBusy, setPzBusy] = useState<boolean>(false);
  const [pzError, setPzError] = useState<string>('');
  const [llmError, setLlmError] = useState<string>('');

  const [workspaceState, setWorkspaceState] = useState<AiWorkspaceState | null>(null);

  useEffect(() => {
    // 起動時に拡張機能へ設定取得リクエストを送る
    vscode?.postMessage({ command: 'GET_SETTINGS' });

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'SETTINGS_DATA': {
          const payload = data.payload as SettingsPayload;
          setPresetMode(payload.presetMode);
          if (payload.llmConfig) setLlmConfig(payload.llmConfig);
          if (payload.hasGeminiApiKey !== undefined) setHasGeminiApiKey(payload.hasGeminiApiKey);
          if (payload.llmTriggerMode) setLlmTriggerMode(payload.llmTriggerMode);
          break;
        }
        case 'WORKSPACE_STATE_UPDATE': {
          setWorkspaceState(data.payload as AiWorkspaceState);
          break;
        }
        case 'PZ_STATE':
          setPzProfile(data.payload.profile);
          setPzMetrics(data.payload.metrics);
          break;
        case 'PZ_CANDIDATES':
          setPzCandidates(data.payload);
          break;
        case 'PZ_BUSY':
          setPzBusy(data.payload);
          if (data.payload) setPzError('');
          break;
        case 'PZ_ERROR':
          setPzError(data.payload);
          break;
        case 'BACKGROUND_ANALYSIS_STARTED':
          setLlmError('');
          break;
        case 'LLM_ERROR':
          setLlmError(data.payload as string);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSelectPreset = (preset: PresetMode) => {
    setPresetMode(preset);
    vscode?.postMessage({ command: 'SET_PRESET', payload: preset });
  };

  const handleLlmProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as LlmProvider;
    // providerが切り替わったらデフォルトモデルも切り替える
    const model = provider === 'gemini' ? 'gemini-3.6-flash' : 'auto';
    setLlmConfig({ provider, model });
    vscode?.postMessage({ command: 'SET_LLM_CONFIG', payload: { provider, model } });
  };

  const handleLlmModelChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const model = e.target.value;
    setLlmConfig(prev => ({ ...prev, model }));
    vscode?.postMessage({ command: 'SET_LLM_CONFIG', payload: { provider: llmConfig.provider, model } });
  };

  const handleSaveApiKey = () => {
    vscode?.postMessage({ command: 'SAVE_API_KEY', payload: { apiKey: apiKeyValue } });
    setIsEditingApiKey(false);
    setApiKeyValue('');
  };

  const handleDeleteApiKey = () => {
    vscode?.postMessage({ command: 'DELETE_API_KEY' });
    setIsEditingApiKey(false);
    setApiKeyValue('');
  };
  return (
    <div className="App" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--vscode-sideBarTitle-background)', borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)' }}>
        <h2 style={{ margin: 0, fontSize: '14px' }}>✨ vibeCodeEase</h2>
        <button 
          onClick={() => setCurrentView(v => v === 'REVIEW' ? 'SETTINGS' : 'REVIEW')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--vscode-foreground)' }}
          title={currentView === 'REVIEW' ? '設定を開く' : 'レビュー画面に戻る'}
        >
          {currentView === 'REVIEW' ? '⚙️' : '⬅️'}
        </button>
      </div>

      {llmError && (
        <div style={{ padding: '10px', backgroundColor: '#5a1d1d', color: '#ffb3b3', borderRadius: '4px', margin: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>❌ AI Error:</strong> {llmError}</div>
          <button style={{ marginLeft: '10px', padding: '2px 8px', cursor: 'pointer' }} onClick={() => setLlmError('')}>Dismiss</button>
        </div>
      )}

      {currentView === 'REVIEW' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AIReviewScreen workspaceState={workspaceState} vscode={vscode} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
      {/* Section 1: UIUX 設定 */}
      <section className="card uiux-section">
        <h2 className="section-title">🖥️ Section 1: UIUX Settings (AIとの接し方)</h2>
        <div className="form-group">
          <label>Trigger Mode (AI介入の発生タイミング)</label>
          <div className="radio-group">
            {[
              { value: 'continuous', label: '10秒ごと(連続)', desc: '作業中に自動で継続的に解析・生成' },
              { value: 'on-save', label: '保存時のみ', desc: '推奨・APIコスト節約' },
              { value: 'disabled', label: '無効（生成しない）', desc: 'LLM解析を完全に停止' },
            ].map(opt => (
              <label key={opt.value} className={`radio-option ${llmTriggerMode === opt.value ? 'radio-selected' : ''}`}>
                <input
                  type="radio"
                  name="llm-trigger"
                  value={opt.value}
                  checked={llmTriggerMode === opt.value}
                  onChange={() => {
                    vscode?.postMessage({ command: 'SET_LLM_TRIGGER_MODE', payload: opt.value });
                  }}
                />
                <span className="radio-label-text">
                  <strong>{opt.label}</strong>
                  <small>{opt.desc}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="pz-controls uiux-controls" style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <div>
            <label>Visibility Level (通知・提示の強さ): </label>
            <select
              value={pzProfile?.visibilityLevel || 'subtle'}
              onChange={e => vscode?.postMessage({ command: 'PZ_SET_UIUX', payload: { visibility: e.target.value } })}
              className="styled-select"
            >
              <option value="stealth">Stealth (最小限)</option>
              <option value="subtle">Subtle (控えめ)</option>
              <option value="active">Active (積極的)</option>
            </select>
          </div>
          <div>
            <label>Explanation Verbosity (理由説明の表示量): </label>
            <select
              value={pzProfile?.explanationVerbosity || 'summary'}
              onChange={e => vscode?.postMessage({ command: 'PZ_SET_UIUX', payload: { verbosity: e.target.value } })}
              className="styled-select"
            >
              <option value="minimal">Minimal (1行要約)</option>
              <option value="summary">Summary (箇条書き)</option>
              <option value="detailed">Detailed (詳細)</option>
            </select>
          </div>
          <div>
            <label>Application Automation (差分適用の自動化): </label>
            <select
              value={pzProfile?.applicationAutomation || 'manual'}
              onChange={e => vscode?.postMessage({ command: 'PZ_SET_UIUX', payload: { automation: e.target.value } })}
              className="styled-select"
            >
              <option value="manual">Manual (手動確認)</option>
              <option value="bulk">Bulk (ファイル一括)</option>
              <option value="auto">Auto (保存時自動適用)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Section 2: 生成物の設定 */}
      <section className="card generation-section">
        <h2 className="section-title">🧠 Section 2: AI Content Settings (生成物の方向性)</h2>
        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input type="radio" checked={!isPersonalizedMode} onChange={() => setIsPersonalizedMode(false)} />
            <span>🔧 既存人格 (固定プリセット)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input type="radio" checked={isPersonalizedMode} onChange={() => setIsPersonalizedMode(true)} />
            <span>🧠 パーソナライズ (動的学習)</span>
          </label>
        </div>

        {!isPersonalizedMode ? (
          <div className="preset-grid" style={{ display: 'flex', gap: '10px' }}>
            <div
              className={`preset-card ${presetMode === 'HINT' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('HINT')}
              style={{ flex: 1, padding: '10px', textAlign: 'center', cursor: 'pointer', border: presetMode === 'HINT' ? '2px solid var(--vscode-button-background)' : '1px solid var(--vscode-widget-border)', borderRadius: '4px' }}
            >
              <div>💡 ヒント中心</div>
            </div>
            <div
              className={`preset-card ${presetMode === 'ARCHITECTURE' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('ARCHITECTURE')}
              style={{ flex: 1, padding: '10px', textAlign: 'center', cursor: 'pointer', border: presetMode === 'ARCHITECTURE' ? '2px solid var(--vscode-button-background)' : '1px solid var(--vscode-widget-border)', borderRadius: '4px' }}
            >
              <div>📐 設計思想中心</div>
            </div>
            <div
              className={`preset-card ${presetMode === 'BUG_TYPO' ? 'active' : ''}`}
              onClick={() => handleSelectPreset('BUG_TYPO')}
              style={{ flex: 1, padding: '10px', textAlign: 'center', cursor: 'pointer', border: presetMode === 'BUG_TYPO' ? '2px solid var(--vscode-button-background)' : '1px solid var(--vscode-widget-border)', borderRadius: '4px' }}
            >
              <div>🐛 タイポやバグの温床を中心</div>
            </div>
          </div>
        ) : (
          <PersonalizationPanel 
            vscode={vscode} 
            profile={pzProfile} 
            metrics={pzMetrics} 
            candidates={pzCandidates} 
            isBusy={pzBusy} 
            error={pzError} 
          />
        )}

        <div style={{ marginTop: '15px', padding: '10px', background: 'var(--vscode-input-background)', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '5px' }}>📝 現在の生成プロンプト（簡易表示）:</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--vscode-editor-foreground)' }}>
            {isPersonalizedMode ? 
              (pzProfile?.preferenceSummary || '学習データがありません。') : 
              (presetMode === 'HINT' ? 'タイポを手軽に直しつつ、構文・ロジックは解説ヒントを提示。コード理解を最優先。' : 
               presetMode === 'ARCHITECTURE' ? 'AI介入を最小限に抑え、自力でコードを紡ぐクラフト重視。アーキテクチャの提案を主に行う。' : 
               '面倒なタイポや整形・構文修正を自動化。バグの温床となる箇所を積極的に修正。')}
          </pre>
        </div>
      </section>

      {/* Section 3: LLM & API 設定 */}
      <section className="card llm-section">
        <h2 className="section-title">⚙️ Section 3: LLM & API Settings</h2>
        <div className="llm-config-box">
          <div className="form-group">
            <label>Provider</label>
            <select value={llmConfig.provider} onChange={handleLlmProviderChange} className="styled-select">
              <option value="gemini">Google Gemini</option>
              <option value="vscode-lm">VS Code LM</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Model</label>
            <input 
              list="model-list" 
              value={llmConfig.model} 
              onChange={handleLlmModelChange} 
              className="styled-input" 
              placeholder="モデル名を入力または選択"
            />
            <datalist id="model-list">
              {llmConfig.provider === 'gemini' ? (
                <>
                  <option value="gemini-3.6-flash" />
                  <option value="gemini-2.5-flash" />
                  <option value="gemini-2.0-flash" />
                  <option value="gemini-1.5-flash" />
                  <option value="gemini-1.5-pro" />
                  <option value="auto" />
                </>
              ) : (
                <>
                  <option value="auto" />
                  <option value="gpt-4o" />
                  <option value="gpt-4o-mini" />
                  <option value="claude-3.5-sonnet" />
                </>
              )}
            </datalist>
          </div>

          {llmConfig.provider === 'gemini' && (
            <div className="form-group api-key-group">
              <label>API Key</label>
              {hasGeminiApiKey && !isEditingApiKey ? (
                <div className="api-key-status">
                  <span className="status-badge success">✅ 設定済み</span>
                  <div className="api-key-actions">
                    <button className="action-button small" onClick={() => setIsEditingApiKey(true)}>変更</button>
                    <button className="secondary-button small danger" onClick={handleDeleteApiKey}>削除</button>
                  </div>
                </div>
              ) : (
                <div className="api-key-input-box">
                  <input
                    type="password"
                    value={apiKeyValue}
                    onChange={e => setApiKeyValue(e.target.value)}
                    placeholder="APIキーを入力"
                    className="styled-input"
                  />
                  <div className="api-key-actions">
                    <button className="action-button small" onClick={handleSaveApiKey} disabled={!apiKeyValue}>保存</button>
                    {hasGeminiApiKey && <button className="secondary-button small" onClick={() => setIsEditingApiKey(false)}>キャンセル</button>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
        </div>
      )}
    </div>
  );
}

export default App;
