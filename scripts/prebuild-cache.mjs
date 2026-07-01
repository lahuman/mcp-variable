#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

const csvPath = process.argv[2] ? resolve(process.argv[2]) : resolve("data/terms.csv");
const startedAt = performance.now();
const { getDictionaryCachePath, loadDictionaryWithCache } = await import("../dist/cache.js");

const { dictionary, source } = await loadDictionaryWithCache(csvPath);
const cachePath = getDictionaryCachePath(csvPath);
const cacheStat = await stat(cachePath);

console.log(
  JSON.stringify(
    {
      source,
      rows: dictionary.rows.length,
      cachePath,
      cacheBytes: cacheStat.size,
      ms: Math.round(performance.now() - startedAt)
    },
    null,
    2
  )
);
