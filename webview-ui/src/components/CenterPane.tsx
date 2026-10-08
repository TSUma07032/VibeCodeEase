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

// [INTENT: お客様の真の要望「同期されたコードが表示され、そこに対する差分が履歴として蓄積されるGitHub風UI」を実現するためのコンポーネント]
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
    // [INTENT: 「今すぐ介入」ボタン。同期されたコードまたは現在のエディタのコードを分析に回す]
    getVSCodeAPI().postMessage({ command: 'forceAnalyze', code: currentSyncCode });
  };

  return (
    <div className="pane center-pane" style={{ padding: '10px' }}>
      <div className="status-bar" style={{ marginBottom: '10px' }}>
        <span className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className={`led ${isProcessing ? 'blinking' : 'on'}`} />
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

      <div className="proposals-list" style={{ display: 'flex', flexDirection: 'column-reverse', gap: '15px' }}>
        {proposals.map(p => (
          <div key={p.id} className="proposal-card" style={{ border: '1px solid var(--vscode-editorGroup-border)', background: 'var(--vscode-editor-background)', borderRadius: '4px', overflow: 'hidden' }}>
            <div 
              className="proposal-header" 
              onClick={() => toggleReason(p.id)}
              style={{ padding: '8px 12px', background: 'var(--vscode-editorGroupHeader-tabsBackground)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
            >
              <span>{expandedReasons.has(p.id) ? '▼' : '▶'} Reason / Memo</span>
              <span style={{ fontSize: '0.8em', opacity: 0.6 }}>{new Date(parseInt(p.id)).toLocaleTimeString()}</span>
            </div>
            
            {expandedReasons.has(p.id) && (
              <div className="proposal-reason" style={{ padding: '10px', borderBottom: '1px solid var(--vscode-editorGroup-border)', fontSize: '0.9em', color: 'var(--vscode-descriptionForeground)' }}>
                {p.explanation}
              </div>
            )}

            <div className="proposal-diff" style={{ padding: '10px', fontSize: '12px', overflowX: 'auto' }}>
              <DiffView original={p.originalText} proposed={p.proposedText} />
            </div>
            
            <div className="proposal-actions" style={{ padding: '10px', display: 'flex', gap: '10px', borderTop: '1px solid var(--vscode-editorGroup-border)' }}>
              <button onClick={() => onAccept(p)} style={{ flex: 1 }}>✅ Accept & Merge</button>
              <button className="secondary" onClick={() => onDismiss(p.id)} style={{ padding: '4px 12px' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

