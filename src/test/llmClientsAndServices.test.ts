/**
 * [Why/Intent] LLMクライアント、ゲートウェイ、設定リポジトリ、エラー分類、およびバックグラウンドサービスの単体・結合テストスイート。
 * 統一ゲートウェイ経由での通信、プロバイダ分岐、構造化エラーマッピング、および機密ガードが契約通り動作することを網羅的に検証する。
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { GeminiClient } from '../core/llm/geminiClient';
import { LlmConfigRepository } from '../core/llm/llmConfigRepository';
import { GEMINI_SUPPORTED_MODELS } from '../core/llm/llmConstants';
import {
    LLM_SUGGESTED_ACTIONS,
    LlmError,
    type LlmErrorCode,
    mapHttpErrorToLlmError,
    mapNetworkErrorToLlmError,
    mapVsCodeLmErrorToLlmError,
} from '../core/llm/llmErrors';
import { LlmGateway } from '../core/llm/llmGateway';
import { VscodeLmClient } from '../core/llm/vscodeLmClient';
import { LlmBackgroundService } from '../core/llmBackgroundService';
import type { LlmInterventionService } from '../core/llmInterventionService';
import { LearningBackgroundService } from '../core/scaffolding/learningBackgroundService';
import { LearningSessionStore } from '../core/scaffolding/learningSessionStore';
import {
    assertNotSensitiveDocument,
    isSensitiveDocument,
} from '../core/utils/sensitiveDocumentGuard';

/**
 * [Why/Intent] テスト用のインメモリ Memento 実装
 */
class InMemoryMemento implements vscode.Memento {
    private _map = new Map<string, unknown>();
    /** [Why/Intent] 格納されているキー一覧 */
    public keys(): readonly string[] {
        return Array.from(this._map.keys());
    }
    /** [Why/Intent] キーに対応する値を取得する */
    public get<T>(key: string, defaultValue?: T): T {
        return (this._map.has(key) ? this._map.get(key) : defaultValue) as T;
    }
    /** [Why/Intent] キーに対応する値を更新する */
    public update(key: string, value: unknown): Thenable<void> {
        this._map.set(key, value);
        return Promise.resolve();
    }
}

/**
 * [Why/Intent] テスト用のインメモリ SecretStorage 実装
 */
class InMemorySecretStorage implements vscode.SecretStorage {
    private _secrets = new Map<string, string>();
    private readonly _onDidChange = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
    /** [Why/Intent] シークレット変更イベント */
    public readonly onDidChange = this._onDidChange.event;

    /** [Why/Intent] シークレットの取得 */
    public get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this._secrets.get(key));
    }
    /** [Why/Intent] シークレットの保存 */
    public store(key: string, value: string): Thenable<void> {
        this._secrets.set(key, value);
        this._onDidChange.fire({ key });
        return Promise.resolve();
    }
    /** [Why/Intent] シークレットの削除 */
    public delete(key: string): Thenable<void> {
        this._secrets.delete(key);
        this._onDidChange.fire({ key });
        return Promise.resolve();
    }
    /** [Why/Intent] 保存されている全キー一覧の取得 */
    public keys(): Thenable<string[]> {
        return Promise.resolve(Array.from(this._secrets.keys()));
    }
}

/**
 * [Why/Intent] テストホスト環境の設定に左右されず vscode.workspace.getConfiguration を安全に差し替えるテストヘルパー
 */
