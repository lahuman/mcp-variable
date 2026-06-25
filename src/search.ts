import type {
  SearchableTermField,
  SearchMatchedField,
  SearchMatchMode,
  SearchMatchType,
  SearchTermsInput,
  SearchTermsItem,
  SearchTermsOutput,
  TermDictionary,
  TermRow
} from "./types.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const DEFAULT_SEARCH_FIELDS: SearchableTermField[] = [
  "termName",
  "physicalName",
  "domainType",
  "domain",
  "dataType",
  "codeName",
  "definition",
  "requestTask"
];

const MATCH_SCORE: Record<SearchMatchType, number> = {
  exact: 100,
  startsWith: 80,
  contains: 60
};

export function searchTerms(dictionary: TermDictionary, input: SearchTermsInput): SearchTermsOutput {
  const query = input.query.trim();
  const fields = normalizeFields(input.fields);
  const matchMode = input.matchMode ?? "contains";
  const limit = normalizeLimit(input.limit);
  const offset = normalizeOffset(input.offset);
  const warnings: string[] = [];

  if (!query) {
    return {
      query,
      fields,
      matchMode,
      total: 0,
      limit,
      offset,
      items: [],
      warnings: ["Search query is empty."]
    };
  }

  const rankedItems = dictionary.rows
    .map((row) => buildSearchItem(row, query, fields, matchMode))
    .filter((item): item is SearchTermsItem => item !== undefined)
    .sort(compareSearchItems);

  return {
    query,
    fields,
    matchMode,
    total: rankedItems.length,
    limit,
    offset,
    items: rankedItems.slice(offset, offset + limit),
    warnings
  };
}

function normalizeFields(fields: SearchableTermField[] | undefined): SearchableTermField[] {
  if (!fields || fields.length === 0) {
    return DEFAULT_SEARCH_FIELDS;
  }

  return [...new Set(fields)];
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 0), MAX_LIMIT);
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined) {
    return 0;
  }

  return Math.max(Math.trunc(offset), 0);
}

function buildSearchItem(
  row: TermRow,
  query: string,
  fields: SearchableTermField[],
  matchMode: SearchMatchMode
): SearchTermsItem | undefined {
  const matchedFields: SearchMatchedField[] = [];
  let score = 0;

  for (const field of fields) {
    const value = row[field];
    if (!value) {
      continue;
    }

    const matchType = getMatchType(value, query, matchMode);
    if (!matchType) {
      continue;
    }

    matchedFields.push({ field, value, matchType });
    score += MATCH_SCORE[matchType];
  }

  if (matchedFields.length === 0) {
    return undefined;
  }

  return {
    ...row,
    score,
    matchedFields
  };
}

function getMatchType(
  value: string,
  query: string,
  matchMode: SearchMatchMode
): SearchMatchType | undefined {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedValue === normalizedQuery) {
    return "exact";
  }

  if (matchMode === "exact") {
    return undefined;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return "startsWith";
  }

  if (matchMode === "startsWith") {
    return undefined;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return "contains";
  }

  return undefined;
}

function normalizeSearchText(text: string): string {
  return text.trim().toLocaleLowerCase("ko-KR");
}

function compareSearchItems(left: SearchTermsItem, right: SearchTermsItem): number {
  return (
    right.score - left.score ||
    left.termName.localeCompare(right.termName, "ko-KR") ||
    left.physicalName.localeCompare(right.physicalName, "en")
  );
}
