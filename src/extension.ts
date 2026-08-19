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

	const changeModeDisposable = vscode.commands.registerCommand('vibecodeease.changeMode', async () => {
		const result = await vscode.window.showQuickPick(
			[
				{ label: '$(zap) Silent', description: 'Silently fix issues', mode: 'SILENT' as const },
				{ label: '$(lightbulb) Suggestion', description: 'Suggest fixes', mode: 'SUGGESTION' as const },
				{ label: '$(eye-closed) Ignore', description: 'Pause assistance', mode: 'IGNORE' as const }
			],
			{ placeHolder: 'Select vibeCodeEase assistance mode' }
		);

		if (result) {
			statusBar.updateMode(result.mode);
			vscode.window.setStatusBarMessage(`$(check) vibeCodeEase mode set to ${result.label}`, 3000);
		}
	});
	context.subscriptions.push(changeModeDisposable);
}

export function deactivate() {}
