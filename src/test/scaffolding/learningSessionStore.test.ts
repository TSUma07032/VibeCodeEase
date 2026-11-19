import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { LEARNING_CONFIG } from '../../core/scaffolding/defaultLearningConfig';
import { LearningSessionStore } from '../../core/scaffolding/learningSessionStore';
import type {
    LearningSessionState,
    ShadowPredictionResult,
    SnapshotHistoryItem,
} from '../../types/learningScaffolding';

/**
 * [Why/Intent] テスト用のインメモリ Memento モック。
 */
class MockMemento implements vscode.Memento {
    public storage = new Map<string, unknown>();

    public keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.storage.get(key) as T) ?? defaultValue;
    }

    public update(key: string, value: unknown): Thenable<void> {
        this.storage.set(key, value);
        return Promise.resolve();
    }
}

suite('LearningSessionStore Test Suite', () => {
    let memento: MockMemento;
    let store: LearningSessionStore;

    setup(() => {
        memento = new MockMemento();
        store = new LearningSessionStore(memento);
    });

    test('初期状態は empty であり、履歴が空であること', () => {
        const state = store.getState();
        assert.strictEqual(state.status, 'empty');
        assert.strictEqual(state.disclosureMode, 'stepByStep');
        assert.strictEqual(state.unlockedLevel, 1);
        assert.strictEqual(state.history.length, 0);
        assert.strictEqual(store.getHistory().length, 0);
    });

    test('Mementoに保存済みデータが存在する場合、コンストラクタで正しく状態が復元されること', () => {
        const savedState: LearningSessionState = {
            taskId: 'saved-task',
            taskDescription: '復元タスク',
            learningGoal: '復元目標',
            status: 'success',
            disclosureMode: 'direct',
            unlockedLevel: 4,
            latestPrediction: null,
            assessment: {
                isStagnated: false,
                consecutiveStagnantCount: 0,
                reason: 'NONE',
                confidence: 0,
            },
            snoozeUntilTimestamp: null,
            isDismissed: false,
            lastUpdatedTimestamp: 1000,
            history: [],
        };
        memento.storage.set(LEARNING_CONFIG.STORAGE_KEY, savedState);

        const restoredStore = new LearningSessionStore(memento);
        const state = restoredStore.getState();
        assert.strictEqual(state.taskId, 'saved-task');
        assert.strictEqual(state.taskDescription, '復元タスク');
        assert.strictEqual(state.disclosureMode, 'direct');
        assert.strictEqual(state.unlockedLevel, 4);
    });

    test('startSession: loading 状態になり、タスクと目標が設定され、Mementoに保存されること', () => {
        let firedState: LearningSessionState | undefined;
        store.onDidChangeState((s) => {
            firedState = s;
        });

        store.startSession({ taskDescription: 'タスクA', learningGoal: '目標B' });

        const state = store.getState();
        assert.strictEqual(state.status, 'loading');
        assert.strictEqual(state.taskDescription, 'タスクA');
        assert.strictEqual(state.learningGoal, '目標B');
        assert.ok(state.taskId.length > 0);
        assert.strictEqual(firedState?.status, 'loading');

        // Memento保存の検証
        const saved = memento.get<LearningSessionState>(LEARNING_CONFIG.STORAGE_KEY);
        assert.strictEqual(saved?.status, 'loading');
        assert.strictEqual(saved?.taskDescription, 'タスクA');
    });

    test('setPrediction: success 状態になり、最新予想が反映されること', () => {
        store.startSession({ taskDescription: 'タスク', learningGoal: '目標' });

        const prediction: ShadowPredictionResult = {
            milestones: [],
            predictedCompleteCode: 'const a = 1;',
            unresolvedKeyTasks: [],
            stagnationReasonHint: 'None',
            scaffoldingLevels: {
                level1Perspective: 'P',
                level2Concept: 'C',
                level3SkeletonCode: 'S',
                level4CompleteDiff: 'D',
            },
            diagnosticPenalty: 0,
            estimatedProgress: 50,
            timestamp: Date.now(),
            codeHash: 'hash-xyz',
        };

        store.setPrediction(prediction);

        const state = store.getState();
        assert.strictEqual(state.status, 'success');
        assert.strictEqual(state.latestPrediction?.estimatedProgress, 50);
        assert.strictEqual(state.latestPrediction?.predictedCompleteCode, 'const a = 1;');
    });

    test('setError: statusがerrorになり、メッセージとコードが設定・通知されること', () => {
        let firedState: LearningSessionState | undefined;
        store.onDidChangeState((s) => {
            firedState = s;
        });

        store.setError('API Key is missing', 'AUTH_MISSING');

        const state = store.getState();
        assert.strictEqual(state.status, 'error');
        assert.strictEqual(state.errorMessage, 'API Key is missing');
        assert.strictEqual(state.errorCode, 'AUTH_MISSING');
        assert.strictEqual(firedState?.status, 'error');
        assert.strictEqual(firedState?.errorCode, 'AUTH_MISSING');
    });

    test('addHistoryItem: 履歴が追加され、最大20件を超えた場合はFIFOで古いものが削除されること', () => {
        for (let i = 0; i < 25; i++) {
            const item: SnapshotHistoryItem = {
                timestamp: i * 1000,
                estimatedProgress: i,
                codeHash: `hash-${i}`,
                unresolvedTasks: [],
                diagnosticsCount: 0,
            };
            store.addHistoryItem(item);
        }

        const history = store.getHistory();
        assert.strictEqual(history.length, 20);
        assert.strictEqual(history[0].estimatedProgress, 5); // 0〜4は破棄
        assert.strictEqual(history[19].estimatedProgress, 24);
        assert.strictEqual(store.getState().history.length, 20);
    });

    test('snooze: 指定時間後のタイムスタンプが設定され、停滞フラグが解除されること', () => {
        store.setAssessment({
            isStagnated: true,
            consecutiveStagnantCount: 3,
            reason: 'NO_PROGRESS_SCORE',
            confidence: 0.9,
        });
        assert.strictEqual(store.getState().assessment.isStagnated, true);

        const now = Date.now();
        store.snooze(3); // 3分

        const state = store.getState();
        assert.strictEqual(state.assessment.isStagnated, false);
        assert.ok((state.snoozeUntilTimestamp ?? 0) >= now + 179000);
    });

    test('dismiss: isDismissedがtrueになり、停滞フラグが解除されること', () => {
        store.setAssessment({
            isStagnated: true,
            consecutiveStagnantCount: 3,
            reason: 'NO_PROGRESS_SCORE',
            confidence: 0.9,
        });
        store.dismiss();

        const state = store.getState();
        assert.strictEqual(state.isDismissed, true);
        assert.strictEqual(state.assessment.isStagnated, false);
    });

    test('setDisclosureMode: directおよびstepByStepの切り替えが正しく反映されること', () => {
        store.setDisclosureMode('direct');
        assert.strictEqual(store.getState().disclosureMode, 'direct');
        assert.strictEqual(store.getState().unlockedLevel, 4);

        store.setDisclosureMode('stepByStep');
        assert.strictEqual(store.getState().disclosureMode, 'stepByStep');
    });

    test('unlockNextLevel: 1から4まで順次進み、4で上限になること', () => {
        assert.strictEqual(store.getState().unlockedLevel, 1);
        store.unlockNextLevel();
        assert.strictEqual(store.getState().unlockedLevel, 2);
        store.unlockNextLevel();
        assert.strictEqual(store.getState().unlockedLevel, 3);
        store.unlockNextLevel();
        assert.strictEqual(store.getState().unlockedLevel, 4);
        store.unlockNextLevel();
        assert.strictEqual(store.getState().unlockedLevel, 4); // 上限
    });

    test('unlockAll: 直ちにレベル4に遷移すること', () => {
        store.unlockAll();
        assert.strictEqual(store.getState().unlockedLevel, 4);
    });

    test('stopSession: 初期状態へ完全にリセットされること', () => {
        store.startSession({ taskDescription: 'T', learningGoal: 'G' });
        store.unlockNextLevel();
        store.stopSession();

        const state = store.getState();
        assert.strictEqual(state.status, 'empty');
        assert.strictEqual(state.taskDescription, '');
        assert.strictEqual(state.unlockedLevel, 1);
    });
});
