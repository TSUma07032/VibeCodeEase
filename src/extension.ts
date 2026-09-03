import * as vscode from 'vscode';
import { SidebarProvider } from './vscode-utils/SidebarProvider';
import { VibeHoverProvider } from './core/HoverProvider';
import { VibeCodeActionProvider } from './core/CodeActionProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';
import { PresetMode, PRESET_DEFINITIONS } from './types';
import { GlobalState } from './state/globalState';
import { DiagnosticsService } from './core/diagnosticsService';
import { SilentFixService } from './core/silentFixService';
import { ActionLogService } from './core/actionLogService';
import { AdaptiveEngine } from './core/adaptiveEngine';
import { CursorInterventionTracker } from './core/cursorInterventionTracker';

interface PresetQuickPickItem extends vscode.QuickPickItem {
	preset: PresetMode;
}

export function activate(context: vscode.ExtensionContext) {
	GlobalState.getInstance().initialize(context);

	// ワークスペースパスの解決
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Phase 2 & 3: サービスの初期化
	const actionLogService = new ActionLogService(workspaceRoot);
	const adaptiveEngine = new AdaptiveEngine(3);
	const diagnosticsService = new DiagnosticsService();
	const silentFixService = new SilentFixService();
	const cursorInterventionTracker = new CursorInterventionTracker();

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
		vscode.languages.registerCodeActionsProvider('*', new VibeCodeActionProvider(), {
			providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
		})
	);

	context.subscriptions.push(diagnosticsService);
	context.subscriptions.push(silentFixService);
	context.subscriptions.push(cursorInterventionTracker);

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

	const applyInterventionAtCursorCommand = vscode.commands.registerCommand('vibecodeease.applyInterventionAtCursor', async () => {
		const currentIntervention = cursorInterventionTracker.getCurrentIntervention();
		if (!currentIntervention || !currentIntervention.intervention.replacementText) {
			return;
		}
		const edit = new vscode.WorkspaceEdit();
		edit.replace(currentIntervention.uri, currentIntervention.range, currentIntervention.intervention.replacementText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (applied) {
			vscode.window.setStatusBarMessage('$(check) ワンタッチ適用完了', 3000);
			actionLogService.log({
				category: 'SYSTEM',
				action: 'APPLY',
				targetId: currentIntervention.uri.toString(),
				payload: 'Applied intervention at cursor via Tab'
			});
		}
	});
	context.subscriptions.push(applyInterventionAtCursorCommand);

	const configureGeminiKey = vscode.commands.registerCommand('vibecodeease.configureGeminiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
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

	// モード切り替えコマンド (プリセット選択式)
	const switchModeCommand = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
		const items: PresetQuickPickItem[] = [
			{
				label: '$(mortar-board) 学習モード (Learning)',
				description: PRESET_DEFINITIONS.LEARNING.description,
				preset: 'LEARNING'
			},
			{
				label: '$(zap) フローモード (Flow)',
				description: PRESET_DEFINITIONS.FLOW.description,
				preset: 'FLOW'
			},
			{
				label: '$(eye-closed) 職人モード (Zen)',
				description: PRESET_DEFINITIONS.ZEN.description,
				preset: 'ZEN'
			},
			{
				label: '$(settings) カスタム調整 (Custom)',
				description: 'サイドバーのスライダー設定に従って動作',
				preset: 'CUSTOM'
			}
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'vibeCodeEase の動作モードを選択してください'
		});

		if (selected) {
			await GlobalState.getInstance().setPresetMode(selected.preset);
			vscode.window.setStatusBarMessage(`$(check) モードを「${selected.label}」に変更しました`, 3000);
			actionLogService.log({
				category: 'MODE_CHANGE',
				action: 'SWITCH_PRESET',
				targetId: selected.preset,
				payload: `Switched preset to ${selected.preset}`
			});
		}
	});
	context.subscriptions.push(switchModeCommand);

	// セッション開始ログ
	actionLogService.log({
		category: 'SYSTEM',
		action: 'SESSION_START',
		payload: 'Extension Activated with Phase 1-3 features'
	});
}

export function deactivate() {}
