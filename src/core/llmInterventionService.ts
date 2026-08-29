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
     * 機密ファイルへのアクセスを拒否するセキュリティ検証
     */
    private validateDocument(document: vscode.TextDocument): void {
        const fileName = document.fileName.toLowerCase();
        if (fileName.includes('.env') || fileName.includes('.pem') || fileName.includes('.key') || fileName.includes('.git') || fileName.includes('secrets') || fileName.includes('credentials')) {
            throw new Error(`セキュリティ違反: 機密ファイル (${document.fileName}) はLLMに送信できません。`);
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