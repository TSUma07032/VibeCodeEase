import { z } from 'zod';

export const LlmEditSchema = z.object({
  startLine: z.number().int().min(0),
  startCharacter: z.number().int().min(0),
  endLine: z.number().int().min(0),
  endCharacter: z.number().int().min(0),
  oldText: z.string(),
  newText: z.string(),
  category: z.enum(['SYNTAX_TYPO', 'INDENTATION_FORMATTING', 'VAR_FUNC_MANAGEMENT', 'SYNTAX_ERROR_HANDLING']),
  reason: z.string(),
});

export type LlmEdit = z.infer<typeof LlmEditSchema>;

export const LlmInterventionPlanSchema = z.object({
  summary: z.string(),
  edits: z.array(LlmEditSchema),
});

export type LlmInterventionPlan = z.infer<typeof LlmInterventionPlanSchema>;