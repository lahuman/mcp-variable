# mcp-variable Beginner Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new beginner-friendly single-file HTML presentation for developers who are new to MCP.

**Architecture:** Create a standalone HTML deck with six scroll-snapped sections, embedded CSS, embedded JavaScript for navigation, and source links. Add a Node-based static verification script that checks the expected slide structure, required source links, and key Korean copy.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js built-in `fs`/`assert`, existing npm scripts for project verification.

---

## File Structure

- Create: `docs/mcp-variable-beginner-presentation.html`
  - Standalone HTML presentation.
  - Six slides matching the approved design.
  - Embedded CSS and JavaScript only, no new external dependencies.
- Create: `scripts/check-beginner-presentation.mjs`
  - Static verification for required slides, source links, navigation dots, and key content.
- Modify: `package.json`
  - Add `check:presentation` script for repeatable local verification.

### Task 1: Add Static Verification

**Files:**
- Create: `scripts/check-beginner-presentation.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/check-beginner-presentation.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("docs/mcp-variable-beginner-presentation.html", "utf8");

const requiredText = [
  "mcp-variable",
  "개발자가 가장 힘들어 하는 변수명 짓기",
  "용어 사전",
  "도메인 사전",
  "MCP란?",
  "Skill 로 MCP 최대한 활용 하기",
  "설정 방법",
  "사용 방법",
  "6.9%",
  "13,171",
  "convert_terms",
  "https://arxiv.org/abs/2103.07487",
  "https://modelcontextprotocol.io/docs/getting-started/intro",
  "https://modelcontextprotocol.io/docs/learn/architecture"
];

for (const text of requiredText) {
  assert(html.includes(text), `Missing required text: ${text}`);
}

const slideMatches = html.match(/<section class="slide"/g) ?? [];
assert.equal(slideMatches.length, 6, "Expected exactly 6 slides");

const dotMatches = html.match(/class="dot/g) ?? [];
assert.equal(dotMatches.length, 6, "Expected exactly 6 navigation dots");

assert.match(html, /@media \(max-width: 760px\)/, "Missing mobile breakpoint");
assert.match(html, /IntersectionObserver/, "Missing active slide observer");

console.log("Beginner presentation static check passed.");
```

Update `package.json` scripts:

```json
"check:presentation": "node scripts/check-beginner-presentation.mjs"
```

- [ ] **Step 2: Run the verification and confirm it fails**

Run:

```bash
npm run check:presentation
```

Expected: failure because `docs/mcp-variable-beginner-presentation.html` does not exist yet.

### Task 2: Create Presentation HTML

**Files:**
- Create: `docs/mcp-variable-beginner-presentation.html`

- [ ] **Step 1: Create the standalone presentation**

Create a six-slide HTML file with:

- Slide 1: `mcp-variable` opening and `등록일자 -> REG_DTM -> regDtm`
- Slide 2: naming difficulty, 6.9% research data, term dictionary, domain dictionary, physical naming rules
- Slide 3: `MCP란?` with host/client/server explanation
- Slide 4: `Skill 로 MCP 최대한 활용 하기`
- Slide 5: `설정 방법`
- Slide 6: `사용 방법`

- [ ] **Step 2: Run the presentation static check**

Run:

```bash
npm run check:presentation
```

Expected: `Beginner presentation static check passed.`

### Task 3: Verify Project Health

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

- [ ] **Step 1: Open the new HTML in the in-app browser**

Open:

```text
file:///Users/k/DEV/mcp-variable/docs/mcp-variable-beginner-presentation.html
```

Expected: six-slide presentation loads with readable first slide.

- [ ] **Step 2: Check visual basics**

Verify:

- slide 1 is not blank
- navigation dots show six slides
- source links are visible on the final slide
- layout remains readable at a mobile-width viewport
