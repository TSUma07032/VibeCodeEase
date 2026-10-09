/**
 * [Why/Intent] 従来の左側エディタへのUI直接介入を完全排除し、
 * 右側エディタ（Webview）で完全に隔離されたレビュー体験を提供するためのプロバイダークラス。
 */
import * as vscode from 'vscode';
import { SharedAnalysisCache } from '../core/analyzer';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage, AiInterventionLevel } from '../types/webviewMessage';
import { AnalysisResult } from '../types';
import { InterventionManager } from '../core/interventionManager';
import { LlmBackgroundService } from '../core/llmBackgroundService';

export class SideEditorProvider implements vscode.Disposable {
    private static instance: SideEditorProvider;
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    /** 
     * [Why/Intent] Webviewからの提案適用時に applyEdit を実行すると onDidChangeTextDocument が発火するため、
     * 自己変更による不要な競合判定やイベントループを防ぐためのセーフティフラグ。
     */
    private _isApplyingIntervention = false;
    
    /**
     * [Why/Intent] Webviewにフォーカスが当たると activeTextEditor が undefined になる仕様を回避するため、
     * 最後にアクティブだった対象ドキュメントのURIを保持し、反映・破棄操作のターゲットを確実に特定する。
     */
    private _currentDocumentUri?: vscode.Uri;

    /**
     * [Why/Intent]
     * - context: SecretStorage（APIキー）へのアクセスやExtension設定へのアクセスのため。
     * - llmService: ユーザーからの手動推敲（Analyze Now）要求を受けて再解析をトリガーするため。
     */
    private constructor(private readonly context: vscode.ExtensionContext, private readonly llmService: LlmBackgroundService) {}

    public static getInstance(context?: vscode.ExtensionContext, llmService?: LlmBackgroundService): SideEditorProvider {
        if (!SideEditorProvider.instance && context && llmService) {
            SideEditorProvider.instance = new SideEditorProvider(context, llmService);
        }
        return SideEditorProvider.instance;
    }

