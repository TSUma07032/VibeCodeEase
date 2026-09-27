import { z } from 'zod';
import { PainCategory } from './painCategory';

export const LlmEditSchema = z.object({
  startLine: z.number().int().min(0),
  startCharacter: z.number().int().min(0),
  endLine: z.number().int().min(0),
  endCharacter: z.number().int().min(0),
  oldText: z.string().min(1),
  newText: z.string(),
  category: z.enum(['SYNTAX_TYPO', 'INDENTATION_FORMATTING', 'VAR_FUNC_MANAGEMENT', 'SYNTAX_ERROR_HANDLING']),
  reason: z.string()
});

export type LlmEdit = z.infer<typeof LlmEditSchema>;

export const LlmInterventionPlanSchema = z.object({
  summary: z.string(),
  edits: z.array(LlmEditSchema)
});

export type LlmInterventionPlan = z.infer<typeof LlmInterventionPlanSchema>;