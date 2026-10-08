import * as vscode from 'vscode';
import { PanelProvider } from './vscode-utils/PanelProvider';
import { LlmBackgroundService, LlmSettings } from './core/llmBackgroundService';

export function activate(context: vscode.ExtensionContext) {
	let currentSettings: LlmSettings = context.globalState.get('vibecodeease.settings') || { llmApiKey: '', triggerMode: 'on-save' };
	const llmBackgroundService = new LlmBackgroundService(currentSettings);

	// Load settings command internally sets it in the webview
	context.subscriptions.push(
		vscode.commands.registerCommand('vibecodeease.recordAccept', (proposal) => {
			llmBackgroundService.recordAccept(proposal);
		}),
		vscode.commands.registerCommand('vibecodeease.cancelAnalysis', () => {
			llmBackgroundService.cancelAnalysis();
		}),
		vscode.commands.registerCommand('vibecodeease.webviewReady', () => {
			if (PanelProvider.currentPanel) {
				PanelProvider.currentPanel.sendToWebview('loadSettings', currentSettings);
			}
		}),
		vscode.commands.registerCommand('vibecodeease.updateSettings', (settings) => {
			currentSettings = { ...currentSettings, ...settings };
			context.globalState.update('vibecodeease.settings', currentSettings);
			llmBackgroundService.updateSettings(currentSettings);
		}),
		vscode.commands.registerCommand('vibecodeease.forceAnalyze', (code, documentUriStr) => {
			let uri: vscode.Uri | undefined = llmBackgroundService.lastActiveEditorUri;
			let finalCode = llmBackgroundService.lastActiveEditorCode;
			
			if (code) finalCode = code;
			if (documentUriStr) uri = vscode.Uri.parse(documentUriStr);

			if (finalCode && uri) {
				llmBackgroundService.run3LLMPipeline(finalCode, uri);
			} else {
				vscode.window.showErrorMessage('Cannot force analyze: No active text editor or code provided.');
			}
		})
	);

	context.subscriptions.push(llmBackgroundService);

	const open3PaneCommand = vscode.commands.registerCommand('vibecodeease.open3PaneUI', () => {
		PanelProvider.createOrShow(context);
	});
	context.subscriptions.push(open3PaneCommand);
}

export function deactivate() {}

