/**
 * [Why/Intent] LearningConfigStore のMemento読み書き、更新、リセット、イベント通知を網羅検証するテストスイート。
 */
import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import {
    DEFAULT_USER_LEARNING_CONFIG,
    USER_CONFIG_BOUNDS,
} from '../../core/scaffolding/defaultLearningConfig';
import { LearningConfigStore } from '../../core/scaffolding/learningConfigStore';
import type { UserLearningConfig } from '../../types/learningSettings';

/**
 * [Why/Intent] vscode.Mementoのテスト用インメモリスタブ
 */
class MockMemento implements vscode.Memento {
    private readonly _storage = new Map<string, unknown>();

    public keys(): readonly string[] {
        return Array.from(this._storage.keys());
    }

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get<T>(key: string, defaultValue?: T): T | undefined {
        return (this._storage.get(key) as T) ?? defaultValue;
    }

    public update(key: string, value: unknown): Thenable<void> {
        if (value === undefined) {
            this._storage.delete(key);
        } else {
            this._storage.set(key, value);
        }
        return Promise.resolve();
    }
}

suite('LearningConfigStore Test Suite', () => {
    test('ストレージが空の場合、初期値としてDEFAULT_USER_LEARNING_CONFIGが返ること', () => {
        const storage = new MockMemento();
        const store = new LearningConfigStore(storage);
        assert.deepStrictEqual(store.getConfig(), DEFAULT_USER_LEARNING_CONFIG);
        store.dispose();
    });

    test('ストレージに保存済みデータが存在する場合、クランプされて復元されること', () => {
        const storage = new MockMemento();
        void storage.update(LearningConfigStore.STORAGE_KEY, {
            intervalSeconds: 120,
            debounceMs: 999999, // 境界値超過
        });

        const store = new LearningConfigStore(storage);
        const config = store.getConfig();
        assert.strictEqual(config.intervalSeconds, 120);
        assert.strictEqual(config.debounceMs, USER_CONFIG_BOUNDS.DEBOUNCE_MS.MAX); // クランプ
        store.dispose();
    });

    test('updateConfig: パッチが適用され、未指定フィールドが維持され、イベントが発火すること', async () => {
        const storage = new MockMemento();
        const store = new LearningConfigStore(storage);

        let firedConfig: UserLearningConfig | undefined;
        store.onDidChangeConfig((e) => {
            firedConfig = e;
        });

        const updated = await store.updateConfig({
            intervalSeconds: 45,
            defaultDisclosureMode: 'direct',
        });

        assert.strictEqual(updated.intervalSeconds, 45);
        assert.strictEqual(updated.defaultDisclosureMode, 'direct');
        // 未指定フィールドが初期値のまま維持されていること
        assert.strictEqual(updated.debounceMs, DEFAULT_USER_LEARNING_CONFIG.debounceMs);
        assert.strictEqual(
            updated.stagnationThresholdN,
            DEFAULT_USER_LEARNING_CONFIG.stagnationThresholdN,
        );
        assert.strictEqual(firedConfig?.intervalSeconds, 45);

        // Mementoの中身も更新されていること
        const stored = storage.get<UserLearningConfig>(LearningConfigStore.STORAGE_KEY);
        assert.strictEqual(stored?.intervalSeconds, 45);

        store.dispose();
    });

    test('updateConfig: 境界値外の不正入力があった場合も安全にクランプされて永続化・発火されること', async () => {
        const storage = new MockMemento();
        const store = new LearningConfigStore(storage);

        let firedConfig: UserLearningConfig | undefined;
        store.onDidChangeConfig((e) => {
            firedConfig = e;
        });

        const updated = await store.updateConfig({
            intervalSeconds: 99999, // 上限300を超過
            snoozeMinutes: -10, // 下限1未満
        });

        assert.strictEqual(updated.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MAX);
        assert.strictEqual(updated.snoozeMinutes, USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MIN);
        assert.strictEqual(firedConfig?.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MAX);

        const stored = storage.get<UserLearningConfig>(LearningConfigStore.STORAGE_KEY);
        assert.strictEqual(stored?.intervalSeconds, USER_CONFIG_BOUNDS.INTERVAL_SECONDS.MAX);
        assert.strictEqual(stored?.snoozeMinutes, USER_CONFIG_BOUNDS.SNOOZE_MINUTES.MIN);

        store.dispose();
    });

    test('resetConfig: デフォルト設定にリセットされ、Memento更新とイベント発火が行われること', async () => {
        const storage = new MockMemento();
        const store = new LearningConfigStore(storage);

        await store.updateConfig({ intervalSeconds: 90, stagnationThresholdN: 5 });

        let resetFired: UserLearningConfig | undefined;
        store.onDidChangeConfig((e) => {
            resetFired = e;
        });

        const resetResult = await store.resetConfig();
        assert.deepStrictEqual(resetResult, DEFAULT_USER_LEARNING_CONFIG);
        assert.deepStrictEqual(resetFired, DEFAULT_USER_LEARNING_CONFIG);

        const stored = storage.get<UserLearningConfig>(LearningConfigStore.STORAGE_KEY);
        assert.deepStrictEqual(stored, DEFAULT_USER_LEARNING_CONFIG);

        store.dispose();
    });

    test('getConfig: 返り値オブジェクトの変更が内部状態に影響しない不変性を保つこと', () => {
        const storage = new MockMemento();
        const store = new LearningConfigStore(storage);

        const config = store.getConfig();
        config.intervalSeconds = 999;

        assert.strictEqual(
            store.getConfig().intervalSeconds,
            DEFAULT_USER_LEARNING_CONFIG.intervalSeconds,
        );
        store.dispose();
    });
});
