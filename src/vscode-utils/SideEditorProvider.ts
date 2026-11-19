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
import {
    formatInterventionOneLiner,
    formatPersonaSummary,
    getPersonaOpeningMessage,
} from '../core/llm/promptBuilder';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import { LlmInterventionService } from '../core/llmInterventionService';
import { InterventionHistoryStore } from '../core/onDemand/interventionHistoryStore';
import { OnDemandIpcHandler } from '../core/onDemand/onDemandIpcHandler';
import { LearningBackgroundService } from '../core/scaffolding/learningBackgroundService';
import { LearningConfigStore } from '../core/scaffolding/learningConfigStore';
import { LearningSessionStore } from '../core/scaffolding/learningSessionStore';
import { GlobalState } from '../state/globalState';
import type { LearningWebviewMessage } from '../types/learningScaffolding';
import type { LearningSettingsWebviewMessage } from '../types/learningSettings';
import type { InterventionDetail, PersonaId } from '../types/onDemandIntervention';
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
    'REFINE_INTERVENTION',
    'UPDATE_QUICK_SETTINGS',
    'UPDATE_API_KEY',
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
            /**
             * [Why/Intent] 対象ドキュメント内で originalCode を動的テキスト検索（indexOf）してRangeを特定し、
             * newCode への置換 WorkspaceEdit を適用する。行編集等のズレが生じていても動的に正確な位置を特定できる。
             */
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
            updateQuickSettings: async (settings) => {
                const config = vscode.workspace.getConfiguration('vibecodeease');
                if (settings.frequency) {
                    await config.update(
                        'llm.syncFrequency',
                        settings.frequency,
                        vscode.ConfigurationTarget.Global,
                    );
                }
                if (settings.intervalSeconds !== undefined) {
                    await config.update(
                        'llm.syncIntervalSeconds',
                        settings.intervalSeconds,
                        vscode.ConfigurationTarget.Global,
                    );
                }
                if (settings.model) {
                    await config.update(
                        'llmModel',
                        settings.model,
                        vscode.ConfigurationTarget.Global,
                    );
                }
                if (settings.personaId) {
                    await this.context.workspaceState.update(
                        'vibecodeease.currentPersona',
                        settings.personaId,
                    );
                    await GlobalState.getInstance().setPersonaId(settings.personaId);
                    await this.applyPersonaToPendingInterventions(settings.personaId);
                }
                this.llmService.startTimerIfConfigured();
                await this.sendSettingsSync();
            },
            updateApiKey: async (apiKey: string) => {
                const repo = new LlmConfigRepository(this.context.secrets);
                await repo.setApiKey(apiKey);
                this.llmService.startTimerIfConfigured();
                await this.sendSettingsSync();
            },
            expandDetail: async (interventionId: string) => {
                await this.expandIntervention(interventionId);
            },
        });
    }

    /**
     * [Why/Intent] ペルソナ変更時、現在ドキュメントの未対応（pending）提案のペルソナ・変更理由・初手セリフを最新ペルソナに同期する。
     */
    private async applyPersonaToPendingInterventions(personaId: PersonaId): Promise<void> {
        const docUri = this._currentDocumentUri?.toString();
        if (!docUri) {
            return;
        }
        const history = await this.historyStore.getHistory(docUri);
        for (const item of history.interventions) {
            if (item.status !== 'pending') {
                continue;
            }
            item.personaId = personaId;
            const hasUserMessages = item.chatHistory.some((msg) => msg.sender === 'user');
            if (!hasUserMessages) {
                item.chatHistory = [
                    {
                        id: `msg-init-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        sender: 'ai',
                        message: getPersonaOpeningMessage(personaId, item.title),
                        timestamp: new Date().toISOString(),
                        personaId,
                    },
                ];
            }
            await this.historyStore.saveIntervention(docUri, item);
        }
        this.panel?.webview.postMessage({
            type: 'SYNC_HISTORY_STATE',
            payload: {
                documentUri: docUri,
                interventions: this.historyStore.getInterventions(docUri),
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

    /**
     * [Why/Intent] SideEditorProviderのシングルトンインスタンスを取得する。
     */
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

    /**
     * [Why/Intent] テスト環境用: シングルトンインスタンスを破棄・リセットする。
     */
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
     * [Why/Intent] Webviewパネル開閉前に現在のメインエディタURIを捕捉し、フォーカス移動によるURI喪失を防ぐ。
     */
    private captureTargetEditorUri(): void {
        const active = vscode.window.activeTextEditor;
        if (active && active.viewColumn !== vscode.ViewColumn.Beside) {
            this._currentDocumentUri = active.document.uri;
            return;
        }
        if (!this._currentDocumentUri) {
            const visible = vscode.window.visibleTextEditors.find(
                (e) =>
                    e.viewColumn !== vscode.ViewColumn.Beside && e.document.uri.scheme === 'file',
            );
            if (visible) {
                this._currentDocumentUri = visible.document.uri;
            }
        }
    }

    /**
     * [Why/Intent] Webviewパネルを右側（ViewColumn.Beside）に開くか、既存パネルの列位置・幅を維持したまま表示する。
     * 既存パネルに対して ViewColumn.Beside を再指定すると分割列の再計算によりサイドバー幅が変動するため、
     * パネル既存時は自身の viewColumn を維持して reveal する。
     */
    public async openSideEditor(): Promise<void> {
        this.captureTargetEditorUri();
        if (this.panel) {
            this.panel.reveal(this.panel.viewColumn);
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
                (message: unknown) => this.handleMessage(message),
                undefined,
                this.panelDisposables,
            );
            this.registerListeners();
            await this.sendSettingsSync();
        }
        this.syncWithActiveEditor();
    }

    /**
     * [Why/Intent] 指定された介入IDとドキュメントURIから、該当する介入詳細を正確に解決するヘルパー。
     * 以前の実装ではID不一致時に `allItems[0]`（一番上の介入案）へ無条件フォールバックしていたため、
     * 2番目以降の「詳細」を押しても必ず一番上のチャットが開いてしまうバグが発生していた。
     * 本メソッドではURI正規化検索および末尾識別子（source::category::line::char）一致のみを行い、
     * 無関係な先頭要素への誤フォールバックを完全に排除する。
     */
    private resolveInterventionTarget(
        interventionId: string,
        preferredUri: string,
    ): { documentUri: string; detail: InterventionDetail } | undefined {
        let found = this.historyStore.getInterventionById(interventionId, preferredUri);

        if (!found && this._currentDocumentUri) {
            const targetDoc = findTargetDocument(this._currentDocumentUri);
            if (targetDoc) {
                const results = SharedAnalysisCache.getInstance().getResults(targetDoc);
                this.syncResultsToHistoryStore(targetDoc, results);
                found = this.historyStore.getInterventionById(interventionId, preferredUri);
            }
        }

        if (!found && preferredUri && interventionId.includes('::')) {
            const targetSuffix = interventionId.split('::').slice(1).join('::');
            const allItems = this.historyStore.getInterventions(preferredUri);
            const suffixMatch = allItems.find(
                (item) => item.id.split('::').slice(1).join('::') === targetSuffix,
            );
            if (suffixMatch) {
                found = this.historyStore.getInterventionById(suffixMatch.id, preferredUri);
            }
        }

        return found;
    }

    /**
     * [Why/Intent] 指定された介入IDの詳細情報を履歴ストアから横断解決し、
     * サイドバーWebviewパネルへ即座に EXPAND_INTERVENTION_DETAIL メッセージを送信して対話画面へ切り替える。
     * エディタホバーや一覧トグルの「詳細」から呼ばれた際、その時押された介入IDの詳細を確実に開く。
     */
    public async expandIntervention(interventionId: string, documentUri?: string): Promise<void> {
        if (documentUri) {
            this._currentDocumentUri = vscode.Uri.parse(documentUri);
        } else {
            this.captureTargetEditorUri();
        }
        const preferredUri = documentUri ?? this._currentDocumentUri?.toString() ?? '';
        const found = this.resolveInterventionTarget(interventionId, preferredUri);

        if (found) {
            this._currentDocumentUri = vscode.Uri.parse(found.documentUri);
            this.pendingInterventionDetail = found.detail;
            this.pendingTab = undefined;
        }

        await this.openSideEditor();

        const detail =
            found?.detail ??
            this.historyStore.getInterventionById(
                interventionId,
                this._currentDocumentUri?.toString(),
            )?.detail;

        if (detail) {
            this.pendingInterventionDetail = detail;
            void this.panel?.webview.postMessage({
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
     * [Why/Intent] エディタホバーのトグル内「採用」リンク等から指定された介入IDのコードを即時適用し、
     * 履歴ステータスを 'applied' に更新してデコレーションとWebview表示を同期する。
     */
    public async applyInterventionById(
        interventionId: string,
        documentUri?: string,
    ): Promise<void> {
        if (documentUri) {
            this._currentDocumentUri = vscode.Uri.parse(documentUri);
        } else {
            this.captureTargetEditorUri();
        }
        const preferredUri = documentUri ?? this._currentDocumentUri?.toString() ?? '';
        const found = this.resolveInterventionTarget(interventionId, preferredUri);
        const targetUri = found?.documentUri ?? preferredUri;
        const targetId = found?.detail.id ?? interventionId;

        await this.onDemandIpcHandler.handleMessage(
            {
                type: 'APPLY_INTERVENTION',
                payload: { interventionId: targetId },
            },
            targetUri,
        );
    }

    /**
     * [Why/Intent] エディタホバーやコマンドから指定された介入提案を破棄し、
     * 適用済み（applied）だった場合は元のコードへロールバック復元した上でステータスを更新する。
     */
    public async discardIntervention(interventionId: string, documentUri?: string): Promise<void> {
        this.captureTargetEditorUri();
        const preferredUri = documentUri ?? this._currentDocumentUri?.toString() ?? '';
        const found = this.resolveInterventionTarget(interventionId, preferredUri);
        const targetUri = found?.documentUri ?? preferredUri;
        const detail = found?.detail;
        const targetId = detail?.id ?? interventionId;

        if (detail?.status === 'applied') {
            this._isApplyingIntervention = true;
            try {
                await this.onDemandIpcHandler._ctx.applyEditorEdit(
                    targetUri,
                    detail.proposedCode,
                    detail.originalCode,
                );
            } finally {
                this._isApplyingIntervention = false;
            }
        }

        SharedAnalysisCache.getInstance().ignoreIssue(targetId);
        const updated = await this.historyStore.updateStatus(targetUri, targetId, 'dismissed');

        void vscode.commands
            .executeCommand('vibecodeease.refreshDecorations')
            .then(undefined, () => {});
        vscode.window.setStatusBarMessage('$(trash) 提案を破棄しました', 3000);

        if (this.panel && targetUri) {
            this.panel.webview.postMessage({
                type: 'SYNC_HISTORY_STATE',
                payload: {
                    documentUri: targetUri,
                    interventions: this.historyStore.getInterventions(targetUri),
                },
            });
            if (updated) {
                this.panel.webview.postMessage({
                    type: 'UPDATE_INTERVENTION_DETAIL',
                    payload: {
                        interventionId: updated.id,
                        detail: updated,
                    },
                });
            }
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
     * 既に存在する場合は現在の列位置・幅を維持したまま reveal して NAVIGATE_TO_SETTINGS をディスパッチする。
     */
    public async openSettings(): Promise<void> {
        this.pendingInterventionDetail = undefined;
        this.pendingTab = 'settings';
        if (!this.panel) {
            await this.openSideEditor();
        } else {
            this.panel.reveal(this.panel.viewColumn);
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
            /**
             * [Why/Intent] ユーザーによるエディタ編集を検知し、提案の行追従・自動破棄を行うリスナー。
             * 提案適用・差分アンドゥ実行中（`_isApplyingIntervention || onDemandIpcHandler.isApplyingIntervention`）は
             * 自身による置換がイベントとして跳ね返ってくるため二重排他ガードで完全スキップし、循環ループを抑止する。
             * また、300ms デバウンス処理によりキーストロークごとの高頻度な履歴更新・IPC送信負荷を緩和する。
             */
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
                        for (const pendingEvent of pendingEvents) {
                            InterventionManager.handleDocumentChange(pendingEvent);
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
        const currentPersona =
            this.context.workspaceState.get<PersonaId>('vibecodeease.currentPersona') ??
            GlobalState.getInstance().personaId ??
            'mentor';
        this.panel?.webview.postMessage({
            type: 'SYNC_SETTINGS',
            hasApiKey: Boolean(s.apiKey),
            apiKeyLength: s.apiKey ? s.apiKey.length : 0,
            interventionLevel: s.level,
            frequency: s.frequency,
            intervalSeconds: s.intervalSeconds,
            model: s.model,
            personaId: currentPersona,
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
        if (type === 'REQUEST_EXPAND_DETAIL') {
            const payload = (message as { payload?: { interventionId?: string } }).payload;
            if (payload?.interventionId) {
                await this.expandIntervention(payload.interventionId);
            }
            return;
        }
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

            // [Why/Intent] readyハンドシェイク時は、初期リスト同期（dispatchLegacyCommand）が完了した後に
            // EXPAND_INTERVENTION_DETAIL または NAVIGATE_TO_SETTINGS を送信し、選択中の詳細が上書きされるのを防ぐ。
            if (cmd === 'ready') {
                if (this.pendingTab === 'settings' && this.panel) {
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
                    this.pendingInterventionDetail = undefined;
                }
            }
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
            await this.historyStore.updateStatus(doc.uri.toString(), message.id, 'applied');
            this.sendUpdateInterventions(doc);
            this.sendSyncDocument(doc.fileName, doc.getText());
        } finally {
            this._isApplyingIntervention = false;
        }
    }

    private syncWithActiveEditor(): void {
        this.captureTargetEditorUri();
        const targetDoc = findTargetDocument(this._currentDocumentUri);
        if (targetDoc) {
            this.sendSyncDocument(targetDoc.fileName, targetDoc.getText());
            this.sendUpdateInterventions(targetDoc);
        }
    }

    private sendSyncDocument(fileName: string, text: string): void {
        const message: ExtensionToWebviewMessage = { type: 'SYNC_DOCUMENT', fileName, text };
        this.panel?.webview.postMessage(message);
    }

    /**
     * [Why/Intent] 解析結果を履歴ストアへ同期する。
     * 1) 同一IDが既に存在する場合は即スキップし、2番目以降のアイテムが先頭アイテムを上書きするバグを防止する。
     * 2) 過去分（applied / dismissed / reverted）は履歴掲示板に残すため重複除外対象から外し、
     *    未適用の静的解析（pending & non-llm）のみをLLM推敲結果でアップグレードする。
     */
    private syncResultsToHistoryStore(
        document: vscode.TextDocument,
        results: ReturnType<typeof SharedAnalysisCache.prototype.getResults>,
    ): void {
        const docUri = document.uri.toString();
        const existingItems = this.historyStore.getInterventions(docUri);
        const existingIds = new Set(existingItems.map((item) => item.id));
        const now = new Date().toISOString();
        const currentPersona =
            this.context.workspaceState.get<PersonaId>('vibecodeease.currentPersona') ??
            GlobalState.getInstance().personaId ??
            'mentor';

        for (const r of results) {
            const first = r.interventions[0];
            if (!first) {
                continue;
            }
            const id = InterventionManager.generateIssueId(docUri, r);
            if (existingIds.has(id)) {
                continue;
            }

            const rawMessage = (first.message ?? '').trim();
            const title = formatInterventionOneLiner(rawMessage);
            const summary = formatPersonaSummary(currentPersona, rawMessage);

            // 未対応（pending）の既存アイテムとのみ行重複を検査し、過去分（applied/dismissed）は掲示板履歴として保持する
            const overlappingPending = existingItems.find(
                (item) =>
                    item.status === 'pending' &&
                    item.range.start.line <= r.range.end.line &&
                    item.range.end.line >= r.range.start.line,
            );

            if (overlappingPending) {
                if (r.source === 'llm' && !overlappingPending.id.includes('::llm::')) {
                    const existingFound = this.historyStore.getInterventionById(
                        overlappingPending.id,
                        docUri,
                    );
                    if (existingFound?.detail.status === 'pending') {
                        const updatedDetail = existingFound.detail;
                        updatedDetail.title = title;
                        updatedDetail.summary = summary;
                        updatedDetail.originalCode = first.originalText;
                        updatedDetail.proposedCode = first.replacementText;
                        updatedDetail.range = r.range;
                        updatedDetail.updatedAt = now;
                        void this.historyStore.saveIntervention(docUri, updatedDetail);
                    }
                }
                continue;
            }

            const detail: InterventionDetail = {
                id,
                title,
                summary,
                range: r.range,
                status: 'pending',
                personaId: currentPersona,
                originalCode: first.originalText,
                proposedCode: first.replacementText,
                createdAt: now,
                updatedAt: now,
                chatHistory: [
                    {
                        id: `msg-init-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        sender: 'ai',
                        message: getPersonaOpeningMessage(currentPersona, title),
                        timestamp: now,
                        personaId: currentPersona,
                    },
                ],
            };
            existingItems.push(detail);
            existingIds.add(id);
            void this.historyStore.saveIntervention(docUri, detail);
        }
    }

    /**
     * [Why/Intent] 対象ドキュメントの最新解析結果を履歴ストアへ同期永続化し、
     * エディタ側のインライン装飾（Decoration）の再描画コマンドを実行した上で、
     * Webviewパネルへ最新履歴リスト（SYNC_HISTORY_STATE）および旧互換介入リストをブロードキャストする。
     */
    public sendUpdateInterventions(document: vscode.TextDocument): void {
        const results = SharedAnalysisCache.getInstance().getResults(document);
        this.syncResultsToHistoryStore(document, results);
        void vscode.commands
            .executeCommand('vibecodeease.refreshDecorations')
            .then(undefined, () => {});
        if (!this.panel) {
            return;
        }
        const docUri = document.uri.toString();
        this.panel.webview.postMessage({
            type: 'SYNC_HISTORY_STATE',
            payload: {
                documentUri: docUri,
                interventions: this.historyStore.getInterventions(docUri),
            },
        });
        this.panel.webview.postMessage(
            buildUpdateInterventionsMessage(document, results, (uri, r) =>
                InterventionManager.generateIssueId(uri, r),
            ),
        );
    }

    /**
     * [Why/Intent] Webviewパネルおよび登録済みのDisposableリソースをすべて破棄する。
     */
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
