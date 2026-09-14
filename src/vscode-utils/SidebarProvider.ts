import * as vscode from 'vscode';
import { getNonce } from './getNonce';
import { WebviewMessageHandler } from './WebviewMessageHandler';
import { GlobalState } from '../state/globalState';
import { SharedAnalysisCache } from '../core/analyzer';
import { LiveIssue, PAIN_CATEGORY_LABELS } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly messageHandler: WebviewMessageHandler;
  private _debounceTimer?: ReturnType<typeof setTimeout>;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    private readonly llmBackgroundService?: import('../core/llmBackgroundService').LlmBackgroundService
  ) {
    this.messageHandler = new WebviewMessageHandler(secrets);
  }

  public getMessageHandler(): WebviewMessageHandler {
    return this.messageHandler;
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

    // 状態が変更されたら、サイドバーのWebviewに最新設定を送信する
    GlobalState.getInstance().onDidChangeState(async () => {
      if (this._view) {
        await this.messageHandler.sendCurrentSettings(this._view.webview);
        // 設定変更時もライブ問題一覧を更新（介入レベルが変わるため）
        this._pushLiveIssues();
      }
    });

    // アクティブエディタが切り替わったらライブ問題を即更新
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this._pushLiveIssues();
      })
    );

    // テキスト変更時は 500ms デバウンスしてからライブ問題を更新
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || event.document !== activeEditor.document) { return; }
        if (this._debounceTimer) { clearTimeout(this._debounceTimer); }
        this._debounceTimer = setTimeout(() => this._pushLiveIssues(), 500);
      })
    );

    // 初期表示時にも一度プッシュ
    this._pushLiveIssues();

    // 背景のLLM解析ステータスを転送
    if (this.llmBackgroundService) {
      this._disposables.push(
        this.llmBackgroundService.onDidStartAnalysis(() => {
          this._view?.webview.postMessage({ type: 'BACKGROUND_ANALYSIS_STARTED' });
        })
      );
      this._disposables.push(
        this.llmBackgroundService.onDidCompleteAnalysis(() => {
          this._view?.webview.postMessage({ type: 'BACKGROUND_ANALYSIS_COMPLETED' });
        })
      );
    }
  }

  /**
   * 現在のアクティブエディタの解析結果を LiveIssue[] に変換して Webview に送信する
   */
  public pushLiveIssues(): void {
    this._pushLiveIssues();
  }

  private _pushLiveIssues(): void {
    if (!this._view) { return; }
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._view.webview.postMessage({ type: 'LIVE_ISSUES_UPDATE', payload: [] });
      return;
    }

    const results = SharedAnalysisCache.getInstance().getResults(editor.document);
    const globalState = GlobalState.getInstance();

    const issues: LiveIssue[] = results
      .filter(r => globalState.getInterventionLevel(r.category) !== 'IGNORE')
      .map(r => {
        const id = `${editor.document.uri.toString()}::${r.source}::${r.category}::${r.range.start.line}::${r.range.start.character}`;
        return {
          id,
          line: r.range.start.line,
          character: r.range.start.character,
          endLine: r.range.end.line,
          endCharacter: r.range.end.character,
          category: r.category,
          message: r.interventions[0]?.message?.replace(/\$\([^)]*\)\s*/g, '') ??
                  `${PAIN_CATEGORY_LABELS[r.category]}: ${r.interventions[0]?.originalText ?? ''}`,
          replacementText: r.interventions[0]?.replacementText,
          originalText: r.interventions[0]?.originalText,
          source: r.source ?? 'static'
        };
      });

    this._view.webview.postMessage({ type: 'LIVE_ISSUES_UPDATE', payload: issues });
  }

  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); }
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
