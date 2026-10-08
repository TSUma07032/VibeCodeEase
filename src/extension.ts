import * as vscode from 'vscode';
import { PanelProvider } from './vscode-utils/PanelProvider';
import { LlmBackgroundService } from './core/llmBackgroundService';

export function activate(context: vscode.ExtensionContext) {
	const llmBackgroundService = new LlmBackgroundService();
	let currentSettings = { llmApiKey: '', interventionLevel: 50 };

	context.subscriptions.push(
		vscode.commands.registerCommand('vibecodeease.recordAccept', (proposal) => {
			llmBackgroundService.recordAccept(proposal);
		}),
		vscode.commands.registerCommand('vibecodeease.cancelAnalysis', () => {
			llmBackgroundService.cancelAnalysis();
		}),
		vscode.commands.registerCommand('vibecodeease.updateSettings', (settings) => {
			currentSettings = settings;
		}),
		vscode.commands.registerCommand('vibecodeease.forceAnalyze', (code, documentUriStr) => {
			let uri: vscode.Uri | undefined;
			let finalCode = code;
			
			if (!finalCode) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					finalCode = editor.document.getText();
					uri = editor.document.uri;
				}
			} else if (documentUriStr) {
				uri = vscode.Uri.parse(documentUriStr);
			}

			if (finalCode && uri) {
				llmBackgroundService.run3LLMPipeline(finalCode, uri, currentSettings);
			} else {
				vscode.window.showErrorMessage('Cannot force analyze: No active text editor or code provided.');
			}
		}),
		vscode.workspace.onDidChangeTextDocument((e) => {
			llmBackgroundService.handleDocumentChange(e, currentSettings);
		})
	);

	context.subscriptions.push(llmBackgroundService);

	const open3PaneCommand = vscode.commands.registerCommand('vibecodeease.open3PaneUI', () => {
		PanelProvider.createOrShow(context.extensionUri);
	});
	context.subscriptions.push(open3PaneCommand);
}

export function deactivate() {}
