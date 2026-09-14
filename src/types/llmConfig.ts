export type LlmProvider = 'gemini' | 'vscode-lm';

export interface LlmConfig {
    provider: LlmProvider;
    model: string;
}
