import * as vscode from 'vscode';
import { LlmInterventionService } from '../core/llmInterventionService';
import { DEFAULT_TYPO_RULES } from '../core/analyzer';
import {
    LlmInterventionPlan,
    PainCategory,
    PresetMode,
    PRESET_DEFINITIONS,
    PRESET_MODES,
    parsePainCategory,
    clampPreferenceValue,
    RuleSummary,
    LlmTriggerMode
} from '../types';
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

        // TODO
    }

    public async sendCurrentSettings(webview: vscode.Webview): Promise<void> {
        const state = GlobalState.getInstance();
        let apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
        if (!apiKey) {
            apiKey = vscode.workspace.getConfiguration('vibecodeease').get<string>('geminiApiKey');
        }

        // ルールカタログ: DEFAULT_TYPO_RULES を軽量 RuleSummary にシリアライズ
        const activeRules: RuleSummary[] = DEFAULT_TYPO_RULES.map(r => ({
            pattern: r.pattern,
            replacement: r.replacement,
            category: r.category,
            ...(r.languageId ? { languageId: r.languageId } : {})
        }));

        webview.postMessage({
            type: 'SETTINGS_DATA',
            payload: {
                presetMode: state.presetMode,
                preferences: state.preferences.preferences,
                presetDefinitions: PRESET_DEFINITIONS,
                llmConfig: state.llmConfig,
                hasGeminiApiKey: !!apiKey,
                activeRules,
                llmTriggerMode: state.llmTriggerMode
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
                    const state = GlobalState.getInstance();
                    if (state.llmProvider === 'gemini') {
                        let apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
                        if (!apiKey) {
                            apiKey = vscode.workspace.getConfiguration('vibecodeease').get<string>('geminiApiKey');
                        }
                        if (!apiKey) {
                            throw new Error('Gemini APIキーが設定されていません。設定(Settings)またはサイドバーからGemini APIキーを設定してください。');
                        }
                        return await this.llmService.createGeminiPlan(editor.document, source.token, apiKey, state.llmModel);
                    } else {
                        return await this.llmService.createPlan(editor.document, source.token, state.llmModel);
                    }
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
        if (applied && this.actionCallback) {
            this.actionCallback('APPLY', pending.plan, pending.documentUri);
        }
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
