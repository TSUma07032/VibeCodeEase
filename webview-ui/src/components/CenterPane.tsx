import type { Proposal } from '../types/index';
import { DiffView } from './DiffView';
import { getVSCodeAPI } from '../vscode';
import { useState } from 'react';

interface CenterPaneProps {
  proposals: Proposal[];
  currentSyncCode: string;
  currentStage: string;
  isProcessing: boolean;
  onAccept: (proposal: Proposal) => void;
  onDismiss: (id: string) => void;
}

/**
 * @AI_AGENT_NOTE CenterPane Component
 * ROLE: This component serves as the "Commit History" or "Pull Request" view in the Git-like AI Workspace.
 * 
 * WHY: Instead of automatically overwriting the user's local code (which is intrusive), 
 * the AI and the User "push" to a shared workspace timeline. This CenterPane visualizes these pushes 
 * (both `User Sync` and `AI Push`) as a timeline. The user can then explicitly "Pull (Cherry-pick)" 
 * changes back to their local editor.
 * 
 * HINTS FOR FUTURE AGENTS:
 * - `proposals` array acts like a Git commit log.
 * - `isAiPush` determines the icon (✨ for AI, 📝 for User) and label.
 * - If you modify the DiffView or how proposals are accepted, remember that we are strictly adhering 
 *   to a pull-based (opt-in) model to maintain user trust and control.
 */
export function CenterPane({ proposals, currentSyncCode, currentStage, isProcessing, onAccept, onDismiss }: CenterPaneProps) {
  const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

  const toggleReason = (id: string) => {
    setExpandedReasons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForceAnalyze = () => {
    getVSCodeAPI().postMessage({ command: 'forceAnalyze', code: currentSyncCode });
  };

  return (
    <div className="pane center-pane" style={{ padding: '10px' }}>
      <div className="status-bar" style={{ marginBottom: '10px' }}>
        <span className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`led ${isProcessing ? 'active' : ''}`} />
          {isProcessing ? currentStage : 'AI Idle'}
        </span>
        <button className="secondary" onClick={handleForceAnalyze} disabled={isProcessing}>
          ⚡ Intervene Now
        </button>
      </div>

      {!currentSyncCode && proposals.length === 0 && (
        <div className="empty-state">
          <p>No code synced yet. Click "🔄 Sync" above to mirror your current VS Code editor!</p>
        </div>
      )}

      {currentSyncCode && proposals.length === 0 && (
        <div className="empty-state" style={{ textAlign: 'left' }}>
          <h4>Mirrored Workspace</h4>
          <p style={{ opacity: 0.7, fontSize: '0.8em', marginBottom: '10px' }}>Code successfully synced. Awaiting AI proposals...</p>
          <pre style={{ background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)', padding: '10px', overflowX: 'auto', fontSize: '12px', border: '1px solid var(--vscode-editorGroup-border)' }}>
            <code>{currentSyncCode}</code>
          </pre>
        </div>
      )}

      <div className="timeline" style={{ display: 'flex', flexDirection: 'column-reverse', gap: '15px' }}>
        {proposals.map(p => (
          <div key={p.id} className="timeline-item" style={{ display: 'flex', gap: '10px' }}>
            <div className="timeline-marker" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '1.2em' }}>{p.isAiPush ? '✨' : '📝'}</div>
              <div style={{ flex: 1, width: '2px', background: 'var(--vscode-editorGroup-border)', margin: '5px 0' }} />
            </div>
            
            <div className="proposal-card" style={{ flex: 1, border: '1px solid var(--vscode-editorGroup-border)', background: 'var(--vscode-editor-background)', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                className="proposal-header" 
                onClick={() => toggleReason(p.id)}
                style={{ padding: '8px 12px', background: 'var(--vscode-editorGroupHeader-tabsBackground)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong>{p.isAiPush ? 'AI Push' : 'User Sync'}</strong> 
                  <span style={{ marginLeft: '10px', fontSize: '0.9em' }}>{expandedReasons.has(p.id) ? '▼' : '▶'}</span>
                </div>
                <span style={{ fontSize: '0.8em', opacity: 0.6 }}>{new Date(parseInt(p.id)).toLocaleTimeString()}</span>
              </div>
              
              {expandedReasons.has(p.id) && (
                <div className="proposal-reason" style={{ padding: '10px', borderBottom: '1px solid var(--vscode-editorGroup-border)', fontSize: '0.9em', color: 'var(--vscode-descriptionForeground)' }}>
                  {p.explanation}
                </div>
              )}

              {expandedReasons.has(p.id) && p.originalText !== p.proposedText && (
                <div className="proposal-diff" style={{ padding: '10px', fontSize: '12px', overflowX: 'auto' }}>
                  <DiffView original={p.originalText} proposed={p.proposedText} />
                </div>
              )}
              
              {p.originalText !== p.proposedText && (
                <div className="proposal-actions" style={{ padding: '10px', display: 'flex', gap: '10px', borderTop: '1px solid var(--vscode-editorGroup-border)' }}>
                  <button onClick={() => onAccept(p)} style={{ flex: 1 }}>⬇️ Pull (Cherry-pick)</button>
                  <button className="secondary" onClick={() => onDismiss(p.id)} style={{ padding: '4px 12px' }}>Dismiss</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
