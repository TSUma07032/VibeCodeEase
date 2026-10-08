import * as vscode from 'vscode';
import { getNonce } from './getNonce';

export class PanelProvider {
  public static currentPanel: PanelProvider | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PanelProvider.currentPanel) {
      PanelProvider.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'vibeCodeEase3Pane',
      'VibeCodeEase 3-Pane UI',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')],
      }
    );

    PanelProvider.currentPanel = new PanelProvider(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._extensionUri = context.extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'analyzeCode':
            // Will handle 3-LLM logic here
            vscode.commands.executeCommand('vibecodeease.run3LLM', message.code, message.settings);
            break;
          case 'acceptProposal':
            vscode.commands.executeCommand('vibecodeease.recordAccept', message.proposal, message.codeBefore);
            break;
          case 'updateSettings':
            
            vscode.commands.executeCommand('vibecodeease.updateSettings', message.settings);
            break;
          case 'forceAnalyze':
            vscode.commands.executeCommand('vibecodeease.forceAnalyze', message.code, message.documentUri);
            break;
          case 'webviewReady':
            vscode.commands.executeCommand('vibecodeease.webviewReady');
            
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    PanelProvider.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  public sendToWebview(command: string, data: any) {
    this._panel.webview.postMessage({ command, data });
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
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
        <link href="${styleUri}" rel="stylesheet">
        <title>VibeCodeEase 3-Pane</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

