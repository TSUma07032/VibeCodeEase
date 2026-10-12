import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { vscode } from '../utils/vscode';

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Dashboard implementation for LLM status, response, and error logs visualization.
interface DashboardPanelProps {
  status: 'idle' | 'loading' | 'error';
  response: { text: string; timestamp: number } | null;
  logs: Array<{ message: string; timestamp: number }>;
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ status, response, logs }) => {
  const [view, setView] = useState<'response' | 'log'>('response');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (response) {
      navigator.clipboard.writeText(response.text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const statusText = status === 'loading' ? '⏳ 解析中' : status === 'error' ? '❌ エラー' : '⚪ 待機中';

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: '8px' }}>
        <button
          onClick={() => setView('response')}
          style={{
            padding: '4px 12px',
            background: view === 'response' ? 'var(--vscode-button-background)' : 'transparent',
            color: view === 'response' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-button-background)',
            cursor: 'pointer'
          }}
        >
          Response
        </button>
        <button
          onClick={() => setView('log')}
          style={{
            padding: '4px 12px',
            background: view === 'log' ? 'var(--vscode-button-background)' : 'transparent',
            color: view === 'log' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-button-background)',
            cursor: 'pointer'
          }}
        >
          Error Log
        </button>
      </div>

      {view === 'response' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{statusText}</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => vscode.postMessage({ command: 'force_analyze' })}
                disabled={status === 'loading'}
                style={{
                  padding: '4px 8px',
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: status === 'loading' ? 0.6 : 1
                }}
              >
                ▶️ 手動実行
              </button>
              <button
                onClick={handleCopy}
                disabled={!response}
                style={{
                  padding: '4px 8px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  cursor: !response ? 'not-allowed' : 'pointer',
                  opacity: !response ? 0.6 : 1
                }}
              >
                {isCopied ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
          
          <div style={{ flexGrow: 1, overflowY: 'auto', padding: '12px', background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)' }}>
            {!response ? (
              <p>まだ解析結果はありません。</p>
            ) : (
              <ReactMarkdown>{DOMPurify.sanitize(response.text)}</ReactMarkdown>
            )}
          </div>
        </div>
      )}

      {view === 'log' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Error Logs</h3>
            <button
              onClick={() => vscode.postMessage({ command: 'clear_error_logs' })}
              disabled={logs.length === 0}
              style={{
                padding: '4px 8px',
                background: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                border: 'none',
                cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: logs.length === 0 ? 0.6 : 1
              }}
            >
              🗑 Clear
            </button>
          </div>

          <div style={{ flexGrow: 1, overflowY: 'auto', padding: '12px', background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)' }}>
            {logs.length === 0 ? (
              <p>エラーログはありません。</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {logs.map((log, index) => (
                  <li key={index} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    <span style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: '4px' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span style={{ color: 'var(--vscode-errorForeground)' }}>{log.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
