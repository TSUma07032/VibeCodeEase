import { z } from 'zod';
import { PAIN_CATEGORIES, PainCategory } from './painCategory';

export const LlmEditSchema = z.object({
  startLine: z.number().int().min(0),
  startCharacter: z.number().int().min(0),
  endLine: z.number().int().min(0),
  endCharacter: z.number().int().min(0),
  oldText: z.string(),
  newText: z.string(),
  category: z.enum([
    'SYNTAX_TYPO',
    'INDENTATION_FORMATTING',
    'VAR_FUNC_MANAGEMENT',
    'SYNTAX_ERROR_HANDLING'
  ]) as z.ZodType<PainCategory>,
  reason: z.string(),
});

export const LlmInterventionPlanSchema = z.object({
  summary: z.string(),
  edits: z.array(LlmEditSchema),
});

export type LlmEdit = z.infer<typeof LlmEditSchema>;
export type LlmInterventionPlan = z.infer<typeof LlmInterventionPlanSchema>;