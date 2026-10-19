/**
 * [Why/Intent] LlmBackgroundService の pause / resume 協調制御機能（定期タイマー停止・再開、自動実行スキップ、手動実行許可）を網羅検証するテスト。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { LlmBackgroundService } from '../../core/llmBackgroundService';

/**
 * [Why/Intent] vscode.SecretStorageのテスト用モック
 */
class MockSecretStorage implements vscode.SecretStorage {
    private readonly _storage = new Map<string, string>();
    public readonly onDidChange = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event;

    public get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this._storage.get(key));
    }
    public keys(): Thenable<string[]> {
        return Promise.resolve(Array.from(this._storage.keys()));
    }
    public store(key: string, value: string): Thenable<void> {
        this._storage.set(key, value);
        return Promise.resolve();
    }
    public delete(key: string): Thenable<void> {
        this._storage.delete(key);
        return Promise.resolve();
    }
}

suite('LlmBackgroundService Pause/Resume Test Suite', () => {
    test('pause() 呼び出しで isPaused が true になり resume() で false に復帰すること', () => {
        const service = new LlmBackgroundService(new MockSecretStorage());
        assert.strictEqual(service.isPaused, false);

        service.pause();
        assert.strictEqual(service.isPaused, true);

        service.resume();
        assert.strictEqual(service.isPaused, false);

        service.dispose();
    });

    test('isPaused が true かつ isAuto が true の場合、runAnalysis が即座にリターンしスキップされること', async () => {
        const service = new LlmBackgroundService(new MockSecretStorage());
        service.pause();

        let dashboardUpdated = false;
        service.onDidUpdateDashboard.event(() => {
            dashboardUpdated = true;
        });

        const doc = {
            uri: vscode.Uri.file('/test/path.ts'),
            fileName: '/test/path.ts',
            languageId: 'typescript',
            getText: () => 'const x = 1;',
            version: 1,
        } as unknown as vscode.TextDocument;

        // isAuto = true (定期タイマーやonSaveによる自動実行)
        await service.runAnalysis(doc, true);

        // pause 中の自動実行はスキップされるため、ダッシュボードステータス更新は呼ばれない
        assert.strictEqual(dashboardUpdated, false);
        assert.strictEqual(service.getDashboardState().status, 'idle');

        service.dispose();
    });

    test('isPaused が true であっても、isAuto が false (手動推敲実行) の場合はスキップされず解析処理に進むこと', async () => {
        const service = new LlmBackgroundService(new MockSecretStorage());
        service.pause();

        let dashboardStatus: string | undefined;
        service.onDidUpdateDashboard.event((msg: unknown) => {
            const update = msg as { type?: string; status?: string };
            if (update.type === 'LLM_STATUS_UPDATE') {
                dashboardStatus = update.status;
            }
        });

        const doc = {
            uri: vscode.Uri.file('/test/path.ts'),
            fileName: '/test/path.ts',
            languageId: 'typescript',
            getText: () => 'const x = 1;',
            version: 2,
        } as unknown as vscode.TextDocument;

        // isAuto = false (手動実行: forceAnalyze)
        await service.runAnalysis(doc, false);

        // 手動実行は一時停止中であってもスキップされず、loadingまたはerrorへ状態遷移すること
        assert.notStrictEqual(dashboardStatus, undefined);

        service.dispose();
    });

    test('isPaused が false の通常稼働時は、isAuto が true の自動推敲もスキップされず実行されること', async () => {
        const service = new LlmBackgroundService(new MockSecretStorage());
        // 通常稼働 (isPaused === false)
        assert.strictEqual(service.isPaused, false);

        let dashboardStatus: string | undefined;
        service.onDidUpdateDashboard.event((msg: unknown) => {
            const update = msg as { type?: string; status?: string };
            if (update.type === 'LLM_STATUS_UPDATE') {
                dashboardStatus = update.status;
            }
        });

        const doc = {
            uri: vscode.Uri.file('/test/path.ts'),
            fileName: '/test/path.ts',
            languageId: 'typescript',
            getText: () => 'const x = 1;',
            version: 3,
        } as unknown as vscode.TextDocument;

        // isAuto = true
        await service.runAnalysis(doc, true);

        // 通常稼働時はスキップされず状態更新が走る
        assert.notStrictEqual(dashboardStatus, undefined);

        service.dispose();
    });
});
