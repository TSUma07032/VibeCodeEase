import * as vscode from 'vscode';
import { LlmInterventionService } from '../core/llmInterventionService';
import { LlmInterventionPlan, PainCategory, PresetMode, PRESET_DEFINITIONS } from '../types';
import { GlobalState } from '../state/globalState';

export interface PendingPlan {
    documentUri: string;
    documentVersion: number;
    plan: LlmInterventionPlan;
}

export type ActionCallback = (action: 'APPLY' | 'REJECT', plan: LlmInterventionPlan, documentUri: string) => void;

export class WebviewMessageHandler {
    private pendingPlan?: PendingPlan;
    private actionCallback?: ActionCallback;

    constructor(
        private readonly secrets: vscode.SecretStorage,
        private readonly llmService: LlmInterventionService = new LlmInterventionService()
    ) { }

    public setActionCallback(callback: ActionCallback): void {
        this.actionCallback = callback;
    }

    public getPendingPlan(): PendingPlan | undefined {
        return this.pendingPlan;
    }

    /**
     * Webviewから受信したメッセージを検証・ルーティングして適切な処理を実行する
     */
    public async handleMessage(data: unknown, webview: vscode.Webview): Promise<void> {
        // 🛡️ Sentinel: Validate webview payload structure to prevent DoS via unhandled exception
        if (typeof data !== 'object' || data === null || !('command' in data) || typeof (data as { command: unknown }).command !== 'string') {
            return;
        }

        const message = data as { command: string; payload?: unknown; data?: { message?: unknown } };

        switch (message.command) {
            case 'GET_SETTINGS': {
                this.sendCurrentSettings(webview);
                break;
            }
            case 'SET_PRESET': {
                const preset = message.payload as PresetMode;
                if (preset === 'LEARNING' || preset === 'FLOW' || preset === 'ZEN' || preset === 'CUSTOM') {
                    await GlobalState.getInstance().setPresetMode(preset);
                    this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'UPDATE_PREFERENCE_VALUE': {
                const { category, value } = message.payload as { category: PainCategory; value: number };
                if (typeof category === 'string' && typeof value === 'number') {
                    await GlobalState.getInstance().updatePreference(category, value);
                    this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'ANALYZE_CURRENT_FILE': {
                await this.handleAnalyzeCurrentFile(webview);
                break;
            }
            case 'APPLY_PLAN': {
                await this.handleApplyPlan(webview);
                break;
            }
            case 'REJECT_PLAN': {
                if (this.pendingPlan && this.actionCallback) {
                    this.actionCallback('REJECT', this.pendingPlan.plan, this.pendingPlan.documentUri);
                }
                this.pendingPlan = undefined;
                webview.postMessage({ type: 'PLAN_REJECTED' });
                break;
            }
            case 'UPDATE_PREFERENCE': {
                this.handleUpdatePreference((message as any).data?.message);
                break;
            }
            default: {
                // 🛡️ Sentinel: Safely ignore unrecognized commands to prevent unhandled processing
                break;
            }
        }
    }

    public sendCurrentSettings(webview: vscode.Webview): void {
        const state = GlobalState.getInstance();
        webview.postMessage({
            type: 'SETTINGS_DATA',
            payload: {
                presetMode: state.presetMode,
                preferences: state.preferences.preferences,
                presetDefinitions: PRESET_DEFINITIONS
            }
        });
    }

    private async handleAnalyzeCurrentFile(webview: vscode.Webview): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            webview.postMessage({ type: 'ERROR', payload: '解析するファイルをエディタで開いてください。' });
            return;
        }

        webview.postMessage({ type: 'ANALYSIS_STARTED' });
        const source = new vscode.CancellationTokenSource();
        try {
            const plan = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: 'vibeCodeEase: Analyzing with LLM...',
                    cancellable: false
                },
                async () => {
                    const apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
                    return apiKey
                        ? await this.llmService.createGeminiPlan(editor.document, source.token, apiKey)
                        : await this.llmService.createPlan(editor.document, source.token);
                }
            );

            this.pendingPlan = {
                documentUri: editor.document.uri.toString(),
                documentVersion: editor.document.version,
                plan
            };
            webview.postMessage({
                type: 'INTERVENTION_PLAN',
                payload: {
                    plan,
                    currentPreset: GlobalState.getInstance().presetMode
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'LLMによる解析に失敗しました。';
            webview.postMessage({ type: 'ERROR', payload: message });
        } finally {
            source.dispose();
        }
    }

    private async handleApplyPlan(webview: vscode.Webview): Promise<void> {
        const pending = this.pendingPlan;
        const editor = vscode.window.activeTextEditor;
        if (!pending || !editor || editor.document.uri.toString() !== pending.documentUri || editor.document.version !== pending.documentVersion) {
            webview.postMessage({ type: 'ERROR', payload: 'ファイルが変更されたため、提案を適用できません。もう一度解析してください。' });
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        for (const proposedEdit of pending.plan.edits) {
            const range = new vscode.Range(
                proposedEdit.startLine,
                proposedEdit.startCharacter,
                proposedEdit.endLine,
                proposedEdit.endCharacter
            );
            edit.replace(editor.document.uri, range, proposedEdit.newText);
        }

        const applied = await vscode.workspace.applyEdit(edit);
        this.pendingPlan = undefined;
        webview.postMessage({ type: applied ? 'PLAN_APPLIED' : 'ERROR', payload: applied ? undefined : '変更を適用できませんでした。' });
    }

    private handleUpdatePreference(rawMessageInput: unknown): void {
        // 🛡️ Sentinel: Sanitize user input to prevent UI spoofing via VS Code icon syntax $(icon-name)
        const rawMessage = typeof rawMessageInput === 'string' ? rawMessageInput : '';
        const sanitizedMessage = rawMessage.replace(/\$\([^)]*\)/g, '');

        // 🛡️ Sentinel: Limit string length to prevent UI freezing DoS attacks
        const limitedMessage = sanitizedMessage.length > 200 ? sanitizedMessage.substring(0, 200) + '...' : sanitizedMessage;

        vscode.window.setStatusBarMessage(
            `$(check) Preference updated: ${limitedMessage}`,
            3000
        );
    }
}