function mockVscodeConfiguration(overrides: Record<string, unknown>): vscode.Disposable {
    const originalGetConfig = vscode.workspace.getConfiguration;
    (
        vscode.workspace as unknown as {
            getConfiguration: typeof vscode.workspace.getConfiguration;
        }
    ).getConfiguration = (section?: string, scope?: vscode.ConfigurationScope | null) => {
        const config = originalGetConfig(section, scope);
        return {
            get: <T>(key: string, defaultValue?: T): T => {
                const fullKey = section ? `${section}.${key}` : key;
                if (key in overrides) {
                    return overrides[key] as T;
                }
                if (fullKey in overrides) {
                    return overrides[fullKey] as T;
                }
                return config.get<T>(key, defaultValue as T);
            },
            has: (key: string): boolean => {
                if (key in overrides) {
                    return true;
                }
                return config.has(key);
            },
            inspect: config.inspect.bind(config),
            update: config.update.bind(config),
        };
    };

    return {
        dispose: () => {
            (
                vscode.workspace as unknown as { getConfiguration: typeof originalGetConfig }
            ).getConfiguration = originalGetConfig;
        },
    };
}

/**
 * [Why/Intent] 4xx系HTTPステータスコードに応じた LlmError マッピング検証（文数抑制のため分割）
 */
function verify4xxHttpErrorMappings(): void {
    const authErr = mapHttpErrorToLlmError(401, 'Unauthorized API Key');
    assert.strictEqual(authErr.code, 'AUTH_MISSING');
    assert.strictEqual(authErr.retryable, false);
    assert.strictEqual(authErr.statusCode, 401);
    assert.ok(authErr.suggestedAction.includes('Gemini APIキー'));

    const forbiddenErr = mapHttpErrorToLlmError(403, 'Permission denied');
    assert.strictEqual(forbiddenErr.code, 'AUTH_MISSING');
    assert.strictEqual(forbiddenErr.statusCode, 403);

    const notFoundErr = mapHttpErrorToLlmError(404, 'Model not found');
    assert.strictEqual(notFoundErr.code, 'MODEL_NOT_FOUND');
    assert.strictEqual(notFoundErr.statusCode, 404);

    const quotaErr = mapHttpErrorToLlmError(429, 'Resource has been exhausted (quota)');
    assert.strictEqual(quotaErr.code, 'QUOTA_EXCEEDED');
    assert.strictEqual(quotaErr.retryable, false);

    const rateErr = mapHttpErrorToLlmError(429, 'Too many requests, slow down');
    assert.strictEqual(rateErr.code, 'RATE_LIMIT');
    assert.strictEqual(rateErr.retryable, true);
}

/**
 * [Why/Intent] 5xx系および未知のHTTPステータスコードに応じた LlmError マッピング検証（文数抑制のため分割）
 */
function verify5xxAndUnknownHttpErrorMappings(): void {
    const serverErr = mapHttpErrorToLlmError(503, 'Service unavailable');
    assert.strictEqual(serverErr.code, 'SERVER_ERROR');
    assert.strictEqual(serverErr.retryable, true);

    const internalErr = mapHttpErrorToLlmError(500, 'Internal Server Error');
    assert.strictEqual(internalErr.code, 'SERVER_ERROR');
    assert.strictEqual(internalErr.retryable, true);

    const unknownHttpErr = mapHttpErrorToLlmError(418, "I'm a teapot");
    assert.strictEqual(unknownHttpErr.code, 'UNKNOWN');
}

/**
 * [Why/Intent] ネットワークエラーおよびVS Code LM例外のマッピング検証
 */
function verifyNetworkAndLmErrorMappings(): void {
    const timeoutErr = mapNetworkErrorToLlmError(
        new Error('LLM API リクエストがタイムアウトしました。'),
    );
    assert.strictEqual(timeoutErr.code, 'TIMEOUT');
    assert.strictEqual(timeoutErr.retryable, true);

    const dnsErr = mapNetworkErrorToLlmError(new Error('getaddrinfo ENOTFOUND'));
    assert.strictEqual(dnsErr.code, 'NETWORK');
    assert.strictEqual(dnsErr.retryable, true);

    assert.throws(
        () => mapVsCodeLmErrorToLlmError(new vscode.CancellationError()),
        (err) => err instanceof vscode.CancellationError,
    );

    const lmNotFound = mapVsCodeLmErrorToLlmError(new Error('No chat model found'));
    assert.strictEqual(lmNotFound.code, 'MODEL_NOT_FOUND');

    const lmAuth = mapVsCodeLmErrorToLlmError(new Error('Please login to Copilot'));
    assert.strictEqual(lmAuth.code, 'AUTH_MISSING');

    const lmParse = mapVsCodeLmErrorToLlmError(new SyntaxError('Unexpected token < in JSON'));
    assert.strictEqual(lmParse.code, 'PARSE_ERROR');

    const lmUnknown = mapVsCodeLmErrorToLlmError(new Error('Some weird error'));
    assert.strictEqual(lmUnknown.code, 'UNKNOWN');
}

