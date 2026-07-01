import type {
  SuggestTarget,
  SuggestTermsInput,
  SuggestTermsItem,
  SuggestTermsOutput,
  TermDictionary
} from "./types.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;
const DEFAULT_TARGET: SuggestTarget = "term";
const DISABLED_WARNING =
  "Semantic suggestions are disabled; configure Chroma to enable vector-based term recommendations.";

type Env = Record<string, string | undefined>;

type SemanticSuggestionProvider = {
  suggest(input: Required<SuggestTermsInput>, dictionary: TermDictionary): Promise<SuggestTermsOutput>;
};

type ChromaQueryResult = {
  ids?: string[][];
  documents?: Array<Array<string | null>>;
  metadatas?: Array<Array<Record<string, unknown> | null>>;
  distances?: number[][];
};

type ChromaCollection = {
  query(args: {
    queryTexts: string[];
    nResults: number;
    where?: Record<string, unknown>;
  }): Promise<ChromaQueryResult>;
};

type ChromaClient = {
  getCollection(args: { name: string; embeddingFunction?: unknown }): Promise<ChromaCollection>;
};

type ChromaModule = {
  ChromaClient: new (args?: {
    host?: string;
    port?: number;
    ssl?: boolean;
    database?: string;
    headers?: Record<string, string>;
  }) => ChromaClient;
};

type DefaultEmbedModule = {
  DefaultEmbeddingFunction: new () => unknown;
};

export type SemanticSuggestionService = {
  suggest(input: SuggestTermsInput, dictionary: TermDictionary): Promise<SuggestTermsOutput>;
};

export function createSemanticSuggestionService(env: Env = process.env): SemanticSuggestionService {
  const provider = isChromaConfigured(env)
    ? new ChromaSemanticSuggestionProvider(readChromaConfig(env))
    : new DisabledSemanticSuggestionProvider();

  return {
    suggest(input, dictionary) {
      const normalized = normalizeSuggestTermsInput(input);
      return provider.suggest(normalized, dictionary);
    }
  };
}

function normalizeSuggestTermsInput(input: SuggestTermsInput): Required<SuggestTermsInput> {
  return {
    query: input.query.trim(),
    target: input.target ?? DEFAULT_TARGET,
    limit: normalizeLimit(input.limit)
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 0), MAX_LIMIT);
}

class DisabledSemanticSuggestionProvider implements SemanticSuggestionProvider {
  async suggest(input: Required<SuggestTermsInput>): Promise<SuggestTermsOutput> {
    return {
      query: input.query,
      target: input.target,
      limit: input.limit,
      items: [],
      warnings: [DISABLED_WARNING]
    };
  }
}

type ChromaConfig = {
  host: string;
  port: number;
  ssl: boolean;
  collectionName: string;
  database?: string;
};

function isChromaConfigured(env: Env): boolean {
  return Boolean(env.MCP_VARIABLE_CHROMA_HOST || env.MCP_VARIABLE_CHROMA_COLLECTION);
}

function readChromaConfig(env: Env): ChromaConfig {
  return {
    host: env.MCP_VARIABLE_CHROMA_HOST ?? "localhost",
    port: normalizePort(env.MCP_VARIABLE_CHROMA_PORT),
    ssl: env.MCP_VARIABLE_CHROMA_SSL === "true",
    collectionName: env.MCP_VARIABLE_CHROMA_COLLECTION ?? "mcp_variable_terms",
    database: env.MCP_VARIABLE_CHROMA_DATABASE
  };
}

function normalizePort(port: string | undefined): number {
  if (!port) {
    return 8000;
  }
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return 8000;
  }
  return parsed;
}

class ChromaSemanticSuggestionProvider implements SemanticSuggestionProvider {
  private collection?: Promise<ChromaCollection>;

  constructor(private readonly config: ChromaConfig) {}

  async suggest(
    input: Required<SuggestTermsInput>,
    _dictionary: TermDictionary
  ): Promise<SuggestTermsOutput> {
    try {
      const collection = await this.getCollection();
      const result = await collection.query({
        queryTexts: [input.query],
        nResults: input.limit,
        where: { target: input.target }
      });

      return {
        query: input.query,
        target: input.target,
        limit: input.limit,
        items: mapChromaResults(input.target, result),
        warnings: []
      };
    } catch (error) {
      return {
        query: input.query,
        target: input.target,
        limit: input.limit,
        items: [],
        warnings: [
          `Semantic suggestions failed: ${error instanceof Error ? error.message : String(error)}`
        ]
      };
    }
  }

  private getCollection(): Promise<ChromaCollection> {
    this.collection ??= this.createCollection();
    return this.collection;
  }

  private async createCollection(): Promise<ChromaCollection> {
    const moduleName = "chromadb";
    const defaultEmbedModuleName = "@chroma-core/default-embed";
    const [chroma, defaultEmbed] = (await Promise.all([
      import(moduleName),
      import(defaultEmbedModuleName)
    ])) as [ChromaModule, DefaultEmbedModule];
    const client = new chroma.ChromaClient({
      host: this.config.host,
      port: this.config.port,
      ssl: this.config.ssl,
      database: this.config.database
    });
    return client.getCollection({
      name: this.config.collectionName,
      embeddingFunction: new defaultEmbed.DefaultEmbeddingFunction()
    });
  }
}

function mapChromaResults(target: SuggestTarget, result: ChromaQueryResult): SuggestTermsItem[] {
  const ids = result.ids?.[0] ?? [];
  const metadatas = result.metadatas?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];

  return ids.map((id, index) => {
    const metadata = metadatas[index] ?? {};
    const distance = distances[index];
    return {
      id,
      target: readSuggestTarget(metadata.target, target),
      termName: readMetadataString(metadata.termName),
      physicalName: readMetadataString(metadata.physicalName),
      score: distance === undefined ? 0 : 1 / (1 + distance),
      reason: "Chroma vector similarity",
      row: {
        termName: readMetadataString(metadata.termName),
        physicalName: readMetadataString(metadata.physicalName),
        domainType: readMetadataString(metadata.domainType),
        domain: readMetadataString(metadata.domain),
        dataType: readMetadataString(metadata.dataType),
        codeName: readOptionalMetadataString(metadata.codeName),
        definition: readOptionalMetadataString(metadata.definition),
        requestTask: readOptionalMetadataString(metadata.requestTask),
        finalRequester: readOptionalMetadataString(metadata.finalRequester),
        finalModifiedAt: readOptionalMetadataString(metadata.finalModifiedAt)
      }
    };
  });
}

function readSuggestTarget(value: unknown, fallback: SuggestTarget): SuggestTarget {
  return value === "term" || value === "word" || value === "domain" ? value : fallback;
}

function readMetadataString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readOptionalMetadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
