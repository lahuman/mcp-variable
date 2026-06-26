# mcp-variable Application Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new standalone HTML presentation that explains `mcp-variable` by applied work, application method, and expected effects.

**Architecture:** Add one static checker and one standalone HTML file. The checker verifies the expected slide count, key Korean copy, examples, links, navigation dots, mobile breakpoint, and slide observer.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js built-in `fs` and `assert`, existing npm scripts.

---

## File Structure

- Create: `docs/mcp-variable-application-presentation.html`
  - Standalone 16-slide Korean presentation.
  - Embedded CSS and JavaScript only.
  - Opens directly in a browser.
- Create: `scripts/check-application-presentation.mjs`
  - Static verification for required slide structure and required copy.
- Modify: `package.json`
  - Add `check:application-presentation`.

### Task 1: Add Static Verification

**Files:**
- Create: `scripts/check-application-presentation.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the failing checker**

Create `scripts/check-application-presentation.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("docs/mcp-variable-application-presentation.html", "utf8");

const requiredText = [
  "mcp-variable",
  "업무 변수명 표준화",
  "등록일자 -> REG_YMD -> regYmd",
  "13,171",
  "추측할 때 생기는 불일치",
  "6.9%",
  "적용 업무",
  "DTO 필드",
  "API payload key",
  "DB 컬럼과 물리명",
  "SQL alias와 검색 조건",
  "코드 리뷰와 리팩터링",
  "적용 방법",
  "MCP 서버 빌드와 연결",
  "Skill 워크플로우",
  "convert_terms 입력 예시",
  "confidence 판단 규칙",
  "적용 효과",
  "추측에서 표준으로",
  "변수명은 추측하지 않고 사전에 확인한다",
  "Skill을 따라 DTO 필드명으로 변환해줘",
  "REG_YMD",
  "USE_YN",
  "USER_NO",
  "regYmd",
  "useYn",
  "userNo",
  "direction",
  "term_to_physical",
  "lowerCamel",
  "snake",
  "reverseCheck",
  "https://arxiv.org/abs/2103.07487",
  "https://modelcontextprotocol.io/docs/getting-started/intro",
  "https://modelcontextprotocol.io/docs/learn/architecture"
];

for (const text of requiredText) {
  assert(html.includes(text), `Missing required text: ${text}`);
}

const slideMatches = html.match(/<section class="slide"/g) ?? [];
assert.equal(slideMatches.length, 16, "Expected exactly 16 slides");

const dotMatches = html.match(/class="dot/g) ?? [];
assert.equal(dotMatches.length, slideMatches.length, "Expected one navigation dot per slide");

assert.match(html, /@media \(max-width: 760px\)/, "Missing mobile breakpoint");
assert.match(html, /IntersectionObserver/, "Missing active slide observer");
assert(!html.includes("TODO"), "Presentation must not contain TODO placeholders");
assert(!html.includes("TBD"), "Presentation must not contain TBD placeholders");

console.log("Application presentation static check passed.");
```

- [ ] **Step 2: Add npm script**

Add the package script:

```json
"check:application-presentation": "node scripts/check-application-presentation.mjs"
```

- [ ] **Step 3: Run the checker and verify RED**

Run:

```bash
npm run check:application-presentation
```

Expected: failure because `docs/mcp-variable-application-presentation.html` does not exist yet.

### Task 2: Create Presentation HTML

**Files:**
- Create: `docs/mcp-variable-application-presentation.html`

- [ ] **Step 1: Create the standalone deck**

Create a 16-slide HTML file with these slide titles:

```text
1. mcp-variable
2. 추측할 때 생기는 불일치
3. 적용 업무
4. 적용 업무: DTO 필드
5. 적용 업무: API payload key
6. 적용 업무: DB 컬럼과 물리명
7. 적용 업무: SQL alias와 검색 조건
8. 적용 업무: 코드 리뷰와 리팩터링
9. 적용 방법
10. 적용 방법: MCP 서버 빌드와 연결
11. 적용 방법: Skill 워크플로우
12. 적용 방법: convert_terms 입력 예시
13. 적용 방법: confidence 판단 규칙
14. 적용 효과
15. 적용 효과: 추측에서 표준으로
16. 변수명은 추측하지 않고 사전에 확인한다
```

Include embedded CSS for the scroll-snapped presentation and embedded JavaScript for progress-dot navigation and active slide updates with `IntersectionObserver`.

- [ ] **Step 2: Run the checker and verify GREEN**

Run:

```bash
npm run check:application-presentation
```

Expected: `Application presentation static check passed.`

### Task 3: Project Verification

**Files:**
- No new files.

- [ ] **Step 1: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected: exit code 0.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: exit code 0.

### Task 4: Browser Verification

**Files:**
- No new files.

- [ ] **Step 1: Open the generated HTML directly**

Open:

```text
file:///Users/k/DEV/mcp-variable/docs/mcp-variable-application-presentation.html
```

Expected: the first slide loads and shows the `mcp-variable` cover.

- [ ] **Step 2: Verify visual basics**

Check:

- There are 16 navigation dots.
- Text is readable on desktop width.
- A mobile-width viewport does not overlap the main slide content.
- Source links are present on the closing slide.

## Self-Review

- The plan covers each requirement in the design spec.
- There are no placeholders or ambiguous "later" steps.
- The checker is created before the deck, giving a RED/GREEN path for the new artifact.