/**
 * [Why/Intent] 定義された全 LlmErrorCode に対する推奨アクション文言の網羅性検証
 */
function verifySuggestedActionCoverage(): void {
    const allCodes: LlmErrorCode[] = [
        'AUTH_MISSING',
        'MODEL_NOT_FOUND',
        'RATE_LIMIT',
        'QUOTA_EXCEEDED',
        'SERVER_ERROR',
        'TIMEOUT',
        'NETWORK',
        'PARSE_ERROR',
        'UNKNOWN',
    ];
    for (const code of allCodes) {
        const action = LLM_SUGGESTED_ACTIONS[code];
        assert.ok(action, `エラーコード ${code} に対する suggestedAction が定義されていること`);
        assert.ok(action.length > 10, `アクション文言が具体的であること: ${action}`);

        const err = new LlmError({ code, message: 'test' });
        assert.strictEqual(err.suggestedAction, action);
    }
}

/**
 * [Why/Intent] エラー定義およびマッピングのテストスイート登録
 */
function registerLlmErrorsTests(): void {
    test('LlmError とエラーマッピング関数群が全主要エラーと推奨対処法を正しく解決すること', () => {
        verify4xxHttpErrorMappings();
        verify5xxAndUnknownHttpErrorMappings();
        verifyNetworkAndLmErrorMappings();
        verifySuggestedActionCoverage();
    });
}

/**
 * [Why/Intent] 機密ファイルガード（sensitiveDocumentGuard）のテーブル駆動テスト登録
 */
function registerSensitiveGuardTests(): void {
    test('sensitiveDocumentGuard が各種機密パターンを網羅的に遮断し、通常ファイルを通過させること', () => {
        const sensitiveCases: Array<{ name: string; fileName: string; languageId?: string }> = [
            { name: '.env ファイル', fileName: '/project/.env' },
            { name: '.env.local ファイル', fileName: '/project/.env.local' },
            { name: '.git/config ファイル', fileName: '/project/.git/config' },
            { name: '秘密鍵 .pem', fileName: '/project/id_rsa.pem' },
            { name: '秘密鍵 .key', fileName: '/project/server.key' },
            { name: 'シークレット JSON', fileName: '/project/secrets.json' },
            { name: 'AWS認証情報', fileName: '/project/credentials' },
            { name: 'languageId secrets', fileName: '/project/dummy.txt', languageId: 'secrets' },
        ];

        for (const tc of sensitiveCases) {
            const doc = {
                fileName: tc.fileName,
                languageId: tc.languageId ?? 'plaintext',
                uri: vscode.Uri.file(tc.fileName),
            } as vscode.TextDocument;

            assert.strictEqual(isSensitiveDocument(doc), true, `${tc.name} は機密判定されること`);
            assert.throws(
                () => assertNotSensitiveDocument(doc),
                /セキュリティエラー/,
                `${tc.name} は assertNotSensitiveDocument で例外送出されること`,
            );
        }

        const safeCases = [
            '/project/src/index.ts',
            '/project/src/app.component.html',
            '/project/README.md',
            '/project/package.json',
        ];
        for (const safePath of safeCases) {
            const doc = {
                fileName: safePath,
                languageId: 'typescript',
                uri: vscode.Uri.file(safePath),
            } as vscode.TextDocument;

            assert.strictEqual(
                isSensitiveDocument(doc),
                false,
                `${safePath} は安全と判定されること`,
            );
            assert.doesNotThrow(
                () => assertNotSensitiveDocument(doc),
                `${safePath} は例外を送出しないこと`,
            );
        }
    });
}

