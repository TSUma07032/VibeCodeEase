import { z } from 'zod';
import { PAIN_CATEGORIES } from './painCategory';
import type { LlmEdit, LlmInterventionPlan } from './llmIntervention';

// LlmEdit Schema
export const LlmEditSchema: z.ZodType<LlmEdit> = z.object({
  startLine: z.number().int().min(0),
  startCharacter: z.number().int().min(0),
  endLine: z.number().int().min(0),
  endCharacter: z.number().int().min(0),
  oldText: z.string().min(1),
  newText: z.string(),
  category: z.enum([PAIN_CATEGORIES[0], ...PAIN_CATEGORIES.slice(1)]),
  reason: z.string()
});

// LlmInterventionPlan Schema
export const LlmInterventionPlanSchema: z.ZodType<LlmInterventionPlan> = z.object({
  summary: z.string(),
  edits: z.array(LlmEditSchema)
});
