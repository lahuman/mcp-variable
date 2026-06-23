---
name: mcp-variable-naming
description: Use the local mcp-variable MCP dictionary to generate, validate, or convert standard variable names, property names, DTO fields, API payload keys, SQL aliases, and database column names while writing or refactoring code. Use whenever a programming task needs names derived from Korean business terms, physical names, snake_case names, lowerCamel/UpperCamel names, or domain dictionary terminology.
---

# MCP Variable Naming

## Purpose

Use the `mcp-variable` MCP server as the source of truth for business variable names. Do not invent names from memory, web search, or generic translation when a name is based on a domain term.

## Required Workflow

1. Identify every business term that will become a variable, property, DTO field, API key, SQL alias, or database column.
2. Call the `mcp-variable` MCP tool `convert_terms` before finalizing those names.
3. Use newline-separated bulk input when converting more than one term.
4. Apply the returned names in code only after checking `confidence`, `unmatched`, `warnings`, and `candidates`.
5. Mention unresolved naming items in the final response if any term is `partial` or `none`.

## Tool Calls

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

If the `mcp-variable` MCP server or `convert_terms` tool is not available:

1. Check the project instructions in `AGENTS.md` for the configured server command.
2. Tell the user that standard naming cannot be verified until the MCP server is enabled.
3. Do not replace MCP lookup with web search or generic translation.
