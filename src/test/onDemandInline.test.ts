/**
 * [Why/Intent] 非侵襲オンデマンド・インライン機能の拡張機能ホスト単体テストスイート。
 * InterventionHistoryStore（JSON永続化とCRUD）、InlineInterventionDecorator（装飾計算）、
 * PromptBuilder（5大ペルソナプロンプト注入厳格検証）、およびActiveInterventionService（正常系・異常系）を検証する。
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ILlmGateway } from '../core/llm/llmGateway';
import { PromptBuilder } from '../core/llm/promptBuilder';
import { ActiveInterventionService } from '../core/onDemand/activeInterventionService';
import { InlineInterventionDecorator } from '../core/onDemand/inlineInterventionDecorator';
import { InterventionHistoryStore } from '../core/onDemand/interventionHistoryStore';
import type { InterventionDetail, InterventionItem } from '../types/onDemandIntervention';

suite('OnDemand Inline Unit Tests', () => {
    let tmpDir: string;
    let store: InterventionHistoryStore;

    const sampleDetail: InterventionDetail = {
        id: 'int-test-100',
        title: 'forEachをreduceに変更',
        summary: '配列走査を集約して宣言的改善',
        range: {
            start: { line: 10, character: 0 },
            end: { line: 12, character: 5 },
        },
        status: 'pending',
        personaId: 'concise',
        originalCode: 'let s = 0;\nitems.forEach(i => s += i);',
        proposedCode: 'const s = items.reduce((acc, i) => acc + i, 0);',
        createdAt: '2026-11-05T12:00:00.000Z',
        updatedAt: '2026-11-05T12:00:00.000Z',
        chatHistory: [],
    };

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-history-test-'));
        store = new InterventionHistoryStore(tmpDir);
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('InterventionHistoryStore: 介入詳細を保存し、JSONから正しく復元できること', async () => {
        const docUri = 'file:///workspace/test.ts';
        await store.saveIntervention(docUri, sampleDetail);

        const history = await store.getHistory(docUri);
        assert.strictEqual(history.interventions.length, 1);
        assert.strictEqual(history.interventions[0].id, 'int-test-100');
        assert.strictEqual(history.interventions[0].title, 'forEachをreduceに変更');
        assert.strictEqual(history.interventions[0].status, 'pending');

        const historyFilePath = path.join(tmpDir, '.vscode', 'vibecodeease', 'history.json');
        assert.ok(fs.existsSync(historyFilePath));
    });

    test('InterventionHistoryStore: ステータスを applied -> reverted -> dismissed と更新できること', async () => {
        const docUri = 'file:///workspace/test.ts';
        await store.saveIntervention(docUri, sampleDetail);

        const applied = await store.updateStatus(docUri, 'int-test-100', 'applied');
        assert.strictEqual(applied?.status, 'applied');

        const reverted = await store.updateStatus(docUri, 'int-test-100', 'reverted');
        assert.strictEqual(reverted?.status, 'reverted');

        const dismissed = await store.updateStatus(docUri, 'int-test-100', 'dismissed');
        assert.strictEqual(dismissed?.status, 'dismissed');

        const history = await store.getHistory(docUri);
        assert.strictEqual(history.interventions[0].status, 'dismissed');
    });

    test('InterventionHistoryStore: チャット履歴を追加して永続化できること', async () => {
        const docUri = 'file:///workspace/test.ts';
        await store.saveIntervention(docUri, sampleDetail);

        await store.addChatMessage(docUri, 'int-test-100', {
            sender: 'user',
            message: 'for-ofループ版も提示してください',
        });
        await store.addChatMessage(docUri, 'int-test-100', {
            sender: 'ai',
            message: 'for-ofループ版は以下です。',
        });

        const history = await store.getHistory(docUri);
        assert.strictEqual(history.interventions[0].chatHistory.length, 2);
        assert.strictEqual(history.interventions[0].chatHistory[0].sender, 'user');
        assert.strictEqual(history.interventions[0].chatHistory[1].sender, 'ai');
    });

    test('InlineInterventionDecorator: 装飾計算ロジックが状態（pending, applied, reverted, dismissed）に応じて正しく計算されること', () => {
        const decorator = new InlineInterventionDecorator();

        const pendingItem: InterventionItem = { ...sampleDetail, status: 'pending' };
        const appliedItem: InterventionItem = { ...sampleDetail, id: 'int-2', status: 'applied' };
        const revertedItem: InterventionItem = { ...sampleDetail, id: 'int-3', status: 'reverted' };
        const dismissedItem: InterventionItem = {
            ...sampleDetail,
            id: 'int-4',
            status: 'dismissed',
        };

        // 1. pending の検証: ヒートマップあり、pending用Gutterアイコンあり、行末テキストあり
        const decPending = decorator.computeDecorations([pendingItem]);
        assert.strictEqual(decPending.heatmapRanges.length, 1);
        assert.strictEqual(decPending.gutterPendingRanges.length, 1);
        assert.strictEqual(decPending.gutterAppliedRanges.length, 0);
        assert.strictEqual(decPending.afterTextRanges.length, 1);

        // 2. applied の検証: ヒートマップなし、applied用弱Gutterアイコンあり、行末テキストなし
        const decApplied = decorator.computeDecorations([appliedItem]);
        assert.strictEqual(decApplied.heatmapRanges.length, 0);
        assert.strictEqual(decApplied.gutterPendingRanges.length, 0);
        assert.strictEqual(decApplied.gutterAppliedRanges.length, 1);
        assert.strictEqual(decApplied.afterTextRanges.length, 0);

        // 3. reverted の検証: pendingと同様にヒートマップ・電球アイコン復元
        const decReverted = decorator.computeDecorations([revertedItem]);
        assert.strictEqual(decReverted.heatmapRanges.length, 1);
        assert.strictEqual(decReverted.gutterPendingRanges.length, 1);
        assert.strictEqual(decReverted.gutterAppliedRanges.length, 0);
        assert.strictEqual(decReverted.afterTextRanges.length, 1);

        // 4. dismissed の検証: 全装飾消去（全て空配列）
        const decDismissed = decorator.computeDecorations([dismissedItem]);
        assert.strictEqual(decDismissed.heatmapRanges.length, 0);
        assert.strictEqual(decDismissed.gutterPendingRanges.length, 0);
        assert.strictEqual(decDismissed.gutterAppliedRanges.length, 0);
        assert.strictEqual(decDismissed.afterTextRanges.length, 0);
    });

    test('PromptBuilder: 5大ペルソナ（mentor, concise, architect, qa_security, tutor）の固有指示文が厳格に注入されること', () => {
        const testCases = [
            { id: 'mentor' as const, expectedKeyword: '初心者' },
            { id: 'concise' as const, expectedKeyword: '結論ファースト' },
            { id: 'architect' as const, expectedKeyword: 'SOLID' },
            { id: 'qa_security' as const, expectedKeyword: '境界値' },
            { id: 'tutor' as const, expectedKeyword: 'ソクラテス' },
        ];

        for (const tc of testCases) {
            const prompt = PromptBuilder.buildChatPrompt(tc.id, sampleDetail, '改善案を提示して');
            assert.ok(
                prompt.includes(tc.expectedKeyword),
                `ペルソナ "${tc.id}" のプロンプトにキーワード "${tc.expectedKeyword}" が含まれていません`,
            );
            assert.ok(prompt.includes('改善案を提示して'));
            assert.ok(prompt.includes(sampleDetail.title));
        }
    });

    test('ActiveInterventionService: 逆指名解析の正常系（指示に基づくレコード生成・永続化）', async () => {
        const fakeGateway: ILlmGateway = {
            generateStructured: async <T>() => {
                await Promise.resolve();
                return {
                    title: '逆指名リファクタ',
                    summary: 'ユーザー指示に基づく修正',
                    proposedCode: 'const x = 42;',
                } as unknown as T;
            },
            embedBatch: async () => {
                await Promise.resolve();
                return [];
            },
            getAvailableModels: async () => {
                await Promise.resolve();
                return ['fake-model'];
            },
        };

        const activeService = new ActiveInterventionService(fakeGateway, store);
        const mockEditor = {
            document: {
                uri: vscode.Uri.parse('file:///workspace/sample.ts'),
                getText: () => 'var x = 42;',
            },
            selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 11)),
        } as unknown as vscode.TextEditor;

        const resultId = await activeService.requestActiveInterventionWithInstruction(
            mockEditor,
            'varをconstに変更して',
        );

        assert.ok(resultId);
        const history = await store.getHistory('file:///workspace/sample.ts');
        assert.strictEqual(history.interventions.length, 1);
        assert.strictEqual(history.interventions[0].id, resultId);
        assert.strictEqual(history.interventions[0].title, '逆指名リファクタ');
    });

    test('ActiveInterventionService: 選択範囲が空の場合に処理が中断されundefinedを返すこと（異常系）', async () => {
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

        const activeService = new ActiveInterventionService(fakeGateway, store);
        const mockEditor = {
            document: {
                uri: vscode.Uri.parse('file:///workspace/sample.ts'),
                getText: () => 'var x = 42;',
            },
            // 空の選択範囲 (start === end)
            selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
        } as unknown as vscode.TextEditor;

        const result = await activeService.requestActiveInterventionWithInstruction(
            mockEditor,
            '指示テキスト',
        );

        assert.strictEqual(result, undefined);
    });
});
