# AGENTS_INIT.md

This file is written in English so AI agents can follow it consistently.
Any TODO comments that will remain in user code or user-facing documents must be written in Korean.

## Variable Naming Baseline

When writing code, refactoring code, or creating DTO/API/DB/SQL artifacts, always use the `mcp-variable` MCP server for names derived from business terms.

Do not create variable names, physical names, field names, or column names from memory, generic translation, web search, or model guesses.

## MCP Usage Rule

Before creating any of the following names, call the `convert_terms` tool from the `mcp-variable` MCP server:

- variable names
- object property names
- DTO field names
- API payload keys
- SQL aliases
- database column names
- physical names

For code identifiers, use `lowerCamel`:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "lowerCamel"
}
```

For database columns, SQL aliases, and physical names, use `snake`:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "snake"
}
```

## Result Handling

- If `confidence` is `"exact"`, use `convertedText` as-is.
- If `confidence` is `"composed"`, check `warnings` first. Use `convertedText` only when there is no blocking warning.
- If `confidence` is `"partial"`, do not finalize the name. Report `candidates`, `unmatched`, and `warnings` to the user.
- If `confidence` is `"none"`, treat the term as missing from the dictionary. Do not invent a replacement name.

## Comment Rule for Missing Words or Domains

When a word, domain, or full term is missing or cannot be confirmed, leave a clear Korean comment so the user can add it to the dictionary later.

The comment must include:

- the original Korean term
- whether the missing item is a word, domain, or full term
- the MCP `confidence`
- any `unmatched` value or candidate information
- an instruction that the user should add the term or domain to the dictionary
- Korean wording for the user

Example for a missing word or term:

```ts
// TODO(mcp-variable): "아라"는 사전에 등록되지 않은 용어입니다. confidence=none.
// 사용자가 단어/도메인을 사전에 추가한 뒤 convert_terms를 다시 실행해 표준 변수명을 확정해야 합니다.
const temporaryValue = value;
```

Example for a missing or uncertain domain:

```ts
// TODO(mcp-variable): "처리상태구분"의 도메인 "구분" 매핑을 확인할 수 없습니다. confidence=partial.
// 사용자가 한글 도메인명과 물리 토큰을 사전에 추가/확인한 뒤 convert_terms를 다시 실행해야 합니다.
const temporaryProcessingStatusValue = value;
```

## Prohibited Behavior

- Do not translate a missing Korean term into a natural English variable name.
- Do not treat `confidence: "none"` or `confidence: "partial"` as a confirmed standard name.
- Do not use web search results as standard variable names.
- Do not arbitrarily choose one option when the MCP response has multiple candidates.

## Final Response Rule

If any term was missing or unresolved, report it in a separate section of the final response.

Example:

```text
Unresolved terms:
- 아라: confidence none, dictionary registration required
- 처리상태구분: domain mapping for "구분" needs confirmation
```
