import { getUniqueMapping } from "./dictionary.js";
import { camelToSnakePhysical, formatPhysicalName, normalizePhysicalName, splitPhysicalName } from "./physical.js";
import type {
  Confidence,
  ConversionCandidate,
  ConvertTermsInput,
  ConvertTermsOutput,
  ConvertTermsSummary,
  ResolvedDirection,
  ReverseCheck,
  TermComponent,
  TermDictionary,
  TermMatch
} from "./types.js";

const DEFAULT_MAX_CANDIDATES = 5;

type PhysicalTokenComposition = {
  convertedText: string;
  confidence: Confidence;
  components: TermComponent[];
  candidates: ConversionCandidate[];
  unmatched: string[];
  warnings: string[];
};

export function convertTerms(dictionary: TermDictionary, input: ConvertTermsInput): ConvertTermsOutput {
  const maxCandidates = normalizeMaxCandidates(input.maxCandidates);
  const text = input.text.trim();
  const bulkLines = splitBulkLines(text);

  if (bulkLines.length > 1) {
    return convertBulkTerms(dictionary, text, input, bulkLines, maxCandidates);
  }

  return convertSingleTerm(dictionary, text, input, maxCandidates);
}

function convertSingleTerm(
  dictionary: TermDictionary,
  text: string,
  input: ConvertTermsInput,
  maxCandidates: number
): ConvertTermsOutput {
  const direction = resolveDirection(text, input.direction);

  if (direction === "term_to_physical") {
    return convertTermToPhysical(dictionary, text, input, maxCandidates);
  }

  return convertPhysicalToTerm(dictionary, text, maxCandidates);
}

function convertBulkTerms(
  dictionary: TermDictionary,
  text: string,
  input: ConvertTermsInput,
  lines: string[],
  maxCandidates: number
): ConvertTermsOutput {
  const items = lines.map((line) =>
    convertSingleTerm(dictionary, line, { ...input, text: line }, maxCandidates)
  );
  const summary = summarizeItems(items);
  const direction = resolveBulkDirection(text, input.direction, items);
  const warnings = items.flatMap((item) => item.warnings);
  const directions = new Set(items.map((item) => item.direction));

  if (directions.size > 1) {
    warnings.unshift("Bulk input resolved to mixed conversion directions; inspect items for per-line directions.");
  }

  const annotatedText = buildBulkAnnotatedText(items);

  return {
    direction,
    input: text,
    convertedText: items.map((item) => item.convertedText).join("\n"),
    ...(annotatedText ? { annotatedText } : {}),
    confidence: summarizeConfidence(summary),
    matches: items.flatMap((item) => item.matches),
    candidates: items.flatMap((item) => item.candidates).slice(0, maxCandidates),
    unmatched: items.flatMap((item) => item.unmatched),
    warnings,
    items,
    summary
  };
}

function buildBulkAnnotatedText(items: ConvertTermsOutput[]): string | undefined {
  if (!items.some((item) => item.annotatedText)) {
    return undefined;
  }

  return items.map((item) => item.annotatedText ?? item.convertedText).join("\n");
}

function splitBulkLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function summarizeItems(items: ConvertTermsOutput[]): ConvertTermsSummary {
  const summary: ConvertTermsSummary = {
    total: items.length,
    exact: 0,
    composed: 0,
    partial: 0,
    none: 0
  };

  for (const item of items) {
    summary[item.confidence] += 1;
  }

  return summary;
}

function summarizeConfidence(summary: ConvertTermsSummary): Confidence {
  if (summary.total === 0 || summary.none === summary.total) {
    return "none";
  }

  if (summary.exact === summary.total) {
    return "exact";
  }

  if (summary.exact + summary.composed === summary.total) {
    return "composed";
  }

  return "partial";
}

function resolveBulkDirection(
  text: string,
  requestedDirection: ConvertTermsInput["direction"],
  items: ConvertTermsOutput[]
): ResolvedDirection {
  if (requestedDirection && requestedDirection !== "auto") {
    return requestedDirection;
  }

  const directions = new Set(items.map((item) => item.direction));
  if (directions.size === 1) {
    return items[0]?.direction ?? resolveDirection(text, requestedDirection);
  }

  return resolveDirection(text, requestedDirection);
}

