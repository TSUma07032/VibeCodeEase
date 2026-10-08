import * as vscode from 'vscode';
import { PanelProvider } from '../vscode-utils/PanelProvider';
import { GeminiClient } from './llm/geminiClient';
import { INTERVENTION_RESPONSE_SCHEMA } from './llm/promptBuilder';

export interface LlmSettings {
  llmApiKey: string;
  triggerMode: 'on-save' | 'interval-10s' | 'disabled';
}

export class LlmBackgroundService implements vscode.Disposable {
  private _tokenSource: vscode.CancellationTokenSource | null = null;
  private _disposables: vscode.Disposable[] = [];
  public lastActiveEditorCode: string = '';
  public lastActiveEditorUri: vscode.Uri | undefined;
  private _geminiClient = new GeminiClient();
  private _settings: LlmSettings;
  private _intervalTimer: NodeJS.Timeout | undefined;

  constructor(settings: LlmSettings) {
    this._settings = settings;

    // Track active editor
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.uri.scheme === 'file') {
          this.lastActiveEditorCode = editor.document.getText();
          this.lastActiveEditorUri = editor.document.uri;
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
          this.lastActiveEditorCode = e.document.getText();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this._settings.triggerMode === 'on-save' && document.uri.scheme === 'file') {
          this.lastActiveEditorCode = document.getText();
          this.lastActiveEditorUri = document.uri;
          this.run3LLMPipeline(this.lastActiveEditorCode, this.lastActiveEditorUri);
        }
      })
    );

    if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.scheme === 'file') {
      this.lastActiveEditorCode = vscode.window.activeTextEditor.document.getText();
      this.lastActiveEditorUri = vscode.window.activeTextEditor.document.uri;
    }

    this.updateTriggerLogic();
  }

  public updateSettings(settings: LlmSettings) {
    this._settings = settings;
    this.updateTriggerLogic();
  }

  private updateTriggerLogic() {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = undefined;
    }
    if (this._settings.triggerMode === 'interval-10s') {
      this._intervalTimer = setInterval(() => {
        if (this.lastActiveEditorCode && this.lastActiveEditorUri && this.lastActiveEditorUri.scheme === 'file') {
          this.run3LLMPipeline(this.lastActiveEditorCode, this.lastActiveEditorUri);
        }
      }, 10000);
    }
  }

  public cancelAnalysis() {
    if (this._tokenSource) {
      this._tokenSource.cancel();
      this._tokenSource.dispose();
      this._tokenSource = null;
    }
  }

  public async run3LLMPipeline(code: string, documentUri: vscode.Uri) {
    this.cancelAnalysis();
    this._tokenSource = new vscode.CancellationTokenSource();
    const token = this._tokenSource.token;

    try {
      const apiKey = this._settings.llmApiKey;
      if (!apiKey) {
        throw new Error('Gemini API key is not set. Please configure it in Settings.');
      }

      this.sendStageUpdate('AI Analysis (Gemini)...');
      
      const prompt = `Review the following code and suggest ONE holistic improvement (refactoring, bug fix, or optimization). Return JSON conforming to the schema.
Schema:
${JSON.stringify(INTERVENTION_RESPONSE_SCHEMA)}

Code:
${code}`;

      const response = await this._geminiClient.generate(prompt, apiKey, token) as any;
      if (token.isCancellationRequested) return;

      let proposedText = code;
      let explanation = response.summary || 'No summary provided.';
      
      if (response.edits && Array.isArray(response.edits) && response.edits.length > 0) {
          const edit = response.edits[0];
          if (edit.newText && edit.oldText) {
              proposedText = code.replace(edit.oldText, edit.newText);
              explanation += `\n\nReason: ${edit.reason || 'N/A'}`;
          }
      }

      const proposal = {
        id: Date.now().toString(),
        originalText: code,
        proposedText: proposedText,
        explanation: explanation,
        status: 'pending',
        documentUri: documentUri.toString()
      };

      if (PanelProvider.currentPanel) {
        PanelProvider.currentPanel.sendToWebview('aiProposalsComplete', { proposals: [proposal] });
      }

    } catch (e: unknown) {
      if (e instanceof vscode.CancellationError || token.isCancellationRequested) {
         return;
      }
      if (PanelProvider.currentPanel) {
        const msg = e instanceof Error ? e.message : String(e);
        PanelProvider.currentPanel.sendToWebview('aiProposalsError', { error: msg });
      }
    } finally {
      if (this._tokenSource) {
        this._tokenSource.dispose();
        this._tokenSource = null;
      }
    }
  }

  public async recordAccept(proposal: any) {
    vscode.window.setStatusBarMessage('$(database) Vector DB: Saved Accept history', 3000);
    
    // In a real architecture, we would just emit an event or return a WorkspaceEdit.
    // For now, doing it here to keep it simple but adding a TODO based on architecture review.
    if (proposal.documentUri) {
      const uri = vscode.Uri.parse(proposal.documentUri);
      const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
      
      if (editor) {
        const currentText = editor.document.getText();
        if (currentText === proposal.originalText) {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(currentText.length)
          );
          await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, proposal.proposedText);
          });
          this.lastActiveEditorCode = proposal.proposedText;
        } else {
          vscode.window.showWarningMessage('Code has changed since proposal. Manual merge needed.');
        }
      }
    }

    const newTrend = `Updated ${new Date().toLocaleTimeString()}: User prefers backend refactoring.`;
    if (PanelProvider.currentPanel) {
      PanelProvider.currentPanel.sendToWebview('personalizationUpdated', { trend: newTrend });
    }
  }

  private sendStageUpdate(stage: string) {
    if (PanelProvider.currentPanel) {
      PanelProvider.currentPanel.sendToWebview('aiStageUpdate', { stage });
    }
  }

  dispose() {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
    }
    this.cancelAnalysis();
    this._disposables.forEach(d => d.dispose());
  }
}

