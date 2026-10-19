/**
 * [Why/Intent] 学習支援設定値のクランプ関数（clampUserLearningConfig）の全境界値・異常値動作を網羅検証するテストスイート。
 */
import * as assert from 'node:assert';
import {
    DEFAULT_USER_LEARNING_CONFIG,
    USER_CONFIG_BOUNDS,
} from '../../core/scaffolding/defaultLearningConfig';
import { clampUserLearningConfig } from '../../core/scaffolding/learningConfigValidator';
import type { UserLearningConfig } from '../../types/learningSettings';

suite('LearningConfigValidator Test Suite', () => {
    test('空、undefined、null、非オブジェクト入力時はデフォルト設定を返すこと', () => {
        assert.deepStrictEqual(clampUserLearningConfig(undefined), DEFAULT_USER_LEARNING_CONFIG);
        assert.deepStrictEqual(clampUserLearningConfig({}), DEFAULT_USER_LEARNING_CONFIG);
        assert.deepStrictEqual(
            clampUserLearningConfig(null as unknown as Partial<UserLearningConfig>),
            DEFAULT_USER_LEARNING_CONFIG,
        );
        assert.deepStrictEqual(
            clampUserLearningConfig('invalid' as unknown as Partial<UserLearningConfig>),
            DEFAULT_USER_LEARNING_CONFIG,
        );
    });

    test('有効範囲内の正常値はそのまま反映されること', () => {
        const input = {
            intervalSeconds: 60,
            debounceMs: 6000,
            stagnationThresholdN: 5,
            progressDeltaThreshold: 10,
            snoozeMinutes: 5,
            defaultDisclosureMode: 'direct' as const,
            pauseExistingAnalysisDuringLearning: false,
        };
        const result = clampUserLearningConfig(input);
        assert.deepStrictEqual(result, input);
    });

    test('MIN境界値ジャストの入力値がクランプされずにそのまま返ること', () => {
        const minInput: UserLearningConfig = {
            intervalSeconds: USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MIN,
            debounceMs: USER_CONFIG_BOUNDS.DEBOUNCE_MS.MIN,
            stagnationThresholdN: USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.MIN,
            progressDeltaThreshold: USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.MIN,
            snoozeMinutes: USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MIN,
            defaultDisclosureMode: 'stepByStep',
            pauseExistingAnalysisDuringLearning: true,
        };
        const result = clampUserLearningConfig(minInput);
        assert.deepStrictEqual(result, minInput);
    });

    test('MAX境界値ジャストの入力値がクランプされずにそのまま返ること', () => {
        const maxInput: UserLearningConfig = {
            intervalSeconds: USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MAX,
            debounceMs: USER_CONFIG_BOUNDS.DEBOUNCE_MS.MAX,
            stagnationThresholdN: USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.MAX,
            progressDeltaThreshold: USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.MAX,
            snoozeMinutes: USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MAX,
            defaultDisclosureMode: 'direct',
            pauseExistingAnalysisDuringLearning: false,
        };
        const result = clampUserLearningConfig(maxInput);
        assert.deepStrictEqual(result, maxInput);
    });

    test('下限値未満の入力は安全に下限値へクランプされること', () => {
        const input = {
            intervalSeconds: USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MIN - 5,
            debounceMs: USER_CONFIG_BOUNDS.DEBOUNCE_MS.MIN - 500,
            stagnationThresholdN: USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.MIN - 1,
            progressDeltaThreshold: USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.MIN - 1,
            snoozeMinutes: USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MIN - 1,
        };
        const result = clampUserLearningConfig(input);
        assert.strictEqual(result.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MIN);
        assert.strictEqual(result.debounceMs, USER_CONFIG_BOUNDS.DEBOUNCE_MS.MIN);
        assert.strictEqual(
            result.stagnationThresholdN,
            USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.MIN,
        );
        assert.strictEqual(
            result.progressDeltaThreshold,
            USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.MIN,
        );
        assert.strictEqual(result.snoozeMinutes, USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MIN);
    });

    test('上限値超過の入力は安全に上限値へクランプされること', () => {
        const input = {
            intervalSeconds: USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MAX + 100,
            debounceMs: USER_CONFIG_BOUNDS.DEBOUNCE_MS.MAX + 5000,
            stagnationThresholdN: USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.MAX + 5,
            progressDeltaThreshold: USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.MAX + 10,
            snoozeMinutes: USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MAX + 20,
        };
        const result = clampUserLearningConfig(input);
        assert.strictEqual(result.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MAX);
        assert.strictEqual(result.debounceMs, USER_CONFIG_BOUNDS.DEBOUNCE_MS.MAX);
        assert.strictEqual(
            result.stagnationThresholdN,
            USER_CONFIG_BOUNDS.STAGNATION_THRESHOLD_N.MAX,
        );
        assert.strictEqual(
            result.progressDeltaThreshold,
            USER_CONFIG_BOUNDS.PROGRESS_DELTA_THRESHOLD.MAX,
        );
        assert.strictEqual(result.snoozeMinutes, USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MAX);
    });

    test('NaNや非数値、小数が渡された場合も整数丸めまたはデフォルトへフォールバックすること', () => {
        const input = {
            intervalSeconds: Number.NaN,
            debounceMs: 'invalid' as unknown as number,
            stagnationThresholdN: 3.7,
            progressDeltaThreshold: 5.2,
            snoozeMinutes: Number.NaN,
        };
        const result = clampUserLearningConfig(input);
        assert.strictEqual(result.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS.DEFAULT);
        assert.strictEqual(result.debounceMs, USER_CONFIG_BOUNDS.DEBOUNCE_MS.DEFAULT);
        assert.strictEqual(result.stagnationThresholdN, 4); // 四捨五入
        assert.strictEqual(result.progressDeltaThreshold, 5); // 四捨五入
        assert.strictEqual(result.snoozeMinutes, USER_CONFIG_BOUNDS.SNOOZE_MINUTES.DEFAULT);
    });

    test('defaultDisclosureModeとpauseExistingAnalysisの不正値フォールバックが正しく機能すること', () => {
        const input = {
            defaultDisclosureMode: 'invalidMode' as unknown as 'stepByStep',
            pauseExistingAnalysisDuringLearning: undefined,
        };
        const result = clampUserLearningConfig(input);
        assert.strictEqual(result.defaultDisclosureMode, 'stepByStep');
        assert.strictEqual(result.pauseExistingAnalysisDuringLearning, true);
    });
});
