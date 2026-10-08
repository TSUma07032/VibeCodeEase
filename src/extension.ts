import * as vscode from 'vscode';
import { PanelProvider } from './vscode-utils/PanelProvider';
import { LlmBackgroundService, LlmSettings } from './core/llmBackgroundService';

export async function activate(context: vscode.ExtensionContext) {
	let savedSettings: Partial<LlmSettings> = context.globalState.get('vibecodeease.settings') || {};
	const savedApiKey = await context.secrets.get('vibecodeease.llmApiKey');
	
	let currentSettings: LlmSettings = { 
		llmApiKey: savedApiKey || '', 
		triggerMode: savedSettings.triggerMode || 'on-save' 
	};

	const llmBackgroundService = new LlmBackgroundService(currentSettings);

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
		vscode.commands.registerCommand('vibecodeease.updateSettings', async (settings: LlmSettings) => {
			currentSettings = { ...currentSettings, ...settings };
			// Save non-sensitive settings to globalState
			await context.globalState.update('vibecodeease.settings', { triggerMode: currentSettings.triggerMode });
			// Save API key to secrets
			if (currentSettings.llmApiKey) {
				await context.secrets.store('vibecodeease.llmApiKey', currentSettings.llmApiKey);
			} else {
				await context.secrets.delete('vibecodeease.llmApiKey');
			}
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
