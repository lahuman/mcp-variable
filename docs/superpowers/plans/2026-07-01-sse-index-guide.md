# SSE Index Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a public `/index.html` guide page from the SSE server without exposing the real API key.

**Architecture:** Add a small HTML response helper and a generated guide page inside `src/server_sse.ts`. Keep `/index.html` and `/` public, while `/sse` and `/messages` continue through the existing security pipeline.

**Tech Stack:** Node.js HTTP server, TypeScript, Vitest.

---

## File Structure

- Modify `src/server_sse.ts`: add `sendHtml`, generated guide markup, and route handling for `/` and `/index.html`.
- Modify `tests/server-sse.test.ts`: add HTTP tests for public guide content and key non-disclosure.
- Modify `README.md`: mention the browser guide path and server-side API key example.

## Task 1: Public Index Guide Route

**Files:**
- Modify: `tests/server-sse.test.ts`
- Modify: `src/server_sse.ts`

- [ ] **Step 1: Write the failing test**

Add a test that starts a server with `apiKeys: ["variable-mcp-with-dataportal"]`, requests `/index.html` and `/`, and asserts both are public HTML pages that include `mcp-variable`, `/sse`, `/messages`, `Authorization: Bearer <api-key>`, and do not include `variable-mcp-with-dataportal`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: FAIL because `/index.html` currently returns `404`.

- [ ] **Step 3: Implement minimal route**

Add `sendHtml`, `createIndexHtml`, and route handling before `/sse` and `/messages` guards.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: PASS.

## Task 2: Documentation And Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the guide page**

Mention `GET /index.html` and `GET /` in the SSE deployment section. Add a server-side example:

```dotenv
MCP_VARIABLE_API_KEYS=variable-mcp-with-dataportal
```

- [ ] **Step 2: Run full checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

## Self-Review

- Spec coverage: public index page, non-disclosure of real key, examples, and verification are covered.
- Placeholder scan: no deferred requirements remain.
- Type consistency: route names and environment variable names match existing SSE server code.
