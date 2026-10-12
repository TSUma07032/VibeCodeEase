import * as vscode from 'vscode';
import { SharedAnalysisCache } from '../core/analyzer';
import { InterventionManager } from '../core/interventionManager';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/webviewMessage';
import { fetchSideEditorSettings, saveLlmConfigSettings } from './sideEditorConfig';
import { getSideEditorHtml } from './sideEditorHtml';

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Updated SideEditorProvider to sync dashboard states and LLM config seamlessly.
export class SideEditorProvider implements vscode.Disposable {
    private static instance: SideEditorProvider;
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    private _isApplyingIntervention = false;
    private _currentDocumentUri?: vscode.Uri;

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly llmService: LlmBackgroundService,
    ) {
        this.disposables.push(
            this.llmService.onDidUpdateDashboard.event((message) => {
                this.panel?.webview.postMessage(message);
            }),
        );
    }

    public static getInstance(
        context?: vscode.ExtensionContext,
        llmService?: LlmBackgroundService,
    ): SideEditorProvider {
        if (!SideEditorProvider.instance && context && llmService) {
            SideEditorProvider.instance = new SideEditorProvider(context, llmService);
        }
        return SideEditorProvider.instance;
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

            this.panel.onDidDispose(
                () => {
                    this.dispose();
                },
                null,
                this.disposables,
            );

            this.panel.webview.onDidReceiveMessage(
                (message: WebviewToExtensionMessage) => {
                    void this.handleMessage(message);
                },
                undefined,
                this.disposables,
            );

            this.registerListeners();

            await this.sendSettingsSync();
        }

        this.syncWithActiveEditor();
    }

    private registerListeners() {
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
                if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                    this._currentDocumentUri = editor.document.uri;
                    this.syncWithActiveEditor();
                }
            },
            null,
            this.disposables,
        );

        vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (this._isApplyingIntervention) {
                    return;
                }

                const document = event.document;
                if (document.uri.toString() === this._currentDocumentUri?.toString()) {
                    InterventionManager.handleDocumentChange(event);
                    this.sendUpdateInterventions(document);
                    this.sendSyncDocument(document.fileName, document.getText());
                }
            },
            null,
            this.disposables,
        );
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Retrieve configuration for UI settings, using fallback logic for sync frequency.
    private async sendSettingsSync(): Promise<void> {
        const settings = await fetchSideEditorSettings(this.context);

        this.panel?.webview.postMessage({
            type: 'SYNC_SETTINGS',
            hasApiKey: Boolean(settings.apiKey),
            apiKeyLength: settings.apiKey ? settings.apiKey.length : 0,
            interventionLevel: settings.level,
            frequency: settings.frequency,
            intervalSeconds: settings.intervalSeconds,
            model: settings.model,
        });
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Handle incoming IPC messages including config updates and force analysis.
    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.handleReadyMessage();
                break;
            case 'apply_intervention':
                await this.handleApplyIntervention(message);
                break;
            case 'discard_intervention':
                this.handleDiscardIntervention(message.id);
                break;
            case 'update_api_key':
                await this.handleUpdateApiKey(message.apiKey);
                break;
            case 'update_intervention_level':
                await vscode.workspace
                    .getConfiguration('vibecodeease')
                    .update(
                        'aiInterventionLevel',
                        message.level,
                        vscode.ConfigurationTarget.Global,
                    );
                break;
            case 'update_llm_config':
                await this.handleUpdateLlmConfig(message);
                break;
            case 'clear_error_logs':
                this.llmService.clearErrorLogs();
                break;
            case 'force_analyze':
                this.handleForceAnalyze();
                break;
        }
    }

    private async handleReadyMessage(): Promise<void> {
        if (this._currentDocumentUri) {
            const doc = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === this._currentDocumentUri?.toString(),
            );
            if (doc) {
                this.sendSyncDocument(doc.fileName, doc.getText());
                this.sendUpdateInterventions(doc);
            }
        }

        await this.sendSettingsSync();

        this.panel?.webview.postMessage({
            type: 'LLM_DASHBOARD_INIT',
            ...this.llmService.getDashboardState(),
        });
    }

    /**
     * [Why/Intent] Webviewからの介入適用要求を受け、ドキュメントの指定範囲を置換してUIへ最新状態を同期する。
     */
    private async handleApplyIntervention(
        message: Extract<WebviewToExtensionMessage, { command: 'apply_intervention' }>,
    ): Promise<void> {
        // [Why/Intent] 介入適用中のドキュメント変更イベント発火によって
        // 不要な再同期や循環呼び出し・競合が発生するのを防ぐフラグ保護
        this._isApplyingIntervention = true;
        try {
            if (!this._currentDocumentUri) {
                return;
            }
            const doc = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === this._currentDocumentUri?.toString(),
            );
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

    /**
     * [Why/Intent] Webviewからの介入破棄要求を受け、マネージャーから除外して最新一覧をUIへ同期する。
     */
    private handleDiscardIntervention(id: string): void {
        InterventionManager.discardIntervention(id);
        if (this._currentDocumentUri) {
            const doc = vscode.workspace.textDocuments.find(
                (d) => d.uri.toString() === this._currentDocumentUri?.toString(),
            );
            if (!doc) {
                return;
            }
            this.sendUpdateInterventions(doc);
        }
    }

    /**
     * [Why/Intent] Webviewで入力されたGemini APIキーをVS Code SecretStorageへセキュアに保存/削除する。
     */
    private async handleUpdateApiKey(apiKey?: string): Promise<void> {
        if (apiKey) {
            await this.context.secrets.store('vibecodeease.geminiApiKey', apiKey);
        } else {
            await this.context.secrets.delete('vibecodeease.geminiApiKey');
        }
        await this.sendSettingsSync();
    }

    /**
     * [Why/Intent] WebviewからのLLM同期設定更新を受け、設定を保存してバックグラウンドタイマーを再起動する。
     */
    private async handleUpdateLlmConfig(
        message: Extract<WebviewToExtensionMessage, { command: 'update_llm_config' }>,
    ): Promise<void> {
        await saveLlmConfigSettings(message.intervalSeconds, message.frequency, message.model);
        await this.sendSettingsSync();
        this.llmService.startTimerIfConfigured();
    }

    /**
     * [Why/Intent] Webviewの「今すぐ解析」ボタン押下を受け、現在アクティブなファイルの手動解析を即時実行する。
     */
    private handleForceAnalyze(): void {
        let targetDoc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === this._currentDocumentUri?.toString(),
        );
        targetDoc ??= vscode.window.visibleTextEditors.find(
            (e) => e.document.uri.scheme === 'file' && e.viewColumn !== vscode.ViewColumn.Beside,
        )?.document;
        if (targetDoc) {
            void this.llmService.runAnalysis(targetDoc, false);
        }
    }

    private syncWithActiveEditor() {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
            this._currentDocumentUri = editor.document.uri;
            this.sendSyncDocument(editor.document.fileName, editor.document.getText());
            this.sendUpdateInterventions(editor.document);
        }
    }

    private sendSyncDocument(fileName: string, text: string) {
        if (this.panel) {
            const message: ExtensionToWebviewMessage = {
                type: 'SYNC_DOCUMENT',
                fileName,
                text,
            };
            this.panel.webview.postMessage(message);
        }
    }

    public sendUpdateInterventions(document: vscode.TextDocument): void {
        if (this.panel) {
            const results = SharedAnalysisCache.getInstance().getResults(document);
            const interventions = results.map((r) => ({
                id: InterventionManager.generateIssueId(document.uri.toString(), r),
                range: {
                    start: { line: r.range.start.line, character: r.range.start.character },
                    end: { line: r.range.end.line, character: r.range.end.character },
                },
                originalText: r.interventions[0]?.originalText || '',
                replacementText: r.interventions[0]?.replacementText || '',
                message: r.interventions[0]?.message ?? '',
            }));

            const message: ExtensionToWebviewMessage = {
                type: 'UPDATE_INTERVENTIONS',
                interventions,
            };
            this.panel.webview.postMessage(message);
        }
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
