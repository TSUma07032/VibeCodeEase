import { useState, useEffect } from 'react';

// Make sure we have the same types as backend, simplified for UI
type SituationId = 'learning' | 'ideation' | 'design_review' | 'implementation' | 'debugging' | 'deadline_rush';
type PersonaMode = 'adaptive' | 'fixed:exploration' | 'fixed:learning' | 'fixed:quality';

interface Candidate {
  id: string;
  persona: string;
  text: string;
  score?: number;
}

interface Profile {
  currentSituation: SituationId;
  currentPersonaMode: PersonaMode;
  personaSummary: string;
  preferenceSummary: string;
  likedRecords: any[];
  visibilityLevel: 'stealth' | 'subtle' | 'active';
  explanationVerbosity: 'minimal' | 'summary' | 'detailed';
  applicationAutomation: 'manual' | 'bulk' | 'auto';
}

interface Metrics {
  totalInteractions: number;
  preferenceHits: number;
  acceptedCount: number;
  regenerationCount: number;
}

interface Props {
  vscode: any; // The acquired vscode api object
  profile: Profile | null;
  metrics: Metrics | null;
  candidates: Candidate[];
  isBusy: boolean;
  error: string;
}

export function PersonalizationPanel({ vscode, profile, metrics, candidates, isBusy, error }: Props) {
  const [query, setQuery] = useState('');
  const [useSelection, setUseSelection] = useState(true);

  // Initialize
  useEffect(() => {
    vscode.postMessage({ command: 'PZ_GET_STATE' });
  }, [vscode]);

  const handleAsk = () => {
    if (!query.trim()) return;
    vscode.postMessage({
      command: 'PZ_ASK',
      payload: { query, useSelection }
    });
  };

  const handleFeedback = (candidateId: string, action: 'accept' | 'good' | 'bad' | 'regenerate') => {
    vscode.postMessage({
      command: 'PZ_FEEDBACK',
      payload: { candidateId, action }
    });
  };

  if (!profile || !metrics) return <div>Loading personalization state...</div>;

  return (
    <div className="personalization-panel">
      <div className="pz-controls" style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label>現在の状況: </label>
          <select 
            value={profile.currentSituation} 
            onChange={e => vscode.postMessage({ command: 'PZ_SET_SITUATION', payload: e.target.value })}
          >
            <option value="learning">学習中</option>
            <option value="ideation">アイデア発散中</option>
            <option value="design_review">設計レビュー中</option>
            <option value="implementation">実装中</option>
            <option value="debugging">デバッグ中</option>
            <option value="deadline_rush">締切直前</option>
          </select>
        </div>
        <div>
          <label>人格モード: </label>
          <select
            value={profile.currentPersonaMode}
            onChange={e => vscode.postMessage({ command: 'PZ_SET_PERSONA_MODE', payload: e.target.value })}
          >
            <option value="adaptive">状況変動型 (E)</option>
            <option value="fixed:exploration">探究型 (A)</option>
            <option value="fixed:learning">学習型 (B)</option>
            <option value="fixed:quality">品質・設計型 (D)</option>
          </select>
        </div>
      </div>

      <div className="pz-input" style={{ marginBottom: '10px' }}>
        <textarea 
          placeholder="質問を入力..." 
          value={query} 
          onChange={e => setQuery(e.target.value)}
          style={{ width: '100%', minHeight: '60px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)' }}
        />
        <label>
          <input 
            type="checkbox" 
            checked={useSelection} 
            onChange={e => setUseSelection(e.target.checked)} 
          />
          エディタの選択範囲を含める
        </label>
        <button onClick={handleAsk} disabled={isBusy || !query.trim()} style={{ marginLeft: '10px' }}>
          {isBusy ? 'AI思考中...' : '送信'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--vscode-errorForeground)', marginBottom: '10px' }}>{error}</div>}

      {candidates.length > 0 && (
        <div className="pz-candidates">
          <h3>上位の候補</h3>
          <div className="candidate-card" style={{ border: '1px solid var(--vscode-focusBorder)', padding: '10px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
              <span className="badge">Rank 1: {candidates[0].persona} (Score: {candidates[0].score?.toFixed(2)})</span>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: '10px 0', fontSize: '0.9em' }}>{candidates[0].text}</pre>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button onClick={() => handleFeedback(candidates[0].id, 'accept')}>採用</button>
              <button onClick={() => handleFeedback(candidates[0].id, 'good')}>👍</button>
              <button onClick={() => handleFeedback(candidates[0].id, 'bad')}>👎</button>
              <button onClick={() => handleFeedback(candidates[0].id, 'regenerate')}>🔄 再生成</button>
            </div>
          </div>

          <details>
            <summary>他の候補を見る ({candidates.length - 1}件)</summary>
            {candidates.slice(1).map((c, i) => (
              <div key={c.id} style={{ borderTop: '1px solid var(--vscode-widget-border)', padding: '10px 0' }}>
                <div><span className="badge">Rank {i + 2}: {c.persona} (Score: {c.score?.toFixed(2)})</span></div>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '5px 0', fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)' }}>{c.text}</pre>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button onClick={() => handleFeedback(c.id, 'accept')}>採用</button>
                  <button onClick={() => handleFeedback(c.id, 'bad')}>👎</button>
                </div>
              </div>
            ))}
          </details>
        </div>
      )}
    </div>
  );
}


