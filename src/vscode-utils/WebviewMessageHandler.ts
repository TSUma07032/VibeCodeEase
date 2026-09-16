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
    LlmTriggerMode,
    LiveIssue,
    EditorAppealLevel
} from '../types';
import { GlobalState } from '../state/globalState';
import { SharedAnalysisCache } from '../core/analyzer';
import { findOriginalTextRange } from '../core/llm/planValidator';

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
                await this.sendCurrentSettings(webview);
                break;
            }
            case 'SET_PRESET': {
                const preset = message.payload as PresetMode;
                if (PRESET_MODES.includes(preset)) {
                    await GlobalState.getInstance().setPresetMode(preset);
                    await this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'UPDATE_PREFERENCE_VALUE': {
                const payload = message.payload as { category?: unknown; value?: unknown } | undefined;
                if (payload && typeof payload.category === 'string' && typeof payload.value === 'number' && !isNaN(payload.value)) {
                    const validCategory = parsePainCategory(payload.category);
                    const validValue = clampPreferenceValue(payload.value);
                    await GlobalState.getInstance().updatePreference(validCategory, validValue);
                    await this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'SET_LLM_CONFIG': {
                const payload = message.payload as { provider: 'gemini' | 'vscode-lm', model: string } | undefined;
                if (payload && (payload.provider === 'gemini' || payload.provider === 'vscode-lm') && typeof payload.model === 'string') {
                    await GlobalState.getInstance().setLlmConfig(payload);
                    await this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'SAVE_API_KEY': {
                const payload = message.payload as { apiKey: string } | undefined;
                if (payload && typeof payload.apiKey === 'string') {
                    if (payload.apiKey.trim() === '') {
                        await this.secrets.delete('vibecodeease.geminiApiKey');
                    } else {
                        await this.secrets.store('vibecodeease.geminiApiKey', payload.apiKey.trim());
                    }
                    await this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'DELETE_API_KEY': {
                await this.secrets.delete('vibecodeease.geminiApiKey');
                await this.sendCurrentSettings(webview);
                break;
            }
            case 'SET_LLM_TRIGGER_MODE': {
                const payload = message.payload as LlmTriggerMode | undefined;
                if (payload && ['continuous', 'on-save', 'disabled'].includes(payload)) {
                    await GlobalState.getInstance().setLlmTriggerMode(payload);
                    await this.sendCurrentSettings(webview);
                }
                break;
            }
            case 'SET_EDITOR_APPEAL_LEVEL': {
                const payload = message.payload as EditorAppealLevel | undefined;
                if (payload && ['high', 'medium', 'low'].includes(payload)) {
                    await GlobalState.getInstance().setEditorAppealLevel(payload);
                    await this.sendCurrentSettings(webview);
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
            case 'JUMP_TO_ISSUE': {
                // Grammarly パネルから問題行へジャンプ
                const payload = message.payload as { line?: unknown; character?: unknown } | undefined;
                if (payload && typeof payload.line === 'number' && typeof payload.character === 'number') {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const pos = new vscode.Position(payload.line, payload.character);
                        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                        editor.selection = new vscode.Selection(pos, pos);
                        vscode.window.showTextDocument(editor.document);
                    }
                }
                break;
            }
            case 'APPLY_LIVE_ISSUE': {
                const issue = message.payload as LiveIssue | undefined;
                const editor = vscode.window.activeTextEditor;
                if (issue && issue.replacementText !== undefined && editor) {
                    const edit = new vscode.WorkspaceEdit();
                    let range = new vscode.Range(
                        issue.line, issue.character,
                        issue.endLine, issue.endCharacter
                    );

                    // セーブ時のズレ補正: originalTextがあれば動的検索
                    if (issue.originalText) {
                        const dynamicRange = findOriginalTextRange(editor.document, issue.originalText, issue.line, issue.character);
                        if (dynamicRange) {
                            range = dynamicRange;
                        } else {
                            vscode.window.showErrorMessage('コードが大幅に変更されたため、適用位置を特定できませんでした。');
                            break;
                        }
                    }

                    edit.replace(editor.document.uri, range, issue.replacementText);
                    const applied = await vscode.workspace.applyEdit(edit);
                    if (applied) {
                        SharedAnalysisCache.getInstance().ignoreIssue(issue.id);
                    }
                }
                break;
            }
            case 'REJECT_LIVE_ISSUE': {
                const issue = message.payload as LiveIssue | undefined;
                if (issue && issue.id) {
                    SharedAnalysisCache.getInstance().ignoreIssue(issue.id);
                    vscode.commands.executeCommand('vibecodeease.refreshLiveIssues');
                }
                break;
            }
            case 'UPDATE_PREFERENCE': {
                // UIからの古いアクション(もし残っていれば)への対応、現状はUPDATE_PREFERENCE_VALUEを使用
                this.handleUpdatePreference(message.payload);
                break;
            }
            default: {
                // 🛡️ Sentinel: Safely ignore unrecognized commands to prevent unhandled processing
                break;
            }
        }
    }

    public async sendCurrentSettings(webview: vscode.Webview): Promise<void> {
        const state = GlobalState.getInstance();
        let apiKey = await this.secrets.get('vibecodeease.geminiApiKey');

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
                llmTriggerMode: state.llmTriggerMode,
                editorAppealLevel: state.editorAppealLevel
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
        if (!pending || !editor || editor.document.uri.toString() !== pending.documentUri) {
            webview.postMessage({ type: 'ERROR', payload: 'ファイルが閉じられたか、変更されたため適用できません。' });
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        for (const proposedEdit of pending.plan.edits) {
            let range = new vscode.Range(
                proposedEdit.startLine,
                proposedEdit.startCharacter,
                proposedEdit.endLine,
                proposedEdit.endCharacter
            );

            // セーブ時のズレ補正
            if (proposedEdit.oldText) {
                const dynamicRange = findOriginalTextRange(editor.document, proposedEdit.oldText, proposedEdit.startLine, proposedEdit.startCharacter);
                if (dynamicRange) {
                    range = dynamicRange;
                } else {
                    webview.postMessage({ type: 'ERROR', payload: `コードが変更されたため、適用位置を特定できませんでした。（対象: ${proposedEdit.category}）` });
                    return;
                }
            }

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
