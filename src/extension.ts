/**
 * [Why/Intent] 拡張機能のエントリポイント。ライフサイクル管理（activate/deactivate）、
 * 各種サービス初期化、LlmGatewayと依存性のDI配線、コマンド登録、
 * およびオンデマンドインラインAI機能（Hover、Decorator、QuickPick、逆指名）を統括する。
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
import { InlineInterventionDecorator } from './core/onDemand/inlineInterventionDecorator';
import { InlineInterventionHoverProvider } from './core/onDemand/inlineInterventionHoverProvider';
import { InterventionQuickPick } from './core/onDemand/interventionQuickPick';
import { PersonalizationService } from './core/personalization/personalizationService';
import { SilentFixService } from './core/silentFixService';
import { GlobalState } from './state/globalState';
import { SideEditorProvider } from './vscode-utils/SideEditorProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';

/**
 * [Why/Intent] 非侵襲オンデマンド・インライン機能群（デコレータ、ホバープロバイダ、QuickPick、逆指名サービス）の
 * 初期化およびVS Code拡張コンテキスト・イベントリスナーへの登録を統括するヘルパー関数。
 */
function registerOnDemandInterventions(
    context: vscode.ExtensionContext,
    sideEditorProvider: SideEditorProvider,
    llmGateway: LlmGateway,
): void {
    const historyStore = sideEditorProvider.getHistoryStore();
    const decorator = new InlineInterventionDecorator();
    const hoverProvider = new InlineInterventionHoverProvider(historyStore);
    const quickPick = new InterventionQuickPick(historyStore);
    const activeService = new ActiveInterventionService(llmGateway, historyStore);

    const refreshActiveDecorations = () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
            const items = historyStore.getInterventions(editor.document.uri.toString());
            decorator.updateDecorations(editor, items);
        }
    };

    context.subscriptions.push(
        decorator,
        vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                const items = historyStore.getInterventions(editor.document.uri.toString());
                decorator.updateDecorations(editor, items);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor?.document.uri.toString() === event.document.uri.toString()) {
                await historyStore.validateAndAdjustRange(
                    activeEditor.document.uri.toString(),
                    event,
                );
                refreshActiveDecorations();
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
            async (interventionIdOrArray: string | string[]) => {
                const id = Array.isArray(interventionIdOrArray)
                    ? interventionIdOrArray[0]
                    : interventionIdOrArray;
                if (id) {
                    await sideEditorProvider.expandIntervention(id);
                }
            },
        ),
        vscode.commands.registerCommand(
            'vibecodeease.discardIntervention',
            async (interventionIdOrArray: string | string[]) => {
                const id = Array.isArray(interventionIdOrArray)
                    ? interventionIdOrArray[0]
                    : interventionIdOrArray;
                const editor = vscode.window.activeTextEditor;
                if (id && editor) {
                    await historyStore.updateStatus(
                        editor.document.uri.toString(),
                        id,
                        'dismissed',
                    );
                    refreshActiveDecorations();
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
            refreshActiveDecorations();
        }),
    );

    refreshActiveDecorations();
}

/** [Why/Intent] 拡張機能の各種VS Codeコマンドを登録するヘルパー */
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
    );
}

/**
 * [Why/Intent] VS Code拡張機能のアクティベーション関数。
 * グローバル状態、LLMインフラ、各種サービス（ログ、診断、バックグラウンド推敲、パーソナライズ、サイドエディタ）
 * およびオンデマンドインライン機能を順次初期化・配線する。
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

    const silentFixService = new SilentFixService(personalizationService);
    const sideEditorProvider = SideEditorProvider.getInstance(context, llmBackgroundService, {
        llmInterventionService,
    });

    context.subscriptions.push(
        llmBackgroundService.onDidCompleteAnalysis((uri) => {
            const editor = vscode.window.visibleTextEditors.find(
                (e) => e.document.uri.toString() === uri.toString(),
            );
            if (editor) {
                sideEditorProvider.sendUpdateInterventions(editor.document);
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

export function deactivate(): void {}
