import { stat } from "node:fs/promises";

import { loadDictionaryWithCache } from "./cache.js";
import { convertTerms } from "./matcher.js";
import { searchTerms } from "./search.js";
import { createSemanticSuggestionService, type SemanticSuggestionService } from "./semantic.js";
import type {
  ConvertTermsInput,
  ConvertTermsOutput,
  SearchTermsInput,
  SearchTermsOutput,
  SuggestTermsInput,
  SuggestTermsOutput,
  TermDictionary
} from "./types.js";

export class TermDictionaryService {
  private dictionary?: TermDictionary;
  private loadedMtimeMs?: number;
  private loadedSize?: number;

  constructor(
    private readonly csvPath: string,
    private readonly semanticSuggestionService: SemanticSuggestionService = createSemanticSuggestionService()
  ) {}

  async convert(input: ConvertTermsInput): Promise<ConvertTermsOutput> {
    const reloadWarning = await this.ensureLoaded();
    const result = convertTerms(this.dictionary!, input);
    if (reloadWarning) {
      return {
        ...result,
        warnings: [...result.warnings, reloadWarning]
      };
    }
    return result;
  }

  async search(input: SearchTermsInput): Promise<SearchTermsOutput> {
    const reloadWarning = await this.ensureLoaded();
    const result = searchTerms(this.dictionary!, input);
    if (reloadWarning) {
      return {
        ...result,
        warnings: [...result.warnings, reloadWarning]
      };
    }
    return result;
  }

  async suggest(input: SuggestTermsInput): Promise<SuggestTermsOutput> {
    const reloadWarning = await this.ensureLoaded();
    const result = await this.semanticSuggestionService.suggest(input, this.dictionary!);
    if (reloadWarning) {
      return {
        ...result,
        warnings: [...result.warnings, reloadWarning]
      };
    }
    return result;
  }

  get path(): string {
    return this.csvPath;
  }

  private async ensureLoaded(): Promise<string | undefined> {
    const fileStat = await stat(this.csvPath);
    if (
      this.dictionary &&
      this.loadedMtimeMs === fileStat.mtimeMs &&
      this.loadedSize === fileStat.size
    ) {
      return undefined;
    }

    try {
      const { dictionary } = await loadDictionaryWithCache(this.csvPath);
      this.dictionary = dictionary;
      this.loadedMtimeMs = fileStat.mtimeMs;
      this.loadedSize = fileStat.size;
      return undefined;
    } catch (error) {
      if (!this.dictionary) {
        throw error;
      }

      return `Reload failed for ${this.csvPath}; using the last successfully loaded dictionary. ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
}
