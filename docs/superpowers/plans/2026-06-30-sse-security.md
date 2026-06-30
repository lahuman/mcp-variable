# SSE Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in API-key authentication, abuse limits, CORS allowlisting, and security headers to the SSE MCP server.

**Architecture:** Keep the stdio MCP server untouched. Extend `src/server_sse.ts` with environment-driven security options, request guards for `/sse` and `/messages`, and small response helpers that apply common headers. Add tests in the existing SSE test file and document deployment variables.

**Tech Stack:** Node.js HTTP server, TypeScript, `@modelcontextprotocol/sdk` SSE transport, Vitest, Docker Compose environment variables.

---

## File Structure

- Modify `src/server_sse.ts`: add security option parsing, auth checks, rate limiting, CORS handling, max-session enforcement, and security headers.
- Modify `tests/server-sse.test.ts`: add focused HTTP-level tests for auth, CORS, rate limits, session limits, and the existing MCP happy path.
- Modify `.env.example`: document optional security environment variables.
- Modify `docker-compose.yml`: pass optional security variables into the container.
- Modify `README.md`: explain how to enable API keys, CORS, and abuse limits.

## Task 1: Security Option Parsing Tests

**Files:**
- Modify: `tests/server-sse.test.ts`
- Modify: `src/server_sse.ts`

- [ ] **Step 1: Write failing tests for parsed defaults and env overrides**

Add tests inside `describe("SSE server options", () => { ... })`:

```ts
  test("uses safe security defaults without enabling auth", () => {
    expect(resolveSseServerOptions([], {})).toMatchObject({
      apiKeys: [],
      allowedOrigins: [],
      maxSessions: 100,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 120
    });
  });

  test("parses security options from environment variables", () => {
    expect(
      resolveSseServerOptions([], {
        MCP_VARIABLE_API_KEYS: "alpha, beta ",
        MCP_VARIABLE_ALLOWED_ORIGINS: "https://term2var.kro.kr, https://example.com",
        MCP_VARIABLE_MAX_SESSIONS: "2",
        MCP_VARIABLE_RATE_LIMIT_WINDOW_MS: "1000",
        MCP_VARIABLE_RATE_LIMIT_MAX: "3"
      })
    ).toMatchObject({
      apiKeys: ["alpha", "beta"],
      allowedOrigins: ["https://term2var.kro.kr", "https://example.com"],
      maxSessions: 2,
      rateLimitWindowMs: 1000,
      rateLimitMax: 3
    });
  });

  test("rejects invalid security limit values", () => {
    expect(() => resolveSseServerOptions([], { MCP_VARIABLE_MAX_SESSIONS: "0" })).toThrow(/Invalid MCP_VARIABLE_MAX_SESSIONS/);
    expect(() => resolveSseServerOptions([], { MCP_VARIABLE_RATE_LIMIT_WINDOW_MS: "0" })).toThrow(/Invalid MCP_VARIABLE_RATE_LIMIT_WINDOW_MS/);
    expect(() => resolveSseServerOptions([], { MCP_VARIABLE_RATE_LIMIT_MAX: "0" })).toThrow(/Invalid MCP_VARIABLE_RATE_LIMIT_MAX/);
  });
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: FAIL because `SseServerOptions` does not include the security fields yet.

- [ ] **Step 3: Implement option parsing**

In `src/server_sse.ts`, extend `SseServerOptions` and parse env values:

```ts
  apiKeys: string[];
  allowedOrigins: string[];
  maxSessions: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
```

Use comma-separated parsing for keys/origins and positive integer parsing for limits.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: all existing and new option tests pass.

## Task 2: API Key Authentication

**Files:**
- Modify: `tests/server-sse.test.ts`
- Modify: `src/server_sse.ts`

- [ ] **Step 1: Write failing tests for `/sse` auth**

Add tests that start a server with `apiKeys: ["secret"]` and assert:

```ts
expect(await textResponse(`${baseUrl}/sse`)).toMatchObject({ status: 401, body: "Missing API key" });
expect(await textResponse(`${baseUrl}/sse`, { headers: { Authorization: "Bearer wrong" } })).toMatchObject({ status: 403, body: "Invalid API key" });
expect((await fetch(`${baseUrl}/sse`, { headers: { Authorization: "Bearer secret" } })).status).toBe(200);
```

Add helper functions:

```ts
async function textResponse(url: string, init?: RequestInit): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(url, init);
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: FAIL because `/sse` accepts unauthenticated requests.

- [ ] **Step 3: Implement auth guard**

In `src/server_sse.ts`, add a helper that accepts either:

```ts
Authorization: Bearer <key>
X-API-Key: <key>
```

When `apiKeys.length === 0`, allow the request. When enabled, protect both `GET /sse` and `POST /messages`.

- [ ] **Step 4: Run and verify GREEN**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: auth tests pass.

## Task 3: CORS, Sessions, And Rate Limits

**Files:**
- Modify: `tests/server-sse.test.ts`
- Modify: `src/server_sse.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

```ts
// OPTIONS preflight succeeds for an allowed origin.
expect(preflight.status).toBe(204);
expect(preflight.headers.get("access-control-allow-origin")).toBe("https://term2var.kro.kr");

// Disallowed Origin is rejected.
expect(disallowed.status).toBe(403);
expect(disallowed.body).toBe("Origin not allowed");

// Max sessions returns 503 when one stream is already open and maxSessions is 1.
expect(second.status).toBe(503);
expect(second.body).toBe("Too many active sessions");

// Rate limit returns 429.
expect(third.status).toBe(429);
expect(third.headers.get("retry-after")).toBe("1");
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: FAIL because CORS, max sessions, and rate limits are not implemented.

- [ ] **Step 3: Implement guards**

Add:

- CORS headers for allowed origins.
- `OPTIONS` handler for `/sse` and `/messages`.
- `sessions.size >= maxSessions` check before creating a new SSE session.
- Process-local `Map<string, { windowStart: number; count: number }>` rate limiter keyed by `X-Forwarded-For` or socket address.

- [ ] **Step 4: Run and verify GREEN**

Run:

```bash
npm test -- tests/server-sse.test.ts
```

Expected: all SSE security tests pass.

## Task 4: Docs And Deployment Variables

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`

- [ ] **Step 1: Update deployment docs**

Add these variables to `.env.example` and Docker Compose:

```dotenv
MCP_VARIABLE_API_KEYS=
MCP_VARIABLE_ALLOWED_ORIGINS=
MCP_VARIABLE_MAX_SESSIONS=100
MCP_VARIABLE_RATE_LIMIT_WINDOW_MS=60000
MCP_VARIABLE_RATE_LIMIT_MAX=120
```

Add README notes that `MCP_VARIABLE_API_KEYS` enables auth and clients must send `Authorization: Bearer <key>` or `X-API-Key`.

- [ ] **Step 2: Run full checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands pass.

## Self-Review

- Spec coverage: API key auth, CORS allowlist, session/rate limits, security headers, docs, and tests are covered.
- Placeholder scan: no task contains `TBD`, `TODO`, or deferred requirements.
- Type consistency: option names match the design spec and use the `MCP_VARIABLE_*` environment prefix already used by the SSE server.
