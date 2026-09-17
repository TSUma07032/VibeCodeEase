export interface SettingsPayload {
  activeRules?: import('./liveIssue').RuleSummary[];
  llmTriggerMode?: import('./llmConfig').LlmTriggerMode;
  editorAppealLevel?: import('./common').EditorAppealLevel;
}

export type WebviewMessage =
  | { command: 'GET_SETTINGS' }
  | { command: 'SET_PRESET'; payload: import('./preset').PresetMode }
  | { command: 'UPDATE_PREFERENCE_VALUE'; payload: { category: string; value: number } }
  | { command: 'SAVE_API_KEY'; payload: { apiKey: string } }
  | { command: 'DELETE_API_KEY' }
  | { command: 'SET_LLM_CONFIG'; payload: { provider: 'gemini' | 'vscode-lm'; model: string } }
  | { command: 'SET_LLM_TRIGGER_MODE'; payload: import('./llmConfig').LlmTriggerMode }
  | { command: 'SET_EDITOR_APPEAL_LEVEL'; payload: import('./common').EditorAppealLevel }
  | { command: 'ANALYZE_CURRENT_FILE' }
  | { command: 'APPLY_PLAN' }
  | { command: 'REJECT_PLAN' }
  | { command: 'JUMP_TO_ISSUE'; payload: { line: number; character: number } }
  | { command: 'APPLY_LIVE_ISSUE'; payload: import('./liveIssue').LiveIssue }
  | { command: 'REJECT_LIVE_ISSUE'; payload: import('./liveIssue').LiveIssue }
  | { command: 'UPDATE_PREFERENCE'; payload: unknown };
