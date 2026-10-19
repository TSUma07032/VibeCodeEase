import * as vscode from 'vscode';
import type { GeminiClient } from '../../llm/geminiClient';
import type { EmbeddingProvider } from './embeddingProvider';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
    public readonly providerId: string;

    constructor(
        private readonly geminiClient: GeminiClient,
        private readonly getApiKey: () => Promise<string | undefined>,
        private readonly modelName: string = 'gemini-embedding-001',
    ) {
        this.providerId = `gemini:${this.modelName}`;
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) {
            return [];
        }

        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API key is required for GeminiEmbeddingProvider');
        }

        const source = new vscode.CancellationTokenSource();
        const timer = setTimeout(() => source.cancel(), 30000);

        try {
            return await this.geminiClient.embedBatch({
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
