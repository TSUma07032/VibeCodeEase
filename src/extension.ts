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

	interface ModeQuickPickItem extends vscode.QuickPickItem {
		mode: 'SILENT' | 'SUGGESTION' | 'IGNORE';
	}

	const switchModeCommand = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
		const items: ModeQuickPickItem[] = [
			{ label: '$(zap) Silent', description: 'Silently fix issues in the background', mode: 'SILENT' },
			{ label: '$(lightbulb) Suggestion', description: 'Suggest fixes for issues', mode: 'SUGGESTION' },
			{ label: '$(eye-closed) Ignore', description: 'Pause assistance', mode: 'IGNORE' }
		];
		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select vibeCodeEase assistance mode'
		});

		if (selected) {
			statusBar.updateMode(selected.mode);
			vscode.window.setStatusBarMessage(`$(check) Mode switched to ${selected.label.replace(/^\$\([\w-]+\)\s*/, '')}`, 3000);
		}
	});
	context.subscriptions.push(switchModeCommand);
}

export function deactivate() {}
