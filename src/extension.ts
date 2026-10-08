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
import { LlmBackgroundService } from './core/llmBackgroundService';

import { registerCommands } from './commands';
import { PanelProvider } from './vscode-utils/PanelProvider';

export function activate(context: vscode.ExtensionContext) {
	GlobalState.getInstance().initialize(context);

	// 繝ｯ繝ｼ繧ｯ繧ｹ繝壹・繧ｹ繝代せ縺ｮ隗｣豎ｺ
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Phase 2 & 3: 繧ｵ繝ｼ繝薙せ縺ｮ蛻晄悄蛹・
	const actionLogService = new ActionLogService(workspaceRoot);
	const adaptiveEngine = new AdaptiveEngine(3);
	const diagnosticsService = new DiagnosticsService();
	const silentFixService = new SilentFixService();
	const llmBackgroundService = new LlmBackgroundService();

	// 菫晏ｭ俶凾閾ｪ蜍穂ｿｮ豁｣・・ILENT・峨・繧ｳ繝ｼ繝ｫ繝舌ャ繧ｯ驟咲ｷ・
	silentFixService.setOnFixAppliedCallback((fixCount, docUri) => {
		vscode.window.setStatusBarMessage(`$(zap) 菫晏ｭ俶凾縺ｫ${fixCount}莉ｶ縺ｮ蝠城｡後ｒ閾ｪ蜍穂ｿｮ豁｣縺励∪縺励◆`, 3000);
		actionLogService.log({
			category: 'SILENT_FIX',
			action: 'APPLY_ON_SAVE',
			targetId: docUri,
			value: fixCount,
			payload: `Automatically fixed ${fixCount} issues on save`
		});
	});

	// 繧ｵ繧､繝峨ヰ繝ｼProvider縺ｮ蛻晄悄蛹悶→繧｢繧ｯ繧ｷ繝ｧ繝ｳ繧ｳ繝ｼ繝ｫ繝舌ャ繧ｯ驟咲ｷ・
	const sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets);
	sidebarProvider.getMessageHandler().setActionCallback((action, plan, docUri) => {
		// 繝ｭ繧ｰ險倬鹸
		actionLogService.log({
			category: 'LLM_PLAN',
			action,
			targetId: docUri,
			value: plan.edits.length,
			payload: plan.summary
		});

		// 驕ｩ蠢懊お繝ｳ繧ｸ繝ｳ縺ｸ縺ｮ騾夂衍・亥推邱ｨ髮・・繧ｫ繝・ざ繝ｪ縺斐→縺ｫ險倬鹸・・
		for (const edit of plan.edits) {
			adaptiveEngine.recordAction(edit.category, action);
		}
	});

	// 繝励Ο繝舌う繝繝ｼ繝ｻ繝ｪ繧ｹ繝翫・縺ｮ逋ｻ骭ｲ
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
	context.subscriptions.push(llmBackgroundService);

	const refreshLiveIssuesCmd = vscode.commands.registerCommand('vibecodeease.refreshLiveIssues', () => {
		sidebarProvider.pushLiveIssues();
	});
	context.subscriptions.push(refreshLiveIssuesCmd);

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
			vscode.window.setStatusBarMessage('$(check) 菫ｮ豁｣繧帝←逕ｨ縺励∪縺励◆', 3000);
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
						vscode.window.setStatusBarMessage('$(check) 菫ｮ豁｣繧偵Ρ繝ｳ繧ｿ繝・メ驕ｩ逕ｨ縺励∪縺励◆', 3000);
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
			prompt: 'Gemini API繧ｭ繝ｼ繧貞・蜉帙＠縺ｦ縺上□縺輔＞縲ゅく繝ｼ縺ｯVS Code縺ｮSecretStorage縺ｫ菫晏ｭ倥＆繧後∪縺吶・,
			password: true,
			ignoreFocusOut: true,
			placeHolder: 'AIza...'
		});
		if (apiKey === undefined) {
			return;
		}
		if (!apiKey.trim()) {
			await context.secrets.delete('vibecodeease.geminiApiKey');
			vscode.window.setStatusBarMessage('$(check) Gemini API繧ｭ繝ｼ繧貞炎髯､縺励∪縺励◆縲・, 3000);
			return;
		}
		await context.secrets.store('vibecodeease.geminiApiKey', apiKey.trim());
		vscode.window.setStatusBarMessage('$(check) Gemini API繧ｭ繝ｼ繧貞ｮ牙・縺ｫ菫晏ｭ倥＠縺ｾ縺励◆縲・, 3000);
	});
	context.subscriptions.push(configureGeminiKey);

	const statusBar = new VibeStatusBar();
	context.subscriptions.push(statusBar);

	const open3PaneCommand = vscode.commands.registerCommand('vibecodeease.open3PaneUI', () => {
		PanelProvider.createOrShow(context.extensionUri);
	});
	context.subscriptions.push(open3PaneCommand);

	// 繧ｳ繝槭Φ繝臥匳骭ｲ
	registerCommands(context, { actionLogService });

	// 繧ｻ繝・す繝ｧ繝ｳ髢句ｧ九Ο繧ｰ
	actionLogService.log({
		category: 'SYSTEM',
		action: 'SESSION_START',
		payload: 'Extension Activated with Phase 1-3 features'
	});
}

export function deactivate() {}



