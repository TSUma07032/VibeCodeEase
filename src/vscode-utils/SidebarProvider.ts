import * as vscode from 'vscode';
import { getNonce } from './getNonce';

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'openPanel': {
          vscode.commands.executeCommand('vibecodeease.open3PaneUI');
          break;
        }
      }
    });
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>vibeCodeEase</title>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
          button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px 14px; cursor: pointer; border-radius: 4px; font-weight: bold; width: 100%; max-width: 200px; margin-bottom: 20px; }
          button:hover { background: var(--vscode-button-hoverBackground); }
          p { color: var(--vscode-descriptionForeground); font-size: 13px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h3>vibeCodeEase</h3>
        <p>Your AI pair programmer is ready.</p>
        <button id="openBtn">Open AI Workspace</button>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          document.getElementById('openBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'openPanel' });
          });
        </script>
      </body>
      </html>`;
  }
}
