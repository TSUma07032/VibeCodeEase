import * as vscode from 'vscode';

/**
 * [Why/Intent] Side Editor 用の Webview HTML を生成する純粋ヘルパー関数。
 * SideEditorProvider からプレゼンテーション層（HTML構築）を完全に切り離し、単一責任の原則（SRP）を徹底する。
 * Viteでビルドされたフロントエンド資産（webview-ui/dist/assets/）の index.js / index.css を Webview URI として安全に読み込む。
 */
export function getSideEditorHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'),
    );

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri.toString()}" rel="stylesheet">
            <title>vibeCodeEase Side Editor</title>
        </head>
        <body>
            <div id="root"></div>
            <script type="module" src="${scriptUri.toString()}"></script>
        </body>
        </html>`;
}
