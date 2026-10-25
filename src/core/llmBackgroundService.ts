import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { AnalysisResult, LlmInterventionPlan } from '../types';
import { SharedAnalysisCache } from './analyzer';
import { isSensitiveDocument, LlmInterventionService } from './llmInterventionService';

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Extending LlmBackgroundService to handle Dashboard states (idle, loading, error, logs, response) and timer intervals.
export class LlmBackgroundService implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _llmService: LlmInterventionService;
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
        private readonly secrets: vscode.SecretStorage,
        llmService?: LlmInterventionService,
    ) {
        this._llmService =
            llmService ?? new LlmInterventionService(undefined, undefined, this.secrets);
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
            const rawSecs = config.get<number>('llm.syncIntervalSeconds') ?? 10;
            const intervalSecs = Math.min(3600, Math.max(5, rawSecs));
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

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Clear error logs and notify UI.
    public clearErrorLogs(): void {
        this._errorLogs = [];
        this.onDidUpdateDashboard.fire({ type: 'LLM_DASHBOARD_INIT', ...this.getDashboardState() });
    }

    /** [Why/Intent] Geminiプロバイダ利用時に必要なAPIキーをSecretStorageおよび設定からフォールバック取得する */
    private async prepareApiKey(provider: string): Promise<string | undefined> {
        if (provider !== 'gemini') {
            return undefined;
        }
        const secretKey = await this.secrets.get('vibecodeease.geminiApiKey');
        return (
            secretKey ??
            vscode.workspace.getConfiguration('vibecodeease').get<string>('geminiApiKey')
        );
    }

    /** [Why/Intent] ユーザー設定のプロバイダに応じたプラン作成処理へ委譲する */
    private async executeLlmPlan(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        apiKey?: string,
    ): Promise<LlmInterventionPlan> {
        const state = GlobalState.getInstance();
        if (state.llmProvider === 'gemini' && apiKey) {
            return this._llmService.createGeminiPlan({
                document,
                token,
                apiKey,
                modelName: state.llmModel,
                presetMode: state.presetMode,
            });
        }
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

    /** [Why/Intent] エラーメッセージの内容を分類し識別タグを付与する */
    private formatErrorLog(errorMessage: string, error: unknown): string {
        const lowerMsg = errorMessage.toLowerCase();
        if (/(quota|429|503|fetch|network)/.test(lowerMsg)) {
            return `[API Error] ${errorMessage}`;
        }
        if (
            lowerMsg.includes('json') ||
            lowerMsg.includes('parse') ||
            error instanceof SyntaxError
        ) {
            return `[Parse Error] ${errorMessage}`;
        }
        return `[Unknown Error] ${errorMessage}`;
    }

    /** [Why/Intent] エラー重要度に応じたステータスバー通知を表示する */
    private showErrorMessage(errorMessage: string): void {
        if (errorMessage.toLowerCase().includes('quota')) {
            vscode.window.setStatusBarMessage(
                '$(error) AI API Quota 超過: プランまたは課金情報を確認してください',
                10000,
            );
        } else if (errorMessage.includes('503') || errorMessage.includes('429')) {
            const code = errorMessage.includes('503') ? '503' : '429';
            vscode.window.setStatusBarMessage(
                `$(error) AI通信エラー: サーバーが混雑しています (${code})`,
                10000,
            );
        } else {
            vscode.window.setStatusBarMessage('$(error) AI通信エラー: 解析に失敗しました', 5000);
        }
    }

    /** [Why/Intent] 解析中の例外発生時、イベント発火・UI通知・最大50件のログ履歴保存を行う */
    private handleAnalysisError(error: unknown, token: vscode.CancellationToken): void {
        if (token.isCancellationRequested) {
            return;
        }
        console.error('[LlmBackgroundService] Analysis failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this._onDidError.fire(errorMessage);
        this.showErrorMessage(errorMessage);

        const logMsg = this.formatErrorLog(errorMessage, error);
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
        apiKey?: string,
    ): Promise<void> {
        this._onDidStartAnalysis.fire();

        try {
            const plan = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: 'vibeCodeEase: AI 解析中...',
                },
                async () => {
                    return this.executeLlmPlan(document, token, apiKey);
                },
            );

            if (token.isCancellationRequested) {
                this._status = 'idle';
                this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'idle' });
                return;
            }
            this.applyPlanResults(document, plan);
        } catch (error) {
            this.handleAnalysisError(error, token);
        } finally {
            this._onDidCompleteAnalysis.fire(document.uri);
        }
    }

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

        const state = GlobalState.getInstance();
        const apiKey = await this.prepareApiKey(state.llmProvider);
        if (state.llmProvider === 'gemini' && !apiKey) {
            this._status = 'error';
            this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'error' });
            return;
        }

        const token = this.createAnalysisCancellationToken();
        await this.performAnalysis(document, token, apiKey);
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
