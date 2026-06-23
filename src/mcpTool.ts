import { z } from "zod";

import type { TermDictionaryService } from "./service.js";
import type { ConvertTermsInput, ConvertTermsOutput } from "./types.js";

export const convertTermsInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("Korean term text, physical snake/camel name, or newline-separated list to convert."),
  direction: z.enum(["auto", "term_to_physical", "physical_to_term"]).default("auto").optional(),
  outputCase: z.enum(["snake", "lowerCamel", "upperCamel"]).default("snake").optional(),
  maxCandidates: z.number().int().min(0).max(50).default(5).optional()
});

const componentSchema = z.object({
  term: z.string(),
  physical: z.string(),
  role: z.enum(["word", "domain"])
});

const reverseCheckSchema = z.object({
  sourceTerm: z.string(),
  physical: z.string(),
  suggestedTerm: z.string(),
  annotatedText: z.string(),
  confidence: z.enum(["exact", "composed", "partial", "none"]),
  components: z.array(componentSchema),
  candidates: z.array(z.unknown()),
  unmatched: z.array(z.string()),
  warnings: z.array(z.string())
});

const convertTermsItemOutputSchema = z.object({
  direction: z.enum(["term_to_physical", "physical_to_term"]),
  input: z.string(),
  convertedText: z.string(),
  annotatedText: z.string().optional(),
  confidence: z.enum(["exact", "composed", "partial", "none"]),
  matches: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      type: z.enum(["attribute", "word", "domain"]),
      components: z.array(componentSchema)
    })
  ),
  candidates: z.array(z.unknown()),
  unmatched: z.array(z.string()),
  warnings: z.array(z.string()),
  reverseCheck: reverseCheckSchema.optional()
});

const convertTermsSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  exact: z.number().int().nonnegative(),
  composed: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  none: z.number().int().nonnegative()
});

export const convertTermsOutputSchema = convertTermsItemOutputSchema.extend({
  items: z.array(convertTermsItemOutputSchema).optional(),
  summary: convertTermsSummarySchema.optional()
});

export type ConvertTermsToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ConvertTermsOutput & Record<string, unknown>;
};

export function createConvertTermsHandler(
  service: TermDictionaryService
): (input: ConvertTermsInput) => Promise<ConvertTermsToolResult> {
  return async (input: ConvertTermsInput) => {
    const parsed = convertTermsInputSchema.parse(input);
    const output = await service.convert(parsed);
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output as ConvertTermsOutput & Record<string, unknown>
    };
  };
}
