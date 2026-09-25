import { z } from 'zod';

export const PainCategorySchema = z.enum([
  'SYNTAX_TYPO',
  'INDENTATION_FORMATTING',
  'VAR_FUNC_MANAGEMENT',
  'SYNTAX_ERROR_HANDLING'
]);

export const LlmEditSchema = z.object({
  startLine: z.number(),
  startCharacter: z.number(),
  endLine: z.number(),
  endCharacter: z.number(),
  oldText: z.string(),
  newText: z.string(),
  category: PainCategorySchema,
  reason: z.string()
});

export const LlmInterventionPlanSchema = z.object({
  summary: z.string(),
  edits: z.array(LlmEditSchema)
});

export type LlmEdit = z.infer<typeof LlmEditSchema>;
export type LlmInterventionPlan = z.infer<typeof LlmInterventionPlanSchema>;