import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { AnalysisResult, LlmInterventionPlan } from '../types';
import { SharedAnalysisCache } from './analyzer';
import { LlmInterventionService } from './llmInterventionService';

// [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Extending LlmBackgroundService to handle Dashboard states (idle, loading, error, logs, response) and timer intervals.
export class LlmBackgroundService implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _llmService = new LlmInterventionService();

    private _cancellationTokenSource?: vscode.CancellationTokenSource;

    private readonly _onDidStartAnalysis = new vscode.EventEmitter<void>();
    public readonly onDidStartAnalysis = this._onDidStartAnalysis.event;

    private readonly _onDidCompleteAnalysis = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidCompleteAnalysis = this._onDidCompleteAnalysis.event;

    private readonly _onDidError = new vscode.EventEmitter<string>();
    public readonly onDidError = this._onDidError.event;

    private _status: 'idle' | 'loading' | 'error' = 'idle';
    private _latestResponse: { text: string; timestamp: number } | null = null;
    private _errorLogs: Array<{ message: string; timestamp: number }> = [];
    private _timerId: NodeJS.Timeout | undefined;
    private _lastDocumentVersion: number | undefined;

    public readonly onDidUpdateDashboard = new vscode.EventEmitter<unknown>();

    constructor(private readonly secrets: vscode.SecretStorage) {
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                const config = vscode.workspace.getConfiguration('vibecodeease');
                let syncFreq = config.get<string>('llm.syncFrequency');
                syncFreq ??= config.get<boolean>('analyzeOnSave') ? 'onSave' : 'manual';
                if (syncFreq !== 'onSave') {
                    return;
                }

                if (document === vscode.window.activeTextEditor?.document) {
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
        const config = vscode.workspace.getConfiguration('vibecodeease');
        let syncFreq = config.get<string>('llm.syncFrequency');
        syncFreq ??= config.get<boolean>('analyzeOnSave') ? 'onSave' : 'manual';
        if (syncFreq === 'interval') {
            const intervalSecs = config.get<number>('llm.syncIntervalSeconds') ?? 10;
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

    /**
     * [Why/Intent] Geminiプロバイダ利用時に必要なAPIキーをSecretStorageおよび設定からフォールバック取得する。
     */
    private async prepareApiKey(provider: string): Promise<string | undefined> {
        if (provider !== 'gemini') {
            return undefined;
        }
        let apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
        apiKey ??= vscode.workspace.getConfiguration('vibecodeease').get<string>('geminiApiKey');
        return apiKey;
    }

    /**
     * [Why/Intent] ユーザー設定のプロバイダ（Gemini または VS Code Language Model API）に応じたプラン作成処理へ委譲する。
     */
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

    /**
     * [Why/Intent] LLM解析結果を内部キャッシュへマージし、エディタ・ステータスバー・SideEditorダッシュボードへ反映する。
     */
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
        vscode.window.setStatusBarMessage('$(check) vibeCodeEase: AI 解析完了', 3000);

        let mdText = '';
        if (!plan.edits || plan.edits.length === 0) {
            mdText = '**AI 提案**: 特に修正の必要はありません。';
        } else {
            mdText = `### AI 提案 (${plan.edits.length}件)\n`;
            plan.edits.forEach((edit) => {
                mdText += `- **行 ${edit.startLine + 1}**: ${edit.reason}\n`;
            });
        }
        this._latestResponse = { text: mdText, timestamp: Date.now() };
        this._status = 'idle';
        this.onDidUpdateDashboard.fire({
            type: 'LLM_RESPONSE_UPDATE',
            text: this._latestResponse.text,
            timestamp: this._latestResponse.timestamp,
        });
        this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'idle' });
    }

    /**
     * [Why/Intent] エラーメッセージの内容（クォータ超過、レート制限、ネットワーク障害、構文エラー等）を分類し、
     * ダッシュボードログで見分けやすい識別タグ（[API Error], [Parse Error], [Unknown Error]）を付与する。
     */
    private formatErrorLog(errorMessage: string, error: unknown): string {
        const lowerMsg = errorMessage.toLowerCase();
        if (
            lowerMsg.includes('quota') ||
            lowerMsg.includes('429') ||
            lowerMsg.includes('503') ||
            lowerMsg.includes('fetch') ||
            lowerMsg.includes('network')
        ) {
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

    /**
     * [Why/Intent] エラー重要度に応じた通知表示時間を制御する。
     * クォータ超過やサーバ混雑は原因特定のため長め（10秒）に、一般通信エラーは短め（5秒）に表示する。
     */
    private showErrorMessage(errorMessage: string): void {
        if (errorMessage.toLowerCase().includes('quota')) {
            vscode.window.setStatusBarMessage(
                `$(error) AI API Quota 超過: プランまたは課金情報を確認してください`,
                10000,
            );
        } else if (errorMessage.includes('503') || errorMessage.includes('429')) {
            vscode.window.setStatusBarMessage(
                `$(error) AI通信エラー: サーバーが混雑しています (${errorMessage.includes('503') ? '503' : '429'})`,
                10000,
            );
        } else {
            vscode.window.setStatusBarMessage('$(error) AI通信エラー: 解析に失敗しました', 5000);
        }
    }

    /**
     * [Why/Intent] 解析中の例外発生時、キャンセル要求であれば無視し、
     * 実際のエラーであればイベント発火、UI通知、最大50件のログ履歴シフト保存を行う。
     */
    private handleAnalysisError(error: unknown, token: vscode.CancellationToken): void {
        if (token.isCancellationRequested) {
            return;
        }

        console.error('[LlmBackgroundService] Analysis failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this._onDidError.fire(errorMessage);
        this.showErrorMessage(errorMessage);

        const logMsg = this.formatErrorLog(errorMessage, error);
        this._errorLogs.push({ message: logMsg, timestamp: Date.now() });
        if (this._errorLogs.length > 50) {
            this._errorLogs.shift();
        }

        this._status = 'error';
        this.onDidUpdateDashboard.fire({
            type: 'LLM_ERROR_LOG',
            message: logMsg,
            timestamp: this._errorLogs[this._errorLogs.length - 1].timestamp,
        });
        this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'error' });
    }

    /**
     * [Why/Intent] 解析対象外ドキュメントを防御的に除外する。
     * 1. 機密情報保護: .env や secrets 言語IDのファイルはLLMへ送信しない。
     * 2. コスト削減: 自動解析（isAuto）時、前回の解析からバージョンが変更されていなければ再送信を抑止する。
     */
    private shouldSkipDocument(document: vscode.TextDocument, isAuto: boolean): boolean {
        if (document.fileName.includes('.env') || document.languageId === 'secrets') {
            return true;
        }
        if (isAuto && document.version === this._lastDocumentVersion) {
            return true;
        }
        return false;
    }

    /**
     * [Why/Intent] 先行する未完了の解析リクエストが存在する場合、直ちにキャンセルして新規トークンを発行する。
     * 高速入力時や頻繁な保存時における競合状態・古い結果の上書きを防止する。
     */
    private createAnalysisCancellationToken(): vscode.CancellationToken {
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        this._cancellationTokenSource = new vscode.CancellationTokenSource();
        return this._cancellationTokenSource.token;
    }

    /**
     * [Why/Intent] 解析のライフサイクル（進捗表示、キャンセレーション制御、完了イベント発火）を統括する。
     */
    private async performAnalysis(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        apiKey?: string,
    ): Promise<void> {
        this._onDidStartAnalysis.fire();
        const statusBarDisposable = vscode.window.setStatusBarMessage(
            '$(sync~spin) vibeCodeEase: AI 解析中...',
        );
        this._disposables.push(statusBarDisposable);

        try {
            const plan = await this.executeLlmPlan(document, token, apiKey);
            statusBarDisposable.dispose();

            if (token.isCancellationRequested) {
                this._status = 'idle';
                this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'idle' });
                return;
            }

            this.applyPlanResults(document, plan);
        } catch (error) {
            statusBarDisposable.dispose();
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
        if (this.shouldSkipDocument(document, isAuto)) {
            return;
        }
        this._lastDocumentVersion = document.version;

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
        this._disposables.forEach((d) => {
            d.dispose();
        });
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        if (this._timerId) {
            clearInterval(this._timerId);
        }
    }
}
