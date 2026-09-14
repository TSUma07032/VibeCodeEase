import './App.css';
import { useEffect, useState } from 'react';
import type {
  PainCategory,
  PresetMode,
  InterventionPlan,
  SettingsPayload,
  LlmConfig,
  LlmProvider
} from './types';
import { CATEGORY_NAMES } from './types';

// VS Code API を取得するための宣言
declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;


function getInterventionBadge(val: number) {
  if (val >= 0.75) {
    return <span className="level-badge badge-silent">⚡ 自動修正</span>;
  }
  if (val >= 0.40) {
    return <span className="level-badge badge-suggestion">💡 提案</span>;
  }
  return <span className="level-badge badge-ignore">🧘 自力解決</span>;
}

/** プリセット選択時の嗜好値プレビュー用 */
const PRESET_PREVIEW: Record<string, Record<string, number>> = {
  LEARNING: { SYNTAX_TYPO: 0.9, INDENTATION_FORMATTING: 0.5, VAR_FUNC_MANAGEMENT: 0.2, SYNTAX_ERROR_HANDLING: 0.5 },
  FLOW:     { SYNTAX_TYPO: 0.9, INDENTATION_FORMATTING: 0.9, VAR_FUNC_MANAGEMENT: 0.7, SYNTAX_ERROR_HANDLING: 0.8 },
  ZEN:      { SYNTAX_TYPO: 0.1, INDENTATION_FORMATTING: 0.1, VAR_FUNC_MANAGEMENT: 0.1, SYNTAX_ERROR_HANDLING: 0.1 },
  CUSTOM:   {},
};

