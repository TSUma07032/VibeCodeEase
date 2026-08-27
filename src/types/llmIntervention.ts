import { PainCategory } from './painCategory';

export interface LlmEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  oldText: string;
  newText: string;
  category: PainCategory;
  reason: string;
}

export interface LlmInterventionPlan {
  summary: string;
  edits: LlmEdit[];
}