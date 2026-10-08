import * as vscode from 'vscode';
import { EmbeddingProvider } from './embeddingProvider';
import { GeminiClient } from '../../llm/geminiClient';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
    public readonly providerId: string;

    constructor(
        private readonly geminiClient: GeminiClient,
        private readonly getApiKey: () => Promise<string | undefined>,
        private readonly modelName: string = 'text-embedding-004'
    ) {
        this.providerId = `gemini:${this.modelName}`;
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];
        
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API key is required for GeminiEmbeddingProvider');
        }

        const source = new vscode.CancellationTokenSource();
        // Typically timeout or token should be passed from caller, but for simplicity here we create one
        setTimeout(() => source.cancel(), 30000); 

        try {
            return await this.geminiClient.embedBatch(texts, apiKey, source.token, this.modelName);
        } finally {
            source.dispose();
        }
    }
}
