import * as vscode from 'vscode';
import { ResponseRecord } from '../../types/personalization';
import { GeminiClient } from '../llm/geminiClient';
import { VscodeLmClient } from '../llm/vscodeLmClient';
import { LlmProvider } from '../../types';

export const SUMMARY_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    required: ['personaSummary', 'preferenceSummary'],
    properties: {
        personaSummary: { type: 'STRING' },
        preferenceSummary: { type: 'STRING' }
    }
};

export class PreferenceSummarizer {
    constructor(
        private readonly geminiClient: GeminiClient,
        private readonly vscodeLmClient: VscodeLmClient,
        private readonly getLlmConfig: () => { provider: LlmProvider, model: string },
        private readonly getApiKey: () => Promise<string | undefined>
    ) {}

    public async summarize(
        likedRecords: ResponseRecord[],
        dislikedRecords: ResponseRecord[],
        token: vscode.CancellationToken
    ): Promise<{ personaSummary: string; preferenceSummary: string }> {
        // Take up to 8 recent records
        const recentLiked = likedRecords.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
        const recentDisliked = dislikedRecords.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);

        if (recentLiked.length === 0 && recentDisliked.length === 0) {
            return { personaSummary: '', preferenceSummary: '' };
        }

        const prompt = this.buildPrompt(recentLiked, recentDisliked);
        const config = this.getLlmConfig();
        
        let rawResponse: unknown;
        if (config.provider === 'gemini') {
            const apiKey = await this.getApiKey();
            if (!apiKey) throw new Error('Gemini API key is required.');
            rawResponse = await this.geminiClient.generate(prompt, apiKey, token, config.model, SUMMARY_RESPONSE_SCHEMA);
        } else {
            rawResponse = await this.vscodeLmClient.generate(prompt, token, config.model);
        }

        return this.parseAndValidate(rawResponse);
    }

    private buildPrompt(liked: ResponseRecord[], disliked: ResponseRecord[]): string {
        const likedText = liked.map((r, i) => `Liked ${i + 1} (Persona: ${r.persona}, Situation: ${r.situation}):\n${r.text}`).join('\n\n');
        const dislikedText = disliked.map((r, i) => `Disliked ${i + 1} (Persona: ${r.persona}, Situation: ${r.situation}):\n${r.text}`).join('\n\n');

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

Respond ONLY with a JSON object conforming exactly to this schema:
${JSON.stringify(SUMMARY_RESPONSE_SCHEMA)}
`;
    }

    private parseAndValidate(raw: unknown): { personaSummary: string; preferenceSummary: string } {
        if (typeof raw !== 'object' || raw === null) {
            throw new Error('LLM response is not an object.');
        }

        const obj = raw as Record<string, unknown>;
        
        if (typeof obj.personaSummary === 'string' && typeof obj.preferenceSummary === 'string') {
            return {
                personaSummary: obj.personaSummary,
                preferenceSummary: obj.preferenceSummary
            };
        }

        throw new Error('Invalid schema from LLM for summary.');
    }
}
