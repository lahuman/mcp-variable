import { normalizePhysicalName, splitPhysicalName } from "./physical.js";
import type { AttributeEntry, TermComponent, TermDictionary, TermRow } from "./types.js";

type SuffixSplit = {
  wordComponents: TermComponent[];
  domainTerm: string;
  domainPhysical: string;
};

const FORCED_DOMAIN_MAPPINGS = new Map<string, string>([["명", "NM"]]);

export function buildDictionary(rows: TermRow[]): TermDictionary {
  const dictionary: TermDictionary = {
    rows,
    attributeByTerm: new Map(),
    attributeByPhysical: new Map(),
    termToPhysical: new Map(),
    physicalToTerms: new Map(),
    domainTermToPhysical: new Map(),
    domainPhysicalToTerms: new Map(),
    warnings: []
  };

  const wordCandidates = new Map<string, Set<string>>();
  for (const row of rows) {
    const { termStem, physicalStemTokens } = getDomainTypeStemParts(row);
    if (termStem && physicalStemTokens.length === 1) {
      addMapping(wordCandidates, termStem, physicalStemTokens[0]!);
    }
  }

  for (const [term, physicals] of wordCandidates.entries()) {
    for (const physical of physicals) {
      if (!hasShorterCandidateForPhysical(wordCandidates, term, physical)) {
        addWordMapping(dictionary, term, physical);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      const split = splitBySuffixDomain(row.termName, splitPhysicalName(row.physicalName), dictionary);
      if (split) {
        for (const component of split.wordComponents) {
          changed = addWordMapping(dictionary, component.term, component.physical) || changed;
        }
        changed = addMapping(dictionary.domainTermToPhysical, split.domainTerm, split.domainPhysical) || changed;
        changed = addMapping(dictionary.domainPhysicalToTerms, split.domainPhysical, split.domainTerm) || changed;
      }
    }
  }

  applyForcedDomainMappings(dictionary);

  for (const row of rows) {
    const physical = normalizePhysicalName(row.physicalName);
    const components = buildComponents(row, dictionary);
    const entry: AttributeEntry = {
      term: row.termName,
      physical,
      row: { ...row, physicalName: physical },
      components
    };

    if (!dictionary.attributeByTerm.has(row.termName)) {
      dictionary.attributeByTerm.set(row.termName, entry);
    }
    if (!dictionary.attributeByPhysical.has(physical)) {
      dictionary.attributeByPhysical.set(physical, entry);
    }
  }

  return dictionary;
}

function applyForcedDomainMappings(dictionary: TermDictionary): void {
  for (const [term, physical] of FORCED_DOMAIN_MAPPINGS.entries()) {
    const normalizedPhysical = normalizePhysicalName(physical);
    dictionary.domainTermToPhysical.set(term, new Set([normalizedPhysical]));

    for (const [physicalToken, terms] of dictionary.domainPhysicalToTerms.entries()) {
      if (physicalToken === normalizedPhysical) {
        continue;
      }

      terms.delete(term);
      if (terms.size === 0) {
        dictionary.domainPhysicalToTerms.delete(physicalToken);
      }
    }

    const reverseTerms = dictionary.domainPhysicalToTerms.get(normalizedPhysical) ?? new Set<string>();
    reverseTerms.add(term);
    dictionary.domainPhysicalToTerms.set(normalizedPhysical, reverseTerms);
  }
}

export function getUniqueMapping(map: Map<string, Set<string>>, key: string): string | undefined {
  const values = map.get(key);
  if (!values || values.size !== 1) {
    return undefined;
  }
  return [...values][0];
}

export function addMapping(map: Map<string, Set<string>>, key: string, value: string): boolean {
  const normalizedKey = key.trim();
  const normalizedValue = normalizePhysicalName(value);
  if (!normalizedKey || !normalizedValue) {
    return false;
  }

  const values = map.get(normalizedKey) ?? new Set<string>();
  const beforeSize = values.size;
  values.add(normalizedValue);
  map.set(normalizedKey, values);
  return values.size > beforeSize;
}

function addWordMapping(dictionary: TermDictionary, term: string, physical: string): boolean {
  const addedTerm = addMapping(dictionary.termToPhysical, term, physical);
  const addedPhysical = addMapping(dictionary.physicalToTerms, physical, term);
  return addedTerm || addedPhysical;
}

function hasShorterCandidateForPhysical(
  candidates: Map<string, Set<string>>,
  term: string,
  physical: string
): boolean {
  for (const [otherTerm, otherPhysicals] of candidates.entries()) {
    if (
      otherTerm.length < term.length &&
      otherPhysicals.has(physical) &&
      (term.startsWith(otherTerm) || term.endsWith(otherTerm))
    ) {
      return true;
    }
  }

  return false;
}

function buildComponents(row: TermRow, dictionary: TermDictionary): TermComponent[] {
  const physicalTokens = splitPhysicalName(row.physicalName);
  const split = splitBySuffixDomain(row.termName, physicalTokens, dictionary);
  if (split) {
    return [
      ...split.wordComponents,
      {
        term: split.domainTerm,
        physical: split.domainPhysical,
        role: "domain"
      }
    ];
  }

  if (physicalTokens.length > 1) {
    dictionary.warnings.push(
      `Could not verify word segmentation for ${row.termName} -> ${normalizePhysicalName(row.physicalName)}`
    );
  }

  return [];
}

function getDomainTypeStemParts(row: TermRow): {
  termStem: string;
  physicalStemTokens: string[];
} {
  const physicalTokens = splitPhysicalName(row.physicalName);
  const physicalStemTokens = physicalTokens.slice(0, -1);
  const termStem =
    row.domainType && row.termName.endsWith(row.domainType)
      ? row.termName.slice(0, -row.domainType.length)
      : "";

  return { termStem, physicalStemTokens };
}

function splitBySuffixDomain(
  termName: string,
  physicalTokens: string[],
  dictionary: TermDictionary
): SuffixSplit | undefined {
  const domainPhysical = physicalTokens.at(-1);
  if (!termName || !domainPhysical) {
    return undefined;
  }

  const physicalStemTokens = physicalTokens.slice(0, -1);
  if (physicalStemTokens.length === 0) {
    if (!isAllowedForcedDomainPhysical(termName, domainPhysical)) {
      return undefined;
    }

    return {
      wordComponents: [],
      domainTerm: termName,
      domainPhysical
    };
  }

  const knownDomainSplit = splitByKnownDomainSuffix(
    termName,
    physicalStemTokens,
    domainPhysical,
    dictionary
  );
  if (knownDomainSplit) {
    return knownDomainSplit;
  }

  const wordComponents = segmentByTokens(termName, physicalStemTokens, dictionary, {
    allowRemainder: true
  });
  if (!wordComponents) {
    return undefined;
  }

  const consumedLength = wordComponents.reduce((total, component) => total + component.term.length, 0);
  const domainTerm = termName.slice(consumedLength);
  if (!domainTerm) {
    return undefined;
  }
  if (!isAllowedForcedDomainPhysical(domainTerm, domainPhysical)) {
    return undefined;
  }

  return {
    wordComponents,
    domainTerm,
    domainPhysical
  };
}

function isAllowedForcedDomainPhysical(domainTerm: string, domainPhysical: string): boolean {
  const forcedPhysical = FORCED_DOMAIN_MAPPINGS.get(domainTerm);
  return !forcedPhysical || normalizePhysicalName(forcedPhysical) === domainPhysical;
}

function splitByKnownDomainSuffix(
  termName: string,
  physicalStemTokens: string[],
  domainPhysical: string,
  dictionary: TermDictionary
): SuffixSplit | undefined {
  const domainTerms = [...(dictionary.domainPhysicalToTerms.get(domainPhysical) ?? [])].sort(
    (a, b) => b.length - a.length
  );

  for (const domainTerm of domainTerms) {
    if (!termName.endsWith(domainTerm)) {
      continue;
    }

    const stem = termName.slice(0, -domainTerm.length);
    const wordComponents = segmentKnownDomainStem(stem, physicalStemTokens, dictionary);
    if (wordComponents) {
      return {
        wordComponents,
        domainTerm,
        domainPhysical
      };
    }
  }

  return undefined;
}

function segmentKnownDomainStem(
  stem: string,
  physicalTokens: string[],
  dictionary: TermDictionary
): TermComponent[] | undefined {
  const wordComponents = segmentByTokens(stem, physicalTokens, dictionary, {
    allowRemainder: false
  });
  if (wordComponents) {
    return wordComponents;
  }

  const inferredComponents = segmentByTokensWithSingleInferredWord(stem, physicalTokens, dictionary);
  if (inferredComponents) {
    return inferredComponents;
  }

  if (stem && physicalTokens.length === 1) {
    return [{ term: stem, physical: physicalTokens[0]!, role: "word" }];
  }

  return undefined;
}

function segmentByTokensWithSingleInferredWord(
  text: string,
  physicalTokens: string[],
  dictionary: TermDictionary
): TermComponent[] | undefined {
  if (!text || physicalTokens.length < 2) {
    return undefined;
  }

  const solutions = new Map<string, TermComponent[]>();

  function visit(
    remaining: string,
    tokenIndex: number,
    inferred: boolean,
    knownCount: number,
    components: TermComponent[]
  ): void {
    if (solutions.size > 1) {
      return;
    }

    if (tokenIndex === physicalTokens.length) {
      if (!remaining && inferred && knownCount > 0) {
        const signature = components
          .map((component) => `${component.term}:${component.physical}`)
          .join("|");
        solutions.set(signature, components);
      }
      return;
    }

    if (!remaining) {
      return;
    }

    const physicalToken = physicalTokens[tokenIndex]!;
    const knownTerms = [...(dictionary.physicalToTerms.get(physicalToken) ?? [])].sort(
      (a, b) => b.length - a.length
    );

    for (const term of knownTerms) {
      if (!remaining.startsWith(term)) {
        continue;
      }

      visit(remaining.slice(term.length), tokenIndex + 1, inferred, knownCount + 1, [
        ...components,
        { term, physical: physicalToken, role: "word" }
      ]);
    }

    if (inferred) {
      return;
    }
    if (dictionary.physicalToTerms.has(physicalToken)) {
      return;
    }

    const remainingTokenCount = physicalTokens.length - tokenIndex - 1;
    const maxInferredLength = remaining.length - remainingTokenCount;
    for (let length = 1; length <= maxInferredLength; length += 1) {
      const term = remaining.slice(0, length);
      if (dictionary.termToPhysical.has(term)) {
        continue;
      }

      visit(remaining.slice(length), tokenIndex + 1, true, knownCount, [
        ...components,
        { term, physical: physicalToken, role: "word" }
      ]);
    }
  }

  visit(text, 0, false, 0, []);

  return solutions.size === 1 ? [...solutions.values()][0] : undefined;
}

function segmentByTokens(
  text: string,
  physicalTokens: string[],
  dictionary: TermDictionary,
  options: { allowRemainder: boolean }
): TermComponent[] | undefined {
  const termsByLength = [...dictionary.termToPhysical.keys()].sort((a, b) => b.length - a.length);

  function visit(remaining: string, tokenIndex: number): TermComponent[] | undefined {
    if (tokenIndex === physicalTokens.length) {
      return options.allowRemainder || !remaining ? [] : undefined;
    }
    if (!remaining) {
      return undefined;
    }

    const physicalToken = physicalTokens[tokenIndex];
    for (const term of termsByLength) {
      const physicals = dictionary.termToPhysical.get(term);
      if (!physicals?.has(physicalToken) || !remaining.startsWith(term)) {
        continue;
      }

      const next = visit(remaining.slice(term.length), tokenIndex + 1);
      if (next) {
        return [{ term, physical: physicalToken, role: "word" }, ...next];
      }
    }

    return undefined;
  }

  return visit(text, 0);
}