function convertTermToPhysical(
  dictionary: TermDictionary,
  text: string,
  input: ConvertTermsInput,
  maxCandidates: number
): ConvertTermsOutput {
  const exact = dictionary.attributeByTerm.get(text);
  if (exact) {
    const target = formatPhysicalName(exact.physical, input.outputCase);
    return withReverseCheck(
      dictionary,
      withPhysicalDomainSuffixWarning(
        dictionary,
        {
          direction: "term_to_physical",
          input: text,
          convertedText: target,
          confidence: "exact",
          matches: [
            {
              source: text,
              target,
              type: "attribute",
              components: exact.components
            }
          ],
          candidates: [],
          unmatched: [],
          warnings: []
        },
        exact.physical
      ),
      maxCandidates
    );
  }

  const composed = composeTermToPhysical(dictionary, text, input, maxCandidates);
  if (composed) {
    return withReverseCheck(dictionary, withPhysicalDomainSuffixWarning(dictionary, composed), maxCandidates);
  }

  return withReverseCheck(
    dictionary,
    withPhysicalDomainSuffixWarning(dictionary, scanKoreanText(dictionary, text, input, maxCandidates)),
    maxCandidates
  );
}

function convertPhysicalToTerm(
  dictionary: TermDictionary,
  text: string,
  maxCandidates: number
): ConvertTermsOutput {
  const normalized = camelToSnakePhysical(text);
  const exact = dictionary.attributeByPhysical.get(normalized);
  if (exact) {
    return withPhysicalDomainSuffixWarning(
      dictionary,
      {
        direction: "physical_to_term",
        input: text,
        convertedText: exact.term,
        confidence: "exact",
        matches: [
          {
            source: text,
            target: exact.term,
            type: "attribute",
            components: exact.components
          }
        ],
        candidates: [],
        unmatched: [],
        warnings: []
      },
      normalized
    );
  }

  const composed = composePhysicalTokensToTerm(dictionary, normalized, maxCandidates);

  if (composed.confidence === "composed") {
    return withPhysicalDomainSuffixWarning(
      dictionary,
      {
        direction: "physical_to_term",
        input: text,
        convertedText: composed.convertedText,
        confidence: "composed",
        matches: [
          {
            source: text,
            target: composed.convertedText,
            type: "attribute",
            components: composed.components
          }
        ],
        candidates: composed.candidates,
        unmatched: composed.unmatched,
        warnings: composed.warnings
      },
      normalized
    );
  }

  return withPhysicalDomainSuffixWarning(
    dictionary,
    {
      direction: "physical_to_term",
      input: text,
      convertedText: composed.convertedText || text,
      confidence: composed.confidence,
      matches:
        composed.components.length > 0
          ? [
              {
                source: text,
                target: composed.convertedText,
                type: "attribute",
                components: composed.components
              }
            ]
          : [],
      candidates: composed.candidates,
      unmatched: composed.unmatched,
      warnings: composed.warnings
    },
    normalized
  );
}

function withPhysicalDomainSuffixWarning(
  dictionary: TermDictionary,
  result: ConvertTermsOutput,
  physicalName = result.convertedText
): ConvertTermsOutput {
  const warning = getPhysicalDomainSuffixWarning(dictionary, physicalName);
  if (!warning || result.warnings.includes(warning)) {
    return result;
  }

  return {
    ...result,
    warnings: [...result.warnings, warning]
  };
}

function getPhysicalDomainSuffixWarning(
  dictionary: TermDictionary,
  physicalName: string
): string | undefined {
  if (!/[A-Za-z0-9_]/.test(physicalName)) {
    return undefined;
  }

  const normalized = camelToSnakePhysical(physicalName);
  const lastToken = splitPhysicalName(normalized).at(-1);
  if (!lastToken || dictionary.domainPhysicalToTerms.has(lastToken)) {
    return undefined;
  }

  return `Physical name ${normalized} does not end with a registered domain token.`;
}

function withReverseCheck(
  dictionary: TermDictionary,
  result: ConvertTermsOutput,
  maxCandidates: number
): ConvertTermsOutput {
  const reverseCheck = buildReverseCheck(dictionary, result.input, result.convertedText, maxCandidates);
  if (!reverseCheck) {
    return result;
  }

  return {
    ...result,
    annotatedText: reverseCheck.annotatedText,
    reverseCheck
  };
}

