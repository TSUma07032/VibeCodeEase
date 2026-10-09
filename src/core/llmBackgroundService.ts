import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import { LlmInterventionService } from './llmInterventionService';
import { SharedAnalysisCache } from './analyzer';
import { AnalysisResult } from '../types';

/**
 * バックグラウンドでLLMによる解析を実行し、SharedAnalysisCache に結果をマージするサービス。
 */
export class LlmBackgroundService implements vscode.Disposable {
    // TODO(Next-Gen Agent): 自律的改善のライフサイクルとバッジ通知
    // 現在はエディタのテキスト変更(連続入力時)や保存時に都度全体解析を行っているが、
    // 長期的には独立した「AIワークスペース状態モデル」に対する差分同期アーキテクチャに移行し、
    // 完了時にサイドバーアイコンに未読バッジ等を付ける非侵入型のUI/UXを実装すること。
    
    private readonly _disposables: vscode.Disposable[] = [];
    private readonly _llmService = new LlmInterventionService();
    
    // 現在実行中の解析をキャンセルするためのトークンソース
    private _cancellationTokenSource?: vscode.CancellationTokenSource;

    private readonly _onDidStartAnalysis = new vscode.EventEmitter<void>();
    public readonly onDidStartAnalysis = this._onDidStartAnalysis.event;

    private readonly _onDidCompleteAnalysis = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidCompleteAnalysis = this._onDidCompleteAnalysis.event;

    private readonly _onDidError = new vscode.EventEmitter<string>();
    public readonly onDidError = this._onDidError.event;

    constructor(private readonly secrets: vscode.SecretStorage) {
        // [Why/Intent] ファイル編集中ではなく「保存時（Save）」に限定してLLM解析を走らせることで、
        // 入力中の不要なAPI負荷と頻繁な再解析を抑制し、保存というコードの区切りにおいてのみ確定的に推敲結果を提供するため。
        this._disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                const analyzeOnSave = vscode.workspace.getConfiguration('vibecodeease').get('analyzeOnSave');
                if (!analyzeOnSave) {return;}

                const editor = vscode.window.activeTextEditor;
                if (editor && document === editor.document) {
                    this._runAnalysis(document);
                }
            })
        );
    }

    private async _runAnalysis(document: vscode.TextDocument) {
        const uri = document.uri.toString();
        
        // 🛡️ Sentinel: 機密ファイルはスキップ (.envなど)
        if (document.fileName.includes('.env') || document.languageId === 'secrets') {
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
            
            vscode.window.setStatusBarMessage('$(check) vibeCodeEase: AI 解析完了', 3000);

            // SideEditorProvider.getInstance().sendUpdateInterventions(document); は削除し、
            // 外側から onDidCompleteAnalysis を監視して通知するように変更 (クリーンアーキテクチャ)
        } catch (error) {
            if (!token.isCancellationRequested) {
                console.error('[LlmBackgroundService] Analysis failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                this._onDidError.fire(errorMessage);
                
                if (errorMessage.toLowerCase().includes('quota')) {
                    vscode.window.setStatusBarMessage(`$(error) AI API Quota 超過: プランまたは課金情報を確認してください`, 10000);
                } else if (errorMessage.includes('503') || errorMessage.includes('429')) {
                    vscode.window.setStatusBarMessage(`$(error) AI通信エラー: サーバーが混雑しています (${errorMessage.includes('503') ? '503' : '429'})`, 10000);
                } else {
                    vscode.window.setStatusBarMessage('$(error) AI通信エラー: 解析に失敗しました', 5000);
                }
            }
        } finally {
            this._onDidCompleteAnalysis.fire(document.uri);
        }
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
    }
}
