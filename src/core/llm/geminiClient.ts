/**
 * [Why/Intent] Gemini REST API通信の低レベル制御、モデル動的検出・10分間キャッシュ、
 * Embeddingバッチ処理、およびHTTP/ネットワーク例外のマッピングを担当するクライアントモジュール。
 */
import * as https from 'node:https';
import { URL } from 'node:url';
import type * as vscode from 'vscode';
import { MODEL_CACHE_TTL_MS } from './llmConstants';
import { LlmError, mapHttpErrorToLlmError, mapNetworkErrorToLlmError } from './llmErrors';
import type { RawLlmResponse } from './llmGateway';

interface GeminiModel {
    name: string;
    supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
    models?: GeminiModel[];
}

/**
 * [Why/Intent] Gemini API へのコンテンツ生成リクエストパラメータをまとめたオプションオブジェクト
 */
export interface GeminiGenerateOptions {
    prompt: string;
    apiKey: string;
    token: vscode.CancellationToken;
    modelName?: string;
    responseSchema?: unknown;
}

/**
 * [Why/Intent] 複数テキストの一括ベクトル化（batchEmbedContents）リクエストパラメータ
 */
export interface GeminiEmbedBatchOptions {
    texts: string[];
    apiKey: string;
    token: vscode.CancellationToken;
    modelName?: string;
}

/**
 * [Why/Intent] HTTPSリクエスト送信処理のパラメータをまとめたヘルパー型
 */
interface RequestOptionsParam {
    urlString: string;
    token: vscode.CancellationToken;
    options?: https.RequestOptions;
    body?: string;
}

/**
 * [Why/Intent] Gemini REST APIとの直接通信をカプセル化する低レベルクライアント。
 * モデル自動検出とTTLキャッシュ、batchEmbedContents対応、構造化レスポンス取得を提供する。
 */
export class GeminiClient {
    /** [Why/Intent] 推奨・安定稼働するGeminiモデルの優先順序リスト。ユーザー指定モデルが利用不可の場合に順次フォールバックを試みる */
    private readonly preferredNames = [
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-pro',
        'gemini-3.1-flash-lite',
        'gemini-3.0-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ];

    /**
     * [Why/Intent] GET /v1beta/models で取得した素のモデルリストをAPIキー単位でキャッシュし、
     * 毎リクエストごとの重複通信を削減する（TTL: 10分）。
     */
    private readonly _rawModelCache = new Map<
        string,
        { models: GeminiModel[]; expiresAt: number }
    >();

    /**
     * [Why/Intent] 指定モデルのエンドポイントへ generateContent リクエストを発行するヘルパー
     */
    private async callGenerateEndpoint(
        modelName: string,
        params: GeminiGenerateOptions,
    ): Promise<{ statusCode: number; body: string }> {
        const generationConfig: Record<string, unknown> = {
            responseMimeType: 'application/json',
        };
        if (params.responseSchema) {
            generationConfig.responseSchema = params.responseSchema;
        }

        return this.request({
            urlString: `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
            options: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            },
            token: params.token,
            body: JSON.stringify({
                contents: [{ parts: [{ text: params.prompt }] }],
                generationConfig,
            }),
        });
    }

    /**
     * [Why/Intent] レスポンス本文からCandidateテキストを取り出し、型安全にJSONパースするヘルパー
     */
    private parseRawResponseBody<T>(responseBody: string): RawLlmResponse<T> {
        const data = JSON.parse(responseBody) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) {
            throw new LlmError({
                code: 'PARSE_ERROR',
                message: 'Geminiから生成テキストが返されませんでした。',
            });
        }

        try {
            const parsed = JSON.parse(raw) as T;
            return { rawText: raw, parsed };
        } catch (e) {
            throw new LlmError({
                code: 'PARSE_ERROR',
                message: `GeminiレスポンスのJSONパースに失敗しました: ${raw.slice(0, 100)}`,
                cause: e,
            });
        }
    }

    /**
     * [Why/Intent] Gemini APIへリクエストを送信し、生の返答文字列と型検証されたパース済みオブジェクトを返す
     */
    public async generateContentWithRaw<T>(
        params: GeminiGenerateOptions,
    ): Promise<RawLlmResponse<T>> {
        const candidateModels = await this.discoverModels(
            params.apiKey,
            params.token,
            params.modelName,
        );

        for (const model of candidateModels) {
            const response = await this.callGenerateEndpoint(model.name, params);

            if (response.statusCode === 404) {
                continue;
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw mapHttpErrorToLlmError(response.statusCode, response.body);
            }

            return this.parseRawResponseBody<T>(response.body);
        }

        throw new LlmError({
            code: 'MODEL_NOT_FOUND',
            message:
                '利用可能なGeminiモデルが見つかりません。APIキーが利用できるモデルか確認してください。',
        });
    }

    /**
     * [Why/Intent] 後方互換性のためのメソッド。generateContentWithRaw を呼び出しパース結果のみを返す。
     */
    public async generate(params: GeminiGenerateOptions): Promise<unknown> {
        const result = await this.generateContentWithRaw(params);
        return result.parsed;
    }

    /**
     * [Why/Intent] Gemini REST API (batchEmbedContents) を使用してテキスト配列を一括してベクトル埋め込みに変換する
     */
    public async embedBatch(params: GeminiEmbedBatchOptions): Promise<number[][]> {
        const texts = params.texts;
        if (texts.length === 0) {
            return [];
        }

        const modelName = params.modelName ?? 'gemini-embedding-001';
        const requests = texts.map((text) => ({
            model: `models/${modelName}`,
            content: { parts: [{ text }] },
        }));

        const response = await this.request({
            urlString: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:batchEmbedContents?key=${encodeURIComponent(params.apiKey)}`,
            options: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            },
            token: params.token,
            body: JSON.stringify({ requests }),
        });

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw mapHttpErrorToLlmError(response.statusCode, response.body);
        }

