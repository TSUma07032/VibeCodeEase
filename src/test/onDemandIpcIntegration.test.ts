/**
 * [Why/Intent] 拡張機能ホストとWebview間のIPCメッセージ結合テストスイート。
 * OnDemandIpcHandler を通じて APPLY_INTERVENTION / UNDO_INTERVENTION / DISCARD_INTERVENTION /
 * SEND_CHAT_MESSAGE の完全往復フローと排他制御（循環介入防止フラグ）を厳格に検証する。
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ILlmGateway } from '../core/llm/llmGateway';
import { InterventionHistoryStore } from '../core/onDemand/interventionHistoryStore';
import { OnDemandIpcHandler } from '../core/onDemand/onDemandIpcHandler';
import type { InterventionDetail } from '../types/onDemandIntervention';
import type { ExtensionToWebviewInterventionMessage } from '../types/onDemandIpcMessages';

suite('OnDemand IPC Integration Tests', () => {
    let tmpDir: string;
    let store: InterventionHistoryStore;

    const sampleDetail: InterventionDetail = {
        id: 'ipc-test-001',
        title: '型アノテーションの追加',
        summary: '引数にnumber型を追加',
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 25 },
        },
        status: 'pending',
        personaId: 'concise',
        originalCode: 'function add(a, b) {',
        proposedCode: 'function add(a: number, b: number): number {',
        createdAt: '2026-11-05T12:00:00.000Z',
        updatedAt: '2026-11-05T12:00:00.000Z',
        chatHistory: [],
    };

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ipc-test-'));
        store = new InterventionHistoryStore(tmpDir);
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('APPLY_INTERVENTION: エディタ置換実行、store更新(applied)、SYNC_HISTORY_STATE送信、排他フラグ保護', async () => {
        const docUri = 'file:///workspace/math.ts';
        await store.saveIntervention(docUri, sampleDetail);

        const postedMessages: ExtensionToWebviewInterventionMessage[] = [];
        let appliedOldText = '';
        let appliedNewText = '';
        let flagDuringApply = false;

        const fakeGateway: ILlmGateway = {
            generateStructured: async <T>() => {
                await Promise.resolve();
                return {} as unknown as T;
            },
            embedBatch: async () => {
                await Promise.resolve();
                return [];
            },
            getAvailableModels: async () => {
                await Promise.resolve();
                return [];
            },
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: fakeGateway,
            postMessage: (msg) => postedMessages.push(msg),
            applyEditorEdit: async (_uri, oldText, newText) => {
                flagDuringApply = handler.isApplyingIntervention;
                appliedOldText = oldText;
                appliedNewText = newText;
                await Promise.resolve();
                return true;
            },
        });

        assert.strictEqual(handler.isApplyingIntervention, false);

        await handler.handleMessage(
            { type: 'APPLY_INTERVENTION', payload: { interventionId: 'ipc-test-001' } },
            docUri,
        );

        // 1. 排他フラグが置換中に true になり、終了後に false に戻ること
        assert.strictEqual(flagDuringApply, true);
        assert.strictEqual(handler.isApplyingIntervention, false);

        // 2. エディタ置換のテキスト検証
        assert.strictEqual(appliedOldText, sampleDetail.originalCode);
        assert.strictEqual(appliedNewText, sampleDetail.proposedCode);

        // 3. store のステータスが applied に更新されていること
        const history = await store.getHistory(docUri);
        assert.strictEqual(history.interventions[0].status, 'applied');

        // 4. SYNC_HISTORY_STATE が配信されていること
        assert.ok(postedMessages.some((m) => m.type === 'SYNC_HISTORY_STATE'));
        const syncMsg = postedMessages.find((m) => m.type === 'SYNC_HISTORY_STATE');
        if (syncMsg?.type === 'SYNC_HISTORY_STATE') {
            assert.strictEqual(syncMsg.payload.interventions[0].status, 'applied');
        }
    });

    test('UNDO_INTERVENTION: 元コードへロールバック置換、store更新(reverted)、SYNC_HISTORY_STATE送信', async () => {
        const docUri = 'file:///workspace/math.ts';
        await store.saveIntervention(docUri, { ...sampleDetail, status: 'applied' });

        const postedMessages: ExtensionToWebviewInterventionMessage[] = [];
        let appliedOldText = '';
        let appliedNewText = '';

        const fakeGateway: ILlmGateway = {
            generateStructured: async <T>() => {
                await Promise.resolve();
                return {} as unknown as T;
            },
            embedBatch: async () => {
                await Promise.resolve();
                return [];
            },
            getAvailableModels: async () => {
                await Promise.resolve();
                return [];
            },
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: fakeGateway,
            postMessage: (msg) => postedMessages.push(msg),
            applyEditorEdit: async (_uri, oldText, newText) => {
                appliedOldText = oldText;
                appliedNewText = newText;
                await Promise.resolve();
                return true;
            },
        });

        await handler.handleMessage(
            { type: 'UNDO_INTERVENTION', payload: { interventionId: 'ipc-test-001' } },
            docUri,
        );

        // ロールバック: proposedCode -> originalCode
        assert.strictEqual(appliedOldText, sampleDetail.proposedCode);
        assert.strictEqual(appliedNewText, sampleDetail.originalCode);

        const history = await store.getHistory(docUri);
        assert.strictEqual(history.interventions[0].status, 'reverted');

        const syncMsg = postedMessages.find((m) => m.type === 'SYNC_HISTORY_STATE');
        if (syncMsg?.type === 'SYNC_HISTORY_STATE') {
            assert.strictEqual(syncMsg.payload.interventions[0].status, 'reverted');
        }
    });

    test('DISCARD_INTERVENTION: 提案破棄、store更新(dismissed)、SYNC_HISTORY_STATE送信', async () => {
        const docUri = 'file:///workspace/math.ts';
        await store.saveIntervention(docUri, sampleDetail);

        const postedMessages: ExtensionToWebviewInterventionMessage[] = [];
        const fakeGateway: ILlmGateway = {
            generateStructured: async <T>() => {
                await Promise.resolve();
                return {} as unknown as T;
            },
            embedBatch: async () => {
                await Promise.resolve();
                return [];
            },
            getAvailableModels: async () => {
                await Promise.resolve();
                return [];
            },
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: fakeGateway,
            postMessage: (msg) => postedMessages.push(msg),
            applyEditorEdit: async () => {
                await Promise.resolve();
                return true;
            },
        });

        await handler.handleMessage(
            { type: 'DISCARD_INTERVENTION', payload: { interventionId: 'ipc-test-001' } },
            docUri,
        );

        const history = await store.getHistory(docUri);
        assert.strictEqual(history.interventions[0].status, 'dismissed');

        const syncMsg = postedMessages.find((m) => m.type === 'SYNC_HISTORY_STATE');
        if (syncMsg?.type === 'SYNC_HISTORY_STATE') {
            assert.strictEqual(syncMsg.payload.interventions[0].status, 'dismissed');
        }
    });

    test('チャット正常系往復: SET_CHAT_LOADING(true) -> Gateway呼出 -> RECEIVE_CHAT_MESSAGE -> SET_CHAT_LOADING(false)', async () => {
        const docUri = 'file:///workspace/math.ts';
        await store.saveIntervention(docUri, sampleDetail);

        const postedMessages: ExtensionToWebviewInterventionMessage[] = [];
        const fakeGateway: ILlmGateway = {
            generateStructured: async <T>() => {
                await Promise.resolve();
                return {
                    text: 'number型にすることでランタイムエラーを防止します。',
                } as unknown as T;
            },
            embedBatch: async () => {
                await Promise.resolve();
                return [];
            },
            getAvailableModels: async () => {
                await Promise.resolve();
                return [];
            },
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: fakeGateway,
            postMessage: (msg) => postedMessages.push(msg),
            applyEditorEdit: async () => {
                await Promise.resolve();
                return true;
            },
        });

        await handler.handleMessage(
            {
                type: 'SEND_CHAT_MESSAGE',
                payload: {
                    interventionId: 'ipc-test-001',
                    personaId: 'concise',
                    text: 'なぜnumber型にするのですか？',
                },
            },
            docUri,
        );

        assert.strictEqual(postedMessages.length, 3);
        assert.strictEqual(postedMessages[0].type, 'SET_CHAT_LOADING');
        if (postedMessages[0].type === 'SET_CHAT_LOADING') {
            assert.strictEqual(postedMessages[0].payload.isLoading, true);
        }

        assert.strictEqual(postedMessages[1].type, 'RECEIVE_CHAT_MESSAGE');
        if (postedMessages[1].type === 'RECEIVE_CHAT_MESSAGE') {
            assert.ok(postedMessages[1].payload.message.message.includes('number型'));
        }

        assert.strictEqual(postedMessages[2].type, 'SET_CHAT_LOADING');
        if (postedMessages[2].type === 'SET_CHAT_LOADING') {
            assert.strictEqual(postedMessages[2].payload.isLoading, false);
        }
    });

    test('チャット異常系: LLM失敗時にエラーメッセージをRECEIVE_CHAT_MESSAGE送信しローディング解除すること', async () => {
        const docUri = 'file:///workspace/math.ts';
        await store.saveIntervention(docUri, sampleDetail);

        const postedMessages: ExtensionToWebviewInterventionMessage[] = [];
        const failingGateway: ILlmGateway = {
            generateStructured: () => Promise.reject(new Error('Network timeout')),
            embedBatch: async () => {
                await Promise.resolve();
                return [];
            },
            getAvailableModels: async () => {
                await Promise.resolve();
                return [];
            },
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: failingGateway,
            postMessage: (msg) => postedMessages.push(msg),
            applyEditorEdit: async () => {
                await Promise.resolve();
                return true;
            },
        });

        await handler.handleMessage(
            {
                type: 'SEND_CHAT_MESSAGE',
                payload: {
                    interventionId: 'ipc-test-001',
                    personaId: 'concise',
                    text: 'エラーテスト',
                },
            },
            docUri,
        );

        // 1. SET_CHAT_LOADING: true
        // 2. RECEIVE_CHAT_MESSAGE (エラーメッセージ)
        // 3. SET_CHAT_LOADING: false
        assert.strictEqual(postedMessages.length, 3);
        assert.strictEqual(postedMessages[0].type, 'SET_CHAT_LOADING');
        assert.strictEqual(postedMessages[1].type, 'RECEIVE_CHAT_MESSAGE');
        if (postedMessages[1].type === 'RECEIVE_CHAT_MESSAGE') {
            assert.ok(postedMessages[1].payload.message.message.includes('エラー'));
        }
        assert.strictEqual(postedMessages[2].type, 'SET_CHAT_LOADING');
        if (postedMessages[2].type === 'SET_CHAT_LOADING') {
            assert.strictEqual(postedMessages[2].payload.isLoading, false);
        }
    });
});
