/**
 * [Why/Intent] 停滞判定と進捗スコア計算を副作用のない純粋関数として分離し、高信頼な単体テストを担保する。
 */
import type {
    MilestoneTask,
    SnapshotHistoryItem,
    StagnationAssessment,
} from '../../types/learningScaffolding';
import { LEARNING_CONFIG } from './defaultLearningConfig';

/** [Why/Intent] 停滞判定に必要な履歴および環境状態パラメータ */
export interface AssessStagnationParams {
    history: SnapshotHistoryItem[];
    thresholdN: number;
    currentTimestamp: number;
    snoozeUntilTimestamp: number | null;
    isDismissed: boolean;
    isWindowFocused: boolean;
    progressDeltaThreshold?: number;
}

/** [Why/Intent] タスク進捗状態に応じた達成率比率（COMPLETED: 1.0, IN_PROGRESS: 着手中として過大評価を抑えつつ努力を反映する半分の0.5評価、その他: 0.0）を返す */
function getMilestoneRatio(status: MilestoneTask['status']): number {
    if (status === 'COMPLETED') {
        return 1.0;
    }
    if (status === 'IN_PROGRESS') {
        return 0.5;
    }
    return 0.0;
}

/**
 * [Why/Intent] 説明可能なマイルストーン加重平均とエラー減点を用いて進捗スコア(0-100)を計算する。
 */
export function calculateProgressScore(
    milestones: MilestoneTask[],
    errorCount: number,
): { estimatedProgress: number; diagnosticPenalty: number } {
    let baseScore = 0;
    let hasUnstartedCoreTask = false;

    for (const m of milestones) {
        baseScore += m.weight * getMilestoneRatio(m.status);
        if (m.isLearningGoalCore && m.status === 'NOT_STARTED') {
            hasUnstartedCoreTask = true;
        }
    }

    const diagnosticPenalty = Math.min(
        LEARNING_CONFIG.MAX_DIAGNOSTIC_PENALTY,
        Math.max(0, errorCount * LEARNING_CONFIG.DIAGNOSTIC_PENALTY_PER_ERROR),
    );

    let progress = Math.round(baseScore - diagnosticPenalty);
    if (hasUnstartedCoreTask) {
        progress = Math.min(progress, LEARNING_CONFIG.CORE_TASK_CAP_PROGRESS);
    }

    return {
        estimatedProgress: Math.max(0, Math.min(100, progress)),
        diagnosticPenalty,
    };
}

/** [Why/Intent] スヌーズまたは通知破棄による停滞判定の抑制条件を判定する */
function isAssessmentSuppressed(
    isDismissed: boolean,
    snoozeUntil: number | null,
    now: number,
): boolean {
    return isDismissed || (snoozeUntil !== null && now < snoozeUntil);
}

/** [Why/Intent] 直近n回履歴における3大停滞パターン（進捗なし・空転エラー・長時間放置）を判定する */
function detectStagnationReason(params: {
    recent: SnapshotHistoryItem[];
    delta: number;
    isWindowFocused: boolean;
    progressDeltaThreshold: number;
}): StagnationAssessment['reason'] {
    const { recent, delta, isWindowFocused, progressDeltaThreshold } = params;
    const first = recent[0];
    const latest = recent[recent.length - 1];

    const hasCodeChanged = recent.every(
        (item, idx, arr) => idx === 0 || item.codeHash !== arr[idx - 1].codeHash,
    );
    const hasPersistentErrors = recent.every((item) => item.diagnosticsCount > 0);
    if (hasCodeChanged && hasPersistentErrors && delta < progressDeltaThreshold) {
        return 'CODE_CHURN_WITH_ERRORS';
    }

    const tasksUnchanged =
        JSON.stringify(first.unresolvedTasks) === JSON.stringify(latest.unresolvedTasks);
    if (delta < progressDeltaThreshold && tasksUnchanged) {
        return 'NO_PROGRESS_SCORE';
    }

    const isCodeUnchanged = recent.every((item) => item.codeHash === first.codeHash);
    if (isWindowFocused && isCodeUnchanged && latest.diagnosticsCount > 0) {
        return 'IDLE_TOO_LONG';
    }

    return 'NONE';
}

/**
 * [Why/Intent] 停滞理由の客観性に応じた確信度スコアをマッピングする。
 * NO_PROGRESS_SCOREはスコア数値変化なしで最も客観性が高く高信頼(0.9)、
 * CODE_CHURN_WITH_ERRORSはコード変更があるもののエラー解消不能な空回りを表し準高信頼(0.85)、
 * IDLE_TOO_LONGは他画面での外部ドキュメント調査等の可能性を考慮し中信頼(0.8)とする。
 */
function getConfidenceByReason(reason: StagnationAssessment['reason']): number {
    switch (reason) {
        case 'NO_PROGRESS_SCORE':
            return 0.9;
        case 'CODE_CHURN_WITH_ERRORS':
            return 0.85;
        case 'IDLE_TOO_LONG':
            return 0.8;
        case 'NONE':
            return 0;
    }
}

/**
 * [Why/Intent] 直近n回の履歴スナップショットから、学習者の停滞状態を純粋計算により判定する。
 */
export function assessStagnation(params: AssessStagnationParams): StagnationAssessment {
    const {
        history,
        thresholdN,
        currentTimestamp,
        snoozeUntilTimestamp,
        isDismissed,
        isWindowFocused,
        progressDeltaThreshold = LEARNING_CONFIG.PROGRESS_DELTA_THRESHOLD,
    } = params;

    if (
        isAssessmentSuppressed(isDismissed, snoozeUntilTimestamp, currentTimestamp) ||
        history.length < thresholdN
    ) {
        return { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 };
    }

    const recent = history.slice(-thresholdN);
    const delta = Math.abs(
        recent[recent.length - 1].estimatedProgress - recent[0].estimatedProgress,
    );
    const reason = detectStagnationReason({
        recent,
        delta,
        isWindowFocused,
        progressDeltaThreshold,
    });

    if (reason !== 'NONE') {
        return {
            isStagnated: true,
            consecutiveStagnantCount: thresholdN,
            reason,
            confidence: getConfidenceByReason(reason),
        };
    }

    return { isStagnated: false, consecutiveStagnantCount: 0, reason: 'NONE', confidence: 0 };
}
