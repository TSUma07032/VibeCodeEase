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
  presetMode: import('./preset').PresetMode;
  llmConfig: import('./llmConfig').LlmConfig;
  hasGeminiApiKey: boolean;
  activeRules?: import('./liveIssue').RuleSummary[];
  llmTriggerMode?: import('./llmConfig').LlmTriggerMode;
  editorAppealLevel?: import('./common').EditorAppealLevel;
}

export interface AiWorkspaceFile {
  uri: string;
  label: string;
}

export interface AiDiff {
  id: string; // The LiveIssue id
  originalStartLine: number;
  originalEndLine: number;
  aiStartLine: number;
  aiEndLine: number;
  message: string;
  replacementText: string;
  originalText?: string;
  category: string;
}

export interface AiWorkspaceState {
  files: AiWorkspaceFile[];
  activeFileUri?: string;
  aiCode?: string;
  diffs?: AiDiff[];
  languageId?: string;
}
