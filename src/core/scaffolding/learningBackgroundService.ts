/**
 * [Why/Intent] エディタ変更を監視し、5秒デバウンス＋最小30秒インターバル制御によりLLM予想生成・停滞判定を自律実行する。
 */
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type {
    LearningSessionState,
    ShadowPredictionLlmResponse,
    ShadowPredictionResult,
} from '../../types/learningScaffolding';
import type { UserLearningConfig } from '../../types/learningSettings';
import { isSensitiveDocument, type LlmInterventionService } from '../llmInterventionService';
import { LEARNING_CONFIG } from './defaultLearningConfig';
import { buildShadowPredictionPrompt, SHADOW_PREDICTION_SCHEMA } from './learningPromptBuilder';
import type { LearningSessionStore } from './learningSessionStore';
import { assessStagnation, calculateProgressScore } from './stagnationCalculator';

/** [Why/Intent] ドキュメントURIからエラー重要度の診断情報を抽出するヘルパー */
function collectErrorDiagnostics(
    uri: vscode.Uri,
): Array<{ line: number; message: string; severity: string }> {
    return vscode.languages
        .getDiagnostics(uri)
        .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
        .map((d) => ({
            line: d.range.start.line + 1,
            message: d.message,
            severity: 'Error',
        }));
}

/** [Why/Intent] エラー文字列からLearningSessionStateのエラーコード分類を導出する */
function classifyLearningError(message: string): LearningSessionState['errorCode'] {
    const lower = message.toLowerCase();
    if (lower.includes('api key') || lower.includes('auth')) {
        return 'AUTH_MISSING';
    }
    if (lower.includes('429') || lower.includes('quota') || lower.includes('rate limit')) {
        return 'RATE_LIMIT';
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
        return 'NETWORK';
    }
    return 'UNKNOWN';
}

/** [Why/Intent] updateSessionWithPrediction に渡す引数オブジェクト型 */
interface UpdatePredictionParams {
    parsed: ShadowPredictionLlmResponse;
    diagsCount: number;
    codeHash: string;
    now: number;
}

/**
 * [Why/Intent] バックグラウンド監視サービスクラス。
 */
