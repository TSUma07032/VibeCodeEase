import * as vscode from 'vscode';
import { getNonce } from './getNonce';
import { WebviewMessageHandler } from './WebviewMessageHandler';

export class SidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    private readonly messageHandler: WebviewMessageHandler;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        secrets: vscode.SecretStorage
    ) {
        this.messageHandler = new WebviewMessageHandler(secrets);
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            // 🛡️ Sentinel: Restrict webview resource access to only the built dist directory,
            // preventing arbitrary extension file access (Principle of Least Privilege).
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist')],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            await this.messageHandler.handleMessage(data, webviewView.webview);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // webview内のベースとなるパス
        const baseUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist')
        );

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.js')
        );

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.css')
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; base-uri ${webview.cspSource};">
        <base href="${baseUri}/">
        <link href="${styleUri}" rel="stylesheet">
        <title>vibeCodeEase Settings</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
    }
}