    /**
     * [Why/Intent] 既存パネルがあればそれを前面に出し（reveal）、無ければ ViewColumn.Beside (右側) で新規生成する。
     * ユーザーのコーディング作業領域（左側）を妨げないようにするため。
     */
    public async openSideEditor() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vibecodeeaseSideEditor',
                'vibeCodeEase: AI Side Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist')]
                }
            );

            this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

            this.panel.onDidDispose(() => {
                this.dispose();
            }, null, this.disposables);

            this.panel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
                this.handleMessage(message);
            }, undefined, this.disposables);
            
            this.registerListeners();

            /**
             * [Why/Intent] パネル生成時に設定情報（APIキー有無、推敲レベル）を即時同期することで、
             * Settingsタブを開いた際に最新の状態が反映されているようにするため。
             */
            const apiKey = await this.context.secrets.get('vibecodeease.geminiApiKey');
            const level = vscode.workspace.getConfiguration('vibecodeease').get<string>('aiInterventionLevel', 'Level 2 (Refactoring)');
            this.panel.webview.postMessage({ type: 'SYNC_SETTINGS', hasApiKey: !!apiKey, interventionLevel: level });
        }

        this.syncWithActiveEditor();
    }

    private registerListeners() {
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
                this._currentDocumentUri = editor.document.uri;
                this.syncWithActiveEditor();
            }
        }, null, this.disposables);

        vscode.workspace.onDidChangeTextDocument(event => {
            if (this._isApplyingIntervention) {
                return;
            }

            const document = event.document;
            if (this._currentDocumentUri && document.uri.toString() === this._currentDocumentUri.toString()) {
                InterventionManager.handleDocumentChange(event);
                this.sendUpdateInterventions(document);
                this.sendSyncDocument(document.fileName, document.getText());
            }
        }, null, this.disposables);
    }

    /**
     * [Why/Intent] ユーザーの設定状態（APIキー有無、推敲レベル）をWebview側に同期させるヘルパー。
     * コードの重複（DRY原則違反）を防ぐため1箇所に集約する。
     */
    private async sendSettingsSync() {
        const apiKey = await this.context.secrets.get('vibecodeease.geminiApiKey');
        const level = vscode.workspace.getConfiguration('vibecodeease').get<string>('aiInterventionLevel', 'Level 2 (Refactoring)') as AiInterventionLevel;
        this.panel?.webview.postMessage({ type: 'SYNC_SETTINGS', hasApiKey: !!apiKey, interventionLevel: level });
    }

    /**
     * [Why/Intent] Webviewからのメッセージを受信し、対応する処理を実行する。
     */
    private async handleMessage(message: WebviewToExtensionMessage) {
        if (message.command === 'ready') {
            if (this._currentDocumentUri) {
                const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === this._currentDocumentUri!.toString());
                if (doc) {
                    this.sendSyncDocument(doc.fileName, doc.getText());
                    this.sendUpdateInterventions(doc);
                }
            }
            
            await this.sendSettingsSync();
            return;
        }

        if (message.command === 'apply_intervention') {
            this._isApplyingIntervention = true;
            try {
                if (!this._currentDocumentUri) return;
                const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === this._currentDocumentUri!.toString());
                if (!doc) return;
                
                const range = new vscode.Range(
                    new vscode.Position(message.range.start.line, message.range.start.character),
                    new vscode.Position(message.range.end.line, message.range.end.character)
                );
                
                await InterventionManager.applyIntervention(doc, message.id, message.newText, range);
                
                this.sendUpdateInterventions(doc);
                this.sendSyncDocument(doc.fileName, doc.getText());
            } finally {
                this._isApplyingIntervention = false;
            }
        } else if (message.command === 'discard_intervention') {
            InterventionManager.discardIntervention(message.id);
            if (this._currentDocumentUri) {
                const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === this._currentDocumentUri!.toString());
                if (doc) {
                    this.sendUpdateInterventions(doc);
                }
            }
        } else if (message.command === 'update_api_key') {
            /**
             * [Why/Intent] APIキーは平文でsettings.jsonに保存せず、セキュアなSecretStorageに保存するため。
             */
            if (message.apiKey) {
                await this.context.secrets.store('vibecodeease.geminiApiKey', message.apiKey);
            } else {
                await this.context.secrets.delete('vibecodeease.geminiApiKey');
            }
            await this.sendSettingsSync();
        } else if (message.command === 'update_intervention_level') {
            /**
             * [Why/Intent] 推敲レベルはWorkspace全体またはGlobalで適用される動作設定であるため、ConfigurationAPI経由で反映する。
             */
            await vscode.workspace.getConfiguration('vibecodeease').update('aiInterventionLevel', message.level, vscode.ConfigurationTarget.Global);
        } else if (message.command === 'force_analyze') {
            /**
             * [Why/Intent] ユーザーが手動で解析を実行（🚀 今すぐコードを推敲する）できるようにするため。
             */
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === this._currentDocumentUri?.toString());
            if (doc) {
                this.llmService.runAnalysis(doc);
            }
        }
    }

    private syncWithActiveEditor() {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.viewColumn !== vscode.ViewColumn.Beside) {
            this._currentDocumentUri = editor.document.uri;
            this.sendSyncDocument(editor.document.fileName, editor.document.getText());
            this.sendUpdateInterventions(editor.document);
        }
    }

    private sendSyncDocument(fileName: string, text: string) {
        if (this.panel) {
            const message: ExtensionToWebviewMessage = {
                type: 'SYNC_DOCUMENT',
                fileName,
                text
            };
            this.panel.webview.postMessage(message);
        }
    }

    public sendUpdateInterventions(document: vscode.TextDocument) {
        if (this.panel) {
            const results = SharedAnalysisCache.getInstance().getResults(document);
            const interventions = results.map(r => {
                const id = InterventionManager.generateIssueId(document.uri.toString(), r);
                return {
                    id: id,
                    range: {
                        start: { line: r.range.start.line, character: r.range.start.character },
                        end: { line: r.range.end.line, character: r.range.end.character }
                    },
                    originalText: r.interventions[0]?.originalText || '',
                    replacementText: r.interventions[0]?.replacementText || '',
                    message: r.interventions[0]?.message || ''
                };
            });
            
            const message: ExtensionToWebviewMessage = {
                type: 'UPDATE_INTERVENTIONS',
                interventions
            };
            this.panel.webview.postMessage(message);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'));

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>vibeCodeEase Side Editor</title>
            </head>
            <body>
                <div id="root"></div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    /**
     * [Why/Intent] WebviewPanel破棄に伴うメモリリークや不要なイベント発火を防止するため、
     * 登録された全リスナーを明示的に解放する。
     */
    public dispose() {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
