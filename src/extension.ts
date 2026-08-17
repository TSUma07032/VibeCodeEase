import * as vscode from 'vscode';
import { SidebarProvider } from './vscode-utils/SidebarProvider';
import { VibeHoverProvider } from './core/HoverProvider';
import { VibeCodeActionProvider } from './core/CodeActionProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';

export function activate(context: vscode.ExtensionContext) {
	const sidebarProvider = new SidebarProvider(context.extensionUri);
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

	const statusBar = new VibeStatusBar();
	context.subscriptions.push(statusBar);

	const toggleModeCommand = vscode.commands.registerCommand('vibecodeease.toggleMode', async () => {
		const options: vscode.QuickPickItem[] = [
			{ label: '$(zap) SILENT', description: 'Silently fix issues in the background' },
			{ label: '$(lightbulb) SUGGESTION', description: 'Suggest fixes for issues' },
			{ label: '$(eye-closed) IGNORE', description: 'Pause vibeCodeEase assistance' }
		];

		const selected = await vscode.window.showQuickPick(options, {
			placeHolder: 'Select vibeCodeEase intervention mode'
		});

		if (selected) {
			const mode = selected.label.split(' ')[1] as 'SILENT' | 'SUGGESTION' | 'IGNORE';
			statusBar.updateMode(mode);
			vscode.window.setStatusBarMessage(`$(check) vibeCodeEase mode updated to: ${mode}`, 3000);
		}
	});
	context.subscriptions.push(toggleModeCommand);
}

export function deactivate() {}
