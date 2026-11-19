/**
 * [Why/Intent] ユーザーのシチュエーションおよびペルソナ重みに応じて複数の回答候補を生成するクラス。
 * 通信は ILlmGateway を経由し、各プロバイダの差異を隠蔽して構造化候補配列を型安全に取得する。
 */
import type * as vscode from 'vscode';
import type { LlmProvider } from '../../types';
import type {
    Candidate,
    PersonaId,
    PersonaWeights,
    SituationId,
} from '../../types/personalization';
import type { GeminiClient } from '../llm/geminiClient';
import type { ILlmGateway } from '../llm/llmGateway';
import type { VscodeLmClient } from '../llm/vscodeLmClient';
import { DESIGNER_POLICY, PERSONA_DEFINITIONS, SITUATION_LABELS } from './personaDefinitions';

/** [Why/Intent] ペルソナ候補群の構造化出力（JSON Schema）定義 */
export const CANDIDATES_RESPONSE_SCHEMA = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        required: ['id', 'persona', 'text', 'policyCompliant'],
        properties: {
            id: { type: 'STRING' },
            persona: { type: 'STRING', enum: ['exploration', 'learning', 'quality'] },
            text: { type: 'STRING' },
            policyCompliant: { type: 'BOOLEAN' },
        },
    },
};

/**
 * [Why/Intent] CandidateGenerator の初期化に必要な依存サービス（Gateway または低レベルクライアント群）
 */
export interface CandidateGeneratorParams {
    gateway?: ILlmGateway;
    geminiClient?: GeminiClient;
    vscodeLmClient?: VscodeLmClient;
    getLlmConfig?: () => { provider: LlmProvider; model: string };
    getApiKey?: () => Promise<string | undefined>;
}

/**
 * [Why/Intent] 複数ペルソナ候補生成に必要なクエリ、コンテキストコード、シチュエーション、ペルソナ重み、要約
 */
export interface GenerateCandidatesParams {
    userQuery: string;
    contextCode: string | undefined;
    situation: SituationId;
    personaWeights: PersonaWeights;
    preferenceSummary: string;
    token: vscode.CancellationToken;
}

/**
 * [Why/Intent] ペルソナ候補生成プロンプト構築に必要な入力パラメータ
 */
export interface BuildPromptParams {
    userQuery: string;
    contextCode: string | undefined;
    situation: SituationId;
    personaWeights: PersonaWeights;
    preferenceSummary: string;
}

/**
 * [Why/Intent] LLMから返された各候補オブジェクトが Candidate インターフェースの必須フィールドを満たすか判定するユーザー定義型ガード
 */
function isValidCandidate(obj: unknown): obj is Candidate {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const rec = obj as Record<string, unknown>;
    const validPersonas = ['exploration', 'learning', 'quality'];
    return (
        typeof rec.id === 'string' &&
        typeof rec.persona === 'string' &&
        validPersonas.includes(rec.persona) &&
        typeof rec.text === 'string' &&
        typeof rec.policyCompliant === 'boolean'
    );
}

/**
 * [Why/Intent] ユーザーの状況とペルソナ重みに基づき、LLMを用いて複数の回答候補を生成するクラス。
 * ILlmGateway（またはレガシーClient）経由で生成リクエストを実行し、スキーマ準拠検証を行う。
 */
export class CandidateGenerator {
    private readonly gateway?: ILlmGateway;
    private readonly geminiClient?: GeminiClient;
    private readonly vscodeLmClient?: VscodeLmClient;
    private readonly getLlmConfig?: () => { provider: LlmProvider; model: string };
    private readonly getApiKey?: () => Promise<string | undefined>;

    constructor(params: CandidateGeneratorParams) {
        this.gateway = params.gateway;
        this.geminiClient = params.geminiClient;
        this.vscodeLmClient = params.vscodeLmClient;
        this.getLlmConfig = params.getLlmConfig;
        this.getApiKey = params.getApiKey;
    }

    /**
     * [Why/Intent] 統一ゲートウェイまたはフォールバッククライアント経由でペルソナ候補群を生成する
     */
    public async generateCandidates(params: GenerateCandidatesParams): Promise<Candidate[]> {
        const prompt = this.buildPrompt(params);

        if (this.gateway) {
            const rawResponse = await this.gateway.generateStructured<unknown>({
                prompt,
                responseSchema: CANDIDATES_RESPONSE_SCHEMA,
                token: params.token,
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
                token: params.token,
                modelName: config.model,
                responseSchema: CANDIDATES_RESPONSE_SCHEMA,
            });
        } else if (this.vscodeLmClient) {
            rawResponse = await this.vscodeLmClient.generate(prompt, params.token, config.model);
        }

        return this.parseAndValidate(rawResponse);
    }

    /**
     * [Why/Intent] 状況・コード・ペルソナ比率を埋め込んだ候補生成プロンプト文字列を構築する
     */
    private buildPrompt(params: BuildPromptParams): string {
        const sortedPersonas = Object.entries(params.personaWeights)
            .sort(([, a], [, b]) => b - a)
            .map(([p]) => p as PersonaId);

        const assignments: PersonaId[] = [
            sortedPersonas[0],
            sortedPersonas[0],
            sortedPersonas[1],
            sortedPersonas[2],
        ];

        const instructionsForCandidates = assignments
            .map((p, idx) => {
                const def = PERSONA_DEFINITIONS[p];
                return (
                    `Candidate ${idx + 1} (id: "cand_${idx + 1}", persona: "${p}"):\n` +
                    `Goal: ${def.purpose}\n` +
                    `Characteristics: ${def.characteristics.join(', ')}\n` +
                    `Outputs to include: ${def.expectedOutputs.join(', ')}`
                );
            })
            .join('\n\n');

        return `
You are a coding assistant. Your task is to generate 4 different candidate responses to the user's query.

${DESIGNER_POLICY}

Current Situation: ${SITUATION_LABELS[params.situation]}
User Preferences Summary:
${params.preferenceSummary || 'No specific preferences recorded yet.'}

User Query:
${params.userQuery}

${params.contextCode ? `Context Code:\n${params.contextCode}` : ''}

Generate 4 candidate responses adhering to these persona assignments:
${instructionsForCandidates}

Return the response as a JSON array matching the provided schema. Each candidate must have id, persona, text, and policyCompliant fields.
`;
    }

    /**
     * [Why/Intent] LLM返答をパースし、候補モデルのスキーマ妥当性検証と型安全なフィルタリングを行う
     */
    private parseAndValidate(rawResponse: unknown): Candidate[] {
        let parsed: unknown = rawResponse;
        if (typeof rawResponse === 'string') {
            try {
                parsed = JSON.parse(rawResponse);
            } catch {
                return [];
            }
        }

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter(isValidCandidate);
    }
}
