# mcp-variable Beginner Presentation Design

## Goal

Create a new beginner-friendly HTML presentation for developers who have little or no prior MCP experience. The presentation should make `mcp-variable` feel approachable, useful, and immediately usable.

## Output

- Create a new standalone HTML file: `docs/mcp-variable-beginner-presentation.html`
- Do not overwrite the existing `docs/mcp-variable-presentation.html`
- Keep the presentation usable by opening the HTML file directly in a browser

## Audience

The audience is developers who understand variables, DTOs, APIs, and database columns, but do not yet understand MCP. They need a simple explanation first, then practical setup and usage examples.

## Style Direction

Use the approved A+B direction:

- A: Storytelling intro style as the base
- B: Step-by-step educational clarity mixed in

The visual tone should be warmer and easier than the existing presentation while staying professional. The deck should avoid dense documentation blocks and use simple visual metaphors, short examples, and clear calls to action.

## Slide Structure

### 1. mcp-variable First Slide

Message: AI should not guess business variable names. It should check the trusted dictionary.

Content:

- Title centered around `mcp-variable`
- Simple example: `등록일자 -> REG_YMD -> regYmd`
- One-line positioning: CSV-backed Korean term and physical-name conversion MCP server
- Mention that the bundled dictionary currently contains 13,171 converted public-standard terms

### 2. The Hardest Developer Task: Naming Variables

Message: Naming is hard because developers are translating business meaning into shared code language.

Content:

- Internet-verified research data:
  - The paper `How Developers Choose Names` studied 334 subjects.
  - In 47 naming instances, the median probability that two developers chose the same name was only 6.9%.
  - The paper also frames variable and function names as implicit documentation for program comprehension.
- Explain that the problem becomes harder in Korean business systems because developers must decide:
  - Which Korean business term is standard
  - Which physical abbreviation represents it
  - Which data domain applies, such as value, date, yes/no, number, or code
  - Which final identifier style to use, such as `snake` or `lowerCamel`
- Add a simple dictionary explanation:
  - Term dictionary: standard Korean business names
  - Domain dictionary: data meaning and type standards such as date, yes/no, number, code, value
  - Physical naming rules: approved abbreviations such as `REG_YMD`, `USE_YN`, and `USER_NO`
- Connect to `mcp-variable`: it changes naming from guessing to checking.

Sources:

- `https://arxiv.org/abs/2103.07487`

### 3. What Is MCP?

Message: MCP is a standard way for AI apps to connect to tools and data.

Content:

- Use a simple "standard port for AI" metaphor
- Explain host, client, server in plain Korean
- Show that `mcp-variable` is a local stdio MCP server
- Mention that MCP can expose tools, resources, and prompts, but this project exposes one tool: `convert_terms`

Sources:

- `https://modelcontextprotocol.io/docs/getting-started/intro`
- `https://modelcontextprotocol.io/docs/learn/architecture`

### 4. Use Skill To Get More From MCP

Message: MCP gives the AI a tool; a Skill tells the AI when and how to use it.

Content:

- Explain Skill as a repeatable instruction manual for AI coding agents
- Show the local skill path: `skills/mcp-variable-naming/SKILL.md`
- Show the required workflow:
  - collect Korean business terms
  - call `convert_terms`
  - use `lowerCamel` for code identifiers
  - use `snake` for DB columns and physical names
  - inspect `confidence`, `unmatched`, `warnings`, and `candidates`
- Emphasize: no silent guessing when confidence is `partial` or `none`

### 5. Setup Method

Message: Build the local MCP server and register it in an AI client.

Content:

- Commands:
  - `npm install`
  - `npm run build`
  - `node dist/server.js --csv ./data/terms.csv`
- MCP configuration JSON based on this machine's current config:

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

- Include a clear note: build after source changes because MCP clients run `dist/server.js`.

### 6. Usage Method

Message: Give Korean terms, choose an output case, and trust the confidence result.

Content:

- Show lowerCamel DTO example:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "lowerCamel"
}
```

- Show snake/DB example:

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "snake"
}
```

- Show confidence handling:
  - `exact`: use directly
  - `composed`: use after checking warnings
  - `partial` or `none`: do not invent a final name
- End with the practical prompt:

```text
반드시 mcp-variable MCP 서버의 convert_terms 도구만 사용하세요.
웹 검색, 일반 지식, 추측을 사용하지 마세요.
confidence가 "none"이면 사전에 없는 용어라고 답하세요.
```

## Visual Requirements

- Use a full-page slide layout with smooth vertical navigation and progress dots.
- Use a balanced palette, not a one-note blue or purple theme.
- Use simple diagram-like blocks for the naming problem, MCP flow, skill workflow, setup, and usage.
- Use cards only for repeated items or concrete framed examples.
- Avoid landing-page marketing structure; the first viewport should be the actual presentation.
- Keep all text responsive and readable on desktop and mobile.

## Validation

Before handoff:

- Run a static sanity check on the new HTML with a local parser or script.
- Open the new HTML in the in-app browser or a local browser if practical.
- Run normal project checks when practical:
  - `npm test`
  - `npm run typecheck`
  - `npm run build`

## Out Of Scope

- Do not regenerate `data/terms.csv`.
- Do not modify MCP server behavior.
- Do not overwrite the existing presentation.
- Do not add external runtime dependencies.
