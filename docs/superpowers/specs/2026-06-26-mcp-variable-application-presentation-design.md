# mcp-variable Application Presentation Design

## Goal

Create a new standalone HTML presentation that explains `mcp-variable` through three practical questions:

- Which work can use it?
- How should teams apply it?
- What effect should they expect?

The deck should be useful for introducing the project to developers, technical leads, and AI coding-tool users who already understand DTOs, APIs, SQL, and database columns.

## Output

- Create a new file: `docs/mcp-variable-application-presentation.html`
- Keep existing presentation files unchanged:
  - `docs/mcp-variable-presentation.html`
  - `docs/mcp-variable-beginner-presentation.html`
- The HTML must open directly in a browser without a dev server.
- Add a dedicated static checker for the new presentation.

## Audience

The audience understands application development and Korean business-system naming problems, but may not know this MCP server. They need a concrete map from everyday work to the MCP workflow and its expected benefits.

## Narrative

Use a three-act structure:

1. **적용 업무**: Show the exact work surfaces where naming decisions happen.
2. **적용 방법**: Show the repeatable MCP and Skill workflow.
3. **적용 효과**: Show what improves when naming moves from guessing to dictionary-backed checking.

The presentation should avoid a generic MCP introduction as the main story. MCP appears as the mechanism, while the business value stays centered on naming standardization.

## Slide Structure

### 1. Cover

Message: `mcp-variable` turns business naming into a dictionary-backed workflow.

Include:

- Title: `mcp-variable`
- Subtitle around "업무 변수명 표준화"
- Example: `등록일자 -> REG_YMD -> regYmd`
- Dictionary size: 13,171 converted public-standard terms

### 2. The Problem

Message: AI and developers create inconsistent names when they guess.

Include:

- Korean business term, physical abbreviation, and final code identifier can diverge.
- The paper `How Developers Choose Names` found a median same-name probability of 6.9% across 47 naming instances.
- Connect the research to Korean business systems.

### 3. Section Intro: 적용 업무

Message: Naming appears in many ordinary development tasks.

Include:

- DTO fields
- API payload keys
- DB columns and physical names
- SQL aliases and search conditions
- Review and refactoring

### 4. Applied Work: DTO Fields

Message: DTO fields should follow verified lowerCamel physical names.

Include:

- Example Korean terms: `등록일자`, `사용여부`, `사용자번호`
- Example output: `regYmd`, `useYn`, `userNo`
- Emphasize lowerCamel for code identifiers.

### 5. Applied Work: API Payload Keys

Message: Request and response keys should use the same dictionary-backed names as DTOs.

Include:

- Before/after comparison showing guessed names versus verified names.
- Mention consistent client/server contracts.

### 6. Applied Work: DB Columns and Physical Names

Message: DB columns and physical names use snake case and approved abbreviations.

Include:

- Example output: `REG_YMD`, `USE_YN`, `USER_NO`
- Emphasize domain suffixes such as date/time, yes/no, number, code, and value.

### 7. Applied Work: SQL Aliases and Search Conditions

Message: SQL aliases and query conditions should not drift from application naming.

Include:

- Example flow from Korean term to snake alias.
- Show the same source term driving SQL and application code.

### 8. Applied Work: Code Review and Refactoring

Message: Review comments can focus on dictionary evidence instead of personal preference.

Include:

- Reviewer asks for MCP lookup evidence.
- Refactoring uses bulk conversion to rename repeated terms consistently.

### 9. Section Intro: 적용 방법

Message: Teams apply `mcp-variable` by combining the MCP server, `convert_terms`, and a Skill.

Include:

- Local CSV dictionary
- Local stdio MCP server
- AI coding client
- Skill instruction

### 10. Apply Method: Build and Register

Message: Build the server and register it in the AI client.

Include:

- `npm install`
- `npm run build`
- `node dist/server.js --csv ./data/terms.csv`
- Current MCP config JSON from `AGENTS.md`
- Note: build after source changes because clients run `dist/server.js`.

### 11. Apply Method: Skill Workflow

Message: The Skill tells the AI when and how to use the MCP tool.

Include:

- Collect Korean business terms.
- Call `convert_terms` with newline-separated input.
- Use `lowerCamel` for code.
- Use `snake` for DB and physical names.
- Inspect `confidence`, `unmatched`, `warnings`, and `candidates`.

### 12. Apply Method: convert_terms Examples

Message: Conversion is a small structured request, not a free-form translation prompt.

Include:

- DTO lowerCamel request JSON.
- DB snake request JSON.
- Mention `direction: "term_to_physical"`.

### 13. Apply Method: Decision Rules

Message: The result must be judged before names are applied.

Include:

- `exact`: apply directly.
- `composed`: apply after warning/candidate review.
- `partial` or `none`: do not silently guess.
- If `reverseCheck` appears, report the reverse-confirmed Korean term.

### 14. Section Intro: 적용 효과

Message: The effect is not just faster naming; it is a more reliable naming system.

Include:

- Consistency
- Review speed
- AI output quality
- Dictionary-centered team convention

### 15. Effect: Before and After

Message: The visible difference is from scattered guesses to one shared standard.

Include:

- Before: web search, memory, personal abbreviations, reviewer preference.
- After: trusted CSV, MCP lookup, confidence check, repeatable Skill workflow.

### 16. Effect: Closing

Message: "변수명은 추측하지 않고 사전에 확인한다."

Include:

- Short closing prompt: `Skill을 따라 DTO 필드명으로 변환해줘`
- Source links:
  - `https://arxiv.org/abs/2103.07487`
  - `https://modelcontextprotocol.io/docs/getting-started/intro`
  - `https://modelcontextprotocol.io/docs/learn/architecture`

## Visual Requirements

- Full-page scroll-snapped slides with progress dots.
- Warm professional tone consistent with existing decks, but structured around work flow rather than MCP education.
- Use compact cards, flow diagrams, before/after comparisons, and code examples.
- Avoid external runtime dependencies.
- Keep typography responsive and readable on desktop and mobile.
- Do not use visible instructional text about how to operate the presentation.

## Validation

- Add `scripts/check-application-presentation.mjs`.
- Add `npm run check:application-presentation`.
- Static check should verify:
  - exactly 16 slides
  - one dot per slide
  - required section titles and examples
  - required source links
  - mobile breakpoint
  - `IntersectionObserver`
- Run:
  - `npm run check:application-presentation`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Browser-check the file directly if practical.

## Out Of Scope

- Do not regenerate `data/terms.csv`.
- Do not modify MCP server behavior.
- Do not replace the existing beginner or original presentation.
- Do not add new package dependencies.

## Self-Review

- No placeholders remain.
- The scope is a single standalone HTML presentation plus one checker and one package script.
- The slide structure covers the requested "적용 업무, 적용방법, 적용 효과" basis.
- Validation is explicit and repeatable.