function App() {
  const [presetMode, setPresetMode] = useState<PresetMode>('LEARNING');
  const [preferences, setPreferences] = useState<Record<PainCategory, number>>({
    SYNTAX_TYPO: 0.8,
    INDENTATION_FORMATTING: 0.7,
    VAR_FUNC_MANAGEMENT: 0.3,
    SYNTAX_ERROR_HANDLING: 0.4
  });
  const [plan, setPlan] = useState<InterventionPlan | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // LLM / API Key State
  const [llmConfig, setLlmConfig] = useState<LlmConfig>({ provider: 'gemini', model: 'gemini-2.5-flash' });
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState<boolean>(false);
  const [apiKeyValue, setApiKeyValue] = useState<string>('');
  const [isEditingApiKey, setIsEditingApiKey] = useState<boolean>(false);

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
          setPreferences(payload.preferences);
          if (payload.llmConfig) setLlmConfig(payload.llmConfig);
          if (payload.hasGeminiApiKey !== undefined) setHasGeminiApiKey(payload.hasGeminiApiKey);
          break;
        }
        case 'ANALYSIS_STARTED':
          setIsAnalyzing(true);
          setStatus('ファイルを解析しています...');
          setPlan(null);
          break;
        case 'INTERVENTION_PLAN': {
          setIsAnalyzing(false);
          setStatus('');
          const p = data.payload?.plan ?? data.payload;
          setPlan(p as InterventionPlan);
          break;
        }
        case 'PLAN_APPLIED':
          setIsAnalyzing(false);
          setPlan(null);
          setStatus('変更を適用しました。');
          break;
        case 'PLAN_REJECTED':
          setIsAnalyzing(false);
          setPlan(null);
          setStatus('提案を却下しました。');
          break;
        case 'ERROR':
          setIsAnalyzing(false);
          setStatus(data.payload as string);
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

  const handleSliderChange = (category: PainCategory, value: number) => {
    setPreferences(prev => ({ ...prev, [category]: value }));
    setPresetMode('CUSTOM');
    vscode?.postMessage({
      command: 'UPDATE_PREFERENCE_VALUE',
      payload: { category, value }
    });
  };

  const handleAnalyze = () => {
    if (vscode) {
      vscode.postMessage({ command: 'ANALYZE_CURRENT_FILE' });
    } else {
      setStatus('VS Code APIを利用できません。');
    }
  };

  const handleApply = () => vscode?.postMessage({ command: 'APPLY_PLAN' });
  const handleReject = () => vscode?.postMessage({ command: 'REJECT_PLAN' });

  const handleLlmProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as LlmProvider;
    // providerが切り替わったらデフォルトモデルも切り替える
    const model = provider === 'gemini' ? 'gemini-2.5-flash' : 'auto';
    setLlmConfig({ provider, model });
    vscode?.postMessage({ command: 'SET_LLM_CONFIG', payload: { provider, model } });
  };

  const handleLlmModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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
    <div className="App">
      <header className="header">
        <h1>✨ vibeCodeEase</h1>
        <p>AI-assisted Flow & Learning Support</p>
      </header>

      {/* AIモデル・API設定 */}
      <section className="preset-section llm-section">
        <h2 className="section-title">🤖 AIモデル & API設定</h2>
        <div className="llm-config-box">
          <div className="form-group">
            <label>LLM プロバイダー</label>
            <select value={llmConfig.provider} onChange={handleLlmProviderChange} className="styled-select">
              <option value="gemini">💎 Google Gemini (推奨)</option>
              <option value="vscode-lm">🤖 VS Code LM (Copilot等)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>使用モデル</label>
            <select value={llmConfig.model} onChange={handleLlmModelChange} className="styled-select">
              {llmConfig.provider === 'gemini' ? (
                <>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (推奨・高速)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  <option value="auto">自動選択 (Auto)</option>
                </>
              ) : (
                <>
                  <option value="auto">自動選択 (Default)</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3.5-sonnet">claude-3.5-sonnet</option>
                </>
              )}
            </select>
          </div>

          {llmConfig.provider === 'gemini' && (
            <div className="form-group api-key-group">
              <label>Gemini API キー</label>
              {hasGeminiApiKey && !isEditingApiKey ? (
                <div className="api-key-status">
                  <span className="status-badge success">✅ 設定済み (••••••••)</span>
                  <div className="api-key-actions">
                    <button className="action-button small" onClick={() => setIsEditingApiKey(true)}>変更</button>
                    <button className="secondary-button small danger" onClick={handleDeleteApiKey}>削除</button>
                  </div>
                </div>
              ) : (
                <div className="api-key-input-box">
                  <input
                    type="password"
                    placeholder="AIza..."
                    value={apiKeyValue}
                    onChange={e => setApiKeyValue(e.target.value)}
                    className="styled-input"
                  />
                  <div className="api-key-actions">
                    <button className="action-button small" onClick={handleSaveApiKey}>保存</button>
                    {hasGeminiApiKey && <button className="secondary-button small" onClick={() => setIsEditingApiKey(false)}>キャンセル</button>}
                  </div>
                  <div className="api-key-hint">
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studioでキーを取得</a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* プリセット選択 */}
      <section className="preset-section">
        <h2 className="section-title">介入モード (Preset)</h2>
        <div className="preset-grid">
          <div
            className={`preset-card ${presetMode === 'LEARNING' ? 'active' : ''}`}
            onClick={() => handleSelectPreset('LEARNING')}
          >
            <div className="preset-card-header">
              <span>🎓 学習モード (Learning)</span>
            </div>
            <div className="preset-card-desc">
              タイポは手軽に直しつつ、構文・ロジックは解説ヒントを提示。コード理解を最優先。
            </div>
          </div>

          <div
            className={`preset-card ${presetMode === 'FLOW' ? 'active' : ''}`}
            onClick={() => handleSelectPreset('FLOW')}
          >
            <div className="preset-card-header">
              <span>⚡ フローモード (Flow)</span>
            </div>
            <div className="preset-card-desc">
              タイポや構文ミスを裏で自動修正。思考のノリとバイブスを最優先。
            </div>
            <div className="preset-card-badges">
              {Object.entries(PRESET_PREVIEW.FLOW).map(([, v]) => (
                <span key={v} className={`mini-badge ${v >= 0.75 ? 'badge-silent' : v >= 0.40 ? 'badge-suggestion' : 'badge-ignore'}`}>
                  {v >= 0.75 ? '⚡' : v >= 0.40 ? '💡' : '🧘'}
                </span>
              ))}
            </div>
          </div>

          <div
            className={`preset-card ${presetMode === 'ZEN' ? 'active' : ''}`}
            onClick={() => handleSelectPreset('ZEN')}
          >
            <div className="preset-card-header">
              <span>🛠️ 職人モード (Zen)</span>
            </div>
            <div className="preset-card-desc">
              AI介入を最小限に抑え、自力でコードを紡ぐクラフト重視。
            </div>
            <div className="preset-card-badges">
              {Object.entries(PRESET_PREVIEW.ZEN).map(([, v]) => (
                <span key={v} className={`mini-badge badge-ignore`}>🧘</span>
              ))}
            </div>
          </div>

          <div
            className={`preset-card ${presetMode === 'CUSTOM' ? 'active' : ''}`}
            onClick={() => handleSelectPreset('CUSTOM')}
          >
            <div className="preset-card-header">
              <span>⚙️ カスタム調整 (Custom)</span>
            </div>
            <div className="preset-card-desc">
              各カテゴリのわずらわしさをスライダーで自由に設定。
            </div>
          </div>
        </div>
      </section>

      {/* スライダーセクション */}
      <section className="slider-section">
        <h2 className="section-title">わずらわしさ (Pain) マトリクス</h2>
        {(Object.keys(CATEGORY_NAMES) as PainCategory[]).map(category => {
          const val = preferences[category] ?? 0.5;
          return (
            <div key={category} className="slider-group">
              <div className="slider-header">
                <span className="category-name">{CATEGORY_NAMES[category]}</span>
                {getInterventionBadge(val)}
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={val}
                onChange={e => handleSliderChange(category, parseFloat(e.target.value))}
              />
              <div className="slider-labels">
                <span>🧘 0.0 自分で気づいて学ぶ</span>
                <span>💡 0.4 ヒントを出して</span>
                <span>⚡ 1.0 全部任せる</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* ファイル解析・レビュー */}
      <section className="preset-section">
        <h2 className="section-title">スマート一括解析</h2>
        <button
          className="action-button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? '⚡ 解析中...' : '🔍 現在のファイルを解析'}
        </button>
        {status && <p className="status-message">{status}</p>}
      </section>

      {/* プラン表示・学習ポイント */}
      {plan && (
        <section className="plan-section">
          <h2>📋 介入プラン</h2>
          <p className="plan-summary">{plan.summary}</p>

          {presetMode === 'LEARNING' && (
            <div className="learning-box">
              <strong>🎓 学習ポイント:</strong>
              <ul className="learning-points">
                {plan.edits.map((edit, i) => (
                  <li key={i} className="learning-point-item">
                    <span className="learning-category">{CATEGORY_NAMES[edit.category] || edit.category}</span>
                    <span className="learning-reason">{edit.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="learning-tip">💡 「なぜこう変えると良いのか」を確認してから承認すると、コードへの理解が深まります。</p>
            </div>
          )}

          <ul className="edit-list">
            {plan.edits.map((edit, index) => (
              <li key={`${edit.startLine}-${edit.startCharacter}-${index}`} className="edit-item">
                <div><strong>{CATEGORY_NAMES[edit.category] || edit.category}</strong>: {edit.reason}</div>
                <pre>{edit.newText}</pre>
              </li>
            ))}
          </ul>

          <div className="button-group">
            <button
              className="action-button"
              onClick={handleApply}
              disabled={plan.edits.length === 0}
              style={{ flex: 1 }}
            >
              承認して適用
            </button>
            <button className="secondary-button" onClick={handleReject}>
              却下
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
