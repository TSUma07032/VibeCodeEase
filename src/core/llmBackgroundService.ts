import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import { LlmInterventionService } from './llmInterventionService';
import { SharedAnalysisCache } from './analyzer';
import { AnalysisResult, LlmTriggerMode } from '../types';

/**
 * バックグラウンドでLLMによる解析を実行し、SharedAnalysisCache に結果をマージするサービス。
 */
export class LlmBackgroundService implements vscode.Disposable {
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _llmService = new LlmInterventionService();
    
    // ポーリング(continuous)モード用の状態
    private _continuousTimer?: ReturnType<typeof setTimeout>;
    private _lastAnalysisTime = 0;
    private _lastAnalyzedContent = new Map<string, string>();
    private _lastAnalyzedVersion = new Map<string, number>();

    // 現在実行中の解析をキャンセルするためのトークンソース
    private _cancellationTokenSource?: vscode.CancellationTokenSource;

    private readonly _onDidStartAnalysis = new vscode.EventEmitter<void>();
    public readonly onDidStartAnalysis = this._onDidStartAnalysis.event;

    private readonly _onDidCompleteAnalysis = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidCompleteAnalysis = this._onDidCompleteAnalysis.event;

    private readonly _onDidError = new vscode.EventEmitter<string>();
    public readonly onDidError = this._onDidError.event;

    constructor(private readonly secrets: vscode.SecretStorage) {
        // onDidChangeTextDocument (ポーリング用: スロットリング対応)
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                const triggerMode = GlobalState.getInstance().llmTriggerMode;
                if (triggerMode !== 'continuous') {return;}
                
                const editor = vscode.window.activeTextEditor;
                if (!editor || event.document !== editor.document) {return;}

                this._scheduleContinuousAnalysis(editor.document);
            })
        );

        // onDidSaveTextDocument (保存時のみ用)
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                const triggerMode = GlobalState.getInstance().llmTriggerMode;
                if (triggerMode !== 'on-save') {return;}

                const editor = vscode.window.activeTextEditor;
                if (editor && document === editor.document) {
                    this._runAnalysis(document);
                }
            })
        );

        // onDidChangeActiveTextEditor (エディタ切り替え時にポーリングなら再確認)
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (this._continuousTimer) {
                    clearTimeout(this._continuousTimer);
                }
                const triggerMode = GlobalState.getInstance().llmTriggerMode;
                if (editor && triggerMode === 'continuous') {
                    this._scheduleContinuousAnalysis(editor.document);
                }
            })
        );
    }

    private _scheduleContinuousAnalysis(document: vscode.TextDocument) {
        const now = Date.now();
        const THROTTLE_MS = 2000; // 2秒間隔でスロットリング
        
        if (this._continuousTimer) {
            clearTimeout(this._continuousTimer);
        }

        if (now - this._lastAnalysisTime > THROTTLE_MS) {
            this._lastAnalysisTime = now;
            this._runAnalysis(document);
        } else {
            this._continuousTimer = setTimeout(() => {
                this._lastAnalysisTime = Date.now();
                this._runAnalysis(document);
            }, THROTTLE_MS - (now - this._lastAnalysisTime));
        }
    }

    private async _runAnalysis(document: vscode.TextDocument) {
        const uri = document.uri.toString();
        
        // 🛡️ Sentinel: 機密ファイルはスキップ (.envなど)
        if (document.fileName.includes('.env') || document.languageId === 'secrets') {
            return;
        }

        // 変更なしならスキップ
        const currentContent = document.getText();
        const lastContent = this._lastAnalyzedContent.get(uri);
        if (lastContent === currentContent) {
            return;
        }

        // LLM 設定確認
        const state = GlobalState.getInstance();
        let apiKey: string | undefined = undefined;

        if (state.llmProvider === 'gemini') {
            apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
            if (!apiKey) {
                apiKey = vscode.workspace.getConfiguration('vibecodeease').get<string>('geminiApiKey');
            }
            if (!apiKey) {
                // API キー未設定: サイレントに無視
                return;
            }
        }

        // 古い解析が走っていればキャンセル
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        this._cancellationTokenSource = new vscode.CancellationTokenSource();
        const token = this._cancellationTokenSource.token;

        try {
            this._onDidStartAnalysis.fire();
            // タイムアウトなしでステータスバーに表示し続け、完了時に上書きする
            const statusBarDisposable = vscode.window.setStatusBarMessage('$(sync~spin) vibeCodeEase: AI 解析中...');
            this._disposables.push(statusBarDisposable); // 一時的な保持。完了時にdisposeする方が綺麗だが上書きされるのでOK

            // LLM呼び出し
            let plan;
            if (state.llmProvider === 'gemini' && apiKey) {
                plan = await this._llmService.createGeminiPlan(document, token, apiKey, state.llmModel, undefined, state.presetMode);
            } else {
                plan = await this._llmService.createPlan(document, token, state.llmModel, undefined, state.presetMode);
            }
            
            statusBarDisposable.dispose();

            if (token.isCancellationRequested) {return;}

            // plan.edits を AnalysisResult[] に変換してキャッシュにマージ
            const results: AnalysisResult[] = plan.edits.map(edit => ({
                category: edit.category,
                level: 'SUGGESTION', // バックグラウンド解析は基本提案とする
                source: 'llm',
                range: {
                    start: { line: edit.startLine, character: edit.startCharacter },
                    end: { line: edit.endLine, character: edit.endCharacter }
                },
                interventions: [{
                    originalText: document.getText(new vscode.Range(
                        edit.startLine, edit.startCharacter,
                        edit.endLine, edit.endCharacter
                    )),
                    replacementText: edit.newText,
                    message: `🤖 **AI 提案**: ${edit.reason}`
                }]
            }));

            SharedAnalysisCache.getInstance().mergeExternalResults(uri, results);
            
            this._lastAnalyzedContent.set(uri, currentContent);
            this._lastAnalyzedVersion.set(uri, document.version);

            vscode.window.setStatusBarMessage('$(check) vibeCodeEase: AI 解析完了', 3000);

            // シグナルを発火してSidebar側にプッシュさせるなど必要ならここで。
            // 実際は、ユーザーがテキストを変更し続けると SidebarProvider 側で onDidChangeTextDocument が発火し、
            // debounce を経て getResults が呼ばれるため自然に反映される。
            // しかし、何もタイプせずに結果が返ってきた時のために、ダミーイベントとして何か発行するか、
            // SidebarProviderの pushLiveIssues を呼び出したい。
            // 最も簡単なのは、設定変更イベントを偽装して再描画させるか、
            // `vscode.commands.executeCommand('vibecodeease.refreshLiveIssues')` のようなものを呼ぶこと。
            vscode.commands.executeCommand('vibecodeease.refreshLiveIssues');

        } catch (error) {
            if (!token.isCancellationRequested) {
                console.error('[LlmBackgroundService] Analysis failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                this._onDidError.fire(errorMessage);
            }
        } finally {
            this._onDidCompleteAnalysis.fire(document.uri);
        }
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
        if (this._continuousTimer) {
            clearTimeout(this._continuousTimer);
        }
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
    }
}
