---
name: mcp-variable-naming
description: Use when Gemini, Antigravity, or another AI coding agent must search registered Korean dictionary terms or generate, validate, or convert standard variable names, properties, DTO fields, API payload keys, SQL aliases, database columns, physical names, snake_case names, lowerCamel/UpperCamel names, or names derived from Korean domain dictionary terms.
---

# MCP Variable Naming for Gemini

## Purpose

In Gemini/Antigravity coding sessions, use the `mcp-variable` MCP server as the source of truth for business variable names. Do not invent names from memory, web search, or generic translation when a name is based on a domain term.

If the agent session does not automatically load repository instructions, paste or attach `AGENTS_INIT.md` before asking for variable names.

## Required Workflow

1. Identify every business term that will become a variable, property, DTO field, API key, SQL alias, or database column.
2. If the user needs to inspect existing registered dictionary rows first, call `search_terms` with the user's keyword. Use this for discovery only.
3. Call the `mcp-variable` MCP tool `convert_terms` before finalizing any code, API, SQL, DB, or physical name.
4. Use newline-separated bulk input when converting more than one term.
5. Apply the returned names in code only after checking `confidence`, `unmatched`, `warnings`, and `candidates`.
6. Mention unresolved naming items in the final response if any term is `partial` or `none`.

## Tool Calls

For searching registered dictionary rows before choosing a term:

```json
{
  "query": "자동차",
  "fields": ["termName", "definition", "requestTask"],
  "limit": 20
}
```

`search_terms` results show registered rows and matched fields. Do not treat a search result as a confirmed variable or column name; use `convert_terms` for final naming.

For Korean term to code variable names:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "lowerCamel"
}
```

For Korean term to database or physical names:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "snake"
}
```

For validating an existing physical or camel name:

```json
{
  "text": "rotngRsltVal",
  "direction": "physical_to_term"
}
```

## Naming Policy

- Use `lowerCamel` for JavaScript/TypeScript variables, object properties, DTO fields, request/response payload keys, Java/Kotlin fields, and similar code identifiers unless the local codebase clearly uses another convention.
- Use `upperCamel` only for class, type, interface, enum, or component names when the name is directly derived from a domain term.
- Use `snake` for database columns, SQL aliases, physical names, migration identifiers, and metadata that must preserve physical naming.
- Preserve acronyms exactly as returned by the MCP output. Do not manually improve or re-expand abbreviations.
- Prefer exact attribute mappings over composed mappings.
- Use composed mappings only when `confidence` is `composed` and there are no blocking warnings.
- Do not silently use a guessed name when `confidence` is `partial` or `none`.

## Confidence Handling

- `exact`: Use `convertedText`.
- `composed`: Use `convertedText`, and keep any returned warnings visible in the final response if they affect naming confidence.
- `partial`: Do not finalize the name without user confirmation. Show `candidates`, `unmatched`, and the proposed fallback if one is needed to keep code compiling.
- `none`: Treat the term as missing from the dictionary. Do not invent a standard variable name. Ask for the intended term or note that a new dictionary registration is needed.

If `reverseCheck` is present on a `term_to_physical` result, the identifier in `convertedText` is still the machine-usable name, but the Korean term in `reverseCheck.suggestedTerm` should be reported to the user. `annotatedText` contains that reverse-confirmed Korean term directly, for example `애플리케이션정보명`.

## User-Facing TODO Comments

Keep this skill in English for agent clarity, but write comments that remain in user code or user-facing documents in Korean.

```ts
// TODO(mcp-variable): "아라"는 사전에 등록되지 않은 용어입니다. confidence=none.
// 사용자가 단어/도메인을 사전에 추가한 뒤 convert_terms를 다시 실행해 표준 변수명을 확정해야 합니다.
const temporaryValue = value;
```

```ts
// TODO(mcp-variable): "처리상태구분"의 도메인 "구분" 매핑을 확인할 수 없습니다. confidence=partial.
// 사용자가 한글 도메인명과 물리 토큰을 사전에 추가/확인한 뒤 convert_terms를 다시 실행해야 합니다.
const temporaryProcessingStatusValue = value;
```

## Practical Coding Pattern

Before editing code, make a short mapping table in your working notes:

```text
한글명 -> MCP result -> code name -> confidence
등록일자 -> REG_YMD -> regYmd -> exact
라우팅결과값 -> ROTNG_RSLT_VAL -> rotngRsltVal -> exact
아라 -> 아라 -> unresolved -> none
```

Then apply only the resolved names in code. If unresolved names block the implementation, ask the user for the desired standard term instead of making up a name.

## Missing MCP Tool

If the `mcp-variable` MCP server, `search_terms`, or `convert_terms` tool is not available:

1. Check the project instructions in `AGENTS.md` for the configured server command.
2. In Gemini/Antigravity, verify that the `mcp-variable` MCP server is enabled in the client MCP configuration.
3. Tell the user that standard naming cannot be verified until the MCP server is enabled.
4. Do not replace MCP lookup with web search or generic translation.
