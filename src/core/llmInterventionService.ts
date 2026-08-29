import * as vscode from 'vscode';
import { LlmInterventionPlan } from '../types';
import { buildInterventionPrompt } from './llm/promptBuilder';
import { validatePlan } from './llm/planValidator';
import { GeminiClient } from './llm/geminiClient';
import { VscodeLmClient } from './llm/vscodeLmClient';

export class LlmInterventionService {
    constructor(
        private readonly geminiClient = new GeminiClient(),
        private readonly vscodeLmClient = new VscodeLmClient()
    ) {}

    /**
     * 🛡️ Sentinel: 機密ファイル（.env, .pem, .key, credentials等）がLLMに送信されるのを防ぐ
     */
    private validateDocument(document: vscode.TextDocument): void {
        const fileName = document.fileName.toLowerCase();
        const sensitivePatterns = [/\.env/i, /\.pem/i, /\.key/i, /\.git/i, /secrets/i, /credentials/i];
        if (sensitivePatterns.some(pattern => pattern.test(fileName))) {
            const fileNameOnly = document.uri.path.split('/').pop() || document.fileName;
            throw new Error(`セキュリティ違反: 機密ファイル (${fileNameOnly}) はLLMに送信できません。`);
        }
    }

    /**
     * Gemini REST API を使用してファイルの介入プラン（修正案）を作成する
     */
    public async createGeminiPlan(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        apiKey: string
    ): Promise<LlmInterventionPlan> {
        this.validateDocument(document);
        const prompt = buildInterventionPrompt(document);
        const rawResult = await this.geminiClient.generate(prompt, apiKey, token);
        return validatePlan(rawResult, document);
    }

    /**
     * VS Code Language Model API を使用してファイルの介入プラン（修正案）を作成する
     */
    public async createPlan(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<LlmInterventionPlan> {
        this.validateDocument(document);
        const prompt = buildInterventionPrompt(document);
        const rawResult = await this.vscodeLmClient.generate(prompt, token);
        return validatePlan(rawResult, document);
    }
}