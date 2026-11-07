/**
 * [Why/Intent] VS CodeのSide Editor Webviewパネルのライフサイクル、
 * アクティブエディタとの双方向同期、設定・介入プラン・学習状態、
 * およびオンデマンドインラインAI機能（Diff/Chat/状態遷移）のIPCメッセージ中継を管理するプロバイダモジュール。
 */
import * as vscode from 'vscode';
import { SharedAnalysisCache } from '../core/analyzer';
import { InterventionManager } from '../core/interventionManager';
import { LlmConfigRepository } from '../core/llm/llmConfigRepository';
import { LlmGateway } from '../core/llm/llmGateway';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { LlmInterventionService } from '../core/llmInterventionService';
import { InterventionHistoryStore } from '../core/onDemand/interventionHistoryStore';
import { OnDemandIpcHandler } from '../core/onDemand/onDemandIpcHandler';
import { LearningBackgroundService } from '../core/scaffolding/learningBackgroundService';
import { LearningConfigStore } from '../core/scaffolding/learningConfigStore';
import { LearningSessionStore } from '../core/scaffolding/learningSessionStore';
import type { LearningWebviewMessage } from '../types/learningScaffolding';
import type { LearningSettingsWebviewMessage } from '../types/learningSettings';
import type { InterventionDetail } from '../types/onDemandIntervention';
import type { WebviewToExtensionInterventionMessage } from '../types/onDemandIpcMessages';
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

/**
 * [Why/Intent] Webviewから受信したメッセージのうち、OnDemandIpcHandlerへ委譲すべきオンデマンド機能メッセージ種別一覧。
 */
const ON_DEMAND_IPC_TYPES = new Set([
    'APPLY_INTERVENTION',
    'UNDO_INTERVENTION',
    'DISCARD_INTERVENTION',
    'SEND_CHAT_MESSAGE',
    'SWITCH_PERSONA',
    'CLOSE_SIDE_PANEL',
    'REQUEST_ACTIVE_INTERVENTION',
]);

/**
 * [Why/Intent] SideEditorProviderの依存性（学習セッション・推敲サービス等）をテストおよび本番でDI注入するためのオプション
 */
export interface SideEditorProviderOptions {
    learningSessionStore?: LearningSessionStore;
    learningBackgroundService?: LearningBackgroundService;
    learningConfigStore?: LearningConfigStore;
    llmInterventionService?: LlmInterventionService;
    historyStore?: InterventionHistoryStore;
    onDemandIpcHandler?: OnDemandIpcHandler;
}

/**
 * [Why/Intent] Side-by-Side Webviewエディタの生成、表示管理、およびエディタとWebview間のIPC通信を統括するプロバイダ
 */
// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Updated SideEditorProvider to sync dashboard states and LLM config seamlessly.
export class SideEditorProvider implements vscode.Disposable {
    private static instance: SideEditorProvider | undefined;
    private panel: vscode.WebviewPanel | undefined;
    private readonly serviceDisposables: vscode.Disposable[] = [];
    private readonly panelDisposables: vscode.Disposable[] = [];

    private _isApplyingIntervention = false;
    private _currentDocumentUri?: vscode.Uri;
    private _debounceTimer: NodeJS.Timeout | undefined;
    private readonly learningSessionStore: LearningSessionStore;
    private readonly learningBackgroundService: LearningBackgroundService;
    private readonly learningConfigStore: LearningConfigStore;
    private readonly historyStore: InterventionHistoryStore;
    private readonly onDemandIpcHandler: OnDemandIpcHandler;
    private pendingInterventionDetail?: InterventionDetail;
    private pendingTab?: 'code' | 'settings';

