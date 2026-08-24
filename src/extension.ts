import * as vscode from 'vscode';
import { SidebarProvider } from './vscode-utils/SidebarProvider';
import { VibeHoverProvider } from './core/HoverProvider';
import { VibeCodeActionProvider } from './core/CodeActionProvider';
import { VibeStatusBar } from './vscode-utils/StatusBar';
import { InterventionLevel } from './types';

interface ModeQuickPickItem extends vscode.QuickPickItem {
	mode: InterventionLevel;
}

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
		const items: ModeQuickPickItem[] = [
			{
				label: '$(lightbulb) Suggestion Mode',
				description: 'Suggest fixes via UI',
				mode: 'SUGGESTION'
			},
			{
				label: '$(zap) Silent Mode',
				description: 'Fix issues automatically in the background',
				mode: 'SILENT'
			},
			{
				label: '$(eye-closed) Ignore Mode',
				description: 'Pause all assistance',
				mode: 'IGNORE'
			}
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a vibeCodeEase assistance mode',
		});

		if (selected) {
			statusBar.updateMode(selected.mode);
			vscode.window.setStatusBarMessage(`$(check) vibeCodeEase mode set to: ${selected.label.replace(/\$\([^)]*\)\s*/, '')}`, 3000);
		}
	});
	context.subscriptions.push(switchModeDisposable);
}

export function deactivate() {}