/**
 * [Why/Intent] LlmConfigRepository が SecretStorage からのみ APIキーを取得するテスト登録
 */
function registerConfigRepositoryTests(): void {
    test('LlmConfigRepository が SecretStorage のみから APIキーを取得すること', async () => {
        const configMock = mockVscodeConfiguration({
            'vibecodeease.llmProvider': 'gemini',
            'vibecodeease.llmModel': 'gemini-3.5-flash-lite',
        });

        try {
            const secrets = new InMemorySecretStorage();
            const repo = new LlmConfigRepository(secrets);

            // SecretStorage が空の時、undefinedを返す
            const emptyKey = await repo.getApiKey();
            assert.strictEqual(emptyKey, undefined);

            // SecretStorage にキーを設定すると取得できる
            let eventFired = false;
            repo.onDidChangeConfig(() => {
                eventFired = true;
            });
            await repo.setApiKey('secret-priority-key');
            assert.strictEqual(await repo.getApiKey(), 'secret-priority-key');
            assert.strictEqual(eventFired, true);

            // 空文字を渡すと SecretStorage から削除され、undefinedを返す
            await repo.setApiKey('');
            assert.strictEqual(await repo.getApiKey(), undefined);

            const currentConfig = repo.getLlmConfig();
            assert.strictEqual(currentConfig.provider, 'gemini');
            assert.strictEqual(currentConfig.model, 'gemini-3.5-flash-lite');

            repo.dispose();
        } finally {
            configMock.dispose();
        }
    });
}

/**
 * [Why/Intent] テスト用のGeminiClientおよびVscodeLmClientモック作成ヘルパー
 */
function createMockClientsForGatewayTest() {
    let lastGeminiPrompt = '';
    let lastGeminiModel = '';
    let lastVscodePrompt = '';
    let lastVscodeModel = '';
    let lastEmbedTexts: string[] = [];

    const mockGeminiClient = {
        generateContentWithRaw: (params: { prompt: string; modelName?: string }) => {
            lastGeminiPrompt = params.prompt;
            lastGeminiModel = params.modelName ?? '';
            return Promise.resolve({
                rawText: '{"summary":"gateway-gemini-ok","edits":[]}',
                parsed: { summary: 'gateway-gemini-ok', edits: [] },
            });
        },
        embedBatch: (params: { texts: string[] }) => {
            lastEmbedTexts = params.texts;
            return Promise.resolve(params.texts.map(() => [0.1, 0.2, 0.3]));
        },
    } as unknown as GeminiClient;

    const mockVscodeLmClient = {
        generateWithRaw: (prompt: string, _token: unknown, model?: string) => {
            lastVscodePrompt = prompt;
            lastVscodeModel = model ?? '';
            return Promise.resolve({
                rawText: '{"summary":"gateway-vscode-ok","edits":[]}',
                parsed: { summary: 'gateway-vscode-ok', edits: [] },
            });
        },
    } as unknown as VscodeLmClient;

    return {
        mockGeminiClient,
        mockVscodeLmClient,
        getLastGeminiPrompt: () => lastGeminiPrompt,
        getLastGeminiModel: () => lastGeminiModel,
        getLastVscodePrompt: () => lastVscodePrompt,
        getLastVscodeModel: () => lastVscodeModel,
        getLastEmbedTexts: () => lastEmbedTexts,
    };
}

/**
 * [Why/Intent] 生レスポンスの完全出力（console.info）アサーションヘルパー。
 * ※詳細仕様書ではconsole.logと記載されているが、プロジェクトのESLint no-console規約に基づきconsole.infoを採用している。
 */
