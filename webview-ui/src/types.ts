/**
 * [Why/Intent] ExtensionとWebview間で型安全なメッセージ通信（IPC）を保証し、契約（Contract）として定義する。
 */

/**
 * [Why/Intent] ユーザーが選択可能なAI推敲レベルの型定義。
 * マジックストリングを排除し、型安全な通信を実現するため。
 */
export type AiInterventionLevel = 'Level 1 (Typo/Bug Fix)' | 'Level 2 (Refactoring)' | 'Level 3 (Architecture Optimization)';

/**
 * [Why/Intent] WebviewからExtensionへ送るメッセージ。
 * - apply_intervention: ユーザーが提案を反映した際のコード適用要求
 * - discard_intervention: ユーザーが提案を破棄した際の除外要求
 * - ready: WebviewのReactマウント完了を知らせるハンドシェイク
 * - update_api_key: セキュアなストレージにAPIキーを保存/削除するための要求
 * - update_intervention_level: 推敲レベル設定をグローバル設定に反映させるための要求
 * - force_analyze: 即座にドキュメントの再推敲を実行させるための要求
 */
// Webview -> Extension
export type WebviewToExtensionMessage = 
  | { command: 'apply_intervention', id: string, newText: string, range: { start: { line: number, character: number }, end: { line: number, character: number } } }
  | { command: 'discard_intervention', id: string }
  | { command: 'ready' }
  | { command: 'update_api_key', apiKey: string }
  | { command: 'update_intervention_level', level: AiInterventionLevel }
  | { command: 'force_analyze' };

/**
 * [Why/Intent] ExtensionからWebviewへ送るメッセージ。
 * - SYNC_DOCUMENT: ドキュメント内容の同期
 * - UPDATE_INTERVENTIONS: 推敲提案一覧の同期
 * - SYNC_SETTINGS: ユーザー設定（APIキーの有無・推敲レベル）の初期同期および変更反映のため
 */
// Extension -> Webview
export type ExtensionToWebviewMessage = 
  | { type: 'SYNC_DOCUMENT', fileName: string, text: string }
  | { type: 'UPDATE_INTERVENTIONS', interventions: WebviewIntervention[] }
  | { type: 'SYNC_SETTINGS', hasApiKey: boolean, interventionLevel: AiInterventionLevel };

export interface WebviewIntervention {
  id: string;
  range: { start: { line: number, character: number }, end: { line: number, character: number } };
  originalText: string;
  replacementText: string;
  message: string;
}