import * as vscode from 'vscode';
import { SidebarProvider } from './vscode-utils/SidebarProvider';
import { VibeHoverProvider } from './core/HoverProvider';
import { VibeCodeActionProvider } from './core/CodeActionProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';
import { InterventionLevel } from './types';
import { GlobalState } from './state/globalState';

interface ModeQuickPickItem extends vscode.QuickPickItem {
	mode: InterventionLevel;
}

export function activate(context: vscode.ExtensionContext) {
	GlobalState.getInstance().initialize(context);

	const sidebarProvider = new SidebarProvider(context.extensionUri, context.secrets);
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

	const disposable = vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vibeCodeEase!');
	});
	context.subscriptions.push(disposable);

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

	const switchModeCommand = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
		const items: ModeQuickPickItem[] = [
			{
				label: '$(zap) Assist: Silent',
				description: 'Silently fix issues in the background',
				mode: 'SILENT'
			},
			{
				label: '$(lightbulb) Assist: Suggest',
				description: 'Suggest fixes via UI',
				mode: 'SUGGESTION'
			},
			{
				label: '$(eye-closed) Assist: Off',
				description: 'Pause assistance',
				mode: 'IGNORE'
			}
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select vibeCodeEase mode'
		});

		if (selected) {
			await GlobalState.getInstance().setMode(selected.mode);
			statusBar.updateMode(selected.mode);
			vscode.window.setStatusBarMessage(`$(check) Mode changed to ${selected.mode}`, 3000);
		}
	});
	context.subscriptions.push(switchModeCommand);
}

export function deactivate() {}