function assertGatewayLogs(loggedMessages: string[]): void {
    assert.ok(
        loggedMessages.some(
            (msg) =>
                msg.includes('[LLM Raw Response]') &&
                msg.includes('{"summary":"gateway-gemini-ok","edits":[]}'),
        ),
        '生の返答テキストが1文字も欠落することなく出力されること',
    );
}

/**
 * [Why/Intent] LlmGateway の Gemini プロバイダパス・生ログ・プロンプト結合・モデル優先の検証
 */
async function testGatewayGeminiPath(): Promise<void> {
    const configMock = mockVscodeConfiguration({
        'vibecodeease.llmProvider': 'gemini',
        'vibecodeease.llmModel': 'gemini-3.5-flash-lite',
    });

    const secrets = new InMemorySecretStorage();
    await secrets.store('vibecodeease.geminiApiKey', 'dummy-key');
    const repo = new LlmConfigRepository(secrets);
    const mocks = createMockClientsForGatewayTest();

    // ロガー関数を注入することで Extension Host のモジュール境界に依存せず確実にログを検証する
    const loggedMessages: string[] = [];
    const testLogger = (...args: unknown[]) => {
        loggedMessages.push(args.map(String).join(' '));
    };
    const gateway = new LlmGateway(repo, {
        geminiClient: mocks.mockGeminiClient,
        vscodeLmClient: mocks.mockVscodeLmClient,
        logger: testLogger,
    });

    const cts = new vscode.CancellationTokenSource();
    try {
        const result = await gateway.generateStructured<{ summary: string; edits: unknown[] }>({
            systemInstruction: 'You are an expert coder.',
            userPrompt: 'Fix this bug.',
            modelName: 'gemini-3.8-flash',
            responseSchema: {},
            token: cts.token,
        });

        assert.strictEqual(result.summary, 'gateway-gemini-ok');
        assert.strictEqual(
            mocks.getLastGeminiPrompt(),
            'You are an expert coder.\n\nFix this bug.',
            'systemInstruction と userPrompt が正しく結合されること',
        );
        assert.strictEqual(
            mocks.getLastGeminiModel(),
            'gemini-3.8-flash',
            'options.modelName が優先されること',
        );
        assertGatewayLogs(loggedMessages);
    } finally {
        cts.dispose();
        repo.dispose();
        configMock.dispose();
    }
}

/**
 * [Why/Intent] LlmGateway のモデル一覧取得テスト
 */
async function testGatewayModels(): Promise<void> {
    const secrets = new InMemorySecretStorage();
    const repo = new LlmConfigRepository(secrets);
    const mocks = createMockClientsForGatewayTest();
    const gateway = new LlmGateway(repo, {
        geminiClient: mocks.mockGeminiClient,
        vscodeLmClient: mocks.mockVscodeLmClient,
    });
    try {
        const models = await gateway.getAvailableModels();
        assert.deepStrictEqual(models, [...GEMINI_SUPPORTED_MODELS]);
    } finally {
        repo.dispose();
    }
}

/**
 * [Why/Intent] LlmGateway の embedBatch 正常系および APIキー未設定エラーテスト
 */
async function testGatewayEmbedBatch(): Promise<void> {
    const secrets = new InMemorySecretStorage();
    await secrets.store('vibecodeease.geminiApiKey', 'embed-key');
    const repo = new LlmConfigRepository(secrets);
    const mocks = createMockClientsForGatewayTest();
    const gateway = new LlmGateway(repo, {
        geminiClient: mocks.mockGeminiClient,
        vscodeLmClient: mocks.mockVscodeLmClient,
    });
    const cts = new vscode.CancellationTokenSource();

    try {
        // 正常系: geminiClient.embedBatch が呼ばれ埋め込み配列が返ること
        const res = await gateway.embedBatch({
            texts: ['test text 1', 'test text 2'],
            token: cts.token,
        });
        assert.strictEqual(res.length, 2);
        assert.deepStrictEqual(mocks.getLastEmbedTexts(), ['test text 1', 'test text 2']);

        // 異常系: APIキー未設定時に AUTH_MISSING が送出されること
        await secrets.delete('vibecodeease.geminiApiKey');
        await assert.rejects(
            async () => {
                await gateway.embedBatch({
                    texts: ['fail test'],
                    token: cts.token,
                });
            },
            (err: LlmError) => {
                assert.ok(err instanceof LlmError);
                assert.strictEqual(err.code, 'AUTH_MISSING');
                return true;
            },
        );
    } finally {
        cts.dispose();
        repo.dispose();
    }
}

