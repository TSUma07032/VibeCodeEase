import * as assert from 'node:assert';
import {
    assessStagnation,
    calculateProgressScore,
} from '../../core/scaffolding/stagnationCalculator';
import type { MilestoneTask, SnapshotHistoryItem } from '../../types/learningScaffolding';

const baseSnapshot: SnapshotHistoryItem = {
    timestamp: 1000,
    estimatedProgress: 45,
    codeHash: 'hash-a',
    unresolvedTasks: ['Task A', 'Task B'],
    diagnosticsCount: 0,
};

function testCalculateProgressScore(): void {
    suite('calculateProgressScore', () => {
        test('全タスクCOMPLETEDで100%を返すこと', () => {
            const milestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 50,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                { id: '2', title: 'T2', weight: 50, status: 'COMPLETED', isLearningGoalCore: true },
            ];
            const res = calculateProgressScore(milestones, 0);
            assert.strictEqual(res.estimatedProgress, 100);
            assert.strictEqual(res.diagnosticPenalty, 0);
        });

        test('IN_PROGRESSのタスクが重みの0.5倍として正しく合算されること', () => {
            const milestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 40,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                {
                    id: '2',
                    title: 'T2',
                    weight: 40,
                    status: 'IN_PROGRESS',
                    isLearningGoalCore: false,
                },
                {
                    id: '3',
                    title: 'T3',
                    weight: 20,
                    status: 'NOT_STARTED',
                    isLearningGoalCore: true,
                },
            ];
            const res = calculateProgressScore(milestones, 0);
            assert.strictEqual(res.estimatedProgress, 60);
        });

        test('核心タスクがNOT_STARTEDの場合、計算合計が80%でも上限60%にキャップされること', () => {
            const milestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 50,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                {
                    id: '2',
                    title: 'T2',
                    weight: 30,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                {
                    id: '3',
                    title: 'T3',
                    weight: 20,
                    status: 'NOT_STARTED',
                    isLearningGoalCore: true,
                },
            ];
            const res = calculateProgressScore(milestones, 0);
            assert.strictEqual(res.estimatedProgress, 60);
        });

        test('核心タスクがIN_PROGRESSの場合、60%キャップがかからずに高進捗が得られること', () => {
            const milestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 50,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                {
                    id: '2',
                    title: 'T2',
                    weight: 20,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                {
                    id: '3',
                    title: 'T3',
                    weight: 30,
                    status: 'IN_PROGRESS',
                    isLearningGoalCore: true,
                },
            ];
            const res = calculateProgressScore(milestones, 0);
            assert.strictEqual(res.estimatedProgress, 85);
        });

        test('構文エラー1件につき5%減点され、最大20%までペナルティが適用されること', () => {
            const milestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 100,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
            ];
            const res2 = calculateProgressScore(milestones, 2);
            assert.strictEqual(res2.diagnosticPenalty, 10);
            assert.strictEqual(res2.estimatedProgress, 90);

            const res5 = calculateProgressScore(milestones, 5);
            assert.strictEqual(res5.diagnosticPenalty, 20);
            assert.strictEqual(res5.estimatedProgress, 80);
        });

        test('0%下限クランプおよび100%上限クランプが正しく機能すること', () => {
            const lowMilestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 10,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
            ];
            const resLow = calculateProgressScore(lowMilestones, 5);
            assert.strictEqual(resLow.estimatedProgress, 0);

            const highMilestones: MilestoneTask[] = [
                {
                    id: '1',
                    title: 'T1',
                    weight: 80,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
                {
                    id: '2',
                    title: 'T2',
                    weight: 40,
                    status: 'COMPLETED',
                    isLearningGoalCore: false,
                },
            ];
            const resHigh = calculateProgressScore(highMilestones, 0);
            assert.strictEqual(resHigh.estimatedProgress, 100);
        });
    });
}

