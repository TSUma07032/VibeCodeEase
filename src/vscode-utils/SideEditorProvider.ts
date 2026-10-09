/**
 * [Why/Intent] 従来の左側エディタへのUI直接介入を完全排除し、
 * 右側エディタ（Webview）で完全に隔離されたレビュー体験を提供するためのプロバイダークラス。
 */
import * as vscode from 'vscode';
import { SharedAnalysisCache } from '../core/analyzer';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../types/webviewMessage';
import { AnalysisResult } from '../types';
import { InterventionManager } from '../core/interventionManager';

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

    private constructor(private readonly extensionUri: vscode.Uri) {}

    public static getInstance(extensionUri?: vscode.Uri): SideEditorProvider {
        if (!SideEditorProvider.instance && extensionUri) {
            SideEditorProvider.instance = new SideEditorProvider(extensionUri);
        }
        return SideEditorProvider.instance;
    }

    /**
     * [Why/Intent] 既存パネルがあればそれを前面に出し（reveal）、無ければ ViewColumn.Beside (右側) で新規生成する。
     * ユーザーのコーディング作業領域（左側）を妨げないようにするため。
     */
    public openSideEditor() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'vibecodeeaseSideEditor',
                'vibeCodeEase: AI Side Editor',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist')]
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
     * [Why/Intent] Webviewからのメッセージを受信し、対応する処理を実行する。
     * apply_intervention: WorkspaceEdit を組み立てて反映し、UIとキャッシュを同期させる。
     * discard_intervention: 提案をキャッシュから除外し、画面から消去する。
     * ready: Webviewマウント完了時に初回データを再送し、送信漏れ（非同期マウントによるデータ消失）を防止する。
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
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'));

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
