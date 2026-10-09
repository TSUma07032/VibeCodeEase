/**
 * [Why/Intent] ExtensionとWebview間で型安全なメッセージ通信（IPC）を保証し、契約（Contract）として定義する。
 */

/**
 * [Why/Intent] WebviewからExtensionへ送るメッセージ。
 * - apply_intervention: ユーザーが提案を反映した際のコード適用要求
 * - discard_intervention: ユーザーが提案を破棄した際の除外要求
 * - ready: WebviewのReactマウント完了を知らせるハンドシェイク
 */
// Webview -> Extension
export type WebviewToExtensionMessage = 
  | { command: 'apply_intervention', id: string, newText: string, range: { start: { line: number, character: number }, end: { line: number, character: number } } }
  | { command: 'discard_intervention', id: string }
  | { command: 'ready' };

// Extension -> Webview
export type ExtensionToWebviewMessage = 
  | { type: 'SYNC_DOCUMENT', fileName: string, text: string }
  | { type: 'UPDATE_INTERVENTIONS', interventions: WebviewIntervention[] };

export interface WebviewIntervention {
  id: string;
  range: { start: { line: number, character: number }, end: { line: number, character: number } };
  originalText: string;
  replacementText: string;
  message: string;
}