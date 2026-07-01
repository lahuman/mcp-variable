import { z } from "zod";

import type { TermDictionaryService } from "./service.js";
import type {
  ConvertTermsInput,
  ConvertTermsOutput,
  SearchTermsInput,
  SearchTermsOutput,
  SuggestTermsInput,
  SuggestTermsOutput
} from "./types.js";

export const convertTermsInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("Korean term text, physical snake/camel name, or newline-separated list to convert."),
  direction: z.enum(["auto", "term_to_physical", "physical_to_term"]).default("auto").optional(),
  outputCase: z.enum(["snake", "lowerCamel", "upperCamel"]).default("snake").optional(),
  maxCandidates: z.number().int().min(0).max(50).default(5).optional()
});

const searchableTermFieldSchema = z.enum([
  "termName",
  "physicalName",
  "domainType",
  "domain",
  "dataType",
  "codeName",
  "definition",
  "requestTask"
]);

export const searchTermsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Keyword to search in registered dictionary rows."),
  fields: z.array(searchableTermFieldSchema).default([]).optional(),
  matchMode: z.enum(["contains", "startsWith", "exact"]).default("contains").optional(),
  limit: z.number().int().min(0).max(100).default(20).optional(),
  offset: z.number().int().min(0).default(0).optional()
});

export const suggestTermsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Term, word, domain, or phrase to use for semantic recommendations."),
  target: z.enum(["term", "word", "domain"]).default("term").optional(),
  limit: z.number().int().min(0).max(50).default(5).optional()
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

const searchMatchedFieldSchema = z.object({
  field: searchableTermFieldSchema,
  value: z.string(),
  matchType: z.enum(["contains", "startsWith", "exact"])
});

const searchTermsItemOutputSchema = z.object({
  termName: z.string(),
  physicalName: z.string(),
  domainType: z.string(),
  domain: z.string(),
  dataType: z.string(),
  codeName: z.string().optional(),
  definition: z.string().optional(),
  requestTask: z.string().optional(),
  finalRequester: z.string().optional(),
  finalModifiedAt: z.string().optional(),
  score: z.number(),
  matchedFields: z.array(searchMatchedFieldSchema)
});

export const searchTermsOutputSchema = z.object({
  query: z.string(),
  fields: z.array(searchableTermFieldSchema),
  matchMode: z.enum(["contains", "startsWith", "exact"]),
  total: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  items: z.array(searchTermsItemOutputSchema),
  warnings: z.array(z.string())
});

const suggestTermsItemOutputSchema = z.object({
  id: z.string(),
  target: z.enum(["term", "word", "domain"]),
  termName: z.string(),
  physicalName: z.string(),
  score: z.number(),
  reason: z.string(),
  row: z
    .object({
      termName: z.string(),
      physicalName: z.string(),
      domainType: z.string(),
      domain: z.string(),
      dataType: z.string(),
      codeName: z.string().optional(),
      definition: z.string().optional(),
      requestTask: z.string().optional(),
      finalRequester: z.string().optional(),
      finalModifiedAt: z.string().optional()
    })
    .optional()
});

export const suggestTermsOutputSchema = z.object({
  query: z.string(),
  target: z.enum(["term", "word", "domain"]),
  limit: z.number().int().nonnegative(),
  items: z.array(suggestTermsItemOutputSchema),
  warnings: z.array(z.string())
});

export type ConvertTermsToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ConvertTermsOutput & Record<string, unknown>;
};

export type SearchTermsToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: SearchTermsOutput & Record<string, unknown>;
};

export type SuggestTermsToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: SuggestTermsOutput & Record<string, unknown>;
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

export function createSearchTermsHandler(
  service: TermDictionaryService
): (input: SearchTermsInput) => Promise<SearchTermsToolResult> {
  return async (input: SearchTermsInput) => {
    const parsed = searchTermsInputSchema.parse(input);
    const output = await service.search(parsed);
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output as SearchTermsOutput & Record<string, unknown>
    };
  };
}

export function createSuggestTermsHandler(
  service: TermDictionaryService
): (input: SuggestTermsInput) => Promise<SuggestTermsToolResult> {
  return async (input: SuggestTermsInput) => {
    const parsed = suggestTermsInputSchema.parse(input);
    const output = await service.suggest(parsed);
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output as SuggestTermsOutput & Record<string, unknown>
    };
  };
}
