import * as vscode from 'vscode';
import { SharedAnalysisCache } from '../core/analyzer';
import { InterventionManager } from '../core/interventionManager';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { LlmInterventionService } from '../core/llmInterventionService';
import { LearningBackgroundService } from '../core/scaffolding/learningBackgroundService';
import { LearningConfigStore } from '../core/scaffolding/learningConfigStore';
import { LearningSessionStore } from '../core/scaffolding/learningSessionStore';
import type { LearningWebviewMessage } from '../types/learningScaffolding';
import type { LearningSettingsWebviewMessage } from '../types/learningSettings';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/webviewMessage';
import { dispatchLegacyCommand, fetchSideEditorSettings } from './sideEditorConfig';
import { getSideEditorHtml } from './sideEditorHtml';
import {
    buildUpdateInterventionsMessage,
    dispatchLearningMessage,
    findTargetDocument,
    handleLearningSettingsMessage,
    type LearningHandlerContext,
} from './sideEditorLearningHandler';

export interface SideEditorProviderOptions {
    learningSessionStore?: LearningSessionStore;
    learningBackgroundService?: LearningBackgroundService;
    learningConfigStore?: LearningConfigStore;
}

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Updated SideEditorProvider to sync dashboard states and LLM config seamlessly.
export class SideEditorProvider implements vscode.Disposable {
    private static instance: SideEditorProvider | undefined;
    private panel: vscode.WebviewPanel | undefined;
    private readonly serviceDisposables: vscode.Disposable[] = [];
    private readonly panelDisposables: vscode.Disposable[] = [];