function buildReverseCheck(
  dictionary: TermDictionary,
  sourceTerm: string,
  convertedText: string,
  maxCandidates: number
): ReverseCheck | undefined {
  if (containsHangul(convertedText)) {
    return undefined;
  }

  const physical = camelToSnakePhysical(convertedText);
  const composed = composePhysicalTokensToTerm(dictionary, physical, maxCandidates);
  if (composed.confidence !== "composed" || composed.convertedText === sourceTerm) {
    return undefined;
  }

  return {
    sourceTerm,
    physical,
    suggestedTerm: composed.convertedText,
    annotatedText: composed.convertedText,
    confidence: composed.confidence,
    components: composed.components,
    candidates: composed.candidates,
    unmatched: composed.unmatched,
    warnings: composed.warnings
  };
}

function composePhysicalTokensToTerm(
  dictionary: TermDictionary,
  text: string,
  maxCandidates: number
): PhysicalTokenComposition {
  const tokens = splitPhysicalName(text);
  const candidates: ConversionCandidate[] = [];
  const warnings: string[] = [];
  const unmatched: string[] = [];
  const components: TermComponent[] = [];

  tokens.forEach((token, index) => {
    const isDomain = index === tokens.length - 1;
    const terms = isDomain
      ? dictionary.domainPhysicalToTerms.get(token)
      : dictionary.physicalToTerms.get(token);

    if (!terms || terms.size === 0) {
      unmatched.push(token);
      return;
    }

    if (terms.size > 1) {
      warnings.push(`Ambiguous physical token ${token}`);
      for (const term of terms) {
        candidates.push({
          source: token,
          target: term,
          type: isDomain ? "domain" : "word",
          reason: `Physical token ${token} has multiple Korean terms`
        });
      }
      return;
    }

    const term = [...terms][0]!;
    components.push({
      term,
      physical: token,
      role: isDomain ? "domain" : "word"
    });
  });

  const convertedText = components.map((component) => component.term).join("");
  let confidence: Confidence = "none";
  if (tokens.length > 0 && components.length === tokens.length) {
    confidence = "composed";
  } else if (components.length > 0) {
    confidence = "partial";
  }

  return {
    convertedText,
    confidence,
    components,
    candidates: candidates.slice(0, maxCandidates),
    unmatched,
    warnings
  };
}

function composeTermToPhysical(
  dictionary: TermDictionary,
  text: string,
  input: ConvertTermsInput,
  maxCandidates: number
): ConvertTermsOutput | undefined {
  const candidates: ConversionCandidate[] = [];
  const warnings: string[] = [];
  const domains = [...dictionary.domainTermToPhysical.entries()]
    .filter(([, physicals]) => physicals.size === 1)
    .sort(([a], [b]) => b.length - a.length);

  for (const [domainTerm, physicals] of domains) {
    if (!text.endsWith(domainTerm)) {
      continue;
    }

    const domainPhysical = [...physicals][0]!;
    const stem = text.slice(0, -domainTerm.length);
    const wordComponents = segmentStemByUniqueTerms(dictionary, stem, candidates, warnings);
    if (!wordComponents) {
      continue;
    }

    const components: TermComponent[] = [
      ...wordComponents,
      { term: domainTerm, physical: domainPhysical, role: "domain" }
    ];
    const physical = components.map((component) => component.physical).join("_");
    const target = formatPhysicalName(physical, input.outputCase);

    return {
      direction: "term_to_physical",
      input: text,
      convertedText: target,
      confidence: "composed",
      matches: [
        {
          source: text,
          target,
          type: "attribute",
          components
        }
      ],
      candidates: candidates.slice(0, maxCandidates),
      unmatched: [],
      warnings
    };
  }

  return undefined;
}

function segmentStemByUniqueTerms(
  dictionary: TermDictionary,
  stem: string,
  candidates: ConversionCandidate[],
  warnings: string[]
): TermComponent[] | undefined {
  if (!stem) {
    return [];
  }

  const terms = [...dictionary.termToPhysical.keys()].sort((a, b) => b.length - a.length);

  function visit(remaining: string): TermComponent[] | undefined {
    if (!remaining) {
      return [];
    }

    for (const term of terms) {
      if (!remaining.startsWith(term)) {
        continue;
      }

      const physicals = dictionary.termToPhysical.get(term);
      if (!physicals || physicals.size === 0) {
        continue;
      }

      if (physicals.size > 1) {
        warnings.push(`Ambiguous Korean term ${term}`);
        for (const physical of physicals) {
          candidates.push({
            source: term,
            target: physical,
            type: "word",
            reason: `Korean term ${term} has multiple physical tokens`
          });
        }
        continue;
      }

      const physical = [...physicals][0]!;
      const next = visit(remaining.slice(term.length));
      if (next) {
        return [{ term, physical, role: "word" }, ...next];
      }
    }

    return undefined;
  }

  return visit(stem);
}

