import { PresetMode } from './preset';

export type ExtensionMessage =
  | { command: 'GET_SETTINGS' }
  | { command: 'SET_PRESET'; payload: PresetMode }
  | { command: 'UPDATE_PREFERENCE_VALUE'; payload: { category: string; value: number } }
  | { command: 'ANALYZE_CURRENT_FILE' }
  | { command: 'APPLY_PLAN' }
  | { command: 'REJECT_PLAN' }
  | { command: 'UPDATE_PREFERENCE'; payload: unknown };

/**
 * VS Code本体とReactサイドバーUI間（Webview）でやり取りする汎用的なメッセージフォーマット型
 */
export interface WebviewMessage {
  /** メッセージのタイプ・アクション名（例: 'UPDATE_PREFERENCE', 'GET_PREFERENCE' 等） */
  type: string;
  /** ペイロード。任意のデータを持たせることができる */
  payload?: unknown;
}
