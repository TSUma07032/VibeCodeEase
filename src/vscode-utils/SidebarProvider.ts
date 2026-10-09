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
  private selectedWorkspaceUri?: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
    private readonly llmBackgroundService?: import('../core/llmBackgroundService').LlmBackgroundService,
    private readonly personalizationService?: any
  ) {
    this.messageHandler = new WebviewMessageHandler(secrets, undefined, personalizationService);
    this.messageHandler.onSelectWorkspaceFile = (uri) => {
      this._pushWorkspaceState(uri);
    };
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
        this._debounceTimer = setTimeout(() => {
          this._pushLiveIssues();
          this._pushWorkspaceState();
        }, 500);
      })
    );

    // 初期表示時にも一度プッシュ
    this._pushLiveIssues();

    this._disposables.push(
      SharedAnalysisCache.getInstance().onDidChange(() => {
        this._pushLiveIssues();
        this._pushWorkspaceState();
      })
    );

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
      this._disposables.push(
        this.llmBackgroundService.onDidError((errorMessage) => {
          this._view?.webview.postMessage({ type: 'LLM_ERROR', payload: errorMessage });
        })
      );
    }
  }

  /**
   * 現在のアクティブエディタの解析結果を LiveIssue[] に変換して Webview に送信する
   */
  public pushLiveIssues(): void {
    this._pushLiveIssues();
    this._pushWorkspaceState();
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
    this._pushWorkspaceState(editor.document.uri.toString());
  }

  private async _pushWorkspaceState(activeUri?: string): Promise<void> {
    if (!this._view) { return; }
    
    // TODO(Next-Gen Agent): 同期と自律的改善のライフサイクル構築
    // 現在は都度エディタのテキストをパースして擬似的にAI版コードを構築しているが、
    // 長期的には独立した「AIワークスペース状態モデル」を保持し、
    // ユーザーの手元の「ファイルセーブ」をトリガーに差分のみを同期するアーキテクチャへの移行を検討すること。
    
    const cache = SharedAnalysisCache.getInstance();
    const uris = cache.getAllExternalUris();
    const files = uris.map(uri => {
      const parsed = vscode.Uri.parse(uri);
      return { uri, label: vscode.workspace.asRelativePath(parsed) };
    });

    if (uris.length === 0) {
      this.selectedWorkspaceUri = undefined;
      this._view.webview.postMessage({ type: 'WORKSPACE_STATE_UPDATE', payload: { files: [] } });
      return;
    }

    // Determine the active file to display.
    if (activeUri) {
      this.selectedWorkspaceUri = activeUri;
    }
    let selectedUri = this.selectedWorkspaceUri && uris.includes(this.selectedWorkspaceUri) ? this.selectedWorkspaceUri : uris[0];
    this.selectedWorkspaceUri = selectedUri;

    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(selectedUri));
    const results = cache.getResults(document).filter(r => r.source === 'llm');
    const globalState = GlobalState.getInstance();
    
    const edits: { range: vscode.Range, text: string, message: string, id: string, category: string, originalText?: string }[] = [];
    for (const result of results) {
        const level = globalState.getInterventionLevel(result.category);
        if (level === 'IGNORE') continue;
        for (const intervention of result.interventions) {
            if (intervention.replacementText !== undefined) {
                const id = `${selectedUri}::${result.source}::${result.category}::${result.range.start.line}::${result.range.start.character}`;
                edits.push({
                    range: new vscode.Range(result.range.start.line, result.range.start.character, result.range.end.line, result.range.end.character),
                    text: intervention.replacementText,
                    message: intervention.message || 'AI提案があります。',
                    id,
                    category: result.category,
                    originalText: intervention.originalText
                });
            }
        }
    }

    edits.sort((a, b) => a.range.start.compareTo(b.range.start));

    const lines = document.getText().split('\n');
    let lineShift = 0;
    const diffs: import('../types/webviewMessage').AiDiff[] = [];

    for (const edit of edits) {
        const startLine = edit.range.start.line;
        const endLine = edit.range.end.line;
        const originalLinesReplaced = endLine - startLine + 1;
        const replacementLines = edit.text.split('\n');
        const newLinesCount = replacementLines.length;
        
        const modifiedStartLine = startLine + lineShift;
        let before = lines[modifiedStartLine].substring(0, edit.range.start.character);
        let after = lines[modifiedStartLine + originalLinesReplaced - 1].substring(edit.range.end.character);
        
        replacementLines[0] = before + replacementLines[0];
        replacementLines[replacementLines.length - 1] += after;
        
        lines.splice(modifiedStartLine, originalLinesReplaced, ...replacementLines);
        
        diffs.push({
          id: edit.id,
          originalStartLine: startLine,
          originalEndLine: endLine,
          aiStartLine: modifiedStartLine,
          aiEndLine: modifiedStartLine + newLinesCount - 1,
          message: edit.message,
          replacementText: edit.text,
          originalText: edit.originalText,
          category: edit.category
        });

        lineShift += (newLinesCount - originalLinesReplaced);
    }

    const aiCode = lines.join('\n');
    const state: import('../types/webviewMessage').AiWorkspaceState = {
      files,
      activeFileUri: selectedUri,
      aiCode,
      diffs,
      languageId: document.languageId
    };

    this._view.webview.postMessage({ type: 'WORKSPACE_STATE_UPDATE', payload: state });
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
