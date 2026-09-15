import { PresetMode } from './preset';
import { LlmTriggerMode } from './llmConfig';
import { EditorAppealLevel } from './common';
import { LiveIssue } from './liveIssue';

/**
 * VS Code本体とReactサイドバーUI間（Webview）でやり取りする判別可能なユニオン型
 */
export type ExtensionMessage =
  | { command: 'GET_SETTINGS' }
  | { command: 'SET_PRESET'; payload: PresetMode }
  | { command: 'UPDATE_PREFERENCE_VALUE'; payload: { category: string; value: number } }
  | { command: 'SET_LLM_CONFIG'; payload: { provider: 'gemini' | 'vscode-lm'; model: string } }
  | { command: 'SAVE_API_KEY'; payload: { apiKey: string } }
  | { command: 'DELETE_API_KEY' }
  | { command: 'SET_LLM_TRIGGER_MODE'; payload: LlmTriggerMode }
  | { command: 'SET_EDITOR_APPEAL_LEVEL'; payload: EditorAppealLevel }
  | { command: 'ANALYZE_CURRENT_FILE' }
  | { command: 'APPLY_PLAN' }
  | { command: 'REJECT_PLAN' }
  | { command: 'JUMP_TO_ISSUE'; payload: { line: number; character: number } }
  | { command: 'APPLY_LIVE_ISSUE'; payload: LiveIssue }
  | { command: 'REJECT_LIVE_ISSUE'; payload: LiveIssue }
  | { command: 'UPDATE_PREFERENCE'; payload: string };

/**
 * 下位互換用エイリアス
 */
export type WebviewMessage = ExtensionMessage;

export interface SettingsPayload {
  activeRules?: import('./liveIssue').RuleSummary[];
  llmTriggerMode?: import('./llmConfig').LlmTriggerMode;
  editorAppealLevel?: import('./common').EditorAppealLevel;
}
