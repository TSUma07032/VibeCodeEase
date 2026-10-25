import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { LlmInterventionPlan } from '../types';
import type { PresetMode } from '../types/preset';
import { GeminiClient } from './llm/geminiClient';
import { validatePlan } from './llm/planValidator';
import { buildInterventionPrompt } from './llm/promptBuilder';
import { VscodeLmClient } from './llm/vscodeLmClient';

/**
 * [Why/Intent] Gemini APIのStructured Outputs(JSON Schema)を利用し、完成予想や4段階ヒントを型安全に抽出するためのOptions型。
 */
export interface RequestStructuredOutputOptions {
    /** [Why/Intent] モデルの振る舞い・教育的ペルソナを定義するシステムプロンプト */
    systemInstruction: string;
    /** [Why/Intent] ユーザーコードや学習目標を含むユーザー入力プロンプト */
    userPrompt: string;
    /** [Why/Intent] レスポンスのJSON構造を強制するJSON Schemaオブジェクト */
    responseSchema: unknown;
    /** [Why/Intent] 明示的に渡すAPIキー (未指定時はSecretStorageから取得) */
    apiKey?: string;
    /** [Why/Intent] ユーザー操作等による処理中断を受け付けるキャンセレーショントークン */
    token?: vscode.CancellationToken;
    /** [Why/Intent] 使用するLLMモデル名 (未指定時は設定ストアの値を使用) */
    modelName?: string;
}

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

const SENSITIVE_FILE_PATTERNS = [
    /\.env/i,
    /\.pem/i,
    /\.key/i,
    /\.git/i,
    /secrets/i,
    /credentials/i,
];

export function isSensitiveDocument(document: vscode.TextDocument): boolean {
    if (document.languageId === 'secrets') {
        return true;
    }
    const fileName = document.fileName.toLowerCase();
    return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

export class LlmInterventionService {
    constructor(
        private readonly geminiClient = new GeminiClient(),
        private readonly vscodeLmClient = new VscodeLmClient(),
        private readonly secrets?: vscode.SecretStorage,
    ) {}

    /**
     * 🛡️ Sentinel: 機密ファイル（.env, .pem, .key, credentials等）がLLMに送信されるのを防ぐ
     */
    private validateDocument(document: vscode.TextDocument): void {
        if (isSensitiveDocument(document)) {
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

    /**
     * [Why/Intent] 構造化出力（JSON Schema）を指定してLLMにプロンプトを送信し、JSON文字列を返す
     */
    public async requestStructuredOutput(options: RequestStructuredOutputOptions): Promise<string> {
        let apiKey = options.apiKey;
        // 🛡️ Sentinel: APIキーは平文の設定ファイルからの取得を禁止し、SecretStorageに限定する
        if (!apiKey && this.secrets) {
            apiKey = await this.secrets.get('vibecodeease.geminiApiKey');
        }
        if (!apiKey) {
            throw new Error('API Key is missing');
        }

        const prompt = `${options.systemInstruction}\n\n${options.userPrompt}`;
        const fallbackCts = options.token ? undefined : new vscode.CancellationTokenSource();
        const token = options.token ?? (fallbackCts as vscode.CancellationTokenSource).token;
        try {
            const rawResult = await this.geminiClient.generate({
                prompt,
                apiKey,
                token,
                modelName: options.modelName ?? GlobalState.getInstance().llmModel,
                responseSchema: options.responseSchema,
            });

            if (typeof rawResult === 'string') {
                return rawResult;
            }
            return JSON.stringify(rawResult);
        } finally {
            fallbackCts?.dispose();
        }
    }
}
