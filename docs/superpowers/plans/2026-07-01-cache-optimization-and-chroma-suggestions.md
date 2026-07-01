# Cache Optimization And Chroma Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce dictionary cache build time for large CSV files and add optional Chroma-backed semantic search/suggestion support without weakening deterministic term conversion.

**Architecture:** Keep exact and composed conversion on local Map-based dictionary indexes. Optimize the deterministic builder by precomputing row physical tokens and sorted token-specific candidate indexes, then add a semantic suggestion service that is optional and unavailable unless Chroma is configured.

**Tech Stack:** Node.js 20, TypeScript, Vitest, optional Chroma HTTP client integration.

---

## File Structure

- Modify `src/dictionary.ts`: add builder-local candidate indexes and use them in segmentation.
- Modify `src/types.ts`: add semantic suggestion input/output types and optional semantic search mode.
- Modify `src/search.ts`: keep current exact/contains search as default; expose shared ranking types for semantic merge if needed.
- Create `src/semantic.ts`: define optional semantic index interfaces, disabled fallback, and Chroma adapter boundary.
- Modify `src/service.ts`: wire optional semantic search/suggestion methods without changing conversion behavior.
- Modify `src/mcpTool.ts`: register a new `suggest_terms` tool and, if practical, semantic search options.
- Modify `tests/term-converter.test.ts`: add cache-builder regression and semantic fallback tests.
- Modify `README.md`: document cache prebuild command, optimization intent, and optional Chroma setup.

## Task 1: Builder Candidate Index Optimization

**Files:**
- Modify: `tests/term-converter.test.ts`
- Modify: `src/dictionary.ts`

- [ ] **Step 1: Write failing regression tests**

Add tests that prove composed components still resolve for multi-token terms and that builder segmentation only considers candidates attached to the current physical token.

Run:

```bash
npm test -- tests/term-converter.test.ts
```

Expected: FAIL until the new helper is exported or observable through behavior.

- [ ] **Step 2: Implement builder-local indexes**

In `src/dictionary.ts`, introduce a local builder context with:

```ts
type BuilderContext = {
  rows: Array<{ row: TermRow; physicalTokens: string[] }>;
  wordTermsByPhysical: Map<string, string[]>;
  domainTermsByPhysical: Map<string, string[]>;
};
```

Refresh sorted candidates only when mappings change. Use `physicalToken -> sorted terms` inside `segmentByTokens`, `segmentByTokensWithSingleInferredWord`, and `splitByKnownDomainSuffix`.

- [ ] **Step 3: Verify tests pass**

Run:

```bash
npm test -- tests/term-converter.test.ts
```

Expected: PASS with existing conversion outputs unchanged.

## Task 2: Cache Build Benchmark Script

**Files:**
- Create: `scripts/prebuild-cache.mjs`
- Modify: `README.md`

- [ ] **Step 1: Write script behavior test or smoke command**

Use the current dictionary and assert the script reports source, row count, cache path, and elapsed time.

Run:

```bash
node scripts/prebuild-cache.mjs ./data/terms.csv
```

Expected: prints JSON containing `rows`, `source`, `cachePath`, and `ms`.

- [ ] **Step 2: Implement the script**

Load `dist/cache.js`, call `loadDictionaryWithCache(csvPath)`, stat the generated cache, and print a compact JSON summary.

- [ ] **Step 3: Document usage**

Add a README section showing `npm run build` followed by `node scripts/prebuild-cache.mjs ./data/terms.csv`.

## Task 3: Optional Semantic Suggestion Boundary

**Files:**
- Create: `src/semantic.ts`
- Modify: `src/types.ts`
- Modify: `tests/term-converter.test.ts`

- [ ] **Step 1: Write failing fallback tests**

Test that semantic suggestions return a clear warning when Chroma is not configured and do not affect `convert_terms` confidence or converted text.

- [ ] **Step 2: Implement disabled semantic service**

Create `createSemanticSuggestionService()` with a disabled implementation by default. It returns empty `items` plus a warning explaining semantic suggestions are not configured.

- [ ] **Step 3: Verify fallback tests pass**

Run:

```bash
npm test -- tests/term-converter.test.ts
```

Expected: PASS.

## Task 4: MCP `suggest_terms` Tool

**Files:**
- Modify: `src/mcpTool.ts`
- Modify: `src/service.ts`
- Modify: `src/types.ts`
- Modify: `tests/term-converter.test.ts`

- [ ] **Step 1: Write failing MCP handler test**

Add a handler test for `suggest_terms` with input `{ "query": "등록날짜", "target": "term" }`. Expected output includes empty `items` and a warning when Chroma is disabled.

- [ ] **Step 2: Register the tool**

Add Zod schemas and a handler that calls `TermDictionaryService.suggest()`. Keep `convert_terms` and `search_terms` unchanged.

- [ ] **Step 3: Verify tests pass**

Run:

```bash
npm test -- tests/term-converter.test.ts
```

Expected: PASS.

## Task 5: Chroma Adapter Documentation And Optional Wiring

**Files:**
- Modify: `src/semantic.ts`
- Modify: `README.md`
- Modify: `package.json` only if the dependency can be installed and verified.

- [ ] **Step 1: Add adapter boundary**

Implement the Chroma code behind dynamic import/configuration so the server works without Chroma installed.

- [ ] **Step 2: Document Chroma mode**

Document that Chroma is for semantic recommendations only, not authoritative conversion. Include server path, collection naming, and environment variables.

- [ ] **Step 3: Run full checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

## Self-Review

- Spec coverage: deterministic cache optimization, optional semantic recommendation, Chroma role, and verification are covered.
- Placeholder scan: no `TBD` or deferred behavior remains.
- Type consistency: planned service, MCP, and test names match existing TypeScript conventions.
