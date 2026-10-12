import * as vscode from 'vscode';
import type { AiInterventionLevel } from '../types/webviewMessage';

/**
 * [Why/Intent] SideEditor (Webview) と VS Code 拡張機能間で共有される
 * 設定値の取得および永続化を一元管理するモジュール。
 * SideEditorProvider から設定I/Oの責務を分離し、単一責任の原則（SRP）を徹底する。
 */

/**
 * Side Editor UI パネルへ同期される現在の設定値スナップショット
 */
export interface SideEditorSettings {
    apiKey?: string;
    level: AiInterventionLevel;
    frequency: 'manual' | 'onSave' | 'interval';
    intervalSeconds: number;
    model: string;
}

/**
 * [Why/Intent] ユーザー設定および SecretStorage から最新の SideEditor 設定を取得する。
 */
export async function fetchSideEditorSettings(
    context: vscode.ExtensionContext,
): Promise<SideEditorSettings> {
    const apiKey = await context.secrets.get('vibecodeease.geminiApiKey');
    const config = vscode.workspace.getConfiguration('vibecodeease');
    const level = config.get<string>(
        'aiInterventionLevel',
        'Level 2 (Refactoring)',
    ) as AiInterventionLevel;

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Retrieve configuration for UI settings, using fallback logic for sync frequency.
    // 旧バージョンの boolean 設定 'analyzeOnSave' との後方互換性を維持するためのフォールバック救済ロジック
    let frequency = config.get<string>('llm.syncFrequency');
    frequency ??= config.get<boolean>('analyzeOnSave') ? 'onSave' : 'manual';

    const intervalSeconds = config.get<number>('llm.syncIntervalSeconds') ?? 10;
    const model = config.get<string>('llmModel') ?? 'gemini-3.5-flash-lite';

    return {
        apiKey,
        level,
        frequency: frequency as 'manual' | 'onSave' | 'interval',
        intervalSeconds,
        model,
    };
}

/**
 * [Why/Intent] Webviewから受け取ったLLM設定（同期間隔・頻度・モデル）をグローバル設定に保存する。
 */
export async function saveLlmConfigSettings(
    intervalSecondsRaw: number | string | undefined,
    frequency: 'manual' | 'onSave' | 'interval',
    model: string,
): Promise<void> {
    let interval = Number(intervalSecondsRaw);
    // [Why/Intent] 同期間隔の安全クランプ:
    // 下限 5秒: APIレートリミット超過（429/503）や過剰なトークン消費を防止
    // 上限 3600秒 (1時間): 設定ミスによる長時間の解析フリーズを防止
    if (Number.isNaN(interval) || interval < 5) {
        interval = 5;
    }
    if (interval > 3600) {
        interval = 3600;
    }

    const config = vscode.workspace.getConfiguration('vibecodeease');
    await config.update('llm.syncFrequency', frequency, vscode.ConfigurationTarget.Global);
    await config.update('llm.syncIntervalSeconds', interval, vscode.ConfigurationTarget.Global);
    await config.update('llmModel', model, vscode.ConfigurationTarget.Global);
}
