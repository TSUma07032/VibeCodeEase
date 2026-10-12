import type * as vscode from 'vscode';
import type { LlmProvider } from '../../types';
import type {
    Candidate,
    PersonaId,
    PersonaWeights,
    SituationId,
} from '../../types/personalization';
import type { GeminiClient } from '../llm/geminiClient';
import type { VscodeLmClient } from '../llm/vscodeLmClient';
import { DESIGNER_POLICY, PERSONA_DEFINITIONS, SITUATION_LABELS } from './personaDefinitions';

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
 * [Why/Intent] CandidateGenerator の初期化に必要な依存サービス（LLMクライアント・設定取得関数等）
 */
export interface CandidateGeneratorParams {
    geminiClient: GeminiClient;
    vscodeLmClient: VscodeLmClient;
    getLlmConfig: () => { provider: LlmProvider; model: string };
    getApiKey: () => Promise<string | undefined>;
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

export class CandidateGenerator {
    private readonly geminiClient: GeminiClient;
    private readonly vscodeLmClient: VscodeLmClient;
    private readonly getLlmConfig: () => { provider: LlmProvider; model: string };
    private readonly getApiKey: () => Promise<string | undefined>;

    constructor(params: CandidateGeneratorParams) {
        this.geminiClient = params.geminiClient;
        this.vscodeLmClient = params.vscodeLmClient;
        this.getLlmConfig = params.getLlmConfig;
        this.getApiKey = params.getApiKey;
    }

    public async generateCandidates(params: GenerateCandidatesParams): Promise<Candidate[]> {
        const prompt = this.buildPrompt(params);

        const config = this.getLlmConfig();
        let rawResponse: unknown;

        if (config.provider === 'gemini') {
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
        } else {
            rawResponse = await this.vscodeLmClient.generate(prompt, params.token, config.model);
        }

        return this.parseAndValidate(rawResponse);
    }

    private buildPrompt(params: BuildPromptParams): string {
        const situationLabel = SITUATION_LABELS[params.situation];

        // Select which personas to generate candidates for.
        // We'll generate 4 candidates. To ensure diversity, we'll pick based on weights,
        // but ensure at least 3 distinct personas if possible.
        const sortedPersonas = Object.entries(params.personaWeights)
            .sort(([, a], [, b]) => b - a)
            .map(([p]) => p as PersonaId);

        // Generate 4 candidates total
        const assignments: PersonaId[] = [
            sortedPersonas[0],
            sortedPersonas[0], // 2 from dominant
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

Current Situation: ${situationLabel}
User Preference Summary (if any):
${params.preferenceSummary ? params.preferenceSummary : 'None yet.'}

INSTRUCTIONS:
1. Generate 4 candidates. ALL candidates must be factually correct and address the user's query.
2. DO NOT change the technical correctness or safety between candidates.
3. INSTEAD, change the *style, level of intervention, length, and approach* according to the persona assigned to each candidate below.
4. "policyCompliant" MUST be true if the candidate strictly follows the DESIGNER_POLICY. If it violates safety, set it to false.

PERSONA ASSIGNMENTS:
${instructionsForCandidates}

Respond ONLY with a JSON array conforming exactly to this schema:
${JSON.stringify(CANDIDATES_RESPONSE_SCHEMA)}

User Query:
${params.userQuery}

${params.contextCode ? `Selected Context Code:\n\`\`\`\n${params.contextCode}\n\`\`\`` : ''}
`;
    }

    private parseAndValidate(raw: unknown): Candidate[] {
        if (!Array.isArray(raw)) {
            throw new Error('LLM response is not an array.');
        }

        const candidates: Candidate[] = [];

        for (const item of raw) {
            if (isValidCandidate(item)) {
                candidates.push({
                    id: item.id,
                    persona: item.persona,
                    text: item.text,
                    policyCompliant: item.policyCompliant,
                });
            }
        }

        if (candidates.length === 0) {
            throw new Error('Failed to parse any valid candidates from LLM response.');
        }

        return candidates;
    }
}
