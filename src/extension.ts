/**
 * [Why/Intent] 拡張機能のエントリポイント。ライフサイクル管理（activate/deactivate）、
 * 各種サービス初期化、LlmGatewayと依存性のDI配線、およびコマンド登録を統括する。
 * ユーザーの作業領域（左側のVS Codeテキストエディタ）には一切侵入しない（ホバー・背景色・Gutterアイコン・行末テキスト等を表示しない）
 * 非侵襲スタンスを徹底し、すべてのAI介入表示・操作を右側のAI作業スペース（SideEditor Webview）へ集約する。
 */
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ActionLogService } from './core/actionLogService';
import { DiagnosticsService } from './core/diagnosticsService';
import { LlmConfigRepository } from './core/llm/llmConfigRepository';
import { LlmGateway } from './core/llm/llmGateway';
import { LlmBackgroundService } from './core/llmBackgroundService';
import { LlmInterventionService } from './core/llmInterventionService';
import { ActiveInterventionService } from './core/onDemand/activeInterventionService';
import { InterventionQuickPick } from './core/onDemand/interventionQuickPick';
import { PersonalizationService } from './core/personalization/personalizationService';
import { SilentFixService } from './core/silentFixService';
import { GlobalState } from './state/globalState';
import { SideEditorProvider } from './vscode-utils/SideEditorProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';

/**
 * [Why/Intent] VS Codeのコマンド引数（位置引数 arg1, arg2 または配列 [id, uri]）を安全に正規化するヘルパー。
 * 2番目以降の介入案の「詳細」「採用」「却下」実行時に documentUri や id が欠落する不具合を防止する。
 */
export function parseInterventionCommandArgs(
    arg1?: unknown,
    arg2?: unknown,
): { id?: string; uri?: string } {
    if (Array.isArray(arg1)) {
        const id = typeof arg1[0] === 'string' ? arg1[0] : undefined;
        const uri = typeof arg1[1] === 'string' ? arg1[1] : undefined;
        return { id, uri };
    }
    if (typeof arg1 === 'string') {
        const uri = typeof arg2 === 'string' ? arg2 : undefined;
        return { id: arg1, uri };
    }
    return {};
}

/**
 * [Why/Intent] オンデマンド介入コマンド群およびドキュメント変更時のAI作業スペース同期リスナーを登録するヘルパー関数。
 * ユーザー作業領域（左側のエディタ）には一切の装飾（Decorator）やホバー（HoverProvider）を登録せず、
 * 右側のAI作業スペース（SideEditor）の更新のみを行う。
 */
function registerOnDemandInterventions(
    context: vscode.ExtensionContext,
    sideEditorProvider: SideEditorProvider,
    llmGateway: LlmGateway,
): void {
    const historyStore = sideEditorProvider.getHistoryStore();
    const quickPick = new InterventionQuickPick(historyStore);
    const activeService = new ActiveInterventionService(llmGateway, historyStore);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                sideEditorProvider.sendUpdateInterventions(editor.document);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor?.document.uri.toString() === event.document.uri.toString()) {
                await historyStore.validateAndAdjustRange(
                    activeEditor.document.uri.toString(),
                    event,
                );
            }
        }),
        vscode.commands.registerCommand('vibecodeease.showInterventionSummary', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await quickPick.show(editor);
            }
        }),
        vscode.commands.registerCommand(
            'vibecodeease.expandIntervention',
            async (arg1?: unknown, arg2?: unknown) => {
                const { id, uri } = parseInterventionCommandArgs(arg1, arg2);
                if (id) {
                    await sideEditorProvider.expandIntervention(id, uri);
                }
            },
        ),
        vscode.commands.registerCommand(
            'vibecodeease.applyInterventionById',
            async (arg1?: unknown, arg2?: unknown) => {
                const { id, uri } = parseInterventionCommandArgs(arg1, arg2);
                if (id) {
                    const editor = vscode.window.activeTextEditor;
                    await sideEditorProvider.applyInterventionById(
                        id,
                        uri ?? editor?.document.uri.toString(),
                    );
                }
            },
        ),
        vscode.commands.registerCommand(
            'vibecodeease.discardIntervention',
            async (arg1?: unknown, arg2?: unknown) => {
                const { id, uri } = parseInterventionCommandArgs(arg1, arg2);
                if (id) {
                    const editor = vscode.window.activeTextEditor;
                    await sideEditorProvider.discardIntervention(
                        id,
                        uri ?? editor?.document.uri.toString(),
                    );
                }
            },
        ),
        vscode.commands.registerCommand('vibecodeease.requestActiveIntervention', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await activeService.requestActiveIntervention(editor);
            }
        }),
        vscode.commands.registerCommand('vibecodeease.refreshDecorations', () => {
            // [Why/Intent] ユーザー作業領域（左エディタ）への装飾侵入を行わない方針のため no-op とする（互換性維持のためコマンド自体は存続）。
        }),
    );
}

