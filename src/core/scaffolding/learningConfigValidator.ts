/**
 * [Why/Intent] 学習支援設定値の安全な境界値クランプと不正値フォールバックを提供するバリデータモジュール。
 */
import type { UserLearningConfig } from '../../types/learningSettings';
import { DEFAULT_USER_LEARNING_CONFIG, USER_CONFIG_BOUNDS } from './defaultLearningConfig';

/**
 * [Why/Intent] 境界値定義オブジェクトの型
 */
interface NumberBounds {
    MIN: number;
    MAX: number;
    DEFAULT: number;
}

/**
 * [Why/Intent] 数値入力値を指定された上下限値内に安全にクランプし、非数値時はデフォルト値へフォールバックするヘルパー関数。
 */
function clampNumber(val: unknown, bounds: NumberBounds): number {
    if (typeof val !== 'number' || Number.isNaN(val)) {
        return bounds.DEFAULT;
    }
    return Math.min(bounds.MAX, Math.max(bounds.MIN, Math.round(val)));
}

/**
 * [Why/Intent] 外部入力や不正な値を許容境界値内に強制補正し、システムのクラッシュ・不正動作を防ぐ純粋関数。
 */
export function clampUserLearningConfig(input?: Partial<UserLearningConfig>): UserLearningConfig {
    if (!input || typeof input !== 'object') {
        return { ...DEFAULT_USER_LEARNING_CONFIG };
    }

    return {
        intervalSeconds: clampNumber(input.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS),
        debounceMs: clampNumber(input.debounceMs, USER_CONFIG_BOUNDS.DEBOUNCE_MS),
        stagnationThresholdN: clampNumber(
            input.stagnationThresholdN,
            USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N,
        ),
        progressDeltaThreshold: clampNumber(
            input.progressDeltaThreshold,
            USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD,
        ),
        snoozeMinutes: clampNumber(input.snoozeMinutes, USER_CONFIG_BOUNDS.SNOOZE_MINUTES),
        defaultDisclosureMode: input.defaultDisclosureMode === 'direct' ? 'direct' : 'stepByStep',
        pauseExistingAnalysisDuringLearning: input.pauseExistingAnalysisDuringLearning ?? true,
    };
}
