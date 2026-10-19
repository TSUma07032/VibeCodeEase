/**
 * [Why/Intent] 実際のGoogle Gemini APIとの通信を検証する統合テストスイート。
 * モックテストでは検知できないAPI仕様変更、レスポンススキーマの不整合、無効キーによるエラーハンドリングを
 * 実通信を通して検証し、LLM連携機能の堅牢性を担保する。
 * 使い捨てAPIキーは環境変数 TEST_GEMINI_API_KEY から注入され、未設定時はテストを安全にスキップする。
 */
import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { GeminiClient } from '../core/llm/geminiClient';
import { INTERVENTION_RESPONSE_SCHEMA } from '../core/llm/promptBuilder';

/**
 * [Why/Intent] Gemini API実通信時のレスポンス構造を検証するためのインターフェース
 */
interface ExpectedInterventionResponse {
    summary: string;
    edits: Array<{
        oldText?: string;
        originalText?: string;
        newText: string;
        category?: string;
        reason?: string;
    }>;
}

suite('GeminiClient Live Integration Test Suite', function () {
    // 外部APIとの通信遅延およびVS Codeテスト起動オーバーヘッドを考慮してタイムアウトを60秒に設定
    this.timeout(60000);

    let client: GeminiClient;
    const apiKey = process.env.TEST_GEMINI_API_KEY;

    /**
     * [Why/Intent] テスト用のダミーCancellationTokenを生成するヘルパー関数
     */
    function createDummyToken(isCancelled = false): vscode.CancellationToken {
        return {
            isCancellationRequested: isCancelled,
            onCancellationRequested: (listener: (e: unknown) => unknown) => {
                if (isCancelled) {
                    listener(undefined);
                }
                return { dispose: () => {} };
            },
        };
    }

    suiteSetup(function () {
        if (!apiKey) {
            console.info('Skipping live Gemini tests: TEST_GEMINI_API_KEY is not set');
            this.skip();
        }
        client = new GeminiClient();
    });

    test('正常系: generate によるコード推敲プラン生成とスキーマ準拠レスポンスの取得', async function () {
        this.timeout(60000);
        if (!apiKey) {
            this.skip();
            return;
        }

        const prompt =
            '次のTypeScriptコードのタイポを検出してください: export functon calculate() { return 1; }';
        const dummyToken = createDummyToken(false);

        const res = (await client.generate({
            apiKey,
            prompt,
            token: dummyToken,
            modelName: 'gemini-2.5-flash',
            responseSchema: INTERVENTION_RESPONSE_SCHEMA,
        })) as ExpectedInterventionResponse;

        assert.ok(res, 'レスポンスが取得できること');
        assert.strictEqual(typeof res.summary, 'string', 'summaryが文字列であること');
        assert.ok(res.summary.length > 0, 'summaryが空文字でないこと');
        assert.ok(Array.isArray(res.edits), 'editsが配列であること');
        assert.ok(res.edits.length >= 1, 'editsが1件以上含まれること');

        const typoEdit = res.edits.find(
            (edit) =>
                (edit.oldText === 'functon' || edit.originalText === 'functon') &&
                edit.newText === 'function',
        );
        assert.ok(typoEdit, 'functon から function への修正が含まれること');
    });

    test('正常系: embedBatch によるテキストの一括ベクトル生成', async function () {
        if (!apiKey) {
            this.skip();
            return;
        }

        const texts = ['const value = 42;', 'function sample() { return true; }'];
        const dummyToken = createDummyToken(false);

        const embeddings = await client.embedBatch({
            apiKey,
            texts,
            token: dummyToken,
            modelName: 'gemini-embedding-001',
        });

        assert.ok(Array.isArray(embeddings), 'embeddingsが配列であること');
        assert.strictEqual(embeddings.length, 2, '入力テキスト数と同数のベクトルが返ること');

        for (const emb of embeddings) {
            assert.ok(Array.isArray(emb), '各ベクトルが配列であること');
            assert.ok(emb.length > 0, 'ベクトル次元数が1以上であること');
            assert.strictEqual(typeof emb[0], 'number', 'ベクトル要素が数値であること');
        }
    });

    test('異常系: 無効なAPIキーでの呼び出し時にエラーがスローされること', async function () {
        if (!apiKey) {
            this.skip();
            return;
        }

        const dummyToken = createDummyToken(false);
        const invalidClient = new GeminiClient();

        await assert.rejects(
            async () => {
                await invalidClient.generate({
                    apiKey: 'INVALID_DUMMY_GEMINI_API_KEY_99999',
                    prompt: 'hello',
                    token: dummyToken,
                    modelName: 'gemini-2.5-flash',
                });
            },
            (err: Error) => {
                const messageMatches =
                    /Geminiのモデル一覧取得に失敗しました.*HTTP (400|403)/.test(err.message) ||
                    /失敗しました.*HTTP (400|403)/.test(err.message);
                assert.ok(
                    messageMatches,
                    `エラーメッセージが期待パターンに一致すること: ${err.message}`,
                );
                return true;
            },
        );
    });

    test('異常系: 事前キャンセル状態のCancellationTokenでリクエストが中止されること', async function () {
        if (!apiKey) {
            this.skip();
            return;
        }

        const cancelledToken = createDummyToken(true);

        await assert.rejects(async () => {
            await client.generate({
                apiKey,
                prompt: 'hello',
                token: cancelledToken,
                modelName: 'gemini-2.5-flash',
            });
        });
    });
});
