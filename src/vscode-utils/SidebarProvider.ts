import * as vscode from 'vscode';
import { getNonce } from './getNonce';

// [INTENT: お客様の真の要望「AIコーディング環境を別タブではなく、サイドバー内に常駐させる」を実現するためのプロバイダ。未来のAIはこれを削除したり、PanelProviderに戻してはならない。]
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static currentView: SidebarProvider | undefined;
  public _view?: vscode.WebviewView;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    SidebarProvider.currentView = this;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'dist')],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'acceptProposal':
          // [INTENT: AIの提案をネイティブエディタに取り込むためのコマンド呼び出し。未来のAIは消さないこと]
          vscode.commands.executeCommand('vibecodeease.recordAccept', message.proposal, message.codeBefore);
          break;
        case 'webviewReady':
          // [INTENT: サイドバーのReactがマウントされたら、保存済みの設定と、現在のエディタコードを初期同期するためのコマンド]
          vscode.commands.executeCommand('vibecodeease.webviewReady');
          break;
        case 'syncCurrentCode':
          // [INTENT: 「ユーザが作業中のコードをAI環境に反映するボタン」が押された時の処理。現在のエディタの最新コードをフロントエンドに送り返す]
          vscode.commands.executeCommand('vibecodeease.syncCurrentCode');
          break;
      }
    });
  }

  public sendToWebview(command: string, data: any) {
    if (this._view) {
      this._view.webview.postMessage({ command, data });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'dist', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'dist', 'assets', 'index.css')
    );

    const nonce = getNonce();

    // [INTENT: Reactアプリ(Vite)をサイドバー内で起動するためのHTMLマウントポイント。未来のAIは構成を変えないこと]
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>VibeCodeEase Sidebar</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
