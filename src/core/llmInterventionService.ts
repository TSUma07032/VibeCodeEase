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
     * Gemini REST API を使用してファイルの介入プラン（修正案）を作成する
     */
    public async createGeminiPlan(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        apiKey: string
    ): Promise<LlmInterventionPlan> {
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
        const prompt = buildInterventionPrompt(document);
        const rawResult = await this.vscodeLmClient.generate(prompt, token);
        return validatePlan(rawResult, document);
    }
}