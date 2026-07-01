export type ConversionDirection = "auto" | "term_to_physical" | "physical_to_term";
export type ResolvedDirection = Exclude<ConversionDirection, "auto">;
export type OutputCase = "snake" | "lowerCamel" | "upperCamel";
export type Confidence = "exact" | "composed" | "partial" | "none";
export type ComponentRole = "word" | "domain";
export type MatchType = "attribute" | "word" | "domain";
export type SearchMatchMode = "contains" | "startsWith" | "exact";
export type SearchMatchType = "contains" | "startsWith" | "exact";
export type SuggestTarget = "term" | "word" | "domain";
export type SearchableTermField =
  | "termName"
  | "physicalName"
  | "domainType"
  | "domain"
  | "dataType"
  | "codeName"
  | "definition"
  | "requestTask";

export interface TermRow {
  termName: string;
  physicalName: string;
  domainType: string;
  domain: string;
  dataType: string;
  codeName?: string;
  definition?: string;
  requestTask?: string;
  finalRequester?: string;
  finalModifiedAt?: string;
}

export interface TermComponent {
  term: string;
  physical: string;
  role: ComponentRole;
}

export interface AttributeEntry {
  term: string;
  physical: string;
  row: TermRow;
  components: TermComponent[];
}

export interface TermDictionary {
  rows: TermRow[];
  attributeByTerm: Map<string, AttributeEntry>;
  attributeByPhysical: Map<string, AttributeEntry>;
  termToPhysical: Map<string, Set<string>>;
  physicalToTerms: Map<string, Set<string>>;
  domainTermToPhysical: Map<string, Set<string>>;
  domainPhysicalToTerms: Map<string, Set<string>>;
  warnings: string[];
}

export interface ConvertTermsInput {
  text: string;
  direction?: ConversionDirection;
  outputCase?: OutputCase;
  maxCandidates?: number;
}

export interface TermMatch {
  source: string;
  target: string;
  type: MatchType;
  components: TermComponent[];
}

export interface ConversionCandidate {
  source: string;
  target?: string;
  reason: string;
  type?: MatchType;
  components?: TermComponent[];
}

export interface ConvertTermsSummary {
  total: number;
  exact: number;
  composed: number;
  partial: number;
  none: number;
}

export interface ReverseCheck {
  sourceTerm: string;
  physical: string;
  suggestedTerm: string;
  annotatedText: string;
  confidence: Confidence;
  components: TermComponent[];
  candidates: ConversionCandidate[];
  unmatched: string[];
  warnings: string[];
}

export interface ConvertTermsOutput {
  direction: ResolvedDirection;
  input: string;
  convertedText: string;
  annotatedText?: string;
  confidence: Confidence;
  matches: TermMatch[];
  candidates: ConversionCandidate[];
  unmatched: string[];
  warnings: string[];
  reverseCheck?: ReverseCheck;
  items?: ConvertTermsOutput[];
  summary?: ConvertTermsSummary;
}

export interface SearchTermsInput {
  query: string;
  fields?: SearchableTermField[];
  matchMode?: SearchMatchMode;
  limit?: number;
  offset?: number;
}

export interface SearchMatchedField {
  field: SearchableTermField;
  value: string;
  matchType: SearchMatchType;
}

export interface SearchTermsItem extends TermRow {
  score: number;
  matchedFields: SearchMatchedField[];
}

export interface SearchTermsOutput {
  query: string;
  fields: SearchableTermField[];
  matchMode: SearchMatchMode;
  total: number;
  limit: number;
  offset: number;
  items: SearchTermsItem[];
  warnings: string[];
}

export interface SuggestTermsInput {
  query: string;
  target?: SuggestTarget;
  limit?: number;
}

export interface SuggestTermsItem {
  id: string;
  target: SuggestTarget;
  termName: string;
  physicalName: string;
  score: number;
  reason: string;
  row?: TermRow;
}

export interface SuggestTermsOutput {
  query: string;
  target: SuggestTarget;
  limit: number;
  items: SuggestTermsItem[];
  warnings: string[];
}
