import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { LlmInterventionService } from "../core/llmInterventionService";
import { LlmInterventionPlan } from "../types";

interface PendingPlan {
  documentUri: string;
  documentVersion: number;
  plan: LlmInterventionPlan;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  private readonly llmService = new LlmInterventionService();
  private pendingPlan?: PendingPlan;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly secrets: vscode.SecretStorage) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      // 🛡️ Sentinel: Restrict webview resource access to only the built dist directory,
      // preventing arbitrary extension file access (Principle of Least Privilege).
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist")],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      // 🛡️ Sentinel: Validate webview payload structure to prevent DoS via unhandled exception
      if (typeof data !== 'object' || data === null || typeof data.command !== 'string') {
        return;
      }

      switch (data.command) {
        case "ANALYZE_CURRENT_FILE": {
          await this.createInterventionPlan(webviewView.webview);
          break;
        }
        case "APPLY_PLAN": {
          await this.applyInterventionPlan(webviewView.webview);
          break;
        }
        case "REJECT_PLAN": {
          this.pendingPlan = undefined;
          webviewView.webview.postMessage({ type: "PLAN_REJECTED" });
          break;
        }
        case "UPDATE_PREFERENCE": {
          // 🛡️ Sentinel: Sanitize user input to prevent UI spoofing via VS Code icon syntax $(icon-name)
          const rawMessage = typeof data.data?.message === 'string' ? data.data.message : "";
          const sanitizedMessage = rawMessage.replace(/\$\([^)]*\)/g, '');

          // 🛡️ Sentinel: Limit string length to prevent UI freezing DoS attacks
          const limitedMessage = sanitizedMessage.length > 200 ? sanitizedMessage.substring(0, 200) + "..." : sanitizedMessage;

          vscode.window.setStatusBarMessage(
            `$(check) Preference updated: ${limitedMessage}`, 3000
          );
          break;
        }
        default: {
          // 🛡️ Sentinel: Safely ignore unrecognized commands to prevent unhandled processing
          break;
        }
      }
    });
  }

  private async createInterventionPlan(webview: vscode.Webview) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      webview.postMessage({ type: "ERROR", payload: "解析するファイルをエディタで開いてください。" });
      return;
    }

    webview.postMessage({ type: "ANALYSIS_STARTED" });
    const source = new vscode.CancellationTokenSource();
    try {
      const apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
      const plan = apiKey
        ? await this.llmService.createGeminiPlan(editor.document, source.token, apiKey)
        : await this.llmService.createPlan(editor.document, source.token);
      this.pendingPlan = {
        documentUri: editor.document.uri.toString(),
        documentVersion: editor.document.version,
        plan
      };
      webview.postMessage({ type: "INTERVENTION_PLAN", payload: plan });
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLMによる解析に失敗しました。";
      webview.postMessage({ type: "ERROR", payload: message });
    } finally {
      source.dispose();
    }
  }

  private async applyInterventionPlan(webview: vscode.Webview) {
    const pending = this.pendingPlan;
    const editor = vscode.window.activeTextEditor;
    if (!pending || !editor || editor.document.uri.toString() !== pending.documentUri || editor.document.version !== pending.documentVersion) {
      webview.postMessage({ type: "ERROR", payload: "ファイルが変更されたため、提案を適用できません。もう一度解析してください。" });
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const proposedEdit of pending.plan.edits) {
      const range = new vscode.Range(
        proposedEdit.startLine,
        proposedEdit.startCharacter,
        proposedEdit.endLine,
        proposedEdit.endCharacter
      );
      edit.replace(editor.document.uri, range, proposedEdit.newText);
    }

    const applied = await vscode.workspace.applyEdit(edit);
    this.pendingPlan = undefined;
    webview.postMessage({ type: applied ? "PLAN_APPLIED" : "ERROR", payload: applied ? undefined : "変更を適用できませんでした。" });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // webview内のベースとなるパス
    const baseUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist")
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist", "assets", "index.js")
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist", "assets", "index.css")
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
