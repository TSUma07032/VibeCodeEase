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

    // 4. モード切り替えコマンド (プリセット選択式)
    const switchModeCommand = vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
        const items: PresetQuickPickItem[] = [
            {
                label: `$(lightbulb) ヒントモード (Hint)`,
                description: PRESET_DEFINITIONS.HINT.description,
                preset: 'HINT'
            },
            {
                label: `$(versions) アーキテクチャモード (Architecture)`,
                description: PRESET_DEFINITIONS.ARCHITECTURE.description,
                preset: 'ARCHITECTURE'
            },
            {
                label: `$(bug) バグ・タイポ修正 (Bug/Typo)`,
                description: PRESET_DEFINITIONS.BUG_TYPO.description,
                preset: 'BUG_TYPO'
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
