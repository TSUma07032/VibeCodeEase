import React from 'react';
import type { WebviewIntervention } from '../types';

interface ProposalPopupProps {
    intervention: WebviewIntervention;
    onApply: (intervention: WebviewIntervention) => void;
    onDiscard: (id: string) => void;
}

/**
 * [Why/Intent] フローティング（絶対配置）ではなく「対象行の直下にインラインブロックとして挿入」することで、
 * スクロール追従性、行レイアウトの崩れ防止、および視線移動を最小化するためのコンポーネント。
 */
export const ProposalPopup: React.FC<ProposalPopupProps> = ({ intervention, onApply, onDiscard }) => {
    return (
        <div style={{
            margin: '8px 0 8px 40px', // Indent to align roughly with code
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            backgroundColor: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)',
            fontFamily: 'sans-serif',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            display: 'block' // Inline below the line
        }}>
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
                {intervention.message}
            </div>
            
            <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>変更前</div>
                <pre style={{
                    margin: 0,
                    padding: '8px',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)', // [Why/Intent] コード差分（削除・変更前）を直感的に識別させるため赤系
                    borderLeft: '4px solid #f44336',
                    overflowX: 'auto',
                    fontFamily: 'monospace'
                }}>
                    {intervention.originalText}
                </pre>
            </div>

            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>変更後</div>
                <pre style={{
                    margin: 0,
                    padding: '8px',
                    backgroundColor: 'rgba(0, 255, 0, 0.1)', // [Why/Intent] コード差分（追加・変更後）を直感的に識別させるため緑系
                    borderLeft: '4px solid #4caf50',
                    overflowX: 'auto',
                    fontFamily: 'monospace'
                }}>
                    {intervention.replacementText}
                </pre>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                    // [Why/Intent] 反映ボタン: この変更を承認し、実際のファイルに適用させる意図を伝える
                    onClick={() => onApply(intervention)}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        border: 'none',
                        borderRadius: '2px',
                        cursor: 'pointer'
                    }}
                >
                    [反映 (Accept)]
                </button>
                <button 
                    // [Why/Intent] 破棄ボタン: この提案は不要であるというユーザーの意図を伝え、除外させる
                    onClick={() => onDiscard(intervention.id)}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        color: 'var(--vscode-button-foreground)',
                        border: '1px solid var(--vscode-button-background)',
                        borderRadius: '2px',
                        cursor: 'pointer'
                    }}
                >
                    [破棄 (Discard)]
                </button>
            </div>
        </div>
    );
};
