import * as vscode from 'vscode';
import { SidebarProvider } from '../vscode-utils/SidebarProvider';
import { GeminiClient } from './llm/geminiClient';
import { INTERVENTION_RESPONSE_SCHEMA } from './llm/promptBuilder';

export type InterventionMode = 'hinting' | 'silent_fixer' | 'architect';

export interface LlmSettings {
  llmModel: string;
  llmApiKey: string;
  triggerMode: 'on-save' | 'interval-10s' | 'disabled';
  interventionMode?: InterventionMode;
}

/**
 * @AI_AGENT_NOTE LlmBackgroundService Class
 * ROLE: The "Git Daemon" / Background Worker for the AI Workspace.
 * 
 * WHY: This service listens to file changes/saves and asynchronously triggers the AI analysis (`run3LLMPipeline`).
 * It implements the non-blocking, background nature of the Git-like workflow. The AI works on a "remote branch",
 * meaning it never directly edits the user's active VS Code editor unless the user explicitly pulls the change (`recordAccept`).
 * 
 * HINTS FOR FUTURE AGENTS:
 * - `run3LLMPipeline`: Uses `getPromptByMode()` to adjust its LLM instructions based on `InterventionMode`.
 * - `recordAccept`: This is the equivalent of a `git pull`. It maps the `proposal.proposedText` back to the user's local VS Code editor. 
 *   Be careful with the edit logic here; it currently checks if the local code has diverged (`currentText === proposal.originalText`) 
 *   to prevent merge conflicts, which is a crucial safety mechanism!
 */
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
        if (document.uri.scheme === 'file') {
          this.lastActiveEditorCode = document.getText();
          this.lastActiveEditorUri = document.uri;
          
          // User Sync / Push (Silent sync to AI workspace)
          vscode.commands.executeCommand('vibecodeease.syncCurrentCode');
          
          if (this._settings.triggerMode === 'on-save') {
            this.run3LLMPipeline(this.lastActiveEditorCode, this.lastActiveEditorUri);
          }
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
    console.log('[VibeCodeEase:Service] updateSettings received:', settings);
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

  private getPromptByMode(): string {
    const mode = this._settings.interventionMode || 'silent_fixer';
    switch (mode) {
      case 'hinting':
        return 'Review the code and provide gentle hints or point out potential issues without rewriting large parts of the code. Focus on educational feedback.';
      case 'architect':
        return 'Review the code aggressively for architectural improvements, design patterns, and large-scale refactoring opportunities. Suggest bold structural changes.';
      case 'silent_fixer':
      default:
        return 'Review the code and quietly fix typos, lint errors, or minor bugs without making unnecessary structural changes.';
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
      
      const modePrompt = this.getPromptByMode();
      const prompt = `${modePrompt} Suggest ONE holistic improvement. Return JSON conforming to the schema.\n\nIMPORTANT: The 'oldText' in your edits MUST EXACTLY match a substring of the original code, including all whitespaces and indentation. Do not omit any characters. If you want to replace a block, include the entire block exactly as it appears in the code.\n\nSchema:\n${JSON.stringify(INTERVENTION_RESPONSE_SCHEMA)}\n\nCode:\n${code}`;
      
      console.log('[VibeCodeEase:Service] Calling GeminiClient.generate with model:', this._settings.llmModel);
      const response = await this._geminiClient.generate(prompt, apiKey, token, this._settings.llmModel) as any;
      console.log('[VibeCodeEase:Service] GeminiClient.generate returned:', response);
      if (token.isCancellationRequested) {
        console.log('[VibeCodeEase:Service] Token was cancelled after response.');
        return;
      }

      let proposedText = code;
      let explanation = response.summary || 'No summary provided.';
      
      if (response.edits && Array.isArray(response.edits) && response.edits.length > 0) {
          const edit = response.edits[0];
          console.log('[VibeCodeEase:Service] Applying edit:', { oldText: edit.oldText, newText: edit.newText });
          if (edit.newText && edit.oldText) {
              const normalizedCode = code.replace(/\r\n/g, '\n');
              const normalizedOld = edit.oldText.replace(/\r\n/g, '\n');
              
              if (normalizedCode.includes(normalizedOld)) {
                  proposedText = normalizedCode.replace(normalizedOld, edit.newText);
                  console.log('[VibeCodeEase:Service] Replace successful.');
              } else {
                  console.warn('[VibeCodeEase:Service] Replace failed: oldText not found in the code.');
              }
              explanation += `\n\nReason: ${edit.reason || 'N/A'}`;
          }
      }

      console.log('[VibeCodeEase:Service] proposedText === code ?', proposedText === code, 'proposedText === normalizedCode ?', proposedText === code.replace(/\r\n/g, '\n'));
      if (proposedText === code || proposedText === code.replace(/\r\n/g, '\n')) {
        // No changes made by AI or failed to apply patch
        if (SidebarProvider.currentView) {
            console.log('[VibeCodeEase:Service] No changes applied. Notifying UI.');
            SidebarProvider.currentView.sendToWebview('aiStageUpdate', { stage: '' });
            SidebarProvider.currentView.sendToWebview('aiProposalsError', { error: 'AI made no changes, or failed to match the existing code for replacement.' });
        }
        return;
      }

      console.log('[VibeCodeEase:Service] Creating proposal...');
      const proposal = {
        id: Date.now().toString(),
        originalText: code,
        proposedText: proposedText,
        explanation: `[${this._settings.interventionMode || 'silent_fixer'}] ${explanation}`,
        status: 'pending',
        documentUri: documentUri.toString(),
        isAiPush: true
      };

      if (SidebarProvider.currentView) {
        console.log('[VibeCodeEase:Service] Sending aiProposalsComplete', proposal);
        SidebarProvider.currentView.sendToWebview('aiProposalsComplete', { proposals: [proposal] });
      }

    } catch (e: unknown) {
      if (e instanceof vscode.CancellationError || token.isCancellationRequested) {
         console.log('[VibeCodeEase:Service] Pipeline cancelled.', e);
         return;
      }
      console.error('[VibeCodeEase:Service] Error in run3LLMPipeline:', e);
      if (SidebarProvider.currentView) {
        const msg = e instanceof Error ? e.message : String(e);
        SidebarProvider.currentView.sendToWebview('aiProposalsError', { error: msg });
      }
    } finally {
      if (this._tokenSource) {
        this._tokenSource.dispose();
        this._tokenSource = null;
      }
    }
  }

  public async recordAccept(proposal: any) {
    vscode.window.setStatusBarMessage('$(git-pull-request) AI Workspace: Pulled changes', 3000);
    
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
          vscode.window.showWarningMessage('Code has changed since AI pushed. Manual merge needed.');
        }
      }
    }

    const newTrend = `Updated ${new Date().toLocaleTimeString()}: User pulled from AI Workspace.`;
    if (SidebarProvider.currentView) {
      SidebarProvider.currentView.sendToWebview('personalizationUpdated', { trend: newTrend });
    }
  }

  private sendStageUpdate(stage: string) {
    if (SidebarProvider.currentView) {
      SidebarProvider.currentView.sendToWebview('aiStageUpdate', { stage });
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