        const data = JSON.parse(response.body) as {
            embeddings?: Array<{ values: number[] }>;
        };

        if (data.embeddings?.length !== texts.length) {
            throw new LlmError({
                code: 'PARSE_ERROR',
                message: 'Geminiから期待される数のEmbeddingが返されませんでした。',
            });
        }

        return data.embeddings.map((e) => e.values);
    }

    /**
     * [Why/Intent] APIからモデル一覧を取得しキャッシュに格納するヘルパー
     */
    private async fetchAndCacheModels(
        apiKey: string,
        token: vscode.CancellationToken,
    ): Promise<GeminiModel[]> {
        const modelsResponse = await this.request({
            urlString: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
            token,
        });
        if (modelsResponse.statusCode < 200 || modelsResponse.statusCode >= 300) {
            throw mapHttpErrorToLlmError(modelsResponse.statusCode, modelsResponse.body);
        }

        const models = (JSON.parse(modelsResponse.body) as GeminiModelsResponse).models ?? [];
        const available = models.filter((m) =>
            m.supportedGenerationMethods?.includes('generateContent'),
        );
        this._rawModelCache.set(apiKey, {
            models: available,
            expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
        });
        return available;
    }

    /**
     * [Why/Intent] APIキーに紐づく利用可能モデルを動的に取得し、10分間キャッシュを活用しながら優先モデル候補リストを構築する
     */
    private async discoverModels(
        apiKey: string,
        token: vscode.CancellationToken,
        targetModelName?: string,
    ): Promise<GeminiModel[]> {
        const cached = this._rawModelCache.get(apiKey);
        const availableModels =
            cached && cached.expiresAt > Date.now()
                ? cached.models
                : await this.fetchAndCacheModels(apiKey, token);

        const prefs = [...this.preferredNames];
        if (targetModelName && targetModelName !== 'auto') {
            prefs.unshift(targetModelName);
        }

        const preferredModels = prefs
            .map((preferredName) =>
                availableModels.find((model) => model.name.endsWith(`/${preferredName}`)),
            )
            .filter((model): model is GeminiModel => model !== undefined);

        const preferredModelsSet = new Set(preferredModels);
        const candidateModels = [
            ...preferredModels,
            ...availableModels.filter((model) => !preferredModelsSet.has(model)),
        ];
        if (candidateModels.length === 0) {
            throw new LlmError({
                code: 'MODEL_NOT_FOUND',
                message: 'Gemini APIでgenerateContentに対応するモデルが見つかりません。',
            });
        }
        return candidateModels;
    }

    /**
     * [Why/Intent] リトライ可能なステータスコードか否かを判定する
     */
    private isRetryableResponse(statusCode: number, body: string): boolean {
        const isStatusMatch = statusCode === 503 || statusCode === 429;
        return isStatusMatch && !body.toLowerCase().includes('quota');
    }

    private async request(
        params: RequestOptionsParam,
    ): Promise<{ statusCode: number; body: string }> {
        const maxRetries = 1;
        let attempt = 0;

        while (true) {
            try {
                const response = await this.doRequest(params);
                const canRetry =
                    this.isRetryableResponse(response.statusCode, response.body) &&
                    attempt < maxRetries &&
                    !params.token.isCancellationRequested;

                if (canRetry) {
                    attempt++;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                }
                return response;
            } catch (err) {
                if (attempt < maxRetries && !params.token.isCancellationRequested) {
                    attempt++;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                }
                throw mapNetworkErrorToLlmError(err);
            }
        }
    }

    private doRequest(params: RequestOptionsParam): Promise<{ statusCode: number; body: string }> {
        return new Promise((resolve, reject) => {
            const url = new URL(params.urlString);
            const requestOptions = params.options ?? {};
            const request = https.request(
                url,
                { ...requestOptions, method: requestOptions.method ?? 'GET', timeout: 30000 },
                (response) => {
                    let responseBody = '';
                    response.setEncoding('utf8');
                    response.on('data', (chunk: string) => (responseBody += chunk));
                    response.on('end', () =>
                        resolve({ statusCode: response.statusCode ?? 0, body: responseBody }),
                    );
                },
            );

            request.on('timeout', () => {
                request.destroy(new Error('LLM API リクエストがタイムアウトしました。'));
            });

            const cancellation = params.token.onCancellationRequested(() => {
                request.destroy(new Error('リクエストがキャンセルされました。'));
            });
            request.on('close', () => {
                cancellation.dispose();
            });
            request.on('error', reject);

            if (params.body) {
                request.write(params.body);
            }
            request.end();
        });
    }
}
