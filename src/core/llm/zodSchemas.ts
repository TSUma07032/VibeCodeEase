import { z } from "zod";
import { PAIN_CATEGORIES } from '../../types';

export const llmEditSchema = z.object({
  startLine: z.number().int().min(0),
  startCharacter: z.number().int().min(0),
  endLine: z.number().int().min(0),
  endCharacter: z.number().int().min(0),
  oldText: z.string(),
  newText: z.string(),
  category: z.enum(PAIN_CATEGORIES as [string, ...string[]]),
  reason: z.string()
});

export const llmInterventionPlanSchema = z.object({
  summary: z.string(),
  edits: z.array(llmEditSchema)
});
