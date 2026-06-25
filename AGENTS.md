# AGENTS.md

## Project Mission

`mcp-variable` is a Node.js/TypeScript local `stdio` MCP server that converts Korean business terms, physical names, and code variable names from a CSV-backed domain dictionary.

The project goal is to make AI coding tools use a trusted dictionary instead of web search, memory, or guessed translations when generating business variable names.

## Default Dictionary

- Default file: `data/terms.csv`
- Source: 행정안전부 공공데이터 공통표준용어 CSV
- Current source file: `행정안전부_공공데이터 공통표준용어_20251101.csv`
- Current converted rows: 13,171 terms
- Deprecated source rows are excluded.

CSV schema:

- `용어명`
- `물리명`
- `도메인유형`
- `도메인`
- `데이터타입`
- `코드명`
- `정의`
- `요청업무`
- `최종요청자`
- `최종수정일시`

Regenerate the dictionary only when the user explicitly asks:

```bash
npm run convert:public-standard -- "/path/to/행정안전부_공공데이터 공통표준용어_YYYYMMDD.csv" data/terms.csv
```

## Public MCP Tools

### `convert_terms`

Input:

```ts
{
  text: string;
  direction?: "auto" | "term_to_physical" | "physical_to_term";
  outputCase?: "snake" | "lowerCamel" | "upperCamel";
  maxCandidates?: number;
}
```

Important output fields:

- `convertedText`: converted result
- `annotatedText`: reverse-confirmed Korean term when a clearer Korean term is suggested
- `confidence`: `exact`, `composed`, `partial`, or `none`
- `matches`: exact or composed matches
- `candidates`: ambiguous alternatives or possible mappings
- `unmatched`: terms or tokens not found in the dictionary
- `warnings`: ambiguity or diagnostic messages
- `reverseCheck`: token-level reverse lookup details for suggested Korean term changes
- `items`: per-line results for bulk conversion
- `summary`: bulk counts

### `search_terms`

Search registered CSV dictionary rows without converting names.

Input:

```ts
{
  query: string;
  fields?: Array<
    | "termName"
    | "physicalName"
    | "domainType"
    | "domain"
    | "dataType"
    | "codeName"
    | "definition"
    | "requestTask"
  >;
  matchMode?: "contains" | "startsWith" | "exact";
  limit?: number;
  offset?: number;
}
```

Important output fields:

- `items`: matching dictionary rows with `score` and `matchedFields`
- `total`: total matches before pagination
- `matchedFields`: fields that matched the query and whether each match was `exact`, `startsWith`, or `contains`
- `warnings`: diagnostics such as reload fallback warnings

## Mandatory Variable Naming Rule

When writing or refactoring application code, do not invent business variable names.

Use `skills/mcp-variable-naming/SKILL.md` whenever a task involves names derived from Korean business terms, physical names, DTO fields, API payload keys, SQL aliases, database columns, or domain dictionary terminology.

For Gemini/Antigravity sessions, apply `AGENTS_INIT.md` at session startup when repository instructions are not automatically loaded.

Required behavior:

1. Collect the Korean business terms that will become code or database identifiers.
2. Call the `mcp-variable` MCP tool `convert_terms`.
3. Use newline-separated bulk input for multiple terms.
4. Use `outputCase: "lowerCamel"` for code identifiers by default.
5. Use `outputCase: "snake"` for DB columns, SQL aliases, and physical names.
6. Check `confidence`, `unmatched`, `warnings`, and `candidates` before applying names.
7. If `reverseCheck` is present, report its `suggestedTerm` or `annotatedText` to show the reverse-confirmed Korean term.
8. Do not silently use a guessed name when confidence is `partial` or `none`.
9. Report unresolved terms in the final response.

Example for DTO fields:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "lowerCamel"
}
```

Example for DB or physical names:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "snake"
}
```

If the MCP server or `convert_terms` tool is unavailable, tell the user that standard naming cannot be verified. Do not replace MCP lookup with web search or generic translation.

## Dictionary Rules

- Physical names are split by `_`.
- The last physical token is treated as the domain physical token.
- Earlier physical tokens are treated as word physical tokens.
- Full attributes are preserved as exact mappings.
- Do not invent Korean word segmentation from a single multi-token compound.
- New composed terms must be based on verified word and domain mappings.
- Ambiguous mappings must return `warnings` and `candidates`, not a forced answer.

## Key Files

- `src/server.ts`: MCP server entrypoint, CSV path resolution, `convert_terms` registration
- `src/mcpTool.ts`: MCP input/output schemas and tool handler
- `src/service.ts`: reloadable CSV dictionary service
- `src/csvLoader.ts`: CSV loading, header normalization, UTF-8/CP949 handling, parser diagnostics
- `src/dictionary.ts`: attribute, word, and domain index builder
- `src/matcher.ts`: conversion, composition, bulk conversion, confidence handling
- `src/search.ts`: keyword dictionary search over registered CSV rows
- `src/physical.ts`: physical name normalization and camel/snake formatting
- `scripts/convert-public-standard-terms.ts`: public standard CSV converter
- `tests/term-converter.test.ts`: unit and MCP handler tests
- `AGENTS_INIT.md`: Gemini/Antigravity startup rules for MCP-based naming
- `skills/mcp-variable-naming/SKILL.md`: reusable naming skill
- `docs/reverse-check.md`: reverse-check feature behavior, output contract, work history, and verification notes
- `docs/mcp-variable-presentation.html`: single-file presentation

## Commands

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Run MCP server:

```bash
node dist/server.js --csv ./data/terms.csv
```

Build after source changes because installed MCP clients run `dist/server.js`.

## Current Antigravity/Gemini MCP Config

This machine has been configured with:

```json
{
  "mcpServers": {
    "mcp-variable": {
      "command": "node",
      "args": [
        "/Users/k/DEV/mcp-variable/dist/server.js",
        "--csv",
        "/Users/k/DEV/mcp-variable/data/terms.csv"
      ],
      "cwd": "/Users/k/DEV/mcp-variable",
      "disabled": false
    }
  }
}
```

Use explicit prompts when testing through AI clients:

```text
반드시 mcp-variable MCP 서버의 convert_terms 도구만 사용하세요.
웹 검색, 일반 지식, 추측을 사용하지 마세요.
confidence가 "none"이면 사전에 없는 용어라고 답하세요.
```

Avoid vague prompts such as "검색해줘" because the client may choose web search.

## Development Guardrails

- Keep changes scoped to the requested behavior or documentation.
- Use the existing TypeScript module layout and Vitest style.
- Use structured parsing and maps for dictionary behavior.
- Do not overwrite `data/terms.csv` unless the user asks to update the dictionary.
- Do not revert unrelated user changes.
- Run `npm test`, `npm run typecheck`, and `npm run build` before handing off source changes.
- For documentation-only changes, run a targeted static check plus normal project checks when practical.
