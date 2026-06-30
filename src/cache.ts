import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { loadCsvFile } from "./csvLoader.js";
import { buildDictionary } from "./dictionary.js";
import type { AttributeEntry, TermDictionary, TermRow } from "./types.js";

const CACHE_VERSION = 1;
const DICTIONARY_ALGORITHM_VERSION = 3;

export type DictionaryCacheSource = {
  sha256: string;
  size: number;
  mtimeMs: number;
};

export type DictionaryLoadSource = "cache" | "csv";

export type DictionaryLoadResult = {
  dictionary: TermDictionary;
  source: DictionaryLoadSource;
};

type SerializedStringSetMap = Array<[string, string[]]>;
type SerializedAttributeMap = Array<[string, AttributeEntry]>;

type SerializedTermDictionary = {
  rows: TermRow[];
  attributeByTerm: SerializedAttributeMap;
  attributeByPhysical: SerializedAttributeMap;
  termToPhysical: SerializedStringSetMap;
  physicalToTerms: SerializedStringSetMap;
  domainTermToPhysical: SerializedStringSetMap;
  domainPhysicalToTerms: SerializedStringSetMap;
  warnings: string[];
};

type DictionaryCacheFile = {
  cacheVersion: number;
  source: DictionaryCacheSource;
  builder: {
    dictionaryAlgorithmVersion: number;
  };
  createdAt: string;
  dictionary: SerializedTermDictionary;
};

export function getDictionaryCachePath(csvPath: string): string {
  const extension = extname(csvPath);
  const name = basename(csvPath, extension);
  return join(dirname(csvPath), ".cache", `${name}.dic.json`);
}

export async function loadDictionaryWithCache(csvPath: string): Promise<DictionaryLoadResult> {
  const signature = await getDictionaryCacheSource(csvPath);
  const cachedDictionary = await readDictionaryCache(csvPath, signature);
  if (cachedDictionary) {
    return {
      dictionary: cachedDictionary,
      source: "cache"
    };
  }

  const rows = await loadCsvFile(csvPath);
  const dictionary = buildDictionary(rows);
  try {
    await writeDictionaryCache(csvPath, dictionary, signature);
  } catch {
    // Cache writes are an optimization; conversion should still work without them.
  }

  return {
    dictionary,
    source: "csv"
  };
}

export async function writeDictionaryCache(
  csvPath: string,
  dictionary: TermDictionary,
  source?: DictionaryCacheSource
): Promise<void> {
  const cachePath = getDictionaryCachePath(csvPath);
  await mkdir(dirname(cachePath), { recursive: true });
  const cacheSource = source ?? (await getDictionaryCacheSource(csvPath));

  const payload: DictionaryCacheFile = {
    cacheVersion: CACHE_VERSION,
    source: cacheSource,
    builder: {
      dictionaryAlgorithmVersion: DICTIONARY_ALGORITHM_VERSION
    },
    createdAt: new Date().toISOString(),
    dictionary: serializeDictionary(dictionary)
  };
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  await writeFile(tempPath, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(tempPath, cachePath);
}

async function readDictionaryCache(
  csvPath: string,
  source: DictionaryCacheSource
): Promise<TermDictionary | undefined> {
  try {
    const text = await readFile(getDictionaryCachePath(csvPath), "utf8");
    const payload = JSON.parse(text) as DictionaryCacheFile;
    if (!isFreshCache(payload, source)) {
      return undefined;
    }

    return deserializeDictionary(payload.dictionary);
  } catch {
    return undefined;
  }
}

async function getDictionaryCacheSource(csvPath: string): Promise<DictionaryCacheSource> {
  const fileStat = await stat(csvPath);
  const buffer = await readFile(csvPath);
  const hash = createHash("sha256").update(buffer).digest("hex");

  return {
    sha256: hash,
    size: buffer.byteLength,
    mtimeMs: fileStat.mtimeMs
  };
}

function isFreshCache(payload: DictionaryCacheFile, source: DictionaryCacheSource): boolean {
  return (
    payload.cacheVersion === CACHE_VERSION &&
    payload.builder?.dictionaryAlgorithmVersion === DICTIONARY_ALGORITHM_VERSION &&
    payload.source?.sha256 === source.sha256 &&
    payload.source?.size === source.size
  );
}

function serializeDictionary(dictionary: TermDictionary): SerializedTermDictionary {
  return {
    rows: dictionary.rows,
    attributeByTerm: serializeAttributeMap(dictionary.attributeByTerm),
    attributeByPhysical: serializeAttributeMap(dictionary.attributeByPhysical),
    termToPhysical: serializeStringSetMap(dictionary.termToPhysical),
    physicalToTerms: serializeStringSetMap(dictionary.physicalToTerms),
    domainTermToPhysical: serializeStringSetMap(dictionary.domainTermToPhysical),
    domainPhysicalToTerms: serializeStringSetMap(dictionary.domainPhysicalToTerms),
    warnings: dictionary.warnings
  };
}

function deserializeDictionary(serialized: SerializedTermDictionary): TermDictionary {
  return {
    rows: serialized.rows,
    attributeByTerm: deserializeAttributeMap(serialized.attributeByTerm),
    attributeByPhysical: deserializeAttributeMap(serialized.attributeByPhysical),
    termToPhysical: deserializeStringSetMap(serialized.termToPhysical),
    physicalToTerms: deserializeStringSetMap(serialized.physicalToTerms),
    domainTermToPhysical: deserializeStringSetMap(serialized.domainTermToPhysical),
    domainPhysicalToTerms: deserializeStringSetMap(serialized.domainPhysicalToTerms),
    warnings: serialized.warnings
  };
}

function serializeAttributeMap(map: Map<string, AttributeEntry>): SerializedAttributeMap {
  return [...map.entries()];
}

function deserializeAttributeMap(entries: SerializedAttributeMap): Map<string, AttributeEntry> {
  return new Map(entries);
}

function serializeStringSetMap(map: Map<string, Set<string>>): SerializedStringSetMap {
  return [...map.entries()].map(([key, values]) => [key, [...values]]);
}

function deserializeStringSetMap(entries: SerializedStringSetMap): Map<string, Set<string>> {
  return new Map(entries.map(([key, values]) => [key, new Set(values)]));
}
