/**
 * VS Code本体とReactサイドバーUI間（Webview）でやり取りする汎用的なメッセージフォーマット型
 */
export interface WebviewMessage {
  /** メッセージのタイプ・アクション名（例: 'UPDATE_PREFERENCE', 'GET_PREFERENCE' 等） */
  type: string;
  /** ペイロード。任意のデータを持たせることができる */
  payload?: unknown;
}

export interface SettingsPayload {
  activeRules?: import('./liveIssue').RuleSummary[];
  llmTriggerMode?: import('./llmConfig').LlmTriggerMode;
  editorAppealLevel?: import('./common').EditorAppealLevel;
}