    private _isApplyingIntervention = false;
    private _currentDocumentUri?: vscode.Uri;
    private readonly learningSessionStore: LearningSessionStore;
    private readonly learningBackgroundService: LearningBackgroundService;
    private readonly learningConfigStore: LearningConfigStore;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly llmService: LlmBackgroundService,
        options?: SideEditorProviderOptions,
    ) {
        this.learningSessionStore =
            options?.learningSessionStore ?? new LearningSessionStore(context.workspaceState);
        this.learningBackgroundService =
            options?.learningBackgroundService ??
            new LearningBackgroundService(
                this.learningSessionStore,
                new LlmInterventionService(undefined, undefined, context.secrets),
            );
        this.learningConfigStore =
            options?.learningConfigStore ?? new LearningConfigStore(context.globalState);

        this.serviceDisposables.push(
            this.llmService.onDidUpdateDashboard.event((msg) =>
                this.panel?.webview.postMessage(msg),
            ),
            this.learningSessionStore.onDidChangeState((state) =>
                this.panel?.webview.postMessage({ type: 'SYNC_SESSION_STATE', payload: state }),
            ),
            this.learningConfigStore.onDidChangeConfig((config) => {
                this.learningBackgroundService.updateConfig(config);
                if (this.learningSessionStore.getState().status !== 'empty') {
                    if (config.pauseExistingAnalysisDuringLearning) {
                        this.llmService.pause();
                    } else {
                        this.llmService.resume();
                    }
                }
                this.panel?.webview.postMessage({ type: 'SYNC_LEARNING_CONFIG', payload: config });
            }),
            this.learningSessionStore,
            this.learningBackgroundService,
            this.learningConfigStore,
        );
        this.learningBackgroundService.updateConfig(this.learningConfigStore.getConfig());
    }

    public static getInstance(
        context?: vscode.ExtensionContext,
        llmService?: LlmBackgroundService,
        options?: SideEditorProviderOptions,
    ): SideEditorProvider {
        if (!SideEditorProvider.instance && context && llmService) {
            SideEditorProvider.instance = new SideEditorProvider(context, llmService, options);
        }
        return SideEditorProvider.instance as SideEditorProvider;
    }

    public static resetInstanceForTesting(): void {
        SideEditorProvider.instance?.dispose();
        SideEditorProvider.instance = undefined;
    }

    public async openSideEditor(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vibecodeeaseSideEditor',
                'vibeCodeEase: AI Side Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist'),
                    ],
                },
            );
            this.panel.webview.html = getSideEditorHtml(
                this.panel.webview,
                this.context.extensionUri,
            );
            this.panel.onDidDispose(() => this.handlePanelDispose(), null, this.panelDisposables);
            this.panel.webview.onDidReceiveMessage(
                (message: unknown) => void this.handleMessage(message),
                undefined,
                this.panelDisposables,
            );
            this.registerListeners();
            await this.sendSettingsSync();
        }
        this.syncWithActiveEditor();
    }

    private handlePanelDispose(): void {
        this.panel = undefined;
        while (this.panelDisposables.length) {
            this.panelDisposables.pop()?.dispose();
        }
    }

    private _documentChangeDebounceTimer: NodeJS.Timeout | undefined;
    private _pendingChanges: vscode.TextDocumentContentChangeEvent[] = [];

    private registerListeners(): void {
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
                if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                    this._currentDocumentUri = editor.document.uri;
                    this.syncWithActiveEditor();
                }
            },
            null,
            this.panelDisposables,
        );
        vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (this._isApplyingIntervention) {
                    return;
                }
                const doc = event.document;
                if (doc.uri.toString() === this._currentDocumentUri?.toString()) {
                    this._pendingChanges.push(...event.contentChanges);
                    if (this._documentChangeDebounceTimer) {
                        clearTimeout(this._documentChangeDebounceTimer);
                    }
                    // ⚡ Bolt: 頻繁なテキスト入力イベントをデバウンスし、同期的な解析処理によるイベントループのブロックを軽減
                    this._documentChangeDebounceTimer = setTimeout(() => {
                        const syntheticEvent = {
                            document: doc,
                            contentChanges: this._pendingChanges,
                            reason: event.reason,
                        };
                        InterventionManager.handleDocumentChange(syntheticEvent);
                        this.sendUpdateInterventions(doc);
                        this.sendSyncDocument(doc.fileName, doc.getText());
                        this._pendingChanges = [];
                    }, 300);
                }
            },
            null,
            this.panelDisposables,
        );
    }

    private async sendSettingsSync(): Promise<void> {
        const s = await fetchSideEditorSettings(this.context);
        this.panel?.webview.postMessage({
            type: 'SYNC_SETTINGS',
            hasApiKey: Boolean(s.apiKey),
            apiKeyLength: s.apiKey ? s.apiKey.length : 0,
            interventionLevel: s.level,
            frequency: s.frequency,
            intervalSeconds: s.intervalSeconds,
            model: s.model,
        });
    }

    private createLearningHandlerContext(): LearningHandlerContext {
        return {
            learningSessionStore: this.learningSessionStore,
            learningBackgroundService: this.learningBackgroundService,
            learningConfigStore: this.learningConfigStore,
            llmService: this.llmService,
            postMessage: (msg) => void this.panel?.webview.postMessage(msg),
            syncLearningState: () => this.sendLearningStateSync(),
            applyDiff: (code) => this.handleApplyDiff(code),
        };
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        if ('type' in message && typeof (message as { type: string }).type === 'string') {
            const type = (message as { type: string }).type;
            const ctx = this.createLearningHandlerContext();
            if (
                type === 'REQUEST_LEARNING_CONFIG' ||
                type === 'UPDATE_LEARNING_CONFIG' ||
                type === 'RESET_LEARNING_CONFIG'
            ) {
                await handleLearningSettingsMessage(message as LearningSettingsWebviewMessage, ctx);
                return;
            }
            await dispatchLearningMessage(message as LearningWebviewMessage, ctx);
            return;
        }
        if ('command' in message && typeof (message as { command: string }).command === 'string') {
            await dispatchLegacyCommand(message as WebviewToExtensionMessage, {
                context: this.context,
                llmService: this.llmService,
                learningConfigStore: this.learningConfigStore,
                currentDocumentUri: this._currentDocumentUri,
                postMessage: (msg) => void this.panel?.webview.postMessage(msg),
                sendSettingsSync: () => this.sendSettingsSync(),
                sendLearningStateSync: () => this.sendLearningStateSync(),
                sendSyncDocument: (fileName, text) => this.sendSyncDocument(fileName, text),
                sendUpdateInterventions: (doc) => this.sendUpdateInterventions(doc),
                applyIntervention: (msg) => this.handleApplyIntervention(msg),
            });
        }
    }

    private async handleApplyDiff(replacementCode: string): Promise<void> {
        try {
            this._isApplyingIntervention = true;
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                const doc = editor.document;
                const fullRange = new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length),
                );
                const edit = new vscode.WorkspaceEdit();
                edit.replace(doc.uri, fullRange, replacementCode);
                await vscode.workspace.applyEdit(edit);
            }
        } finally {
            this._isApplyingIntervention = false;
        }
    }

    public sendLearningStateSync(): void {
        this.panel?.webview.postMessage({
            type: 'SYNC_SESSION_STATE',
            payload: this.learningSessionStore.getState(),
        });
    }

    private async handleApplyIntervention(
        message: Extract<WebviewToExtensionMessage, { command: 'apply_intervention' }>,
    ): Promise<void> {
        this._isApplyingIntervention = true;
        try {
            const doc = findTargetDocument(this._currentDocumentUri);
            if (!doc) {
                return;
            }
            const range = new vscode.Range(
                new vscode.Position(message.range.start.line, message.range.start.character),
                new vscode.Position(message.range.end.line, message.range.end.character),
            );
            await InterventionManager.applyIntervention({
                document: doc,
                id: message.id,
                newText: message.newText,
                range,
            });
            this.sendUpdateInterventions(doc);
            this.sendSyncDocument(doc.fileName, doc.getText());
        } finally {
            this._isApplyingIntervention = false;
        }
    }

    private syncWithActiveEditor(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
            this._currentDocumentUri = editor.document.uri;
            this.sendSyncDocument(editor.document.fileName, editor.document.getText());
            this.sendUpdateInterventions(editor.document);
        }
    }

    private sendSyncDocument(fileName: string, text: string): void {
        const message: ExtensionToWebviewMessage = { type: 'SYNC_DOCUMENT', fileName, text };
        this.panel?.webview.postMessage(message);
    }

    public sendUpdateInterventions(document: vscode.TextDocument): void {
        if (!this.panel) {
            return;
        }
        const results = SharedAnalysisCache.getInstance().getResults(document);
        this.panel.webview.postMessage(
            buildUpdateInterventionsMessage(document, results, (uri, r) =>
                InterventionManager.generateIssueId(uri, r),
            ),
        );
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        while (this.panelDisposables.length) {
            this.panelDisposables.pop()?.dispose();
        }
        while (this.serviceDisposables.length) {
            this.serviceDisposables.pop()?.dispose();
        }
    }
}