/**
 * [Why/Intent] LlmGateway の VS Code LM プロバイダパスの検証
 */
async function testGatewayVscodeLmPath(): Promise<void> {
    const configMock = mockVscodeConfiguration({
        'vibecodeease.llmProvider': 'vscode-lm',
        'vibecodeease.llmModel': 'copilot-gpt',
    });

    const secrets = new InMemorySecretStorage();
    const repo = new LlmConfigRepository(secrets);
    const mocks = createMockClientsForGatewayTest();
    const gateway = new LlmGateway(repo, {
        geminiClient: mocks.mockGeminiClient,
        vscodeLmClient: mocks.mockVscodeLmClient,
    });

    const cts = new vscode.CancellationTokenSource();
    try {
        const result = await gateway.generateStructured<{ summary: string; edits: unknown[] }>({
            prompt: 'Explicit single prompt',
            responseSchema: {},
            token: cts.token,
        });

        assert.strictEqual(result.summary, 'gateway-vscode-ok');
        assert.strictEqual(mocks.getLastVscodePrompt(), 'Explicit single prompt');
        assert.strictEqual(mocks.getLastVscodeModel(), 'copilot-gpt');
        assert.strictEqual(
            mocks.getLastGeminiPrompt(),
            '',
            'vscode-lm 選択時に GeminiClient は呼ばれないこと',
        );
    } finally {
        cts.dispose();
        repo.dispose();
        configMock.dispose();
    }
}

/**
 * [Why/Intent] LlmGateway のテストスイート登録
 */
function registerLlmGatewayTests(): void {
    test('LlmGateway が Gemini プロバイダで生返答を完全出力し、プロンプト結合とモデル優先を処理すること', async () => {
        await testGatewayGeminiPath();
    });

    test('LlmGateway がサポートされるGeminiモデル一覧を返却すること', async () => {
        await testGatewayModels();
    });

    test('LlmGateway が embedBatch を委譲しAPIキー未設定を遮断すること', async () => {
        await testGatewayEmbedBatch();
    });

    test('LlmGateway が vscode-lm プロバイダへ正しくディスパッチすること', async () => {
        await testGatewayVscodeLmPath();
    });

    test('LlmGateway でAPIキー未設定時に AUTH_MISSING の LlmError がスローされること', async () => {
        const configMock = mockVscodeConfiguration({
            'vibecodeease.llmProvider': 'gemini',
            'vibecodeease.geminiApiKey': '',
        });
        const secrets = new InMemorySecretStorage();
        const repo = new LlmConfigRepository(secrets);
        const gateway = new LlmGateway(repo);

        const cts = new vscode.CancellationTokenSource();
        try {
            await assert.rejects(
                async () => {
                    await gateway.generateStructured({
                        prompt: 'test',
                        responseSchema: {},
                        token: cts.token,
                    });
                },
                (err: Error) => {
                    assert.ok(err instanceof LlmError);
                    assert.strictEqual(err.code, 'AUTH_MISSING');
                    return true;
                },
            );
        } finally {
            cts.dispose();
            repo.dispose();
            configMock.dispose();
        }
    });
}

/**
 * [Why/Intent] GeminiClient.embedBatch の正常系・空配列・エンドポイント呼出検証ヘルパー
 */
