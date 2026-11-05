/**
 * [Why/Intent] ユーザーのフィードバック履歴（高評価・低評価）から、LLMを用いてペルソナおよびスタイルの好みを要約するクラス。
 * 通信は ILlmGateway を経由して構造化JSONを取得する。
 */
import type * as vscode from 'vscode';
import type { LlmProvider } from '../../types';
import type { ResponseRecord } from '../../types/personalization';
import type { GeminiClient } from '../llm/geminiClient';
import type { ILlmGateway } from '../llm/llmGateway';
import type { VscodeLmClient } from '../llm/vscodeLmClient';

/** [Why/Intent] 好み・ペルソナ要約の構造化出力（JSON Schema）定義 */
export const SUMMARY_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    required: ['personaSummary', 'preferenceSummary'],
    properties: {
        personaSummary: { type: 'STRING' },
        preferenceSummary: { type: 'STRING' },
    },
};

/**
 * [Why/Intent] PreferenceSummarizerの初期化パラメータ。ゲートウェイまたは個別クライアントをDI注入する
 */
export interface PreferenceSummarizerParams {
    gateway?: ILlmGateway;
    geminiClient?: GeminiClient;
    vscodeLmClient?: VscodeLmClient;
    getLlmConfig?: () => { provider: LlmProvider; model: string };
    getApiKey?: () => Promise<string | undefined>;
}

/**
 * [Why/Intent] ユーザーの過去フィードバック（評価済み回答履歴）から嗜好・ペルソナの要約文を生成するクラス。
 * ILlmGateway（またはレガシーClient）経由で要約タスクを実行する。
 */
export class PreferenceSummarizer {
    private readonly gateway?: ILlmGateway;
    private readonly geminiClient?: GeminiClient;
    private readonly vscodeLmClient?: VscodeLmClient;
    private readonly getLlmConfig?: () => { provider: LlmProvider; model: string };
    private readonly getApiKey?: () => Promise<string | undefined>;

    constructor(params: PreferenceSummarizerParams) {
        this.gateway = params.gateway;
        this.geminiClient = params.geminiClient;
        this.vscodeLmClient = params.vscodeLmClient;
        this.getLlmConfig = params.getLlmConfig;
        this.getApiKey = params.getApiKey;
    }

    /**
     * [Why/Intent] 好評価・低評価の履歴レコードを抽出し、LLMを用いて最新のペルソナおよび嗜好要約文を生成する
     */
    public async summarize(
        likedRecords: ResponseRecord[],
        dislikedRecords: ResponseRecord[],
        token: vscode.CancellationToken,
    ): Promise<{ personaSummary: string; preferenceSummary: string }> {
        const recentLiked = [...likedRecords].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
        const recentDisliked = [...dislikedRecords]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 8);

        if (recentLiked.length === 0 && recentDisliked.length === 0) {
            return { personaSummary: '', preferenceSummary: '' };
        }

        const prompt = this.buildPrompt(recentLiked, recentDisliked);

        if (this.gateway) {
            const rawResponse = await this.gateway.generateStructured<{
                personaSummary?: string;
                preferenceSummary?: string;
            }>({
                prompt,
                responseSchema: SUMMARY_RESPONSE_SCHEMA,
                token,
            });
            return this.parseAndValidate(rawResponse);
        }

        const config = this.getLlmConfig
            ? this.getLlmConfig()
            : { provider: 'gemini' as LlmProvider, model: 'gemini-3.5-flash-lite' };
        let rawResponse: unknown;
        if (config.provider === 'gemini' && this.geminiClient && this.getApiKey) {
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                throw new Error('Gemini API key is required.');
            }
            rawResponse = await this.geminiClient.generate({
                prompt,
                apiKey,
                token,
                modelName: config.model,
                responseSchema: SUMMARY_RESPONSE_SCHEMA,
            });
        } else if (this.vscodeLmClient) {
            rawResponse = await this.vscodeLmClient.generate(prompt, token, config.model);
        }

        return this.parseAndValidate(rawResponse);
    }

    private buildPrompt(liked: ResponseRecord[], disliked: ResponseRecord[]): string {
        const likedText = liked
            .map(
                (r, i) =>
                    `Liked ${i + 1} (Persona: ${r.persona}, Situation: ${r.situation}):\n${r.text}`,
            )
            .join('\n\n');
        const dislikedText = disliked
            .map(
                (r, i) =>
                    `Disliked ${i + 1} (Persona: ${r.persona}, Situation: ${r.situation}):\n${r.text}`,
            )
            .join('\n\n');

        return `
You are an analyst profiling a user's preferences for an AI coding assistant.
Analyze the responses the user liked and disliked, and generate a natural language summary of their preferences.

Liked Responses:
${likedText || 'None'}

Disliked Responses:
${dislikedText || 'None'}

Based on this, provide:
1. personaSummary: A 2-3 sentence overview of what kind of AI persona/role they prefer (e.g. "They prefer an AI that gives hints rather than full code...").
2. preferenceSummary: A bulleted list of 3-5 specific stylistic or structural preferences (e.g. "- Dislikes long introductions", "- Prefers bullet points").

Return as a JSON object with personaSummary and preferenceSummary strings.
`;
    }

    private parseAndValidate(rawResponse: unknown): {
        personaSummary: string;
        preferenceSummary: string;
    } {
        let parsed: unknown = rawResponse;
        if (typeof rawResponse === 'string') {
            try {
                parsed = JSON.parse(rawResponse);
            } catch {
                return { personaSummary: '', preferenceSummary: '' };
            }
        }

        if (typeof parsed !== 'object' || parsed === null) {
            return { personaSummary: '', preferenceSummary: '' };
        }

        const obj = parsed as Record<string, unknown>;
        return {
            personaSummary: typeof obj.personaSummary === 'string' ? obj.personaSummary : '',
            preferenceSummary:
                typeof obj.preferenceSummary === 'string' ? obj.preferenceSummary : '',
        };
    }
}
