import type { Proposal } from '../types/index';

interface CenterPaneProps {
  proposals: Proposal[];
  isProcessing: boolean;
  currentStage: string;
  onAccept: (id: string) => void;
}

export function CenterPane({ proposals, isProcessing, currentStage, onAccept }: CenterPaneProps) {
  return (
    <div className="pane center-pane">
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
            <span style={{ color: p.status === 'accepted' ? '#89d185' : '#cccccc' }}>
              {p.status === 'accepted' ? '✓ Accepted' : 'Pending'}
            </span>
          </div>
          <div className="proposal-content">
            <div style={{ padding: '10px 15px', fontSize: '0.85em', opacity: 0.8, backgroundColor: 'var(--vscode-editorGroupHeader-noTabsBackground, #1e1e1e)' }}>
              {p.explanation}
            </div>
            <pre className="code-diff">
              {p.proposedText}
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

