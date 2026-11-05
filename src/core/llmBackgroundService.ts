/**
 * [Why/Intent] ファイル保存や定期インターバルを契機としたLLM自動推敲、
 * ダッシュボード状態管理（idle/loading/error）、および構造化エラー・具体的推奨アクション通知を統括するバックグラウンドサービス。
 */
import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { AnalysisResult, LlmInterventionPlan } from '../types';
import { SharedAnalysisCache } from './analyzer';
import {
    DEFAULT_SYNC_INTERVAL_SECONDS,
    MAX_AUTO_ANALYSIS_LINES,
    MAX_SYNC_INTERVAL_SECONDS,
    MIN_SYNC_INTERVAL_SECONDS,
} from './llm/llmConstants';
import { LlmError } from './llm/llmErrors';
import { isSensitiveDocument, type LlmInterventionService } from './llmInterventionService';

/**
 * [Why/Intent] エディタイベントやタイマーに連動してLLM推敲を実行し、UI状態同期とエラー通知を管理するサービス
 */
// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Extending LlmBackgroundService to handle Dashboard states (idle, loading, error, logs, response) and timer intervals.
export class LlmBackgroundService implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _llmService?: LlmInterventionService;
    private _cancellationTokenSource?: vscode.CancellationTokenSource;

    private readonly _onDidStartAnalysis = new vscode.EventEmitter<void>();
    public readonly onDidStartAnalysis = this._onDidStartAnalysis.event;

    private readonly _onDidCompleteAnalysis = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidCompleteAnalysis = this._onDidCompleteAnalysis.event;

    private readonly _onDidError = new vscode.EventEmitter<string>();
    public readonly onDidError = this._onDidError.event;

    public readonly onDidUpdateDashboard = new vscode.EventEmitter<unknown>();

    private _status: 'idle' | 'loading' | 'error' = 'idle';
    private _latestResponse: { text: string; timestamp: number } | null = null;
    private _errorLogs: Array<{ message: string; timestamp: number }> = [];
    private _timerId: NodeJS.Timeout | undefined;
    private readonly _lastAnalyzedVersions = new Map<string, number>();
    private _isPaused = false;

    /** [Why/Intent] 学習支援セッション開始時に自動推敲タイマーを停止して一時停止フラグを立てる */
    public pause(): void {
        this._isPaused = true;
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = undefined;
        }
    }

    /** [Why/Intent] 学習支援セッション終了時または一時停止解除時に自動推敲タイマーを再開する */
    public resume(): void {
        this._isPaused = false;
        this.startTimerIfConfigured();
    }

    /** [Why/Intent] 自動推敲が一時停止中か否かを返す */
    public get isPaused(): boolean {
        return this._isPaused;
    }

    constructor(
        readonly _secrets: vscode.SecretStorage,
        llmService?: LlmInterventionService,
    ) {
        this._llmService = llmService;
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                const config = vscode.workspace.getConfiguration('vibecodeease');
                const syncFreq =
                    config.get<string>('llm.syncFrequency') ??
                    (config.get<boolean>('analyzeOnSave') ? 'onSave' : 'manual');
                if (
                    syncFreq === 'onSave' &&
                    document === vscode.window.activeTextEditor?.document
                ) {
                    void this.runAnalysis(document, true);
                }
            }),
        );
        this.startTimerIfConfigured();
    }

    /**
     * [Why/Intent] ユーザー設定に基づきインターバルタイマーを開始または破棄する
     */
    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Start interval timer for LLM sync if configured.
    public startTimerIfConfigured(): void {
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = undefined;
        }
        if (this._isPaused) {
            return;
        }
        const config = vscode.workspace.getConfiguration('vibecodeease');
        const syncFreq =
            config.get<string>('llm.syncFrequency') ??
            (config.get<boolean>('analyzeOnSave') ? 'onSave' : 'manual');
        if (syncFreq === 'interval') {
            const rawSecs =
                config.get<number>('llm.syncIntervalSeconds') ?? DEFAULT_SYNC_INTERVAL_SECONDS;
            const intervalSecs = Math.min(
                MAX_SYNC_INTERVAL_SECONDS,
                Math.max(MIN_SYNC_INTERVAL_SECONDS, rawSecs),
            );
            this._timerId = setInterval(() => this.runAnalysisOnInterval(), intervalSecs * 1000);
        }
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Interval analysis execution logic.
    private runAnalysisOnInterval(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            if (
                editor.document.uri.scheme === 'file' &&
                editor.viewColumn !== vscode.ViewColumn.Beside
            ) {
                void this.runAnalysis(editor.document, true);
                return;
            }
        }
    }

    /**
     * [Why/Intent] Webviewダッシュボード初期表示用の最新状態（ステータス・生返答・エラーログ）を取得する
     */
    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Retrieve current dashboard state for UI initialization.
    public getDashboardState(): {
        status: 'idle' | 'loading' | 'error';
        response: { text: string; timestamp: number } | null;
        logs: Array<{ message: string; timestamp: number }>;
    } {
        return {
            status: this._status,
            response: this._latestResponse,
            logs: this._errorLogs,
        };
    }

    /**
     * [Why/Intent] 蓄積されたエラーログを初期化し、ダッシュボードへ変更を通知する
     */
    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Clear error logs and notify UI.
    public clearErrorLogs(): void {
        this._errorLogs = [];
        this.onDidUpdateDashboard.fire({ type: 'LLM_DASHBOARD_INIT', ...this.getDashboardState() });
    }

    /** [Why/Intent] ユーザー設定のプロバイダに応じたプラン作成処理へ委譲する */
    private async executeLlmPlan(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
    ): Promise<LlmInterventionPlan> {
        if (!this._llmService) {
            throw new LlmError({
                code: 'UNKNOWN',
                message: 'LlmInterventionService が初期化されていません。',
            });
        }
        const state = GlobalState.getInstance();
        return this._llmService.createPlan({
            document,
            token,
            modelSelector: state.llmModel,
            presetMode: state.presetMode,
        });
    }

    /** [Why/Intent] LLM解析結果を内部キャッシュへマージし、エディタ・ステータスバー・ダッシュボードへ反映する */
    private applyPlanResults(document: vscode.TextDocument, plan: LlmInterventionPlan): void {
        const uri = document.uri.toString();
        const results: AnalysisResult[] = plan.edits.map((edit) => ({
            category: edit.category,
            level: 'SUGGESTION',
            source: 'llm',
            range: {
                start: { line: edit.startLine, character: edit.startCharacter },
                end: { line: edit.endLine, character: edit.endCharacter },
            },
            interventions: [
                {
                    originalText: document.getText(
                        new vscode.Range(
                            edit.startLine,
                            edit.startCharacter,
                            edit.endLine,
                            edit.endCharacter,
                        ),
                    ),
                    replacementText: edit.newText,
                    message: `🤖 **AI 提案**: ${edit.reason}`,
                },
            ],
        }));

        SharedAnalysisCache.getInstance().mergeExternalResults(uri, results);
        this._lastAnalyzedVersions.set(uri, document.version);
        vscode.window.setStatusBarMessage('$(check) vibeCodeEase: AI 解析完了', 3000);

        const mdText =
            !plan.edits || plan.edits.length === 0
                ? '**AI 提案**: 特に修正の必要はありません。'
                : `### AI 提案 (${plan.edits.length}件)\n${plan.edits.map((e) => `- **行 ${e.startLine + 1}**: ${e.reason}\n`).join('')}`;

        this._latestResponse = { text: mdText, timestamp: Date.now() };
        this._status = 'idle';
        this.onDidUpdateDashboard.fire({
            type: 'LLM_RESPONSE_UPDATE',
            text: this._latestResponse.text,
            timestamp: this._latestResponse.timestamp,
        });
        this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'idle' });
    }

    /** [Why/Intent] LlmError から構造化された識別タグと具体的推奨アクションを含むログメッセージを生成する */
    private formatErrorLog(error: unknown): string {
        if (error instanceof LlmError) {
            return `[${error.code}] ${error.message} (推奨対処: ${error.suggestedAction})`;
        }
        const message = error instanceof Error ? error.message : String(error);
        return `[UNKNOWN] ${message}`;
    }

    /** [Why/Intent] LlmError の種別に応じた具体的アクション付きステータスバー通知を表示する */
    private showErrorMessage(error: unknown): void {
        if (error instanceof LlmError) {
            vscode.window.setStatusBarMessage(
                `$(error) AIエラー (${error.code}): ${error.suggestedAction}`,
                10000,
            );
            return;
        }
        vscode.window.setStatusBarMessage('$(error) AI通信エラー: 解析に失敗しました', 5000);
    }

    /** [Why/Intent] 解析中の例外発生時、イベント発火・UI通知・最大50件のログ履歴保存を行う */
    private handleAnalysisError(error: unknown, token: vscode.CancellationToken): void {
        if (token.isCancellationRequested) {
            return;
        }
        console.error('[LlmBackgroundService] Analysis failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this._onDidError.fire(errorMessage);
        this.showErrorMessage(error);

        const logMsg = this.formatErrorLog(error);
        const timestamp = Date.now();
        this._errorLogs.push({ message: logMsg, timestamp });
        if (this._errorLogs.length > 50) {
            this._errorLogs.shift();
        }

        this._status = 'error';
        this.onDidUpdateDashboard.fire({ type: 'LLM_ERROR_LOG', message: logMsg, timestamp });
        this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'error' });
    }

    /** [Why/Intent] 機密ファイル除外とURI単位の未変更バージョン除外を判定する */
    private shouldSkipDocument(document: vscode.TextDocument, isAuto: boolean): boolean {
        if (isSensitiveDocument(document)) {
            return true;
        }
        if (isAuto && document.lineCount > MAX_AUTO_ANALYSIS_LINES) {
            return true;
        }
        const lastVersion = this._lastAnalyzedVersions.get(document.uri.toString());
        return isAuto && lastVersion === document.version;
    }

    /** [Why/Intent] 先行する未完了の解析リクエストをキャンセルして新規トークンを発行する */
    private createAnalysisCancellationToken(): vscode.CancellationToken {
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        this._cancellationTokenSource = new vscode.CancellationTokenSource();
        return this._cancellationTokenSource.token;
    }

    /** [Why/Intent] 解析のライフサイクル（進捗表示、キャンセレーション制御、完了イベント発火）を統括する */
    private async performAnalysis(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
    ): Promise<void> {
        this._onDidStartAnalysis.fire();
        const statusBarDisposable = vscode.window.setStatusBarMessage(
            '$(sync~spin) vibeCodeEase: AI 解析中...',
        );

        try {
            const plan = await this.executeLlmPlan(document, token);
            if (token.isCancellationRequested) {
                this._status = 'idle';
                this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'idle' });
                return;
            }
            this.applyPlanResults(document, plan);
        } catch (error) {
            this.handleAnalysisError(error, token);
        } finally {
            statusBarDisposable.dispose();
            this._onDidCompleteAnalysis.fire(document.uri);
        }
    }

    /**
     * [Why/Intent] 対象ドキュメントに対してLLM推敲を実行し、ステータスバー更新および結果/エラー通知を行う
     */
    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Main analysis logic with UI status updates and error logging.
    public async runAnalysis(
        document: vscode.TextDocument,
        isAuto: boolean = false,
    ): Promise<void> {
        if ((this._isPaused && isAuto) || this.shouldSkipDocument(document, isAuto)) {
            return;
        }

        this._status = 'loading';
        this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'loading' });

        const token = this.createAnalysisCancellationToken();
        await this.performAnalysis(document, token);
    }

    public dispose(): void {
        for (const d of this._disposables) {
            d.dispose();
        }
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = undefined;
        }
        this._onDidStartAnalysis.dispose();
        this._onDidCompleteAnalysis.dispose();
        this._onDidError.dispose();
        this.onDidUpdateDashboard.dispose();
    }
}
