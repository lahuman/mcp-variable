import { normalizePhysicalName, splitPhysicalName } from "./physical.js";
import type { AttributeEntry, TermComponent, TermDictionary, TermRow } from "./types.js";

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

  for (const row of rows) {
    const physicalTokens = splitPhysicalName(row.physicalName);
    const domainPhysical = physicalTokens.at(-1);
    if (row.domainType && domainPhysical) {
      addMapping(dictionary.domainTermToPhysical, row.domainType, domainPhysical);
      addMapping(dictionary.domainPhysicalToTerms, domainPhysical, row.domainType);
    }
  }

  for (const row of rows) {
    const { termStem, physicalStemTokens } = getStemParts(row);
    if (termStem && physicalStemTokens.length === 1) {
      addWordMapping(dictionary, termStem, physicalStemTokens[0]!);
    }
  }

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

export function getUniqueMapping(map: Map<string, Set<string>>, key: string): string | undefined {
  const values = map.get(key);
  if (!values || values.size !== 1) {
    return undefined;
  }
  return [...values][0];
}

export function addMapping(map: Map<string, Set<string>>, key: string, value: string): void {
  const normalizedKey = key.trim();
  const normalizedValue = normalizePhysicalName(value);
  if (!normalizedKey || !normalizedValue) {
    return;
  }

  const values = map.get(normalizedKey) ?? new Set<string>();
  values.add(normalizedValue);
  map.set(normalizedKey, values);
}

function addWordMapping(dictionary: TermDictionary, term: string, physical: string): void {
  addMapping(dictionary.termToPhysical, term, physical);
  addMapping(dictionary.physicalToTerms, physical, term);
}

function buildComponents(row: TermRow, dictionary: TermDictionary): TermComponent[] {
  const { termStem, physicalStemTokens, domainPhysical } = getStemParts(row);
  const components: TermComponent[] = [];

  const stemComponents = segmentStemByTokens(termStem, physicalStemTokens, dictionary);
  if (stemComponents) {
    components.push(...stemComponents);
  } else if (termStem && physicalStemTokens.length > 0) {
    dictionary.warnings.push(
      `Could not verify word segmentation for ${row.termName} -> ${normalizePhysicalName(row.physicalName)}`
    );
  }

  if (row.domainType && domainPhysical) {
    components.push({
      term: row.domainType,
      physical: domainPhysical,
      role: "domain"
    });
  }

  return components;
}

function getStemParts(row: TermRow): {
  termStem: string;
  physicalStemTokens: string[];
  domainPhysical?: string;
} {
  const physicalTokens = splitPhysicalName(row.physicalName);
  const domainPhysical = physicalTokens.at(-1);
  const physicalStemTokens = physicalTokens.slice(0, -1);
  const termStem =
    row.domainType && row.termName.endsWith(row.domainType)
      ? row.termName.slice(0, -row.domainType.length)
      : "";

  return { termStem, physicalStemTokens, domainPhysical };
}

function segmentStemByTokens(
  stem: string,
  physicalTokens: string[],
  dictionary: TermDictionary
): TermComponent[] | undefined {
  if (!stem && physicalTokens.length === 0) {
    return [];
  }
  if (!stem || physicalTokens.length === 0) {
    return undefined;
  }

  const termsByLength = [...dictionary.termToPhysical.keys()].sort((a, b) => b.length - a.length);

  function visit(remaining: string, tokenIndex: number): TermComponent[] | undefined {
    if (!remaining && tokenIndex === physicalTokens.length) {
      return [];
    }
    if (!remaining || tokenIndex >= physicalTokens.length) {
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

  return visit(stem, 0);
}