function scanKoreanText(
  dictionary: TermDictionary,
  text: string,
  input: ConvertTermsInput,
  maxCandidates: number
): ConvertTermsOutput {
  const lookups = buildTermLookups(dictionary, input);
  const unmatched: string[] = [];
  const matches: TermMatch[] = [];
  const candidates: ConversionCandidate[] = [];
  const warnings: string[] = [];
  const chunks: Array<{ kind: "text" | "match"; value: string }> = [];

  for (let index = 0; index < text.length; ) {
    const lookup = lookups.find((candidate) => text.startsWith(candidate.source, index));
    if (!lookup) {
      const char = text[index]!;
      const previousChunk = chunks.at(-1);
      chunks.push({ kind: "text", value: char });
      if (containsHangul(char)) {
        const previousWasUnmatchedHangul =
          previousChunk?.kind === "text" && containsHangul(previousChunk.value.at(-1) ?? "");
        const lastUnmatched = unmatched.at(-1);
        if (previousWasUnmatchedHangul && lastUnmatched) {
          unmatched[unmatched.length - 1] = lastUnmatched + char;
        } else {
          unmatched.push(char);
        }
      }
      index += char.length;
      continue;
    }

    appendMatchChunk(chunks, lookup.target);
    matches.push({
      source: lookup.source,
      target: lookup.target,
      type: lookup.type,
      components: lookup.components
    });
    index += lookup.source.length;
  }

  for (const [term, physicals] of dictionary.termToPhysical.entries()) {
    if (text.includes(term) && physicals.size > 1) {
      warnings.push(`Ambiguous Korean term ${term}`);
      for (const physical of physicals) {
        candidates.push({
          source: term,
          target: physical,
          type: "word",
          reason: `Korean term ${term} has multiple physical tokens`
        });
      }
    }
  }

  return {
    direction: "term_to_physical",
    input: text,
    convertedText: chunks.map((chunk) => chunk.value).join(""),
    confidence: matches.length > 0 ? "partial" : "none",
    matches,
    candidates: candidates.slice(0, maxCandidates),
    unmatched,
    warnings
  };
}

function buildTermLookups(
  dictionary: TermDictionary,
  input: ConvertTermsInput
): Array<TermMatch & { source: string }> {
  const lookups: Array<TermMatch & { source: string; priority: number }> = [];

  for (const entry of dictionary.attributeByTerm.values()) {
    lookups.push({
      source: entry.term,
      target: formatPhysicalName(entry.physical, input.outputCase),
      type: "attribute",
      components: entry.components,
      priority: 3
    });
  }

  for (const [term] of dictionary.termToPhysical.entries()) {
    const physical = getUniqueMapping(dictionary.termToPhysical, term);
    if (!physical) {
      continue;
    }
    lookups.push({
      source: term,
      target: formatPhysicalName(physical, input.outputCase),
      type: "word",
      components: [{ term, physical, role: "word" }],
      priority: 2
    });
  }

  for (const [term] of dictionary.domainTermToPhysical.entries()) {
    const physical = getUniqueMapping(dictionary.domainTermToPhysical, term);
    if (!physical) {
      continue;
    }
    lookups.push({
      source: term,
      target: formatPhysicalName(physical, input.outputCase),
      type: "domain",
      components: [{ term, physical, role: "domain" }],
      priority: 1
    });
  }

  return lookups.sort((a, b) => b.source.length - a.source.length || b.priority - a.priority);
}

function appendMatchChunk(chunks: Array<{ kind: "text" | "match"; value: string }>, value: string): void {
  const previous = chunks.at(-1);
  if (previous?.kind === "match" && isSnakePhysical(previous.value) && isSnakePhysical(value)) {
    previous.value = `${previous.value}_${value}`;
    return;
  }

  chunks.push({ kind: "match", value });
}

function isSnakePhysical(value: string): boolean {
  return /^[A-Z0-9_]+$/.test(value);
}

function resolveDirection(text: string, direction: ConvertTermsInput["direction"]): ResolvedDirection {
  if (direction && direction !== "auto") {
    return direction;
  }

  return containsHangul(text) ? "term_to_physical" : "physical_to_term";
}

function containsHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

function normalizeMaxCandidates(maxCandidates: number | undefined): number {
  if (maxCandidates === undefined) {
    return DEFAULT_MAX_CANDIDATES;
  }
  return Math.max(0, Math.min(50, Math.floor(maxCandidates)));
}
