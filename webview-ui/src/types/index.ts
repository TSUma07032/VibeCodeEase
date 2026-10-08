export interface Proposal {
  id: string;
  originalText: string;
  proposedText: string;
  explanation: string;
  status: 'pending' | 'accepted' | 'rejected';
  documentUri?: string;
}

export interface Settings {
  triggerMode: 'on-save' | 'interval-10s' | 'disabled';
  personalizationTrend: string;
  llmApiKey: string;
  llmModel: string;
}
