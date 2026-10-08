import { useState } from 'react';
import type { Proposal } from '../types/index';
import { DiffView } from './DiffView';

interface CenterPaneProps {
  proposals: Proposal[];
  isProcessing: boolean;
  currentStage: string;
  onAccept: (id: string) => void;
  onForceAnalyze: () => void;
}

export function CenterPane({ proposals, isProcessing, currentStage, onAccept, onForceAnalyze }: CenterPaneProps) {
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  const toggleExplanation = (id: string) => {
    setExpandedExplanations(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="pane center-pane">
      <div className="center-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3>AI Workspace</h3>
        <button 
          onClick={onForceAnalyze} 
          disabled={isProcessing}
          style={{ padding: '5px 10px', backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', cursor: 'pointer' }}
        >
          {isProcessing ? 'Thinking...' : '⚡ Intervene Now'}
        </button>
      </div>

      {isProcessing && (
        <div className="status-badge">
          ⏳ AI is thinking: {currentStage}
        </div>
      )}

      {proposals.length === 0 && !isProcessing && (
        <div style={{ opacity: 0.5, marginTop: '20px' }}>
          No proposals yet. Start typing in your VS Code editor to see AI suggestions here!
        </div>
      )}

      {proposals.map(p => (
        <div key={p.id} className="proposal-card">
          <div className="proposal-header">
            <span>✨ AI Suggestion</span>
            <span style={{ color: p.status === 'accepted' ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-descriptionForeground)' }}>
              {p.status === 'accepted' ? '✓ Accepted' : 'Pending'}
            </span>
          </div>
          <div className="proposal-content">
            <div 
              onClick={() => toggleExplanation(p.id)}
              style={{ cursor: 'pointer', padding: '10px 15px', fontSize: '0.85em', opacity: 0.8, backgroundColor: 'var(--vscode-editorGroupHeader-noTabsBackground, #1e1e1e)', userSelect: 'none' }}
            >
              ▶ <strong>Reason / Memo</strong> (Click to {expandedExplanations[p.id] ? 'collapse' : 'expand'})
            </div>
            {expandedExplanations[p.id] && (
              <div style={{ padding: '10px 15px', fontSize: '0.85em', borderTop: '1px solid var(--vscode-panel-border)' }}>
                {p.explanation.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
            <pre className="code-diff" style={{ overflowX: 'auto', whiteSpace: 'pre', fontSize: '0.9em' }}>
              <DiffView original={p.originalText} proposed={p.proposedText} />
            </pre>
          </div>
          {p.status !== 'accepted' && (
            <div className="proposal-actions">
              <button onClick={() => onAccept(p.id)}>Accept Change</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
