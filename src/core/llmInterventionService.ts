/**
 * [Why/Intent] コードレビュー・AI介入計画の生成および構造化LLM出力を提供するサービス。
 * 通信はすべて ILlmGateway を経由し、機密ファイルガード（assertNotSensitiveDocument）により保護される。
 */
import * as vscode from 'vscode';
import { GlobalState } from '../state/globalState';
import type { LlmInterventionPlan } from '../types';
import type { PresetMode } from '../types/preset';
import { LlmConfigRepository } from './llm/llmConfigRepository';
import { GEMINI_SUPPORTED_MODELS } from './llm/llmConstants';
import { type GenerateStructuredOptions, type ILlmGateway, LlmGateway } from './llm/llmGateway';
import { validatePlan } from './llm/planValidator';
import { buildInterventionPrompt, INTERVENTION_RESPONSE_SCHEMA } from './llm/promptBuilder';
import { assertNotSensitiveDocument, isSensitiveDocument } from './utils/sensitiveDocumentGuard';

export { isSensitiveDocument };

/**
 * [Why/Intent] 構造化出力生成のリクエストパラメータ
 */
export interface RequestStructuredOutputOptions {
    /** [Why/Intent] モデルの振る舞い・教育的ペルソナを定義するシステム指示文 */
    systemInstruction: string;
    /** [Why/Intent] ユーザーコードや学習目標を含むユーザー入力プロンプト */
    userPrompt: string;
    /** [Why/Intent] レスポンスのJSON構造を強制するJSON Schemaオブジェクト */
    responseSchema: unknown;
    /** [Why/Intent] 明示的に渡すAPIキー (未指定時はGateway側で自動解決) */
    apiKey?: string;
    /** [Why/Intent] 処理中断を受け付けるキャンセレーショントークン */
    token?: vscode.CancellationToken;
    /** [Why/Intent] 使用するLLMモデル名 (未指定時は設定ストアの値を使用) */
    modelName?: string;
}

/**
 * [Why/Intent] 介入計画生成のオプション
 */
export interface CreatePlanOptions {
    document: vscode.TextDocument;
    token: vscode.CancellationToken;
    modelSelector?: string;
    preferenceSummary?: string;
    presetMode?: PresetMode;
}

/**
 * [Why/Intent] 後方互換性のためのGemini計画生成オプション型
 */
export interface CreateGeminiPlanOptions extends CreatePlanOptions {
    apiKey?: string;
    modelName?: string;
}

/**
 * [Why/Intent] ILlmGatewayを通じたコード推敲・AI介入生成の統括サービス。
 * 機密ファイルの検査、プロンプト生成、構造化出力取得、および後方互換性アダプタを提供する。
 */
export class LlmInterventionService {
    private readonly gateway: ILlmGateway;

    /**
     * [Why/Intent] 統一ゲートウェイまたは後方互換クライアントを注入してサービスを初期化する
     */
    constructor(
        gatewayOrClient?: ILlmGateway | { generate: (opts: unknown) => Promise<unknown> },
        _vscodeLmClient?: unknown,
        secrets?: vscode.SecretStorage,
    ) {
        if (gatewayOrClient && 'generateStructured' in gatewayOrClient) {
            this.gateway = gatewayOrClient;
        } else if (gatewayOrClient && 'generate' in gatewayOrClient) {
            this.gateway = {
                generateStructured: async <T>(opts: GenerateStructuredOptions<T>) => {
                    let key: string | undefined;
                    if (secrets) {
                        key = await secrets.get('vibecodeease.geminiApiKey');
                    }
                    return gatewayOrClient.generate({ ...opts, apiKey: key }) as Promise<T>;
                },
                embedBatch: () => Promise.resolve([]),
                getAvailableModels: () => Promise.resolve([...GEMINI_SUPPORTED_MODELS]),
            };
        } else {
            const configRepo = new LlmConfigRepository(secrets ?? ({} as vscode.SecretStorage));
            this.gateway = new LlmGateway(configRepo);
        }
    }

    /**
     * [Why/Intent] 統一ゲートウェイ経由でファイルの介入プラン（修正案）を作成する
     */
    public async createPlan(options: CreatePlanOptions): Promise<LlmInterventionPlan> {
        assertNotSensitiveDocument(options.document);
        const prompt = buildInterventionPrompt(
            options.document,
            options.preferenceSummary,
            options.presetMode,
        );
        const rawResult = await this.gateway.generateStructured<unknown>({
            prompt,
            responseSchema: INTERVENTION_RESPONSE_SCHEMA,
            token: options.token,
            modelName: options.modelSelector,
        });
        return validatePlan(rawResult, options.document);
    }

    /**
     * [Why/Intent] 後方互換性のためのGemini計画生成メソッド。
     */
    public async createGeminiPlan(options: CreateGeminiPlanOptions): Promise<LlmInterventionPlan> {
        assertNotSensitiveDocument(options.document);
        const prompt = buildInterventionPrompt(
            options.document,
            options.preferenceSummary,
            options.presetMode,
        );
        const rawResult = await this.gateway.generateStructured<unknown>({
            prompt,
            responseSchema: INTERVENTION_RESPONSE_SCHEMA,
            token: options.token,
            modelName: options.modelName,
        });
        return validatePlan(rawResult, options.document);
    }

    /**
     * [Why/Intent] 構造化出力（JSON Schema）を指定してLLMにプロンプトを送信し、型付けされたオブジェクトを直接取得する。
     * 二重シリアライズ/デシリアライズを完全に解消する。
     */
    public async requestStructured<T>(
        options: RequestStructuredOutputOptions,
        responseValidator?: (data: unknown) => T,
    ): Promise<T> {
        const fallbackCts = options.token ? undefined : new vscode.CancellationTokenSource();
        const token = options.token ?? (fallbackCts as vscode.CancellationTokenSource).token;

        try {
            return await this.gateway.generateStructured<T>({
                systemInstruction: options.systemInstruction,
                userPrompt: options.userPrompt,
                responseSchema: options.responseSchema,
                token,
                modelName: options.modelName ?? GlobalState.getInstance().llmModel,
                responseValidator,
            });
        } finally {
            fallbackCts?.dispose();
        }
    }

    /**
     * [Why/Intent] 後方互換性のためのメソッド。requestStructured で取得したオブジェクトをJSON文字列化して返却する。
     */
    public async requestStructuredOutput(options: RequestStructuredOutputOptions): Promise<string> {
        const result = await this.requestStructured<unknown>(options);
        if (typeof result === 'string') {
            return result;
        }
        return JSON.stringify(result);
    }
}
