import './App.css';
import { useEffect, useState } from 'react';

// VS Code API を取得するための宣言
declare const acquireVsCodeApi: any;
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

type PainCategory =
  | 'SYNTAX_TYPO'
  | 'INDENTATION_FORMATTING'
  | 'VAR_FUNC_MANAGEMENT'
  | 'SYNTAX_ERROR_HANDLING';

type PresetMode = 'LEARNING' | 'FLOW' | 'ZEN' | 'CUSTOM';

interface ProposedEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  newText: string;
  category: PainCategory;
  reason: string;
}

interface InterventionPlan {
  summary: string;
  edits: ProposedEdit[];
}

interface SettingsPayload {
  presetMode: PresetMode;
  preferences: Record<PainCategory, number>;
  presetDefinitions: Record<string, {
    id: string;
    name: string;
    description: string;
    icon: string;
    preferences: Record<PainCategory, number>;
  }>;
}

const CATEGORY_NAMES: Record<PainCategory, string> = {
  SYNTAX_TYPO: 'タイポ・誤記',
  INDENTATION_FORMATTING: 'インデント・整形',
  VAR_FUNC_MANAGEMENT: '変数・関数の管理',
  SYNTAX_ERROR_HANDLING: '構文エラー・ブロック'
};

function getInterventionBadge(val: number) {
  if (val >= 0.75) {
    return <span className="level-badge badge-silent">自動修正</span>;
  }
  if (val >= 0.40) {
    return <span className="level-badge badge-suggestion">提案</span>;
  }
  return <span className="level-badge badge-ignore">自力解決</span>;
}

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

  return (
    <div className="App">
      <header className="header">
        <h1>✨ vibeCodeEase</h1>
        <p>AI-assisted Flow & Learning Support</p>
      </header>

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
                <span>0.0 (自力でやる)</span>
                <span>1.0 (全自動)</span>
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
              <div>
                提案された変更内容を確認し、「なぜこの構文が必要なのか」「タイポやインデントがどのように動作に影響するか」を意識してみましょう。
              </div>
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
