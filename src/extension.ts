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

	const switchModeDisposable = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
		const items: vscode.QuickPickItem[] = [
			{
				label: '$(lightbulb) Suggestion',
				description: 'Suggest fixes for issues',
				detail: 'SUGGESTION'
			},
			{
				label: '$(zap) Silent',
				description: 'Silently fix issues in the background',
				detail: 'SILENT'
			},
			{
				label: '$(eye-closed) Off',
				description: 'Pause assistance',
				detail: 'IGNORE'
			}
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a vibeCodeEase mode'
		});

		if (selected && selected.detail) {
			const mode = selected.detail as import('./types').InterventionLevel;
			statusBar.updateMode(mode);
			vscode.window.setStatusBarMessage(`$(check) vibeCodeEase mode changed to ${selected.label.split(' ')[1]}`, 3000);
		}
	});
	context.subscriptions.push(switchModeDisposable);
}

export function deactivate() {}
