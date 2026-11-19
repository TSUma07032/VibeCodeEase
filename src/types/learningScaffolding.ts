/**
 * [Why/Intent] 学習支援サブシステム全体で共有されるデータ構造およびIPCメッセージ契約を定義する。
 */

/**
 * [Why/Intent] 課題を分解し、達成度と核心タスクを重み付きで管理するためのインターフェース。
 */
export interface MilestoneTask {
    id: string;
    title: string;
    weight: number; // 0 - 100 (合計100)
    status: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';
    isLearningGoalCore: boolean;
}

/**
 * [Why/Intent] 認知負荷を抑えて自力解決を促す4段階（観点・概念・骨組み・完成差分）の足場かけデータ構造。
 */
export interface ScaffoldingLevels {
    level1Perspective: string;
    level2Concept: string;
    level3SkeletonCode: string;
    level4CompleteDiff: string;
}

/**
 * [Why/Intent] LLMがStructured Outputsで返却するJSONスキーマ準拠の応答構造。
 */
export interface ShadowPredictionLlmResponse {
    milestones: MilestoneTask[];
    predictedCompleteCode: string;
    unresolvedKeyTasks: string[];
    stagnationReasonHint: string;
    scaffoldingLevels: ScaffoldingLevels;
}

/**
 * [Why/Intent] LLM応答に計算されたエラー減点・推定進捗度・ハッシュを付与した完全な予測結果。
 */
export interface ShadowPredictionResult extends ShadowPredictionLlmResponse {
    diagnosticPenalty: number;
    estimatedProgress: number; // 0 - 100
    timestamp: number;
    codeHash: string;
}

/**
 * [Why/Intent] 直近n回の停滞判定・空転検知を行うための時系列スナップショット。
 */
export interface SnapshotHistoryItem {
    timestamp: number;
    estimatedProgress: number;
    codeHash: string;
    unresolvedTasks: string[];
    diagnosticsCount: number;
}

/**
 * [Why/Intent] 純粋関数によって判定された停滞の有無・理由・確信度を表す評価結果。
 */
export interface StagnationAssessment {
    isStagnated: boolean;
    consecutiveStagnantCount: number;
    reason: 'NO_PROGRESS_SCORE' | 'CODE_CHURN_WITH_ERRORS' | 'IDLE_TOO_LONG' | 'NONE';
    confidence: number;
}

/**
 * [Why/Intent] WebviewとExtension間で同期される学習支援セッション全体の真実の単一ソース(SSOT)。
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
 * [Why/Intent] LLMプロンプト構築に必要な課題・現在コード・診断エラーを束ねるOptionsオブジェクト型。
 */
export interface ShadowPredictionPromptInput {
    taskDescription: string;
    learningGoal: string;
    currentCode: string;
    diagnostics: Array<{ message: string; line: number; severity: string }>;
}

/**
 * [Why/Intent] WebviewからExtensionへ送出される学習制御コマンドの型安全な判別共用体(Discriminated Union)。
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
 * [Why/Intent] ExtensionからWebviewへ状態通知を行う型安全なIPCメッセージの判別共用体。
 */
export type LearningExtensionMessage =
    | { type: 'SYNC_SESSION_STATE'; payload: LearningSessionState }
    | { type: 'NOTIFY_STAGNATION'; payload: { assessment: StagnationAssessment } }
    | {
          type: 'SHOW_ERROR';
          payload: { message: string; code: 'AUTH_MISSING' | 'RATE_LIMIT' | 'NETWORK' | 'UNKNOWN' };
      };
