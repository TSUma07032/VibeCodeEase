/**
 * [Why/Intent] 拡張機能のエントリポイント。ライフサイクル管理（activate/deactivate）、
 * 各種サービス初期化、LlmGatewayと依存性のDI配線、およびコマンド登録を統括する。
 */
import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ActionLogService } from './core/actionLogService';
import { DiagnosticsService } from './core/diagnosticsService';
import { LlmConfigRepository } from './core/llm/llmConfigRepository';
import { LlmGateway } from './core/llm/llmGateway';
import { LlmBackgroundService } from './core/llmBackgroundService';
import { LlmInterventionService } from './core/llmInterventionService';
// Import personalization services statically
import { PersonalizationService } from './core/personalization/personalizationService';
import { SilentFixService } from './core/silentFixService';
import { GlobalState } from './state/globalState';
import { SideEditorProvider } from './vscode-utils/SideEditorProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';

/**
 * [Why/Intent] 拡張機能の初期化。以前の CodeActionProvider や editorDecorator 等を撤廃し、
 * 左エディタ介入を完全排除して SideEditorProvider への登録のみに集約する（Side-by-Side構成へ刷新する設計方針）。
 * LLM通信はすべて LlmGateway を経由し、直接の低レベルクライアント生成を排除する。
 */
export function activate(context: vscode.ExtensionContext): void {
    GlobalState.getInstance().initialize(context);

    // ワークスペースパスの解決
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // LLM統一インフラストラクチャの初期化
    const llmConfigRepo = new LlmConfigRepository(context.secrets);
    const llmGateway = new LlmGateway(llmConfigRepo);
    const llmInterventionService = new LlmInterventionService(llmGateway);

    // Phase 2 & 3: コアサービスの初期化
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

    // [Why/Intent] コアのバックグラウンド解析サービス完了時に、ObserverパターンでUI更新をトリガーし、密結合を防ぐ
    context.subscriptions.push(
        llmBackgroundService.onDidCompleteAnalysis((uri) => {
            const editor = vscode.window.visibleTextEditors.find(
                (e) => e.document.uri.toString() === uri.toString(),
            );
            if (editor) {
                sideEditorProvider.sendUpdateInterventions(editor.document);
            }
        }),
    );

    // 保存時自動修正（SILENT）のコールバック配線
    silentFixService.setOnFixAppliedCallback((fixCount, docUri) => {
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

    // プロバイダー・リスナーの登録
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vibecodeease')) {
                GlobalState.getInstance().reloadConfiguration();
            }
        }),
    );

    context.subscriptions.push(
        llmConfigRepo,
        diagnosticsService,
        silentFixService,
        llmBackgroundService,
        sideEditorProvider,
        new VibeStatusBar(),
    );

    registerExtensionCommands(context, sideEditorProvider);
    registerCommands(context, { actionLogService });

    // セッション開始ログ
    actionLogService.log({
        category: 'SYSTEM',
        action: 'SESSION_START',
        payload: 'Extension Activated with Phase 1-3 features',
    });
}

/** [Why/Intent] 拡張機能の各種VS Codeコマンドを登録するヘルパー */
function registerExtensionCommands(
    context: vscode.ExtensionContext,
    sideEditorProvider: SideEditorProvider,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
            vscode.window.showInformationMessage('Hello World from vibeCodeEase!');
        }),
        vscode.commands.registerCommand('vibecodeease.openSideEditor', () => {
            void sideEditorProvider.openSideEditor();
        }),
    );
}

export function deactivate(): void {}
