export type LlmProvider = 'gemini' | 'vscode-lm';

export interface LlmConfig {
    provider: LlmProvider;
    model: string;
}

export type LlmTriggerMode = 'continuous' | 'on-save' | 'disabled';
