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

export type LlmEdit = z.infer<typeof LlmEditSchema> & { category: PainCategory };
export type LlmInterventionPlan = z.infer<typeof LlmInterventionPlanSchema> & { edits: LlmEdit[] };