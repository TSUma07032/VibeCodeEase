/**
 * [Why/Intent] 変更方針修正（Refine Intervention）機能における
 * プロンプト生成、レスポンススキーマ、ストア永続化、正常系/異常系のIPC通信往復を検証するテストスイート。
 */
import * as assert from 'node:assert';
import type { ILlmGateway } from '../core/llm/llmGateway';
import { PromptBuilder, REFINE_INTERVENTION_RESPONSE_SCHEMA } from '../core/llm/promptBuilder';
import { InterventionHistoryStore } from '../core/onDemand/interventionHistoryStore';
import { OnDemandIpcHandler } from '../core/onDemand/onDemandIpcHandler';
import type { InterventionDetail } from '../types/onDemandIntervention';
import type { ExtensionToWebviewInterventionMessage } from '../types/onDemandIpcMessages';

suite('OnDemand Refine Intervention Test Suite', () => {
    const mockDetail: InterventionDetail = {
        id: 'test-refine-1',
        title: '型安全性の向上',
        summary: 'any型を明示的な型へ変更します',
        originalCode: 'function get(): any { return {}; }',
        proposedCode: 'function get(): UserProfile { return {}; }',
        range: { start: { line: 5, character: 0 }, end: { line: 6, character: 0 } },
        status: 'pending',
        personaId: 'mentor',
        createdAt: '2026-11-05T00:00:00Z',
        updatedAt: '2026-11-05T00:00:00Z',
        chatHistory: [],
    };

    test('buildRefinePrompt: 元コード、現行提案コード、ユーザー指示、およびJSONスキーマ要求が含まれること', () => {
        const prompt = PromptBuilder.buildRefinePrompt(
            'mentor',
            mockDetail,
            'readonly修飾子も付けてください',
        );

        assert.ok(prompt.includes('【ペルソナ: 初心者向けメンター】'));
        assert.ok(prompt.includes('function get(): any { return {}; }'));
        assert.ok(prompt.includes('function get(): UserProfile { return {}; }'));
        assert.ok(prompt.includes('readonly修飾子も付けてください'));
        assert.ok(prompt.includes('proposedCode'));
        assert.ok(prompt.includes('summary'));
    });

    test('REFINE_INTERVENTION_RESPONSE_SCHEMA: proposedCodeとsummaryが定義されていること', () => {
        assert.strictEqual(REFINE_INTERVENTION_RESPONSE_SCHEMA.type, 'object');
        const props = REFINE_INTERVENTION_RESPONSE_SCHEMA.properties as Record<
            string,
            { type: string }
        >;
        assert.ok(props.proposedCode);
        assert.ok(props.summary);
        assert.deepStrictEqual(REFINE_INTERVENTION_RESPONSE_SCHEMA.required, [
            'proposedCode',
            'summary',
        ]);
    });

    test('InterventionHistoryStore.updateProposal: 提案コードとサマリーが正常に更新されること', async () => {
        const store = new InterventionHistoryStore(process.cwd());
        const docUri = 'file:///test/doc.ts';

        await store.saveIntervention(docUri, mockDetail);

        const updated = await store.updateProposal(docUri, 'test-refine-1', {
            proposedCode: 'function get(): Readonly<UserProfile> { return {}; }',
            summary: 'readonly修飾子を追加して型安全性を強化しました',
        });

        assert.ok(updated);
        assert.strictEqual(
            updated.proposedCode,
            'function get(): Readonly<UserProfile> { return {}; }',
        );
        assert.strictEqual(updated.summary, 'readonly修飾子を追加して型安全性を強化しました');
    });

    test('OnDemandIpcHandler.handleRefine: LLM呼び出しとUPDATE_INTERVENTION_DETAIL送信が正常に行われること', async () => {
        const store = new InterventionHistoryStore(process.cwd());
        const docUri = 'file:///test/doc2.ts';
        await store.saveIntervention(docUri, mockDetail);

        const sentMessages: ExtensionToWebviewInterventionMessage[] = [];
        const mockGateway: ILlmGateway = {
            generateStructured: <T>() =>
                Promise.resolve({
                    proposedCode: 'function get(): Readonly<UserProfile> { return {}; }',
                    summary: 'readonly修飾子を追加しました',
                } as unknown as T),
            embedBatch: () => Promise.resolve([]),
            getAvailableModels: () => Promise.resolve([]),
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: mockGateway,
            postMessage: (msg) => sentMessages.push(msg),
            applyEditorEdit: () => Promise.resolve(true),
        });

        await handler.handleRefine(docUri, {
            interventionId: 'test-refine-1',
            userInstruction: 'readonly修飾子を付けて',
            personaId: 'concise',
        });

        // ローディング開始、更新メッセージ、ローディング終了が送信されたことを検証
        const hasStartLoading = sentMessages.some(
            (m) => m.type === 'SET_REFINE_LOADING' && m.payload.isLoading === true,
        );
        const hasUpdate = sentMessages.some(
            (m) =>
                m.type === 'UPDATE_INTERVENTION_DETAIL' &&
                m.payload.detail.proposedCode ===
                    'function get(): Readonly<UserProfile> { return {}; }',
        );
        const hasEndLoading = sentMessages.some(
            (m) => m.type === 'SET_REFINE_LOADING' && m.payload.isLoading === false,
        );

        assert.ok(hasStartLoading, 'SET_REFINE_LOADING true が送信されること');
        assert.ok(hasUpdate, 'UPDATE_INTERVENTION_DETAIL が送信されること');
        assert.ok(hasEndLoading, 'SET_REFINE_LOADING false が送信されること');
    });

    test('OnDemandIpcHandler.handleRefine: LLM呼び出し失敗時にSET_REFINE_LOADING（エラー付与）が送信されること', async () => {
        const store = new InterventionHistoryStore(process.cwd());
        const docUri = 'file:///test/doc3.ts';
        await store.saveIntervention(docUri, mockDetail);

        const sentMessages: ExtensionToWebviewInterventionMessage[] = [];
        const mockFaultyGateway: ILlmGateway = {
            generateStructured: () => Promise.reject(new Error('LLM connection timed out')),
            embedBatch: () => Promise.resolve([]),
            getAvailableModels: () => Promise.resolve([]),
        };

        const handler = new OnDemandIpcHandler({
            historyStore: store,
            gateway: mockFaultyGateway,
            postMessage: (msg) => sentMessages.push(msg),
            applyEditorEdit: () => Promise.resolve(true),
        });

        await handler.handleRefine(docUri, {
            interventionId: 'test-refine-1',
            userInstruction: 'エラーを発生させる指示',
            personaId: 'mentor',
        });

        const hasErrorLoading = sentMessages.some(
            (m) =>
                m.type === 'SET_REFINE_LOADING' &&
                m.payload.isLoading === false &&
                m.payload.error === 'AIによる再推敲に失敗しました',
        );

        assert.ok(hasErrorLoading, 'SET_REFINE_LOADING (errorあり) が送信されること');
    });
});