export class LearningBackgroundService implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private _debounceTimer: NodeJS.Timeout | undefined;
    private _lastExecutedTimestamp = 0;
    private _lastCodeHash = '';
    private _isWindowFocused = true;
    private _intervalSeconds: number = LEARNING_CONFIG.MIN_INTERVAL_SECONDS;
    private _debounceMs: number = LEARNING_CONFIG.DEBOUNCE_MS;
    private _thresholdN: number = LEARNING_CONFIG.DEFAULT_THRESHOLD_N;
    private _progressDeltaThreshold: number = LEARNING_CONFIG.PROGRESS_DELTA_THRESHOLD;

    /**
     * [Why/Intent] 依存するStoreとLLMサービスを注入し、エディタ編集監視とウィンドウフォーカス監視リスナーを登録する。
     */
    constructor(
        private readonly sessionStore: LearningSessionStore,
        private readonly llmService: LlmInterventionService,
    ) {
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChanged(e)),
            vscode.window.onDidChangeWindowState((state) => {
                this._isWindowFocused = state.focused;
            }),
            this.sessionStore.onDidChangeState((state) => {
                if (
                    state.status === 'empty' ||
                    (state.status === 'loading' && !state.latestPrediction)
                ) {
                    this._lastCodeHash = '';
                    this._lastExecutedTimestamp = 0;
                }
            }),
        );
    }

    /**
     * [Why/Intent] 設定ストアの変更を受信し、内部タイマー・デバウンス間隔および停滞判定回数nを即座に動的更新する。
     */
    public updateConfig(config: UserLearningConfig): void {
        this._intervalSeconds = config.intervalSeconds;
        this._debounceMs = config.debounceMs;
        this._thresholdN = config.stagnationThresholdN;
        this._progressDeltaThreshold = config.progressDeltaThreshold;
    }

    /** [Why/Intent] エディタ編集イベントを検知し、設定されたデバウンス時間で解析タスクを遅延起動する */
    private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        const state = this.sessionStore.getState();
        if (state.status === 'empty') {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (
            editor?.document !== event.document ||
            editor?.viewColumn === vscode.ViewColumn.Beside
        ) {
            return;
        }

        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }

        this._debounceTimer = setTimeout(() => {
            void this.executeAnalysis(editor.document);
        }, this._debounceMs);
    }

    /** [Why/Intent] 設定された最小インターバルの制限をチェックし、必要に応じてタイマーを再設定する */
    private isThrottled(now: number, document: vscode.TextDocument): boolean {
        const elapsedSeconds = (now - this._lastExecutedTimestamp) / 1000;
        if (elapsedSeconds < this._intervalSeconds) {
            const waitMs = (this._intervalSeconds - elapsedSeconds) * 1000;
            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
            }
            this._debounceTimer = setTimeout(() => void this.executeAnalysis(document), waitMs);
            return true;
        }
        return false;
    }

    /** [Why/Intent] 解析結果から予測結果オブジェクトと履歴アイテムを生成してストアに反映し、停滞判定を実行する */
    private updateSessionWithPrediction(params: UpdatePredictionParams): void {
        const { parsed, diagsCount, codeHash, now } = params;
        const { estimatedProgress, diagnosticPenalty } = calculateProgressScore(
            parsed.milestones,
            diagsCount,
        );
        const result: ShadowPredictionResult = {
            ...parsed,
            diagnosticPenalty,
            estimatedProgress,
            timestamp: now,
            codeHash,
        };

        this._lastCodeHash = codeHash;
        this._lastExecutedTimestamp = now;
        this.sessionStore.setPrediction(result);

        this.sessionStore.addHistoryItem({
            timestamp: now,
            estimatedProgress,
            codeHash,
            unresolvedTasks: parsed.unresolvedKeyTasks,
            diagnosticsCount: diagsCount,
        });

        const state = this.sessionStore.getState();
        this.sessionStore.setAssessment(
            assessStagnation({
                history: this.sessionStore.getHistory(),
                thresholdN: this._thresholdN,
                currentTimestamp: now,
                snoozeUntilTimestamp: state.snoozeUntilTimestamp,
                isDismissed: state.isDismissed,
                isWindowFocused: this._isWindowFocused,
                progressDeltaThreshold: this._progressDeltaThreshold,
            }),
        );
    }

    /**
     * [Why/Intent] 指定ドキュメントに対してLLM完成予想生成、進捗計算、停滞判定を実行する。
     */
    public async executeAnalysis(document: vscode.TextDocument): Promise<void> {
        const state = this.sessionStore.getState();
        if (state.status === 'empty' || isSensitiveDocument(document)) {
            return;
        }

        const text = document.getText();
        const codeHash = crypto.createHash('sha256').update(text).digest('hex');
        if (codeHash === this._lastCodeHash && state.latestPrediction !== null) {
            return;
        }

        const now = Date.now();
        if (this.isThrottled(now, document)) {
            return;
        }

        try {
            const diags = collectErrorDiagnostics(document.uri);
            const { systemInstruction, userPrompt } = buildShadowPredictionPrompt({
                taskDescription: state.taskDescription,
                learningGoal: state.learningGoal,
                currentCode: text,
                diagnostics: diags,
            });

            const rawJson = await this.llmService.requestStructuredOutput({
                systemInstruction,
                userPrompt,
                responseSchema: SHADOW_PREDICTION_SCHEMA,
            });

            const parsed = JSON.parse(rawJson) as ShadowPredictionLlmResponse;
            this.updateSessionWithPrediction({
                parsed,
                diagsCount: diags.length,
                codeHash,
                now,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.sessionStore.setError(message, classifyLearningError(message));
        }
    }

    /** [Why/Intent] 登録されたタイマーとイベントリスナーを安全に解放する */
    public dispose(): void {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}
