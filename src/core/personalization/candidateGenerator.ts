import * as vscode from 'vscode';
import { Candidate, PersonaId, SituationId, PersonaWeights } from '../../types/personalization';
import { DESIGNER_POLICY, PERSONA_DEFINITIONS, SITUATION_LABELS } from './personaDefinitions';
import { GeminiClient } from '../llm/geminiClient';
import { VscodeLmClient } from '../llm/vscodeLmClient';
import { LlmProvider } from '../../types';

export const CANDIDATES_RESPONSE_SCHEMA = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        required: ['id', 'persona', 'text', 'policyCompliant'],
        properties: {
            id: { type: 'STRING' },
            persona: { type: 'STRING', enum: ['exploration', 'learning', 'quality'] },
            text: { type: 'STRING' },
            policyCompliant: { type: 'BOOLEAN' }
        }
    }
};

export class CandidateGenerator {
    constructor(
        private readonly geminiClient: GeminiClient,
        private readonly vscodeLmClient: VscodeLmClient,
        private readonly getLlmConfig: () => { provider: LlmProvider, model: string },
        private readonly getApiKey: () => Promise<string | undefined>
    ) {}

    public async generateCandidates(
        userQuery: string,
        contextCode: string | undefined,
        situation: SituationId,
        personaWeights: PersonaWeights,
        preferenceSummary: string,
        token: vscode.CancellationToken
    ): Promise<Candidate[]> {
        const prompt = this.buildPrompt(userQuery, contextCode, situation, personaWeights, preferenceSummary);
        
        const config = this.getLlmConfig();
        let rawResponse: unknown;

        if (config.provider === 'gemini') {
            const apiKey = await this.getApiKey();
            if (!apiKey) throw new Error('Gemini API key is required.');
            rawResponse = await this.geminiClient.generate(prompt, apiKey, token, config.model, CANDIDATES_RESPONSE_SCHEMA);
        } else {
            rawResponse = await this.vscodeLmClient.generate(prompt, token, config.model);
        }

        return this.parseAndValidate(rawResponse);
    }

    private buildPrompt(
        userQuery: string,
        contextCode: string | undefined,
        situation: SituationId,
        personaWeights: PersonaWeights,
        preferenceSummary: string
    ): string {
        const situationLabel = SITUATION_LABELS[situation];
        
        // Select which personas to generate candidates for.
        // We'll generate 4 candidates. To ensure diversity, we'll pick based on weights, 
        // but ensure at least 3 distinct personas if possible.
        const sortedPersonas = Object.entries(personaWeights)
            .sort(([, a], [, b]) => b - a)
            .map(([p]) => p as PersonaId);
        
        // Generate 4 candidates total
        const assignments: PersonaId[] = [
            sortedPersonas[0],
            sortedPersonas[0], // 2 from dominant
            sortedPersonas[1],
            sortedPersonas[2]
        ];

        let instructionsForCandidates = assignments.map((p, idx) => {
            const def = PERSONA_DEFINITIONS[p];
            return `Candidate ${idx + 1} (id: "cand_${idx + 1}", persona: "${p}"):\n` +
                   `Goal: ${def.purpose}\n` +
                   `Characteristics: ${def.characteristics.join(', ')}\n` +
                   `Outputs to include: ${def.expectedOutputs.join(', ')}`;
        }).join('\n\n');

        return `
You are a coding assistant. Your task is to generate 4 different candidate responses to the user's query.

${DESIGNER_POLICY}

Current Situation: ${situationLabel}
User Preference Summary (if any):
${preferenceSummary ? preferenceSummary : 'None yet.'}

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
${userQuery}

${contextCode ? `Selected Context Code:\n\`\`\`\n${contextCode}\n\`\`\`` : ''}
`;
    }

    private parseAndValidate(raw: unknown): Candidate[] {
        if (!Array.isArray(raw)) {
            throw new Error('LLM response is not an array.');
        }

        const validPersonas = ['exploration', 'learning', 'quality'];
        const candidates: Candidate[] = [];

        for (const item of raw) {
            if (typeof item !== 'object' || item === null) continue;
            const obj = item as Record<string, unknown>;
            
            if (
                typeof obj.id === 'string' &&
                typeof obj.persona === 'string' && validPersonas.includes(obj.persona) &&
                typeof obj.text === 'string' &&
                typeof obj.policyCompliant === 'boolean'
            ) {
                candidates.push({
                    id: obj.id,
                    persona: obj.persona as PersonaId,
                    text: obj.text,
                    policyCompliant: obj.policyCompliant
                });
            }
        }

        if (candidates.length === 0) {
            throw new Error('Failed to parse any valid candidates from LLM response.');
        }

        return candidates;
    }
}
