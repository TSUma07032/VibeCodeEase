import * as vscode from 'vscode';
import { PanelProvider } from '../vscode-utils/PanelProvider';
import { GeminiClient } from './llm/geminiClient';
import { INTERVENTION_RESPONSE_SCHEMA } from './llm/promptBuilder';

export interface LlmSettings {
  llmApiKey: string;
  interventionLevel: number;
}

export class LlmBackgroundService implements vscode.Disposable {
  private _tokenSource: vscode.CancellationTokenSource | null = null;
  private _disposables: vscode.Disposable[] = [];
  private _typingTimeout: NodeJS.Timeout | null = null;
  private _lastProcessedCode: string = '';
  private _geminiClient = new GeminiClient();

  public cancelAnalysis() {
    if (this._tokenSource) {
      this._tokenSource.cancel();
      this._tokenSource.dispose();
      this._tokenSource = null;
    }
  }

  public handleDocumentChange(e: vscode.TextDocumentChangeEvent, settings: LlmSettings) {
    if (!PanelProvider.currentPanel || e.document.uri.scheme !== 'file') {
      return;
    }

    const currentCode = e.document.getText();
    if (currentCode === this._lastProcessedCode) {
      return;
    }

    this.cancelAnalysis();

    if (settings.interventionLevel < 10) {
      return;
    }
    
    let debounceTime = 1500;
    if (settings.interventionLevel < 40) {
      debounceTime = 3000;
    } else if (settings.interventionLevel > 80) {
      debounceTime = 800;
    }

    if (this._typingTimeout) {
      clearTimeout(this._typingTimeout);
    }

    this._typingTimeout = setTimeout(() => {
      this._lastProcessedCode = currentCode;
      this.run3LLMPipeline(currentCode, e.document.uri, settings);
    }, debounceTime);
  }

  public async run3LLMPipeline(code: string, documentUri: vscode.Uri, settings: LlmSettings) {
    this.cancelAnalysis();
    this._tokenSource = new vscode.CancellationTokenSource();
    const token = this._tokenSource.token;

    try {
      const apiKey = settings.llmApiKey;
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
    
    if (proposal.documentUri) {
      const uri = vscode.Uri.parse(proposal.documentUri);
      const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
      
      if (editor) {
        // Safe replace strategy to prevent full overwrite of new user changes
        // For this mock we just replace the whole file if it hasn't changed.
        // In a true production app, use vscode.WorkspaceEdit with precise ranges.
        const currentText = editor.document.getText();
        if (currentText === proposal.originalText) {
          const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(currentText.length)
          );
          await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, proposal.proposedText);
          });
          this._lastProcessedCode = proposal.proposedText;
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
    if (this._typingTimeout) {
      clearTimeout(this._typingTimeout);
    }
    this.cancelAnalysis();
    this._disposables.forEach(d => d.dispose());
  }
}

