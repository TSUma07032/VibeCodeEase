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

	const statusBar = new VibeStatusBar();
	context.subscriptions.push(statusBar);

	const disposable = vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
		vscode.window.setStatusBarMessage('$(check) Hello World from vibeCodeEase!', 3000);
	});
	context.subscriptions.push(disposable);

	const changeModeDisposable = vscode.commands.registerCommand('vibecodeease.changeMode', async () => {
		const options: vscode.QuickPickItem[] = [
			{ label: '$(lightbulb) SUGGESTION', description: 'Suggest fixes (Default)' },
			{ label: '$(zap) SILENT', description: 'Silently fix issues' },
			{ label: '$(eye-closed) IGNORE', description: 'Pause assistance' }
		];
		const selection = await vscode.window.showQuickPick(options, {
			placeHolder: 'Select vibeCodeEase intervention mode...'
		});

		if (selection) {
			const mode = selection.label.replace(/\$\([^)]*\)\s*/, '') as 'SUGGESTION' | 'SILENT' | 'IGNORE';
			statusBar.updateMode(mode);
			vscode.window.setStatusBarMessage(`$(check) Mode changed to ${mode}`, 3000);
		}
	});
	context.subscriptions.push(changeModeDisposable);
}

export function deactivate() {}
