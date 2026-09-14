import * as vscode from 'vscode';
import { ActionLogService } from './core/actionLogService';
import { GlobalState } from './state/globalState';
import { PresetMode, PRESET_DEFINITIONS } from './types';

interface PresetQuickPickItem extends vscode.QuickPickItem {
    preset: PresetMode;
}

export interface CommandDependencies {
    actionLogService: ActionLogService;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    const { actionLogService } = deps;

    // 1. Hello World コマンド
    const helloWorldDisposable = vscode.commands.registerCommand('vibecodeease.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from vibeCodeEase!');
    });
    context.subscriptions.push(helloWorldDisposable);

    // 2. 介入適用コマンド
    const applyInterventionCommand = vscode.commands.registerCommand(
        'vibecodeease.applyIntervention',
        async (uri: vscode.Uri, range: vscode.Range, newText: string) => {
            if (!uri || !range || typeof newText !== 'string') {
                return;
            }
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, range, newText);
            const applied = await vscode.workspace.applyEdit(edit);
            if (applied) {
                vscode.window.setStatusBarMessage('$(check) 修正を適用しました', 3000);
                actionLogService.log({
                    category: 'SYSTEM',
                    action: 'APPLY',
                    targetId: uri.toString(),
                    payload: 'Applied intervention via command'
                });
            }
        }
    );
    context.subscriptions.push(applyInterventionCommand);

    // 3. Gemini API キー設定コマンド
    const configureGeminiKey = vscode.commands.registerCommand('vibecodeease.configureGeminiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Gemini APIキーを入力してください。キーはVS CodeのSecretStorageに保存されます。',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'AIza...'
        });
        if (apiKey === undefined) {
            return;
        }
        if (!apiKey.trim()) {
            await context.secrets.delete('vibecodeease.geminiApiKey');
            vscode.window.setStatusBarMessage('$(check) Gemini APIキーを削除しました。', 3000);
            return;
        }
        await context.secrets.store('vibecodeease.geminiApiKey', apiKey.trim());
        vscode.window.setStatusBarMessage('$(check) Gemini APIキーを安全に保存しました。', 3000);
    });
    context.subscriptions.push(configureGeminiKey);

    // 4. モード切り替えコマンド (プリセット選択式)
    const switchModeCommand = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
        const items: PresetQuickPickItem[] = [
            {
                label: '$(mortar-board) 学習モード (Learning)',
                description: PRESET_DEFINITIONS.LEARNING.description,
                preset: 'LEARNING'
            },
            {
                label: '$(zap) フローモード (Flow)',
                description: PRESET_DEFINITIONS.FLOW.description,
                preset: 'FLOW'
            },
            {
                label: '$(eye-closed) 職人モード (Zen)',
                description: PRESET_DEFINITIONS.ZEN.description,
                preset: 'ZEN'
            },
            {
                label: '$(settings) カスタム調整 (Custom)',
                description: 'サイドバーのスライダー設定に従って動作',
                preset: 'CUSTOM'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'vibeCodeEase の動作モードを選択してください'
        });

        if (selected) {
            await GlobalState.getInstance().setPresetMode(selected.preset);
            vscode.window.setStatusBarMessage(`$(check) モードを「${selected.label}」に変更しました`, 3000);
            actionLogService.log({
                category: 'MODE_CHANGE',
                action: 'SWITCH_PRESET',
                targetId: selected.preset,
                payload: `Switched preset to ${selected.preset}`
            });
        }
    });
    context.subscriptions.push(switchModeCommand);
}
