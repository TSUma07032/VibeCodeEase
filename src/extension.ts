import * as vscode from 'vscode';
import { SidebarProvider } from './vscode-utils/SidebarProvider';
import { VibeHoverProvider } from './core/HoverProvider';
import { VibeCodeActionProvider } from './core/CodeActionProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';
import { GlobalState } from './state/globalState';
import { DiagnosticsService } from './core/diagnosticsService';
import { SilentFixService } from './core/silentFixService';
import { ActionLogService } from './core/actionLogService';
import { AdaptiveEngine } from './core/adaptiveEngine';

import { registerCommands } from './commands';
import { AnalysisCache } from './core/analysisCache';

export function activate(context: vscode.ExtensionContext) {
	GlobalState.getInstance().initialize(context);

	// ワークスペースパスの解決
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Phase 2 & 3: サービスの初期化
	const actionLogService = new ActionLogService(workspaceRoot);
	const adaptiveEngine = new AdaptiveEngine(3);
	const diagnosticsService = new DiagnosticsService();
	const silentFixService = new SilentFixService();
	const analysisCache = new AnalysisCache();

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

	// サイドバーProviderの初期化とアクションコールバック配線
	const sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets);
	sidebarProvider.getMessageHandler().setActionCallback((action, plan, docUri) => {
		// ログ記録
		actionLogService.log({
			category: 'LLM_PLAN',
			action,
			targetId: docUri,
			value: plan.edits.length,
			payload: plan.summary
		});

		// 適応エンジンへの通知（各編集のカテゴリごとに記録）
		for (const edit of plan.edits) {
			adaptiveEngine.recordAction(edit.category, action);
		}
	});

	// プロバイダー・リスナーの登録
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"vibecodeease.sidebarView",
			sidebarProvider
		)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider('*', new VibeHoverProvider(undefined, analysisCache))
	);

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			'*',
			new VibeCodeActionProvider(undefined, analysisCache),
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
		)
	);

	context.subscriptions.push(diagnosticsService);
	context.subscriptions.push(silentFixService);

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

