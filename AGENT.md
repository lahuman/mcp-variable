# AGENT.md

## Project Snapshot

`mcp-variable` is a Node.js/TypeScript local `stdio` MCP server for converting Korean business terms, physical names, and variable names using a CSV-backed domain dictionary.

The primary MCP tool is `convert_terms`. It supports:

- Korean term name to physical name, for example `등록일자` -> `REG_YMD`
- Physical snake/camel name to Korean term, for example `rotngRsltVal` -> `라우팅결과값`
- Physical output case conversion: `snake`, `lowerCamel`, `upperCamel`
- Newline-separated bulk conversion with `items` and `summary`
- Missing term detection through `confidence: "none"` and `unmatched`

## Current Data

- Default dictionary: `data/terms.csv`
- Source: 행정안전부 공공데이터 공통표준용어 CSV
- Current converted source file: `행정안전부_공공데이터 공통표준용어_20251101.csv`
- Current data rows: 13,171 rows, excluding deprecated source rows
- Converted schema:
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

To regenerate the CSV from a new public standard term file:

```bash
npm run convert:public-standard -- "/path/to/행정안전부_공공데이터 공통표준용어_YYYYMMDD.csv" data/terms.csv
```

## Key Files

- `src/server.ts`: MCP server entrypoint, CSV path resolution, `convert_terms` registration
- `src/mcpTool.ts`: MCP input/output schemas and tool handler
- `src/service.ts`: reloadable CSV dictionary service
- `src/csvLoader.ts`: CSV loading, header normalization, encoding handling
- `src/dictionary.ts`: attribute, word, and domain index builder
- `src/matcher.ts`: conversion, composition, bulk conversion, confidence handling
- `src/physical.ts`: physical name normalization and camel/snake formatting
- `scripts/convert-public-standard-terms.ts`: public standard CSV to project CSV converter
- `tests/term-converter.test.ts`: unit and MCP handler tests
- `docs/mcp-variable-presentation.html`: single-file presentation explaining MCP and this project

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
node dist/server.js --csv ./data/terms.csv
```

Use `npm run build` after source changes because installed MCP clients are configured to run `dist/server.js`.

## MCP Interface

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
- `confidence`: `exact`, `composed`, `partial`, or `none`
- `matches`: exact or composed matches
- `candidates`: ambiguous or possible alternatives
- `unmatched`: terms or physical tokens that were not found
- `items`: per-line results for bulk conversion
- `summary`: bulk conversion counts

## Dictionary Rules

- Physical names are split by `_`.
- The last physical token is treated as the domain physical token.
- Earlier physical tokens are treated as word physical tokens.
- Full attributes are always preserved as exact mappings.
- Do not invent unverified Korean word segmentation from a single multi-token compound.
- New composed terms must be based on verified word and domain mappings.
- Ambiguous mappings should return `warnings` and `candidates`, not a forced answer.

## Client Usage Notes

When testing through an AI client, force the MCP tool explicitly. Avoid vague prompts like "검색해줘" because the client may use web search or model knowledge.

Recommended prompt pattern:

```text
반드시 mcp-variable MCP 서버의 convert_terms 도구만 사용하세요.
웹 검색, 일반 지식, 추측을 사용하지 마세요.

{
  "text": "아라",
  "direction": "term_to_physical",
  "outputCase": "snake"
}

confidence가 "none"이면 사전에 없는 용어라고 답하세요.
```

On this machine, Antigravity was configured with:

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

## Development Guardrails

- Keep changes scoped to the requested behavior or documentation.
- Use the existing TypeScript module layout and test style.
- Use structured parsing and maps for dictionary behavior, not ad hoc text replacement.
- Do not overwrite `data/terms.csv` unless the user asks to regenerate or update the dictionary.
- Run `npm test`, `npm run typecheck`, and `npm run build` before handing off source changes.
- If only static documentation changes, still run at least a static file check plus the normal project checks when practical.