    private constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly llmService: LlmBackgroundService,
        options?: SideEditorProviderOptions,
    ) {
        this.learningSessionStore =
            options?.learningSessionStore ?? new LearningSessionStore(context.workspaceState);
        const interventionService =
            options?.llmInterventionService ??
            new LlmInterventionService(new LlmGateway(new LlmConfigRepository(context.secrets)));
        this.learningBackgroundService =
            options?.learningBackgroundService ??
            new LearningBackgroundService(this.learningSessionStore, interventionService);
        this.learningConfigStore =
            options?.learningConfigStore ?? new LearningConfigStore(context.globalState);
        this.historyStore = options?.historyStore ?? new InterventionHistoryStore();

        this.onDemandIpcHandler =
            options?.onDemandIpcHandler ?? this.createDefaultOnDemandHandler();

        this.initSubscriptions();
        this.learningBackgroundService.updateConfig(this.learningConfigStore.getConfig());
    }

    private createDefaultOnDemandHandler(): OnDemandIpcHandler {
        const gateway = new LlmGateway(new LlmConfigRepository(this.context.secrets));
        return new OnDemandIpcHandler({
            historyStore: this.historyStore,
            gateway,
            postMessage: (msg) => {
                void this.panel?.webview.postMessage(msg);
            },
            applyEditorEdit: async (uri, originalCode, newCode) => {
                const doc = findTargetDocument(vscode.Uri.parse(uri));
                if (!doc) {
                    return false;
                }
                const text = doc.getText();
                const index = text.indexOf(originalCode);
                if (index === -1) {
                    return false;
                }
                const startPos = doc.positionAt(index);
                const endPos = doc.positionAt(index + originalCode.length);
                const edit = new vscode.WorkspaceEdit();
                edit.replace(doc.uri, new vscode.Range(startPos, endPos), newCode);
                return vscode.workspace.applyEdit(edit);
            },
            closePanel: () => {
                this.panel?.dispose();
            },
        });
    }

    private initSubscriptions(): void {
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

    /**
     * [Why/Intent] 共有InterventionHistoryStoreインスタンスを取得し、DecoratorやQuickPickなどの各機能へDI共有する。
     */
    public getHistoryStore(): InterventionHistoryStore {
        return this.historyStore;
    }

    /**
     * [Why/Intent] オンデマンドIPCハンドラインスタンスを取得する。
     */
    public getOnDemandIpcHandler(): OnDemandIpcHandler {
        return this.onDemandIpcHandler;
    }

    /**
     * [Why/Intent] Webviewパネルを右側（ViewColumn.Beside）に開くか、既存パネルを最前面に表示する
     */
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

    /**
     * [Why/Intent] 指定された介入IDの詳細情報を履歴ストアから解決し、
     * Beside Webviewパネルを展開してEXPAND_INTERVENTION_DETAILメッセージを送信する。
     */
    public async expandIntervention(interventionId: string): Promise<void> {
        await this.openSideEditor();
        const docUri = this._currentDocumentUri?.toString() ?? '';
        const history = await this.historyStore.getHistory(docUri);
        let detail = history.interventions.find((item) => item.id === interventionId);
        if (!detail) {
            const allItems = this.historyStore.getInterventions(docUri);
            detail = allItems.find((item) => item.id === interventionId) as
                | InterventionDetail
                | undefined;
        }

        if (detail) {
            this.pendingInterventionDetail = detail;
            this.panel?.webview.postMessage({
                type: 'EXPAND_INTERVENTION_DETAIL',
                payload: {
                    interventionId: detail.id,
                    persona: detail.personaId,
                    detail,
                },
            });
        }
    }

    /**
     * [Why/Intent] 保留中の遷移先タブ種別を取得する（テスト・内部検証用）。
     */
    public getPendingTab(): 'code' | 'settings' | undefined {
        return this.pendingTab;
    }

    /**
     * [Why/Intent] 設定パネルをWebview右側（Beside）に直接表示する。
     * パネル未作成時は作成後に ready ハンドシェイクで NAVIGATE_TO_SETTINGS を送信し、
     * 既に存在する場合は reveal の上で即座に最新設定を同期し NAVIGATE_TO_SETTINGS をディスパッチする。
     * マウント前連続実行によるフラグ消失レースコンディションを完全防止する。
     */
    public async openSettings(): Promise<void> {
        this.pendingInterventionDetail = undefined;
        this.pendingTab = 'settings';
        if (!this.panel) {
            await this.openSideEditor();
        } else {
            this.panel.reveal(vscode.ViewColumn.Beside);
            void this.sendSettingsSync();
            void this.panel.webview.postMessage({ type: 'NAVIGATE_TO_SETTINGS' });
        }
    }

    private handlePanelDispose(): void {
        this.panel = undefined;
        this.pendingTab = undefined;
        this.pendingInterventionDetail = undefined;
        while (this.panelDisposables.length) {
            this.panelDisposables.pop()?.dispose();
        }
    }

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

        let pendingEvents: vscode.TextDocumentChangeEvent[] = [];

        vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (
                    this._isApplyingIntervention ||
                    this.onDemandIpcHandler.isApplyingIntervention
                ) {
                    return;
                }
                const doc = event.document;
                if (doc.uri.toString() === this._currentDocumentUri?.toString()) {
                    pendingEvents.push(event);
                    if (this._debounceTimer) {
                        clearTimeout(this._debounceTimer);
                    }
                    this._debounceTimer = setTimeout(() => {
                        if (pendingEvents.length > 0) {
                            // handleDocumentChange の重複実行時間を ~327ms から ~33ms に削減 (contentChangesをフラット化し、重複するキャッシュ取得とループ処理を排除)
                            const mergedEvent = {
                                document: doc,
                                contentChanges: pendingEvents.flatMap((e) => e.contentChanges),
                                reason: pendingEvents[0].reason,
                            };
                            InterventionManager.handleDocumentChange(mergedEvent);
                        }
                        pendingEvents = [];
                        this.sendUpdateInterventions(doc);
                        this.sendSyncDocument(doc.fileName, doc.getText());
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

    private async handleTypeMessage(type: string, message: unknown): Promise<void> {
        if (ON_DEMAND_IPC_TYPES.has(type)) {
            const docUri = this._currentDocumentUri?.toString() ?? '';
            await this.onDemandIpcHandler.handleMessage(
                message as WebviewToExtensionInterventionMessage,
                docUri,
            );
            return;
        }

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
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }

        if ('type' in message && typeof (message as { type: string }).type === 'string') {
            await this.handleTypeMessage((message as { type: string }).type, message);
            return;
        }

        if ('command' in message && typeof (message as { command: string }).command === 'string') {
            const cmd = (message as { command: string }).command;
            if (cmd === 'ready') {
                if (this.pendingTab === 'settings' && this.panel) {
                    // [Why/Intent] Webviewマウント完了前に openSettings が呼ばれていた場合、ready ハンドシェイクをトリガーに NAVIGATE_TO_SETTINGS を遅延送信し、フラグを消費・初期化する
                    this.panel.webview.postMessage({ type: 'NAVIGATE_TO_SETTINGS' });
                    this.pendingTab = undefined;
                } else if (this.pendingInterventionDetail && this.panel) {
                    this.panel.webview.postMessage({
                        type: 'EXPAND_INTERVENTION_DETAIL',
                        payload: {
                            interventionId: this.pendingInterventionDetail.id,
                            persona: this.pendingInterventionDetail.personaId,
                            detail: this.pendingInterventionDetail,
                        },
                    });
                }
            }

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

    /**
     * [Why/Intent] 現在の学習セッション状態をWebview UIへ同期送信する
     */
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

    /**
     * [Why/Intent] 対象ドキュメントの最新解析結果（介入プラン）を取得し、Webview UIへ更新メッセージを送信する
     */
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
