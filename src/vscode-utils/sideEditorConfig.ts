import * as vscode from 'vscode';
import { InterventionManager } from '../core/interventionManager';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import type { LearningConfigStore } from '../core/scaffolding/learningConfigStore';
import { GlobalState } from '../state/globalState';
import type { PresetMode } from '../types/preset';
import type { AiInterventionLevel, WebviewToExtensionMessage } from '../types/webviewMessage';
import { findTargetDocument } from './sideEditorLearningHandler';

/**
 * [Why/Intent] SideEditor (Webview) と VS Code 拡張機能間で共有される
 * 設定値の取得および永続化を一元管理するモジュール。
 * SideEditorProvider から設定I/Oの責務を分離し、単一責任の原則（SRP）を徹底する。
 */

export interface SideEditorSettings {
    apiKey?: string;
    level: AiInterventionLevel;
    frequency: 'manual' | 'onSave' | 'interval';
    intervalSeconds: number;
    model: string;
}

export interface LegacyCommandContext {
    context: vscode.ExtensionContext;
    llmService: LlmBackgroundService;
    learningConfigStore: LearningConfigStore;
    currentDocumentUri?: vscode.Uri;
    postMessage: (msg: unknown) => void;
    sendSettingsSync: () => Promise<void>;
    sendLearningStateSync: () => void;
    sendSyncDocument: (fileName: string, text: string) => void;
    sendUpdateInterventions: (doc: vscode.TextDocument) => void;
    applyIntervention: (
        msg: Extract<WebviewToExtensionMessage, { command: 'apply_intervention' }>,
    ) => Promise<void>;
}

/**
 * [Why/Intent] WebviewのAI介入レベル選択値をバックエンドのPresetModeへ変換する。
 */
export function mapAiLevelToPreset(level: AiInterventionLevel): PresetMode {
    if (level === 'Level 1 (Typo/Bug Fix)') {
        return 'BUG_TYPO';
    }
    if (level === 'Level 3 (Architecture Optimization)') {
        return 'ARCHITECTURE';
    }
    return 'HINT';
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
    GlobalState.getInstance().reloadConfiguration();
}

async function handleReadyCommand(ctx: LegacyCommandContext): Promise<void> {
    const doc = findTargetDocument(ctx.currentDocumentUri);
    if (doc) {
        ctx.sendSyncDocument(doc.fileName, doc.getText());
        ctx.sendUpdateInterventions(doc);
    }
    await ctx.sendSettingsSync();
    ctx.sendLearningStateSync();
    ctx.postMessage({
        type: 'SYNC_LEARNING_CONFIG',
        payload: ctx.learningConfigStore.getConfig(),
    });
    ctx.postMessage({
        type: 'LLM_DASHBOARD_INIT',
        ...ctx.llmService.getDashboardState(),
    });
}

async function handleSettingsCommand(
    message: Extract<
        WebviewToExtensionMessage,
        { command: 'update_api_key' | 'update_intervention_level' | 'update_llm_config' }
    >,
    ctx: LegacyCommandContext,
): Promise<void> {
    if (message.command === 'update_api_key') {
        if (message.apiKey) {
            await ctx.context.secrets.store('vibecodeease.geminiApiKey', message.apiKey);
        } else {
            await ctx.context.secrets.delete('vibecodeease.geminiApiKey');
        }
        await ctx.sendSettingsSync();
        return;
    }
    if (message.command === 'update_intervention_level') {
        await vscode.workspace
            .getConfiguration('vibecodeease')
            .update('aiInterventionLevel', message.level, vscode.ConfigurationTarget.Global);
        await GlobalState.getInstance().setPresetMode(mapAiLevelToPreset(message.level));
        return;
    }
    await saveLlmConfigSettings(message.intervalSeconds, message.frequency, message.model);
    await ctx.sendSettingsSync();
    ctx.llmService.startTimerIfConfigured();
}

/**
 * [Why/Intent] Webviewからのレガシーコマンドメッセージをディスパッチする。
 */
export async function dispatchLegacyCommand(
    message: WebviewToExtensionMessage,
    ctx: LegacyCommandContext,
): Promise<void> {
    if (message.command === 'ready') {
        await handleReadyCommand(ctx);
    } else if (message.command === 'apply_intervention') {
        await ctx.applyIntervention(message);
    } else if (message.command === 'discard_intervention') {
        InterventionManager.discardIntervention(message.id);
        const doc = findTargetDocument(ctx.currentDocumentUri);
        if (doc) {
            ctx.sendUpdateInterventions(doc);
        }
    } else if (message.command === 'clear_error_logs') {
        ctx.llmService.clearErrorLogs();
    } else if (message.command === 'force_analyze') {
        const doc = findTargetDocument(ctx.currentDocumentUri, true);
        if (doc) {
            void ctx.llmService.runAnalysis(doc, false);
        }
    } else {
        await handleSettingsCommand(message, ctx);
    }
}
