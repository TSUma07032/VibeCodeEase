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
import { EditorDecorator } from './core/editorDecorator';
import { ProposalCodeLensProvider } from './core/proposalCodeLensProvider';
import { AnalysisResult } from './types';
import { findOriginalTextRange } from './core/llm/planValidator';

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
	const llmBackgroundService = new LlmBackgroundService(context.secrets);
	const editorDecorator = new EditorDecorator();
	const codeLensProvider = new ProposalCodeLensProvider();

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
	const sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets, llmBackgroundService);
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
	context.subscriptions.push(llmBackgroundService);
	context.subscriptions.push(editorDecorator);
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider('*', codeLensProvider)
	);

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

	const reviewInterventionCommand = vscode.commands.registerCommand('vibecodeease.reviewIntervention', async (uri: vscode.Uri, result: AnalysisResult, id: string) => {
		if (!uri || !result) {
			return;
		}
		const intervention = result.interventions[0];
		if (!intervention || !intervention.replacementText) {
			return;
		}

		// 🤖 提案理由を整形
		const reasonMatch = intervention.message?.match(/🤖 \*\*AI 提案\*\*: (.*)/s);
		const reason = reasonMatch ? reasonMatch[1] : (intervention.message ?? '理由の記載はありません。');

		const oldCode = intervention.originalText || '';
		const newCode = intervention.replacementText;

		// モーダルダイアログで確認
		const action = await vscode.window.showInformationMessage(
			`🤖 提案理由:\n${reason}\n\n================\n【変更前】\n${oldCode}\n\n【変更後】\n${newCode}\n================`,
			{ modal: true },
			'✨ 適用',
			'✕ 却下'
		);

		if (action === '✨ 適用') {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.toString() !== uri.toString()) {
				vscode.window.showErrorMessage('適用先のファイルがアクティブではありません。');
				return;
			}
			const edit = new vscode.WorkspaceEdit();
			let range = new vscode.Range(
				result.range.start.line, result.range.start.character,
				result.range.end.line, result.range.end.character
			);
			// ズレ補正
			if (intervention.originalText) {
				const dynamicRange = findOriginalTextRange(editor.document, intervention.originalText, result.range.start.line, result.range.start.character);
				if (dynamicRange) {
					range = dynamicRange;
				} else {
					vscode.window.showErrorMessage('コードが大幅に変更されたため、適用位置を特定できませんでした。');
					return;
				}
			}

			edit.replace(uri, range, newCode);
			const applied = await vscode.workspace.applyEdit(edit);
			if (applied) {
				SharedAnalysisCache.getInstance().ignoreIssue(id);
				vscode.window.setStatusBarMessage('$(check) 修正を適用しました', 3000);
				actionLogService.log({
					category: 'SYSTEM',
					action: 'APPLY_REVIEW',
					targetId: uri.toString(),
					payload: 'Applied intervention after review'
				});
			}
		} else if (action === '✕ 却下') {
			vscode.commands.executeCommand('vibecodeease.rejectIntervention', id);
		}
	});
	context.subscriptions.push(reviewInterventionCommand);

	const rejectInterventionCommand = vscode.commands.registerCommand('vibecodeease.rejectIntervention', (id: string) => {
		if (id) {
			SharedAnalysisCache.getInstance().ignoreIssue(id);
			vscode.window.setStatusBarMessage('$(close) 提案を却下しました', 3000);
			vscode.commands.executeCommand('vibecodeease.refreshLiveIssues');
			
			// If CodeLens/Decorations need refresh
			// It should happen naturally via onDidChangeState or text changes, but to force:
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				editorDecorator.updateDecorations(editor);
			}
		}
	});
	context.subscriptions.push(rejectInterventionCommand);

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

