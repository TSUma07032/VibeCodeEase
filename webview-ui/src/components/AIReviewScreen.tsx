import React, { useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { AiWorkspaceState } from '../types';

interface AIReviewScreenProps {
  workspaceState: AiWorkspaceState | null;
  vscode: any;
}

export const AIReviewScreen: React.FC<AIReviewScreenProps> = ({ workspaceState, vscode }) => {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);
  const widgetsRef = useRef<any[]>([]);

  // TODO(Next-Gen Agent): GitHub風のDiff表示とインタラクティブな学習支援
  // 現在は単一のエディタにハイライトとインラインウィジェットを表示しているが、
  // 長期的にはGitHubのPRレビュー画面のようなSide-by-SideのDiffビューや、
  // ユーザーがAIの提案に対して対話的に質問できるチャット機能（ポップオーバー内など）の実装を検討すること。

  useEffect(() => {
    if (monaco && editorRef.current && workspaceState?.diffs) {
      const editor = editorRef.current;
      
      // Clear old widgets
      widgetsRef.current.forEach(w => editor.removeContentWidget(w));
      widgetsRef.current = [];

      const newDecorations = workspaceState.diffs.map(diff => {
        return {
          range: new monaco.Range(diff.aiStartLine + 1, 1, diff.aiEndLine + 1, 1),
          options: {
            isWholeLine: true,
            className: 'ai-diff-highlight',
            marginClassName: 'ai-diff-margin',
          }
        };
      });

      editor.createDecorationsCollection(newDecorations);

      workspaceState.diffs.forEach(diff => {
        const widgetId = `diff-widget-${diff.id}`;
        
        const domNode = document.createElement('div');
        domNode.className = 'ai-comment-widget';
        domNode.style.background = 'var(--vscode-editorInfo-background)';
        domNode.style.border = '1px solid var(--vscode-editorInfo-border)';
        domNode.style.padding = '8px';
        domNode.style.borderRadius = '4px';
        domNode.style.color = 'var(--vscode-editorInfo-foreground)';
        domNode.style.fontSize = '12px';
        domNode.style.maxWidth = '400px';
        domNode.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        domNode.style.zIndex = '10';
        
        const message = document.createElement('div');
        message.innerText = diff.message;
        message.style.marginBottom = '8px';
        domNode.appendChild(message);

        const applyBtn = document.createElement('button');
        applyBtn.innerText = '✨ Apply';
        applyBtn.className = 'action-button small';
        applyBtn.onclick = () => {
          vscode?.postMessage({ command: 'APPLY_WORKSPACE_DIFF', payload: diff });
        };
        domNode.appendChild(applyBtn);

        const widget = {
          getId: () => widgetId,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: {
              lineNumber: diff.aiStartLine + 1,
              column: 1
            },
            preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.ABOVE]
          })
        };
        
        editor.addContentWidget(widget);
        widgetsRef.current.push(widget);
      });
    }
  }, [monaco, workspaceState, vscode]);

  if (!workspaceState || !workspaceState.files || workspaceState.files.length === 0) {
    return <div style={{ padding: '20px' }}>AIの提案はありません。</div>;
  }

  const handleApplyAll = () => {
    if (workspaceState.activeFileUri && workspaceState.diffs) {
      vscode?.postMessage({ command: 'APPLY_ALL_WORKSPACE_DIFFS', payload: { uri: workspaceState.activeFileUri, diffs: workspaceState.diffs } });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', padding: '10px', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <select 
          className="styled-select" 
          value={workspaceState.activeFileUri || ''}
          onChange={(e) => vscode?.postMessage({ command: 'SELECT_WORKSPACE_FILE', payload: { uri: e.target.value } })}
          style={{ maxWidth: '70%' }}
        >
          {workspaceState.files.map(file => (
            <option key={file.uri} value={file.uri}>{file.label}</option>
          ))}
        </select>
        
        <button className="action-button" onClick={handleApplyAll} disabled={!workspaceState.diffs || workspaceState.diffs.length === 0}>
          🚀 Apply All
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Editor
          height="100%"
          language={workspaceState.languageId === 'typescriptreact' ? 'typescript' : workspaceState.languageId === 'javascriptreact' ? 'javascript' : workspaceState.languageId || 'javascript'}
          theme="vs-dark"
          value={workspaceState.aiCode || ''}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            lineNumbersMinChars: 3
          }}
          onMount={(editor: any) => { editorRef.current = editor; }}
        />
      </div>
    </div>
  );
};
