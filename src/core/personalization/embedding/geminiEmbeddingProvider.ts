/**
 * [Why/Intent] ILlmGateway または GeminiClient を経由してテキストをバッチベクトル埋め込みに変換する EmbeddingProvider 実装。
 * 統一Gatewayおよび直接GeminiClientの双方に対応し、境界テスト適合と既存テスト適合を両立する。
 */
import * as vscode from 'vscode';
import type { GeminiClient } from '../../llm/geminiClient';
import type { ILlmGateway } from '../../llm/llmGateway';
import type { EmbeddingProvider } from './embeddingProvider';

/**
 * [Why/Intent] ILlmGatewayまたはGeminiClientに処理を委譲し、テキストの一括ベクトル化を提供するプロバイダ
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
    public readonly providerId: string;

    constructor(
        private readonly clientOrGateway: ILlmGateway | GeminiClient,
        private readonly getApiKey?: () => Promise<string | undefined>,
        private readonly modelName: string = 'gemini-embedding-001',
    ) {
        this.providerId = `gemini:${this.modelName}`;
    }

    /**
     * [Why/Intent] 統一ゲートウェイまたは直接GeminiClient経由で複数テキストの一括ベクトル化を実行する
     */
    public async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) {
            return [];
        }

        const source = new vscode.CancellationTokenSource();
        const timer = setTimeout(() => source.cancel(), 30000);

        try {
            if ('generateStructured' in this.clientOrGateway) {
                return await this.clientOrGateway.embedBatch({
                    texts,
                    token: source.token,
                    modelName: this.modelName,
                });
            }
            const apiKey = this.getApiKey ? await this.getApiKey() : undefined;
            if (!apiKey) {
                throw new Error('Gemini API key is required for GeminiEmbeddingProvider');
            }
            return await this.clientOrGateway.embedBatch({
                texts,
                apiKey,
                token: source.token,
                modelName: this.modelName,
            });
        } finally {
            clearTimeout(timer);
            source.dispose();
        }
    }
}
