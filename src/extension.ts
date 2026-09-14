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
import { SharedAnalysisCache } from './core/analyzer';

import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
	GlobalState.getInstance().initialize(context);

	// ワークスペースパスの解決
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Phase 2 & 3: サービスの初期化
	const actionLogService = new ActionLogService(workspaceRoot);
	const adaptiveEngine = new AdaptiveEngine(3);
	const diagnosticsService = new DiagnosticsService();
	const silentFixService = new SilentFixService();

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
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('vibecodeease')) {
				GlobalState.getInstance().reloadConfiguration();
			}
		})
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"vibecodeease.sidebarView",
			sidebarProvider
		)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider('*', new VibeHoverProvider())
	);

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			'*',
			new VibeCodeActionProvider(),
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
		)
	);

	context.subscriptions.push(diagnosticsService);
	context.subscriptions.push(silentFixService);

	const disposable = vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vibeCodeEase!');
	});
	context.subscriptions.push(disposable);

	const applyInterventionCommand = vscode.commands.registerCommand('vibecodeease.applyIntervention', async (uri: vscode.Uri, range: vscode.Range, newText: string) => {
		if (!uri || !range || typeof newText !== 'string') {
			return;
		}
		const edit = new vscode.WorkspaceEdit();
		edit.replace(uri, range, newText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (applied) {
			vscode.window.setStatusBarMessage('$(check) 修正を適用しました', 3000);
			actionLogService.log({
				category: 'SYSTEM',
				action: 'APPLY',
				targetId: uri.toString(),
				payload: 'Applied intervention via command'
			});
		}
	});
	context.subscriptions.push(applyInterventionCommand);

	const tabToApplyCommand = vscode.commands.registerCommand('vibecodeease.tabToApply', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return vscode.commands.executeCommand('tab');
		}

		const document = editor.document;
		const selection = editor.selection;
		const globalState = GlobalState.getInstance();

		const results = SharedAnalysisCache.getInstance().getResults(document);

		for (const result of results) {
			if (result.range.start.line > selection.end.line) {
				break;
			}

			const level = globalState.getInterventionLevel(result.category);
			if (level === 'IGNORE') {
				continue;
			}

			const resultRange = new vscode.Range(
				result.range.start.line, result.range.start.character,
				result.range.end.line, result.range.end.character
			);

			if (selection.contains(resultRange.start) || selection.contains(resultRange.end) || selection.intersection(resultRange) || selection.start.line === resultRange.start.line) {
				if (result.interventions.length > 0 && result.interventions[0].replacementText) {
					const newText = result.interventions[0].replacementText;
					const edit = new vscode.WorkspaceEdit();
					edit.replace(document.uri, resultRange, newText);
					const applied = await vscode.workspace.applyEdit(edit);
					if (applied) {
						vscode.window.setStatusBarMessage('$(check) 修正をワンタッチ適用しました', 3000);
						actionLogService.log({
							category: 'SYSTEM',
							action: 'APPLY_TAB',
							targetId: document.uri.toString(),
							payload: `Applied intervention via Tab key: ${result.category}`
						});
					}
					return;
				}
			}
		}

		// If no intervention found, fallback to default tab behavior
		return vscode.commands.executeCommand('tab');
	});
	context.subscriptions.push(tabToApplyCommand);

	const configureGeminiKey = vscode.commands.registerCommand('vibecodeease.configureGeminiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			title: 'vibeCodeEase: Configure Gemini API Key',
			prompt: 'Gemini APIキーを入力してください。キーはVS CodeのSecretStorageに保存されます。',
			password: true,
			ignoreFocusOut: true,
			placeHolder: 'AIza...'
		});
		if (apiKey === undefined) {
			return;
		}
		if (!apiKey.trim()) {
			await context.secrets.delete('vibecodeease.geminiApiKey');
			vscode.window.setStatusBarMessage('$(check) Gemini APIキーを削除しました。', 3000);
			return;
		}
		await context.secrets.store('vibecodeease.geminiApiKey', apiKey.trim());
		vscode.window.setStatusBarMessage('$(check) Gemini APIキーを安全に保存しました。', 3000);
	});
	context.subscriptions.push(configureGeminiKey);

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

