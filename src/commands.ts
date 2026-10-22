import * as vscode from 'vscode';
import type { ActionLogService } from './core/actionLogService';
import { GlobalState } from './state/globalState';
import { PRESET_DEFINITIONS, type PresetMode } from './types';

interface PresetQuickPickItem extends vscode.QuickPickItem {
    preset: PresetMode;
}

export interface CommandDependencies {
    actionLogService: ActionLogService;
}

function registerSwitchModeCommand(actionLogService: ActionLogService): vscode.Disposable {
    return vscode.commands.registerCommand('vibecodeease.switchMode', async () => {
        const items: PresetQuickPickItem[] = [
            {
                label: '$(lightbulb) ヒントモード (Hint)',
                description: PRESET_DEFINITIONS.HINT.description,
                preset: 'HINT',
            },
            {
                label: '$(versions) アーキテクチャモード (Architecture)',
                description: PRESET_DEFINITIONS.ARCHITECTURE.description,
                preset: 'ARCHITECTURE',
            },
            {
                label: '$(bug) バグ・タイポ修正 (Bug/Typo)',
                description: PRESET_DEFINITIONS.BUG_TYPO.description,
                preset: 'BUG_TYPO',
            },
            {
                label: '$(settings) カスタム調整 (Custom)',
                description: 'サイドバーのスライダー設定に従って動作',
                preset: 'CUSTOM',
            },
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'vibeCodeEase: 動作モード選択',
            placeHolder: 'vibeCodeEase の動作モードを選択してください',
        });

        if (selected) {
            await GlobalState.getInstance().setPresetMode(selected.preset);
            vscode.window.setStatusBarMessage(
                `$(check) モードを「${selected.label}」に変更しました`,
                3000,
            );
            actionLogService.log({
                category: 'MODE_CHANGE',
                action: 'SWITCH_PRESET',
                targetId: selected.preset,
                payload: `Switched preset to ${selected.preset}`,
            });
        }
    });
}

function registerConfigureKeyCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand('vibecodeease.configureGeminiKey', async () => {
        const key = await vscode.window.showInputBox({
            title: 'vibeCodeEase: Gemini API設定',
            prompt: 'Gemini API キーを入力してください（空欄で削除）',
            password: true,
            ignoreFocusOut: true,
        });
        if (key === undefined) {
            return;
        }
        const trimmed = key.trim();
        if (trimmed) {
            await context.secrets.store('vibecodeease.geminiApiKey', trimmed);
            vscode.window.setStatusBarMessage(
                '$(check) Gemini API キーを SecretStorage に保存しました',
                3000,
            );
        } else {
            await context.secrets.delete('vibecodeease.geminiApiKey');
            vscode.window.setStatusBarMessage(
                '$(info) Gemini API キーを SecretStorage から削除しました',
                3000,
            );
        }
    });
}

function registerApplyInterventionCommand(actionLogService: ActionLogService): vscode.Disposable {
    return vscode.commands.registerCommand(
        'vibecodeease.applyIntervention',
        async (params?: {
            uri: vscode.Uri;
            range: vscode.Range;
            newText: string;
            category?: string;
        }) => {
            if (!params?.uri || !params.range || typeof params.newText !== 'string') {
                return false;
            }
            const edit = new vscode.WorkspaceEdit();
            edit.replace(params.uri, params.range, params.newText);
            const applied = await vscode.workspace.applyEdit(edit);
            if (applied) {
                actionLogService.log({
                    category: params.category ?? 'INTERVENTION',
                    action: 'APPLY_COMMAND',
                    targetId: params.uri.toString(),
                    payload: 'Applied intervention via command',
                });
            }
            return applied;
        },
    );
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies,
): void {
    const { actionLogService } = deps;
    context.subscriptions.push(
        registerSwitchModeCommand(actionLogService),
        registerConfigureKeyCommand(context),
        registerApplyInterventionCommand(actionLogService),
    );
}