/**
 * [Why/Intent] 拡張機能の各種VS Codeコマンド（SideEditor起動・設定画面起動・HelloWorld）を登録するヘルパー関数。
 */
function registerExtensionCommands(
    context: vscode.ExtensionContext,
    sideEditorProvider: SideEditorProvider,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
            vscode.window.setStatusBarMessage('$(info) Hello World from vibeCodeEase!', 3000);
        }),
        vscode.commands.registerCommand('vibecodeease.openSideEditor', () => {
            void sideEditorProvider.openSideEditor();
        }),
        vscode.commands.registerCommand('vibecodeease.openSettings', () => {
            void sideEditorProvider.openSettings();
        }),
    );
}

/**
 * [Why/Intent] VS Code拡張機能のアクティベーション関数。
 * グローバル状態、LLMインフラ、各種サービス（ログ、診断、バックグラウンド推敲、パーソナライズ、サイドエディタ）
 * およびAI作業スペース連携機能を順次初期化・配線する。
 */
export function activate(context: vscode.ExtensionContext): void {
    GlobalState.getInstance().initialize(context);

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const llmConfigRepo = new LlmConfigRepository(context.secrets);
    const llmGateway = new LlmGateway(llmConfigRepo);
    const llmInterventionService = new LlmInterventionService(llmGateway);

    const actionLogService = new ActionLogService(workspaceRoot);
    const diagnosticsService = new DiagnosticsService();
    const llmBackgroundService = new LlmBackgroundService(context.secrets, llmInterventionService);

    const personalizationService = new PersonalizationService({
        globalStorageUri: context.globalStorageUri,
        gateway: llmGateway,
        getApiKey: () => llmConfigRepo.getApiKey(),
    });
    void personalizationService.initialize();

    const silentFixService = new SetOnFixHelper(personalizationService, actionLogService).service;
    const sideEditorProvider = SideEditorProvider.getInstance(context, llmBackgroundService, {
        llmInterventionService,
    });

    context.subscriptions.push(
        llmBackgroundService.onDidCompleteAnalysis((uri) => {
            const doc =
                vscode.window.visibleTextEditors.find(
                    (e) => e.document.uri.toString() === uri.toString(),
                )?.document ??
                vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
            if (doc) {
                sideEditorProvider.sendUpdateInterventions(doc);
            }
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vibecodeease')) {
                GlobalState.getInstance().reloadConfiguration();
            }
        }),
        llmConfigRepo,
        diagnosticsService,
        silentFixService,
        llmBackgroundService,
        sideEditorProvider,
        new VibeStatusBar(),
    );

    registerExtensionCommands(context, sideEditorProvider);
    registerCommands(context, { actionLogService });
    registerOnDemandInterventions(context, sideEditorProvider, llmGateway);

    actionLogService.log({
        category: 'SYSTEM',
        action: 'SESSION_START',
        payload: 'Extension Activated with Phase 1-3 features and OnDemand Interventions',
    });
}

class SetOnFixHelper {
    public readonly service: SilentFixService;
    public constructor(
        personalizationService: PersonalizationService,
        actionLogService: ActionLogService,
    ) {
        this.service = new SilentFixService(personalizationService);
        this.service.setOnFixAppliedCallback((fixCount, docUri) => {
            vscode.window.setStatusBarMessage(
                `$(zap) 保存時に${fixCount}件の問題を自動修正しました`,
                3000,
            );
            actionLogService.log({
                category: 'SILENT_FIX',
                action: 'APPLY_ON_SAVE',
                targetId: docUri,
                value: fixCount,
                payload: `Automatically fixed ${fixCount} issues on save`,
            });
        });
    }
}

/**
 * [Why/Intent] VS Code拡張機能の非アクティベーション時のクリーンアップ関数。
 */
export function deactivate(): void {}