function testAssessStagnationSuppression(): void {
    test('履歴がthresholdN未満の場合は停滞と判定しないこと', () => {
        const res = assessStagnation({
            history: [baseSnapshot, baseSnapshot],
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res.isStagnated, false);
        assert.strictEqual(res.reason, 'NONE');
    });

    test('スヌーズ中および通知拒否(isDismissed)の場合は停滞を抑制すること', () => {
        const history = [baseSnapshot, baseSnapshot, baseSnapshot];
        const snoozed = assessStagnation({
            history,
            thresholdN: 3,
            currentTimestamp: 2000,
            snoozeUntilTimestamp: 5000,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(snoozed.isStagnated, false);

        const dismissed = assessStagnation({
            history,
            thresholdN: 3,
            currentTimestamp: 6000,
            snoozeUntilTimestamp: null,
            isDismissed: true,
            isWindowFocused: true,
        });
        assert.strictEqual(dismissed.isStagnated, false);
    });

    test('スヌーズ期限切れ後は停滞検知が再開されること (境界値)', () => {
        const history = [baseSnapshot, baseSnapshot, baseSnapshot];
        const res = assessStagnation({
            history,
            thresholdN: 3,
            currentTimestamp: 5000,
            snoozeUntilTimestamp: 5000,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res.isStagnated, true);
        assert.strictEqual(res.reason, 'NO_PROGRESS_SCORE');
    });
}

function testAssessStagnationPositivePatterns(): void {
    test('直近n回で進捗変化量<5%かつ未解決タスク一致ならNO_PROGRESS_SCOREで停滞検知すること', () => {
        const history: SnapshotHistoryItem[] = [
            { ...baseSnapshot, timestamp: 1000, estimatedProgress: 45 },
            { ...baseSnapshot, timestamp: 2000, estimatedProgress: 46 },
            { ...baseSnapshot, timestamp: 3000, estimatedProgress: 46 },
        ];
        const res = assessStagnation({
            history,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res.isStagnated, true);
        assert.strictEqual(res.reason, 'NO_PROGRESS_SCORE');
        assert.strictEqual(res.consecutiveStagnantCount, 3);
    });

    test('コード変更連続＆エラー継続＆進捗停滞ならCODE_CHURN_WITH_ERRORSで検知すること', () => {
        const historyWithErrors: SnapshotHistoryItem[] = [
            {
                ...baseSnapshot,
                timestamp: 1000,
                codeHash: 'h1',
                diagnosticsCount: 1,
                estimatedProgress: 40,
            },
            {
                ...baseSnapshot,
                timestamp: 2000,
                codeHash: 'h2',
                diagnosticsCount: 2,
                estimatedProgress: 40,
            },
            {
                ...baseSnapshot,
                timestamp: 3000,
                codeHash: 'h3',
                diagnosticsCount: 1,
                estimatedProgress: 40,
            },
        ];
        const res = assessStagnation({
            history: historyWithErrors,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res.isStagnated, true);
        assert.strictEqual(res.reason, 'CODE_CHURN_WITH_ERRORS');
    });

    test('コード無変更＆エラー継続＆ウィンドウアクティブならIDLE_TOO_LONGで検知すること', () => {
        const historyWithErr: SnapshotHistoryItem[] = [
            {
                ...baseSnapshot,
                timestamp: 1000,
                codeHash: 'same',
                diagnosticsCount: 1,
                unresolvedTasks: ['T1'],
            },
            {
                ...baseSnapshot,
                timestamp: 2000,
                codeHash: 'same',
                diagnosticsCount: 1,
                unresolvedTasks: ['T2'],
            },
            {
                ...baseSnapshot,
                timestamp: 3000,
                codeHash: 'same',
                diagnosticsCount: 1,
                unresolvedTasks: ['T3'],
            },
        ];
        const res = assessStagnation({
            history: historyWithErr,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res.isStagnated, true);
        assert.strictEqual(res.reason, 'IDLE_TOO_LONG');
    });
}

function testAssessStagnationNegativePatterns(): void {
    test('進捗変化量>=5%または未解決タスク変更時はNO_PROGRESS_SCOREにならないこと (否定系)', () => {
        const historyWithProgress: SnapshotHistoryItem[] = [
            { ...baseSnapshot, timestamp: 1000, estimatedProgress: 40 },
            { ...baseSnapshot, timestamp: 2000, estimatedProgress: 43 },
            { ...baseSnapshot, timestamp: 3000, estimatedProgress: 46 },
        ];
        const res1 = assessStagnation({
            history: historyWithProgress,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res1.isStagnated, false);

        const historyWithTasks: SnapshotHistoryItem[] = [
            {
                ...baseSnapshot,
                timestamp: 1000,
                estimatedProgress: 45,
                unresolvedTasks: ['Task A', 'Task B'],
            },
            {
                ...baseSnapshot,
                timestamp: 2000,
                estimatedProgress: 45,
                unresolvedTasks: ['Task A', 'Task B'],
            },
            {
                ...baseSnapshot,
                timestamp: 3000,
                estimatedProgress: 45,
                unresolvedTasks: ['Task A'],
            },
        ];
        const res2 = assessStagnation({
            history: historyWithTasks,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(res2.isStagnated, false);
    });

    test('エラー0件ならCODE_CHURN_WITH_ERRORSにならないこと (否定系)', () => {
        const historyNoErrors: SnapshotHistoryItem[] = [
            {
                ...baseSnapshot,
                timestamp: 1000,
                codeHash: 'h1',
                diagnosticsCount: 0,
                estimatedProgress: 40,
            },
            {
                ...baseSnapshot,
                timestamp: 2000,
                codeHash: 'h2',
                diagnosticsCount: 0,
                estimatedProgress: 40,
            },
            {
                ...baseSnapshot,
                timestamp: 3000,
                codeHash: 'h3',
                diagnosticsCount: 0,
                estimatedProgress: 40,
            },
        ];
        const resNoErr = assessStagnation({
            history: historyNoErrors,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.notStrictEqual(resNoErr.reason, 'CODE_CHURN_WITH_ERRORS');
    });

    test('エラー0件ならIDLE_TOO_LONGにならないこと (否定系)', () => {
        const historyNoErr: SnapshotHistoryItem[] = [
            {
                ...baseSnapshot,
                timestamp: 1000,
                codeHash: 'same',
                diagnosticsCount: 0,
                unresolvedTasks: ['T1'],
            },
            {
                ...baseSnapshot,
                timestamp: 2000,
                codeHash: 'same',
                diagnosticsCount: 0,
                unresolvedTasks: ['T2'],
            },
            {
                ...baseSnapshot,
                timestamp: 3000,
                codeHash: 'same',
                diagnosticsCount: 0,
                unresolvedTasks: ['T3'],
            },
        ];
        const resNoErr = assessStagnation({
            history: historyNoErr,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: true,
        });
        assert.strictEqual(resNoErr.isStagnated, false);
    });

    test('ウィンドウ非アクティブ(離席)時はIDLE_TOO_LONGをスキップすること', () => {
        const history: SnapshotHistoryItem[] = [
            {
                ...baseSnapshot,
                timestamp: 1000,
                codeHash: 'same',
                diagnosticsCount: 1,
                unresolvedTasks: ['T1'],
            },
            {
                ...baseSnapshot,
                timestamp: 2000,
                codeHash: 'same',
                diagnosticsCount: 1,
                unresolvedTasks: ['T2'],
            },
            {
                ...baseSnapshot,
                timestamp: 3000,
                codeHash: 'same',
                diagnosticsCount: 1,
                unresolvedTasks: ['T3'],
            },
        ];
        const res = assessStagnation({
            history,
            thresholdN: 3,
            currentTimestamp: 3000,
            snoozeUntilTimestamp: null,
            isDismissed: false,
            isWindowFocused: false,
        });
        assert.strictEqual(res.isStagnated, false);
    });
}

suite('StagnationCalculator Test Suite', () => {
    testCalculateProgressScore();
    suite('assessStagnation', () => {
        testAssessStagnationSuppression();
        testAssessStagnationPositivePatterns();
        testAssessStagnationNegativePatterns();
    });
});
