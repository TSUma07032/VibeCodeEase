import * as vscode from 'vscode';
import * as https from 'https';
import { URL } from 'url';
import { INTERVENTION_RESPONSE_SCHEMA } from './promptBuilder';

interface GeminiModel {
    name: string;
    supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
    models?: GeminiModel[];
}

export class GeminiClient {
    private readonly preferredNames = [
        'gemini-3.6-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
    ];

    /**
     * Gemini APIへリクエストを送信し、生成された未検証のJSONレスポンスオブジェクトを返す
     */
    public async generate(prompt: string, apiKey: string, token: vscode.CancellationToken): Promise<unknown> {
        const candidateModels = await this.discoverModels(apiKey, token);

        for (const model of candidateModels) {
            const response = await this.request(
                `https://generativelanguage.googleapis.com/v1beta/${model.name}:generateContent?key=${encodeURIComponent(apiKey)}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                },
                token,
                JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        responseSchema: INTERVENTION_RESPONSE_SCHEMA
                    }
                })
            );

            if (response.statusCode === 404) {
                continue;
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                const details = response.body.slice(0, 160);
                throw new Error(`Gemini APIリクエストに失敗しました（HTTP ${response.statusCode}）。${details}`);
            }

            const data = JSON.parse(response.body) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!raw) {
                throw new Error('Geminiから介入プランが返されませんでした。');
            }
            return JSON.parse(raw);
        }

        throw new Error('利用可能なGeminiモデルが見つかりません。APIキーが新規ユーザー向けモデルを利用できるか確認してください。');
    }

    private async discoverModels(apiKey: string, token: vscode.CancellationToken): Promise<GeminiModel[]> {
        const modelsResponse = await this.request(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
            undefined,
            token
        );
        if (modelsResponse.statusCode < 200 || modelsResponse.statusCode >= 300) {
            throw new Error(`Geminiのモデル一覧取得に失敗しました（HTTP ${modelsResponse.statusCode}）。APIキーとGenerative Language APIの有効化を確認してください。`);
        }

        const models = (JSON.parse(modelsResponse.body) as GeminiModelsResponse).models ?? [];
        const availableModels = models.filter((model) => model.supportedGenerationMethods?.includes('generateContent'));
        const preferredModels = this.preferredNames
            .map((preferredName) => availableModels.find((model) => model.name.endsWith(`/${preferredName}`)))
            .filter((model): model is GeminiModel => model !== undefined);

        // ⚡ Bolt: $O(n^2)$ の Array.includes を $O(n)$ の Set.has ルックアップに置き換え
        // Benchmark: モデル探索におけるフィルタリングの計算量を削減し、APIクライアントの初期化を高速化
        const preferredModelsSet = new Set(preferredModels);
        const candidateModels = [...preferredModels, ...availableModels.filter((model) => !preferredModelsSet.has(model))];
        if (candidateModels.length === 0) {
            throw new Error('Gemini APIでgenerateContentに対応するモデルが見つかりません。');
        }
        return candidateModels;
    }

    private request(
        urlString: string,
        options: https.RequestOptions = {},
        token: vscode.CancellationToken,
        body?: string
    ): Promise<{ statusCode: number; body: string }> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlString);
            const request = https.request(url, { ...options, method: options.method ?? 'GET' }, (response) => {
                let responseBody = '';
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => responseBody += chunk);
                response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body: responseBody }));
            });

            const cancellation = token.onCancellationRequested(() => {
                request.destroy(new Error('リクエストがキャンセルされました。'));
            });
            request.on('close', () => cancellation.dispose());
            request.on('error', reject);

            if (body) {
                request.write(body);
            }
            request.end();
        });
    }
}
