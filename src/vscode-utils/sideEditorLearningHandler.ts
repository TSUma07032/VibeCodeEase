import * as vscode from 'vscode';
import type { LlmBackgroundService } from '../core/llmBackgroundService';
import type { LearningBackgroundService } from '../core/scaffolding/learningBackgroundService';
import type { LearningConfigStore } from '../core/scaffolding/learningConfigStore';
import type { LearningSessionStore } from '../core/scaffolding/learningSessionStore';
import type { AnalysisResult } from '../types';
import type { LearningWebviewMessage } from '../types/learningScaffolding';
import type { LearningSettingsWebviewMessage } from '../types/learningSettings';
import type { ExtensionToWebviewMessage } from '../types/webviewMessage';

/**
 * [Why/Intent] SideEditorProvider から学習支援セッション・設定メッセージ処理の責務を分離するための依存コンテキスト。
 */
export interface LearningHandlerContext {
    learningSessionStore: LearningSessionStore;
    learningBackgroundService: LearningBackgroundService;
    learningConfigStore: LearningConfigStore;
    llmService: LlmBackgroundService;
    postMessage: (message: unknown) => void;
    syncLearningState: () => void;
    applyDiff: (replacementCode: string) => Promise<void>;
}

/**
 * [Why/Intent] Webviewからの学習設定要求を処理し、ストア更新・リセットおよび結果通知を行う。
 */
export async function handleLearningSettingsMessage(
    msg: LearningSettingsWebviewMessage,
    ctx: Pick<LearningHandlerContext, 'learningConfigStore' | 'postMessage'>,
): Promise<void> {
    if (msg.type === 'REQUEST_LEARNING_CONFIG') {
        ctx.postMessage({
            type: 'SYNC_LEARNING_CONFIG',
            payload: ctx.learningConfigStore.getConfig(),
        });
        return;
    }
    if (msg.type === 'UPDATE_LEARNING_CONFIG') {
        try {
            await ctx.learningConfigStore.updateConfig(msg.payload);
            ctx.postMessage({
                type: 'NOTIFY_CONFIG_SAVED',
                payload: { success: true, message: '設定を保存しました' },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ctx.postMessage({
                type: 'NOTIFY_CONFIG_SAVED',
                payload: { success: false, message },
            });
        }
        return;
    }
    if (msg.type === 'RESET_LEARNING_CONFIG') {
        await ctx.learningConfigStore.resetConfig();
        ctx.postMessage({
            type: 'NOTIFY_CONFIG_SAVED',
            payload: { success: true, message: '設定を保存しました' },
        });
    }
}

/**
 * [Why/Intent] セッション開始・終了およびヒント要求メッセージを処理する
 */
export function handleSessionControl(
    msg: Extract<
        LearningWebviewMessage,
        { type: 'START_SESSION' | 'STOP_SESSION' | 'REQUEST_HINT' }
    >,
    ctx: LearningHandlerContext,
): void {
    if (msg.type === 'START_SESSION') {
        ctx.learningSessionStore.startSession(msg.payload);
        const config = ctx.learningConfigStore.getConfig();
        ctx.learningSessionStore.setDisclosureMode(config.defaultDisclosureMode);
        if (config.pauseExistingAnalysisDuringLearning) {
            ctx.llmService.pause();
        }
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
            void ctx.learningBackgroundService.executeAnalysis(editor.document);
        }
    } else if (msg.type === 'STOP_SESSION') {
        ctx.learningSessionStore.stopSession();
        ctx.llmService.resume();
    } else {
        ctx.learningSessionStore.unlockNextLevel();
        ctx.syncLearningState();
    }
}

/**
 * [Why/Intent] ヒント開示設定・レベル遷移・スヌーズメッセージを処理する
 */
export function handleHintControl(
    msg: Extract<
        LearningWebviewMessage,
        {
            type:
                | 'SET_DISCLOSURE_MODE'
                | 'UNLOCK_NEXT_HINT_LEVEL'
                | 'UNLOCK_ALL_HINTS'
                | 'SNOOZE_HINT'
                | 'DISMISS_HINT';
        }
    >,
    learningSessionStore: LearningSessionStore,
): void {
    switch (msg.type) {
        case 'SET_DISCLOSURE_MODE':
            learningSessionStore.setDisclosureMode(msg.payload.mode);
            break;
        case 'UNLOCK_NEXT_HINT_LEVEL':
            learningSessionStore.unlockNextLevel();
            break;
        case 'UNLOCK_ALL_HINTS':
            learningSessionStore.unlockAll();
            break;
        case 'SNOOZE_HINT':
            learningSessionStore.snooze(msg.payload.snoozeMinutes);
            break;
        case 'DISMISS_HINT':
            learningSessionStore.dismiss();
            break;
    }
}

/**
 * [Why/Intent] 学習支援サブシステムのWebviewメッセージをディスパッチし、セッション状態とエディタ操作を制御する。
 */
export async function dispatchLearningMessage(
    msg: LearningWebviewMessage,
    ctx: LearningHandlerContext,
): Promise<void> {
    if (msg.type === 'APPLY_DIFF') {
        await ctx.applyDiff(msg.payload.replacementCode);
        return;
    }
    if (
        msg.type === 'START_SESSION' ||
        msg.type === 'STOP_SESSION' ||
        msg.type === 'REQUEST_HINT'
    ) {
        handleSessionControl(msg, ctx);
        return;
    }
    handleHintControl(msg, ctx.learningSessionStore);
}

/**
 * [Why/Intent] 現在追跡中のURIまたは可視エディタから対象ドキュメントを検索する。
 */
export function findTargetDocument(
    currentUri?: vscode.Uri,
    fallbackToVisible = false,
): vscode.TextDocument | undefined {
    if (currentUri) {
        const found = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === currentUri.toString(),
        );
        if (found) {
            return found;
        }
    }
    if (!fallbackToVisible) {
        return undefined;
    }
    return vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.scheme === 'file' && e.viewColumn !== vscode.ViewColumn.Beside,
    )?.document;
}

/**
 * [Why/Intent] ドキュメントの最新解析結果からWebview送信用のUPDATE_INTERVENTIONSメッセージを構築する。
 */
export function buildUpdateInterventionsMessage(
    document: vscode.TextDocument,
    results: AnalysisResult[],
    generateIssueId: (uri: string, r: AnalysisResult) => string,
): ExtensionToWebviewMessage {
    const uri = document.uri.toString();
    return {
        type: 'UPDATE_INTERVENTIONS',
        interventions: results.map((r) => ({
            id: generateIssueId(uri, r),
            range: {
                start: { line: r.range.start.line, character: r.range.start.character },
                end: { line: r.range.end.line, character: r.range.end.character },
            },
            originalText: r.interventions[0]?.originalText || '',
            replacementText: r.interventions[0]?.replacementText || '',
            message: r.interventions[0]?.message ?? '',
        })),
    };
}
