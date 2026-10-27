import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { ActionLogService } from './core/actionLogService';
import { DiagnosticsService } from './core/diagnosticsService';
import { GeminiClient } from './core/llm/geminiClient';
import { VscodeLmClient } from './core/llm/vscodeLmClient';
import { LlmBackgroundService } from './core/llmBackgroundService';
// Import personalization services statically
import { PersonalizationService } from './core/personalization/personalizationService';
import { SilentFixService } from './core/silentFixService';
import { GlobalState } from './state/globalState';
import { SideEditorProvider } from './vscode-utils/SideEditorProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';

/**
 * [Why/Intent] 拡張機能の初期化。以前の CodeActionProvider や editorDecorator 等を撤廃し、
 * 左エディタ介入を完全排除して SideEditorProvider への登録のみに集約する（Side-by-Side構成へ刷新する設計方針）。
 */
export function activate(context: vscode.ExtensionContext): void {
    GlobalState.getInstance().initialize(context);

    // ワークスペースパスの解決
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Phase 2 & 3: サービスの初期化
    const actionLogService = new ActionLogService(workspaceRoot);
    const diagnosticsService = new DiagnosticsService();
    const llmBackgroundService = new LlmBackgroundService(context.secrets);

    const getApiKey = async (): Promise<string | undefined> => {
        // 🛡️ Sentinel: APIキーは平文の設定ファイルからの取得を禁止し、SecretStorageに限定する
        return await context.secrets.get('vibecodeease.geminiApiKey');
    };
    const personalizationService = new PersonalizationService({
        globalStorageUri: context.globalStorageUri,
        geminiClient: new GeminiClient(),
        vscodeLmClient: new VscodeLmClient(),
        getApiKey,
    });
    void personalizationService.initialize();

    const silentFixService = new SilentFixService(personalizationService);
    const sideEditorProvider = SideEditorProvider.getInstance(context, llmBackgroundService);

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

export function deactivate(): void {}
