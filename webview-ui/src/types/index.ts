export interface Proposal {
  id: string;
  originalText: string;
  proposedText: string;
  explanation: string;
  status: 'pending' | 'accepted' | 'rejected';
  documentUri?: string;
}

export interface Settings {
  interventionLevel: number; // 0 to 100
  personalizationTrend: string;
  llmApiKey: string; // Task 2: LLM API key setting
}
