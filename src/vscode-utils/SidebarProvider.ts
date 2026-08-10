import * as vscode from "vscode";

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

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.command) {
        case "UPDATE_PREFERENCE": {
          vscode.window.showInformationMessage(
            `Preference updated: ${data.data?.message || ""}`
          );
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist", "assets", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist", "assets", "index.css")
    );

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>vibeCodeEase Settings</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
