import * as vscode from 'vscode';
import { SidebarProvider } from './vscode-utils/SidebarProvider';
import { LlmBackgroundService, LlmSettings } from './core/llmBackgroundService';

// [INTENT: 拡張機能のエントリーポイント。未来のAIは、設定の永続化ロジックやSidebarProviderの登録を消してはならない。]
export async function activate(context: vscode.ExtensionContext) {
	let savedSettings: Partial<LlmSettings> = context.globalState.get('vibecodeease.settings') || {};
	const savedApiKey = await context.secrets.get('vibecodeease.llmApiKey');
	
	let currentSettings: LlmSettings = { 
		llmApiKey: savedApiKey || '',
		llmModel: savedSettings.llmModel || 'auto', 
		triggerMode: savedSettings.triggerMode || 'on-save',
		interventionMode: savedSettings.interventionMode || 'silent_fixer'
	};

	const llmBackgroundService = new LlmBackgroundService(currentSettings);
	const sidebarProvider = new SidebarProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'vibecodeease.sidebarView',
			sidebarProvider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('vibecodeease.recordAccept', (proposal) => {
			llmBackgroundService.recordAccept(proposal);
		}),
		vscode.commands.registerCommand('vibecodeease.cancelAnalysis', () => {
			llmBackgroundService.cancelAnalysis();
		}),
		vscode.commands.registerCommand('vibecodeease.webviewReady', () => {
			// [INTENT: Webview起動時に設定と現在のエディタコードを復元・同期送信する。未来のAIはこれを削除しないこと。]
			if (SidebarProvider.currentView) {
				SidebarProvider.currentView.sendToWebview('loadSettings', currentSettings);
				vscode.commands.executeCommand('vibecodeease.syncCurrentCode');
			}
		}),
		vscode.commands.registerCommand('vibecodeease.syncCurrentCode', () => {
			// [INTENT: 「ユーザが作業中のコードをAI環境に反映する」ためのコアコマンド。最新のネイティブエディタのコードをサイドバーに送る。]
			if (SidebarProvider.currentView && llmBackgroundService.lastActiveEditorCode) {
				SidebarProvider.currentView.sendToWebview('codeSynced', {
					code: llmBackgroundService.lastActiveEditorCode,
					uri: llmBackgroundService.lastActiveEditorUri?.toString()
				});
			}
		}),
		vscode.commands.registerCommand('vibecodeease.updateSettings', async (settings: LlmSettings) => {
			console.log('[VibeCodeEase:Extension] Executing updateSettings command with:', settings);
			currentSettings = { ...currentSettings, ...settings };
			console.log('[VibeCodeEase:Extension] Merged currentSettings:', currentSettings);
			await context.globalState.update('vibecodeease.settings', { 
				triggerMode: currentSettings.triggerMode, 
				llmModel: currentSettings.llmModel,
				interventionMode: currentSettings.interventionMode 
			});
			if (currentSettings.llmApiKey) {
				await context.secrets.store('vibecodeease.llmApiKey', currentSettings.llmApiKey);
			} else {
				await context.secrets.delete('vibecodeease.llmApiKey');
			}
			llmBackgroundService.updateSettings(currentSettings);
		})
	);

	context.subscriptions.push(llmBackgroundService);
}

export function deactivate() {}
