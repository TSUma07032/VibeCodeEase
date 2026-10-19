import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { GeminiClient } from '../core/llm/geminiClient';
import { VscodeLmClient } from '../core/llm/vscodeLmClient';
import { LlmBackgroundService } from '../core/llmBackgroundService';
import type { LlmInterventionService } from '../core/llmInterventionService';
import { LearningBackgroundService } from '../core/scaffolding/learningBackgroundService';
import { LearningSessionStore } from '../core/scaffolding/learningSessionStore';

class InMemoryMemento implements vscode.Memento {
    private _map = new Map<string, unknown>();
    public keys(): readonly string[] {
        return Array.from(this._map.keys());
    }
    public get<T>(key: string, defaultValue?: T): T {
        return (this._map.has(key) ? this._map.get(key) : defaultValue) as T;
    }
    public update(key: string, value: unknown): Thenable<void> {
        this._map.set(key, value);
        return Promise.resolve();
    }
}

function registerGeminiAndVscodeLmTests(): void {
    test('GeminiClient が利用可能モデル自動検出・generate・embedBatch(gemini-embedding-001)を処理すること', async () => {
        const client = new GeminiClient();
        const requestedUrls: string[] = [];

        (
            client as unknown as {
                request: (params: {
                    urlString: string;
                }) => Promise<{ statusCode: number; body: string }>;
            }
        ).request = ({ urlString }) => {
            requestedUrls.push(urlString);
            if (urlString.includes('batchEmbedContents')) {
                return Promise.resolve({
                    statusCode: 200,
                    body: JSON.stringify({
                        embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
                    }),
                });
            }
            if (urlString.includes(':generateContent')) {
                return Promise.resolve({
                    statusCode: 200,
                    body: JSON.stringify({
                        candidates: [
                            { content: { parts: [{ text: '{"summary":"ok","edits":[]}' }] } },
                        ],
                    }),
                });
            }
            return Promise.resolve({
                statusCode: 200,
                body: JSON.stringify({
                    models: [
                        {
                            name: 'models/gemini-2.5-flash',
                            supportedGenerationMethods: ['generateContent'],
                        },
                    ],
                }),
            });
        };

        const cts = new vscode.CancellationTokenSource();
        const res = await client.generate({
            prompt: 'test',
            apiKey: 'dummy-key',
            token: cts.token,
            modelName: 'gemini-3.5-flash-lite',
        });
        assert.deepStrictEqual(res, { summary: 'ok', edits: [] });

        const embeddings = await client.embedBatch({
            texts: ['hello', 'world'],
            apiKey: 'dummy-key',
            token: cts.token,
        });
        assert.strictEqual(embeddings.length, 2);
        assert.ok(
            requestedUrls.some((u) => u.includes('models/gemini-embedding-001:batchEmbedContents')),
        );
        cts.dispose();
    });

    test('VscodeLmClient が Markdown コードフェンス付き JSON を正しくパースすること', async () => {
        const originalSelect = vscode.lm?.selectChatModels;
        const mockModel = {
            family: 'copilot',
            id: 'copilot-gpt',
            name: 'Copilot',
            sendRequest: () =>
                Promise.resolve({
                    text: (async function* () {
                        await Promise.resolve();
                        yield '```json\n{"summary":"lm-ok","edits":[]}\n```';
                    })(),
                }),
        };
        Object.defineProperty(vscode.lm, 'selectChatModels', {
            value: () => Promise.resolve([mockModel]),
            configurable: true,
        });

        try {
            const client = new VscodeLmClient();
            const tokenSource = new vscode.CancellationTokenSource();
            const res = await client.generate('hi', tokenSource.token, 'copilot');
            assert.deepStrictEqual(res, { summary: 'lm-ok', edits: [] });
            tokenSource.dispose();
        } finally {
            Object.defineProperty(vscode.lm, 'selectChatModels', {
                value: originalSelect,
                configurable: true,
            });
        }
    });
}

function registerBackgroundServiceTests(): void {
    test('LlmBackgroundService が pause/resume 制御および dispose を安全に行えること', () => {
        const mockSecrets = {
            get: () => Promise.resolve(undefined),
        } as unknown as vscode.SecretStorage;
        const bg = new LlmBackgroundService(mockSecrets);

        bg.pause();
        assert.strictEqual(bg.isPaused, true);
        bg.startTimerIfConfigured();
        bg.resume();
        assert.strictEqual(bg.isPaused, false);
        bg.clearErrorLogs();
        bg.dispose();
    });

    test('LearningBackgroundService がエラー種別(RATE_LIMIT)を分類し機密ファイルを無視すること', async () => {
        const store = new LearningSessionStore(new InMemoryMemento());
        store.startSession({ taskDescription: 'Task 1', learningGoal: 'Goal 1' });

        let callCount = 0;
        const llmService = {
            requestStructuredOutput: () => {
                callCount++;
                return Promise.reject(new Error('429 Resource has been exhausted'));
            },
        } as unknown as LlmInterventionService;

        const learningBg = new LearningBackgroundService(store, llmService);
        const envDoc = {
            uri: vscode.Uri.file('/workspace/.env'),
            fileName: '/workspace/.env',
            languageId: 'plaintext',
            getText: () => 'SECRET=1',
        } as unknown as vscode.TextDocument;
        await learningBg.executeAnalysis(envDoc);
        assert.strictEqual(callCount, 0, '機密ファイルはLLMへ送信されないこと');

        const tsDoc = {
            uri: vscode.Uri.file('/workspace/learn.ts'),
            fileName: '/workspace/learn.ts',
            languageId: 'typescript',
            getText: () => 'const a = 1;',
        } as unknown as vscode.TextDocument;
        await learningBg.executeAnalysis(tsDoc);
        assert.strictEqual(store.getState().status, 'error');
        assert.strictEqual(store.getState().errorCode, 'RATE_LIMIT');

        store.stopSession();
        learningBg.dispose();
        store.dispose();
    });
}

suite('LLM Clients & Background Services Test Suite', () => {
    registerGeminiAndVscodeLmTests();
    registerBackgroundServiceTests();
});
