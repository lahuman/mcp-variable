export type ConversionDirection = "auto" | "term_to_physical" | "physical_to_term";
export type ResolvedDirection = Exclude<ConversionDirection, "auto">;
export type OutputCase = "snake" | "lowerCamel" | "upperCamel";
export type Confidence = "exact" | "composed" | "partial" | "none";
export type ComponentRole = "word" | "domain";
export type MatchType = "attribute" | "word" | "domain";

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
