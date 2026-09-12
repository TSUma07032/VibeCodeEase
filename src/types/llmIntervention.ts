import { z } from 'zod';
import { PainCategory, PAIN_CATEGORIES } from './painCategory';

export const LlmEditSchema = z.object({
  startLine: z.number().int().min(0),
  startCharacter: z.number().int().min(0),
  endLine: z.number().int().min(0),
  endCharacter: z.number().int().min(0),
  oldText: z.string(),
  newText: z.string(),
  category: z.enum(PAIN_CATEGORIES as [string, ...string[]]),
  reason: z.string()
});

export const LlmInterventionPlanSchema = z.object({
  summary: z.string(),
  edits: z.array(LlmEditSchema)
});

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