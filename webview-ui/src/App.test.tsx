import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import { mockPostMessage } from './test/setup';

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => <div data-testid="monaco-editor-mock">Monaco Editor Mock</div>,
  useMonaco: () => ({
    Range: class Range {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
      constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
        this.startLineNumber = startLineNumber;
        this.startColumn = startColumn;
        this.endLineNumber = endLineNumber;
        this.endColumn = endColumn;
      }
    },
    editor: {
      ContentWidgetPositionPreference: { BELOW: 1, ABOVE: 2 }
    }
  })
}));

describe('App Component (Webview UI)', () => {
  it('initial render sends GET_SETTINGS and shows AI Review Screen', () => {
    render(<App />);

    expect(mockPostMessage).toHaveBeenCalledWith({ command: 'GET_SETTINGS' });
    expect(screen.getByText('✨ vibeCodeEase')).toBeInTheDocument();
    expect(screen.getByTitle('設定を開く')).toBeInTheDocument();
    
    // AI Review screen is default
    expect(screen.getByText('AIの提案はありません。')).toBeInTheDocument();
  });

  it('toggles settings view when clicking settings icon', () => {
    render(<App />);
    const toggleBtn = screen.getByTitle('設定を開く');
    fireEvent.click(toggleBtn);

    // Settings screen
    expect(screen.getByText(/Section 1: UIUX Settings/)).toBeInTheDocument();
    
    const backBtn = screen.getByTitle('レビュー画面に戻る');
    fireEvent.click(backBtn);
    expect(screen.getByText('AIの提案はありません。')).toBeInTheDocument();
  });

  it('renders workspace state and sends APPLY_ALL_WORKSPACE_DIFFS when clicked', async () => {
    render(<App />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'WORKSPACE_STATE_UPDATE',
            payload: {
              files: [{ uri: 'file:///test.ts', label: 'test.ts' }],
              activeFileUri: 'file:///test.ts',
              aiCode: 'console.log("test");',
              diffs: [
                {
                  id: 'diff-1',
                  originalStartLine: 0,
                  originalEndLine: 0,
                  aiStartLine: 0,
                  aiEndLine: 0,
                  message: 'AI suggestion',
                  replacementText: 'console.log("test");',
                  category: 'SYNTAX_TYPO'
                }
              ],
              languageId: 'typescript'
            }
          }
        })
      );
    });

    expect(await screen.findByDisplayValue('test.ts')).toBeInTheDocument();
    
    const applyAllBtn = screen.getByRole('button', { name: /Apply All/ });
    fireEvent.click(applyAllBtn);

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'APPLY_ALL_WORKSPACE_DIFFS',
      payload: {
        uri: 'file:///test.ts',
        diffs: expect.any(Array)
      }
    });
  });
});
