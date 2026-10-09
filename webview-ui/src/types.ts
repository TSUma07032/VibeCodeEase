export type PainCategory =
  | 'SYNTAX_TYPO'
  | 'INDENTATION_FORMATTING'
  | 'VAR_FUNC_MANAGEMENT'
  | 'SYNTAX_ERROR_HANDLING';

export type PresetMode = 'HINT' | 'ARCHITECTURE' | 'BUG_TYPO' | 'CUSTOM';

/** LLMバックグラウンドサービスのトリガーモード */
export type LlmTriggerMode = 'continuous' | 'on-save' | 'disabled';

export interface ProposedEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  newText: string;
  category: PainCategory;
  reason: string;
}

export interface InterventionPlan {
  summary: string;
  edits: ProposedEdit[];
}

export type LlmProvider = 'gemini' | 'vscode-lm';

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
}

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  preferences: Record<PainCategory, number>;
}

/** ルールカタログ1件 */
export interface RuleSummary {
  pattern: string;
  replacement: string;
  category: PainCategory;
  languageId?: string[];
}

export interface LiveIssue {
  id: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  category: PainCategory;
  message: string;
  replacementText?: string;
  originalText?: string;
  source: 'static' | 'ast' | 'llm';
}

export interface SettingsPayload {
  presetMode: PresetMode;
  preferences: Record<PainCategory, number>;
  presetDefinitions: Record<string, PresetDefinition>;
  llmConfig: LlmConfig;
  hasGeminiApiKey: boolean;
  activeRules?: RuleSummary[];
  llmTriggerMode?: LlmTriggerMode;
  editorAppealLevel?: EditorAppealLevel;
}

export const CATEGORY_NAMES: Record<PainCategory, string> = {
  SYNTAX_TYPO: 'タイポ・誤記',
  INDENTATION_FORMATTING: 'インデント・整形',
  VAR_FUNC_MANAGEMENT: '変数・関数の管理',
  SYNTAX_ERROR_HANDLING: '構文エラー・ブロック'
};

export type EditorAppealLevel = 'high' | 'medium' | 'low';


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