async function testGeminiClientEmbedBatch(): Promise<void> {
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
        return Promise.resolve({
            statusCode: 200,
            body: JSON.stringify({
                embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
            }),
        });
    };

    const cts = new vscode.CancellationTokenSource();
    try {
        // 空配列時は即座に空配列を返し HTTP 通信を行わないこと
        const emptyRes = await client.embedBatch({
            texts: [],
            apiKey: 'key',
            token: cts.token,
        });
        assert.deepStrictEqual(emptyRes, []);
        assert.strictEqual(requestedUrls.length, 0);

        // 複数テキスト時は batchEmbedContents エンドポイントへリクエストすること
        const res = await client.embedBatch({
            texts: ['hello', 'world'],
            apiKey: 'key',
            token: cts.token,
        });
        assert.strictEqual(res.length, 2);
        assert.deepStrictEqual(res[0], [0.1, 0.2]);
        assert.deepStrictEqual(res[1], [0.3, 0.4]);
        assert.ok(
            requestedUrls.some((u) => u.includes('models/gemini-embedding-001:batchEmbedContents')),
        );
    } finally {
        cts.dispose();
    }
}

/**
 * [Why/Intent] GeminiClient の10分TTLモデルキャッシュおよび各種エラー送出テスト登録
 */
function registerGeminiClientTests(): void {
    test('GeminiClient が GET /models を10分キャッシュし重複リクエストを防止すること', async () => {
        const client = new GeminiClient();
        let modelsRequestCount = 0;

        (
            client as unknown as {
                request: (params: {
                    urlString: string;
                }) => Promise<{ statusCode: number; body: string }>;
            }
        ).request = ({ urlString }) => {
            if (urlString.includes(':generateContent')) {
                return Promise.resolve({
                    statusCode: 200,
                    body: JSON.stringify({
                        candidates: [{ content: { parts: [{ text: '{"result":"cached-ok"}' }] } }],
                    }),
                });
            }
            if (urlString.includes('/v1beta/models?')) {
                modelsRequestCount++;
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
            }
            return Promise.resolve({ statusCode: 404, body: 'Not found' });
        };

        const cts = new vscode.CancellationTokenSource();
        // 1回目のリクエスト: models APIが叩かれる
        await client.generateContentWithRaw({
            prompt: 'req1',
            apiKey: 'test-key',
            token: cts.token,
        });
        assert.strictEqual(modelsRequestCount, 1, '初回のモデルディスカバリが実行されること');

        // 2回目のリクエスト: 10分TTL内のためキャッシュが使われ、modelsRequestCount は増加しない
        await client.generateContentWithRaw({
            prompt: 'req2',
            apiKey: 'test-key',
            token: cts.token,
        });
        assert.strictEqual(
            modelsRequestCount,
            1,
            '2回目はモデルキャッシュが使用され通信がスキップされること',
        );

        cts.dispose();
    });

    test('GeminiClient が embedBatch でバッチ埋め込みを正しく取得し空配列を早期返却すること', async () => {
        await testGeminiClientEmbedBatch();
    });

    test('GeminiClient が 401, 404, 429, 503 の各HTTPステータス時に適切な LlmError を送出すること', async () => {
        const client = new GeminiClient();
        let targetStatusCode = 401;
        let targetBody = 'Unauthorized';

        (
            client as unknown as {
                request: () => Promise<{ statusCode: number; body: string }>;
            }
        ).request = () => Promise.resolve({ statusCode: targetStatusCode, body: targetBody });

        const cts = new vscode.CancellationTokenSource();

        // 401 検証
        targetStatusCode = 401;
        targetBody = 'API key not valid';
        await assert.rejects(
            async () => {
                await client.generateContentWithRaw({
                    prompt: 'test',
                    apiKey: 'key',
                    token: cts.token,
                });
            },
            (err: LlmError) => err.code === 'AUTH_MISSING',
        );

        // 404（候補全滅）検証
        targetStatusCode = 404;
        targetBody = 'Not found';
        await assert.rejects(
            async () => {
                await client.generateContentWithRaw({
                    prompt: 'test',
                    apiKey: 'key',
                    token: cts.token,
                });
            },
            (err: LlmError) => err.code === 'MODEL_NOT_FOUND',
        );

        // 429 (quota) 検証
        targetStatusCode = 429;
        targetBody = 'Resource has been exhausted (check quota)';
        await assert.rejects(
            async () => {
                await client.generateContentWithRaw({
                    prompt: 'test',
                    apiKey: 'key',
                    token: cts.token,
                });
            },
            (err: LlmError) => err.code === 'QUOTA_EXCEEDED' && err.retryable === false,
        );

        // 503 検証
        targetStatusCode = 503;
        targetBody = 'Service Unavailable';
        await assert.rejects(
            async () => {
                await client.generateContentWithRaw({
                    prompt: 'test',
                    apiKey: 'key',
                    token: cts.token,
                });
            },
            (err: LlmError) => err.code === 'SERVER_ERROR' && err.retryable === true,
        );

        cts.dispose();
    });
}

