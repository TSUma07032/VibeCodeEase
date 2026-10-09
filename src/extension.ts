import * as vscode from 'vscode';
import { VibeStatusBar } from './vscode-utils/StatusBar';
import { GlobalState } from './state/globalState';
import { DiagnosticsService } from './core/diagnosticsService';
import { SilentFixService } from './core/silentFixService';
import { ActionLogService } from './core/actionLogService';
import { LlmBackgroundService } from './core/llmBackgroundService';
import { SideEditorProvider } from './vscode-utils/SideEditorProvider';
import { registerCommands } from './commands';

// Import personalization services statically
import { PersonalizationService } from './core/personalization/personalizationService';
import { GeminiClient } from './core/llm/geminiClient';
import { VscodeLmClient } from './core/llm/vscodeLmClient';

/**
 * [Why/Intent] 拡張機能の初期化。以前の CodeActionProvider や editorDecorator 等を撤廃し、
 * 左エディタ介入を完全排除して SideEditorProvider への登録のみに集約する（Side-by-Side構成へ刷新する設計方針）。
 */
export function activate(context: vscode.ExtensionContext) {
	GlobalState.getInstance().initialize(context);

	// ワークスペースパスの解決
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Phase 2 & 3: サービスの初期化
	const actionLogService = new ActionLogService(workspaceRoot);
	const diagnosticsService = new DiagnosticsService();
	const llmBackgroundService = new LlmBackgroundService(context.secrets);

	const getApiKey = async () => { let key = await context.secrets.get('vibecodeease.geminiApiKey'); if (!key) key = vscode.workspace.getConfiguration('vibecodeease').get('geminiApiKey'); return key as string; };
	const personalizationService = new PersonalizationService(context.globalStorageUri, new GeminiClient(), new VscodeLmClient(), getApiKey);
	personalizationService.initialize();

	const silentFixService = new SilentFixService(personalizationService);
    const sideEditorProvider = SideEditorProvider.getInstance(context.extensionUri);

    // [Why/Intent] コアのバックグラウンド解析サービス完了時に、ObserverパターンでUI更新をトリガーし、密結合を防ぐ
    context.subscriptions.push(
        llmBackgroundService.onDidCompleteAnalysis(uri => {
            const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
            if (editor) {
                sideEditorProvider.sendUpdateInterventions(editor.document);
            }
        })
    );

	// 保存時自動修正（SILENT）のコールバック配線
	silentFixService.setOnFixAppliedCallback((fixCount, docUri) => {
		vscode.window.setStatusBarMessage(`$(zap) 保存時に${fixCount}件の問題を自動修正しました`, 3000);
		actionLogService.log({
			category: 'SILENT_FIX',
			action: 'APPLY_ON_SAVE',
			targetId: docUri,
			value: fixCount,
			payload: `Automatically fixed ${fixCount} issues on save`
		});
	});

	// プロバイダー・リスナーの登録
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('vibecodeease')) {
				GlobalState.getInstance().reloadConfiguration();
			}
		})
	);

	context.subscriptions.push(diagnosticsService);
	context.subscriptions.push(silentFixService);
	context.subscriptions.push(llmBackgroundService);
    context.subscriptions.push(sideEditorProvider);

	const disposable = vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vibeCodeEase!');
	});
	context.subscriptions.push(disposable);
    
    /**
     * [Why/Intent] ユーザーが任意のタイミングで右側にAI提案エディタを開けるようにするコマンド。
     */
    const openSideEditorCommand = vscode.commands.registerCommand('vibecodeease.openSideEditor', () => {
        sideEditorProvider.openSideEditor();
    });
    context.subscriptions.push(openSideEditorCommand);

	const statusBar = new VibeStatusBar();
	context.subscriptions.push(statusBar);

	// コマンド登録
	registerCommands(context, { actionLogService });

	// セッション開始ログ
	actionLogService.log({
		category: 'SYSTEM',
		action: 'SESSION_START',
		payload: 'Extension Activated with Phase 1-3 features'
	});
}

export function deactivate() {}
