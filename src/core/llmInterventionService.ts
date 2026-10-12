import type * as vscode from 'vscode';
import type { LlmInterventionPlan } from '../types';
import type { PresetMode } from '../types/preset';
import { GeminiClient } from './llm/geminiClient';
import { validatePlan } from './llm/planValidator';
import { buildInterventionPrompt } from './llm/promptBuilder';
import { VscodeLmClient } from './llm/vscodeLmClient';

export interface CreateGeminiPlanOptions {
    document: vscode.TextDocument;
    token: vscode.CancellationToken;
    apiKey: string;
    modelName?: string;
    preferenceSummary?: string;
    presetMode?: PresetMode;
}

export interface CreatePlanOptions {
    document: vscode.TextDocument;
    token: vscode.CancellationToken;
    modelSelector?: string;
    preferenceSummary?: string;
    presetMode?: PresetMode;
}

export class LlmInterventionService {
    constructor(
        private readonly geminiClient = new GeminiClient(),
        private readonly vscodeLmClient = new VscodeLmClient(),
    ) {}

    /**
     * 🛡️ Sentinel: 機密ファイル（.env, .pem, .key, credentials等）がLLMに送信されるのを防ぐ
     */
    private validateDocument(document: vscode.TextDocument): void {
        const fileName = document.fileName.toLowerCase();
        const sensitivePatterns = [
            /\.env/i,
            /\.pem/i,
            /\.key/i,
            /\.git/i,
            /secrets/i,
            /credentials/i,
        ];
        if (sensitivePatterns.some((pattern) => pattern.test(fileName))) {
            const fileNameOnly = document.uri.path.split('/').pop() ?? document.fileName;
            throw new Error(
                `セキュリティ違反: 機密ファイル (${fileNameOnly}) はLLMに送信できません。`,
            );
        }
    }

    /**
     * Gemini REST API を使用してファイルの介入プラン（修正案）を作成する
     */
    public async createGeminiPlan(options: CreateGeminiPlanOptions): Promise<LlmInterventionPlan> {
        this.validateDocument(options.document);
        const prompt = buildInterventionPrompt(
            options.document,
            options.preferenceSummary,
            options.presetMode,
        );
        const rawResult = await this.geminiClient.generate({
            prompt,
            apiKey: options.apiKey,
            token: options.token,
            modelName: options.modelName,
        });
        return validatePlan(rawResult, options.document);
    }

    /**
     * VS Code Language Model API を使用してファイルの介入プラン（修正案）を作成する
     */
    public async createPlan(options: CreatePlanOptions): Promise<LlmInterventionPlan> {
        this.validateDocument(options.document);
        const prompt = buildInterventionPrompt(
            options.document,
            options.preferenceSummary,
            options.presetMode,
        );
        const rawResult = await this.vscodeLmClient.generate(
            prompt,
            options.token,
            options.modelSelector,
        );
        return validatePlan(rawResult, options.document);
    }
}