/**
 * [Why/Intent] VscodeLmClient のモデル未検出、キャンセル再スロー、JSONパース失敗テスト登録
 */
function registerVscodeLmClientTests(): void {
    test('VscodeLmClient がモデル未検出・キャンセル再スロー・Markdownフェンスパースを契約通り処理すること', async () => {
        const originalSelect = vscode.lm?.selectChatModels;
        const client = new VscodeLmClient();
        const cts = new vscode.CancellationTokenSource();

        // 1. モデル未検出時: MODEL_NOT_FOUND LlmError が送出されること
        Object.defineProperty(vscode.lm, 'selectChatModels', {
            value: () => Promise.resolve([]),
            configurable: true,
        });
        await assert.rejects(
            async () => {
                await client.generateWithRaw('hi', cts.token);
            },
            (err: LlmError) => err.code === 'MODEL_NOT_FOUND',
        );

        // 2. キャンセル発生時: vscode.CancellationError がそのまま再スローされること
        const cancelingModel = {
            family: 'copilot',
            id: 'copilot-gpt',
            name: 'Copilot',
            sendRequest: () => Promise.reject(new vscode.CancellationError()),
        };
        Object.defineProperty(vscode.lm, 'selectChatModels', {
            value: () => Promise.resolve([cancelingModel]),
            configurable: true,
        });
        await assert.rejects(
            async () => {
                await client.generateWithRaw('hi', cts.token);
            },
            (err) => err instanceof vscode.CancellationError,
        );

        // 3. 不正JSON返却時: PARSE_ERROR LlmError が送出されること
        const invalidJsonModel = {
            family: 'copilot',
            id: 'copilot-gpt',
            name: 'Copilot',
            sendRequest: () =>
                Promise.resolve({
                    text: (async function* () {
                        await Promise.resolve();
                        yield 'This is not JSON';
                    })(),
                }),
        };
        Object.defineProperty(vscode.lm, 'selectChatModels', {
            value: () => Promise.resolve([invalidJsonModel]),
            configurable: true,
        });
        await assert.rejects(
            async () => {
                await client.generateWithRaw('hi', cts.token);
            },
            (err: LlmError) => err.code === 'PARSE_ERROR',
        );

        // 4. 正常系: Markdownフェンス内のJSONをパースできること
        const validModel = {
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
            value: () => Promise.resolve([validModel]),
            configurable: true,
        });
        const res = await client.generateWithRaw<{ summary: string }>('hi', cts.token);
        assert.deepStrictEqual(res.parsed.summary, 'lm-ok');

        // クリーンアップ
        Object.defineProperty(vscode.lm, 'selectChatModels', {
            value: originalSelect,
            configurable: true,
        });
        cts.dispose();
    });
}

/**
 * [Why/Intent] LlmBackgroundService および LearningBackgroundService の挙動テスト登録
 */
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
    registerLlmErrorsTests();
    registerSensitiveGuardTests();
    registerConfigRepositoryTests();
    registerLlmGatewayTests();
    registerGeminiClientTests();
    registerVscodeLmClientTests();
    registerBackgroundServiceTests();
});
