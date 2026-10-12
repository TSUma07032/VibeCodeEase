import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { AnalysisResult } from '../types';
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
    public startTimerIfConfigured() {
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
    private runAnalysisOnInterval() {
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
    public getDashboardState() {
        return {
            status: this._status,
            response: this._latestResponse,
            logs: this._errorLogs,
        };
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Clear error logs and notify UI.
    public clearErrorLogs() {
        this._errorLogs = [];
        this.onDidUpdateDashboard.fire({ type: 'LLM_DASHBOARD_INIT', ...this.getDashboardState() });
    }

    // [AI-WARNING] DO NOT REMOVE THIS OPTIMIZATION: Main analysis logic with UI status updates and error logging.
    public async runAnalysis(
        document: vscode.TextDocument,
        isAuto: boolean = false,
    ): Promise<void> {
        const uri = document.uri.toString();

        if (document.fileName.includes('.env') || document.languageId === 'secrets') {
            return;
        }

        if (isAuto && document.version === this._lastDocumentVersion) {
            return;
        }
        this._lastDocumentVersion = document.version;

        this._status = 'loading';
        this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'loading' });

        const state = GlobalState.getInstance();
        let apiKey: string | undefined;

        if (state.llmProvider === 'gemini') {
            apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
            apiKey ??= vscode.workspace
                .getConfiguration('vibecodeease')
                .get<string>('geminiApiKey');
            if (!apiKey) {
                this._status = 'error';
                this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'error' });
                return;
            }
        }

        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        this._cancellationTokenSource = new vscode.CancellationTokenSource();
        const token = this._cancellationTokenSource.token;

        try {
            this._onDidStartAnalysis.fire();
            const statusBarDisposable = vscode.window.setStatusBarMessage(
                '$(sync~spin) vibeCodeEase: AI 解析中...',
            );
            this._disposables.push(statusBarDisposable);

            let plan;
            if (state.llmProvider === 'gemini' && apiKey) {
                plan = await this._llmService.createGeminiPlan(
                    document,
                    token,
                    apiKey,
                    state.llmModel,
                    undefined,
                    state.presetMode,
                );
            } else {
                plan = await this._llmService.createPlan(
                    document,
                    token,
                    state.llmModel,
                    undefined,
                    state.presetMode,
                );
            }

            statusBarDisposable.dispose();

            if (token.isCancellationRequested) {
                this._status = 'idle';
                this.onDidUpdateDashboard.fire({ type: 'LLM_STATUS_UPDATE', status: 'idle' });
                return;
            }

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

            // Generate mdText and update dashboard
            let mdText = '';
            if (!plan?.edits || plan.edits.length === 0) {
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
        } catch (error) {
            if (!token.isCancellationRequested) {
                console.error('[LlmBackgroundService] Analysis failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                this._onDidError.fire(errorMessage);

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
                    vscode.window.setStatusBarMessage(
                        '$(error) AI通信エラー: 解析に失敗しました',
                        5000,
                    );
                }

                // Error logging logic
                const lowerMsg = errorMessage.toLowerCase();
                let logMsg = '';
                if (
                    lowerMsg.includes('quota') ||
                    lowerMsg.includes('429') ||
                    lowerMsg.includes('503') ||
                    lowerMsg.includes('fetch') ||
                    lowerMsg.includes('network')
                ) {
                    logMsg = `[API Error] ${errorMessage}`;
                } else if (
                    lowerMsg.includes('json') ||
                    lowerMsg.includes('parse') ||
                    error instanceof SyntaxError
                ) {
                    logMsg = `[Parse Error] ${errorMessage}`;
                } else {
                    logMsg = `[Unknown Error] ${errorMessage}`;
                }

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
        } finally {
            this._onDidCompleteAnalysis.fire(document.uri);
        }
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
