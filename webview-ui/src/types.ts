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
  | { command: 'force_analyze' }
  | { command: 'update_llm_config', frequency: 'manual' | 'onSave' | 'interval', intervalSeconds: number, model: string }
  | { command: 'clear_error_logs' };

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
  | { type: 'SYNC_SETTINGS', hasApiKey: boolean, apiKeyLength?: number, interventionLevel: AiInterventionLevel, frequency: 'manual' | 'onSave' | 'interval', intervalSeconds: number, model: string }
  | { type: 'LLM_STATUS_UPDATE', status: 'idle' | 'loading' | 'error' }
  | { type: 'LLM_RESPONSE_UPDATE', text: string, timestamp: number }
  | { type: 'LLM_ERROR_LOG', message: string, timestamp: number }
  | { type: 'LLM_DASHBOARD_INIT', response: { text: string; timestamp: number } | null, logs: Array<{ message: string; timestamp: number }>, status: 'idle' | 'loading' | 'error' };

/**
 * [Why/Intent] AI推敲提案のメタデータおよび置換範囲・内容を保持する型定義。
 */
export interface WebviewIntervention {
  id: string;
  range: { start: { line: number, character: number }, end: { line: number, character: number } };
  originalText: string;
  replacementText: string;
  message: string;
}

/**
 * [Why/Intent] 学習課題を構成するマイルストーン項目とその達成状況・学習目標の核心タスクか否かを管理する。
 */
export interface MilestoneTask {
  id: string;
  title: string;
  weight: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';
  isLearningGoalCore: boolean;
}

/**
 * [Why/Intent] 段階的足場かけ（Scaffolding）の4段階ヒント（観点・概念・骨組み・完成差分）のテキストを保持する。
 */
export interface ScaffoldingLevels {
  level1Perspective: string;
  level2Concept: string;
  level3SkeletonCode: string;
  level4CompleteDiff: string;
}

/**
 * [Why/Intent] AIが裏で予測した完成形コード、マイルストーン進捗、停滞理由ヒント、エラー減点等の全結果をまとめた構造体。
 */
export interface ShadowPredictionResult {
  milestones: MilestoneTask[];
  predictedCompleteCode: string;
  unresolvedKeyTasks: string[];
  stagnationReasonHint: string;
  scaffoldingLevels: ScaffoldingLevels;
  diagnosticPenalty: number;
  estimatedProgress: number;
  timestamp: number;
  codeHash: string;
}

/**
 * [Why/Intent] 停滞判定エンジンが直近n回の進展を比較分析するための履歴スナップショット。
 */
export interface SnapshotHistoryItem {
  timestamp: number;
  estimatedProgress: number;
  codeHash: string;
  unresolvedTasks: string[];
  diagnosticsCount: number;
}

/**
 * [Why/Intent] 停滞判定結果（停滞有無、連続回数、判定理由、確信度）を表すドメインモデル。
 */
export interface StagnationAssessment {
  isStagnated: boolean;
  consecutiveStagnantCount: number;
  reason: 'NO_PROGRESS_SCORE' | 'CODE_CHURN_WITH_ERRORS' | 'IDLE_TOO_LONG' | 'NONE';
  confidence: number;
}

/**
 * [Why/Intent] 学習支援サブシステムのセッション全体の状態（4状態、開示モード、アンロックLv、最新予測、履歴等）を保持する。
 */
export interface LearningSessionState {
  taskId: string;
  taskDescription: string;
  learningGoal: string;
  status: 'empty' | 'loading' | 'success' | 'error';
  disclosureMode: 'stepByStep' | 'direct';
  unlockedLevel: 1 | 2 | 3 | 4;
  latestPrediction: ShadowPredictionResult | null;
  assessment: StagnationAssessment;
  snoozeUntilTimestamp: number | null;
  isDismissed: boolean;
  lastUpdatedTimestamp: number;
  history: SnapshotHistoryItem[];
  errorMessage?: string;
  errorCode?: 'AUTH_MISSING' | 'RATE_LIMIT' | 'NETWORK' | 'UNKNOWN';
}

/**
 * [Why/Intent] WebviewからExtensionへ送る学習支援関連のコマンドメッセージ定義。
 */
export type LearningWebviewMessage =
  | { type: 'START_SESSION'; payload: { taskDescription: string; learningGoal: string } }
  | { type: 'STOP_SESSION' }
  | { type: 'REQUEST_HINT' }
  | { type: 'SET_DISCLOSURE_MODE'; payload: { mode: 'stepByStep' | 'direct' } }
  | { type: 'UNLOCK_NEXT_HINT_LEVEL'; payload: { targetLevel: 1 | 2 | 3 | 4 } }
  | { type: 'UNLOCK_ALL_HINTS' }
  | { type: 'SNOOZE_HINT'; payload: { snoozeMinutes: number } }
  | { type: 'DISMISS_HINT' }
  | { type: 'APPLY_DIFF'; payload: { replacementCode: string } };

/**
 * [Why/Intent] ExtensionからWebviewへ送る学習支援セッション同期メッセージ定義。
 */
export type LearningExtensionMessage =
  | { type: 'SYNC_SESSION_STATE'; payload: LearningSessionState }
  | { type: 'NOTIFY_STAGNATION'; payload: { assessment: StagnationAssessment } }
  | { type: 'SHOW_ERROR'; payload: { message: string; code: 'AUTH_MISSING' | 'RATE_LIMIT' | 'NETWORK' | 'UNKNOWN' } };

/**
 * [Why/Intent] ユーザーがカスタマイズ可能な学習支援パラメータを定義するモデル。
 */
export interface UserLearningConfig {
  intervalSeconds: number;
  debounceMs: number;
  stagnationThresholdN: number;
  progressDeltaThreshold: number;
  snoozeMinutes: number;
  defaultDisclosureMode: 'stepByStep' | 'direct';
  pauseExistingAnalysisDuringLearning: boolean;
}

/**
 * [Why/Intent] WebviewからExtensionへ送る学習設定メッセージ。
 */
export type LearningSettingsWebviewMessage =
  | { type: 'REQUEST_LEARNING_CONFIG' }
  | { type: 'UPDATE_LEARNING_CONFIG'; payload: Partial<UserLearningConfig> }
  | { type: 'RESET_LEARNING_CONFIG' };

/**
 * [Why/Intent] ExtensionからWebviewへ送る学習設定同期メッセージ。
 */
export type LearningSettingsExtensionMessage =
  | { type: 'SYNC_LEARNING_CONFIG'; payload: UserLearningConfig }
  | { type: 'NOTIFY_CONFIG_SAVED'; payload: { success: boolean; message?: string } };
