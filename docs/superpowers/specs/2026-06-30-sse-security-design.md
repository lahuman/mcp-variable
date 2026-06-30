# SSE Security Design

## Goal

Add opt-in security controls to the SSE MCP server so public deployments can require an API key, limit abuse, and optionally allow browser clients without changing the stdio server or dictionary behavior.

## Scope

- Protect `GET /sse` and `POST /messages`.
- Keep `GET /health` public by default, but make its session count safe to expose.
- Preserve existing local development behavior when no security environment variables are configured.
- Document security environment variables in `README.md` and `.env.example`.

## Recommended Approach

Use an API key as the primary control, with rate/session limits as baseline abuse protection.

- API key auth is enabled when `MCP_VARIABLE_API_KEYS` is non-empty.
- Clients may send a key with `Authorization: Bearer <key>` or `X-API-Key: <key>`.
- Query-string keys are not supported because SSE endpoint URLs and proxy logs commonly expose query parameters.
- `/sse` and `/messages` must pass the same auth check.
- Failed auth returns `401` for missing credentials and `403` for invalid credentials.

## Abuse Protection

- `MCP_VARIABLE_MAX_SESSIONS` limits concurrent SSE sessions. Default: `100`.
- `MCP_VARIABLE_RATE_LIMIT_WINDOW_MS` and `MCP_VARIABLE_RATE_LIMIT_MAX` apply a simple in-memory per-client request limit to `/sse` and `/messages`. Defaults: `60000` and `120`.
- Client identity comes from `X-Forwarded-For` first, then the remote socket address.
- `Retry-After` is returned for rate-limited requests.
- The limits are intentionally process-local because this server is currently a simple single-node deployment.

## CORS And Browser Use

- CORS is disabled unless `MCP_VARIABLE_ALLOWED_ORIGINS` is configured.
- Allowed origins are comma-separated exact origins, for example `https://term2var.kro.kr,https://example.com`.
- When configured, requests with a non-allowed `Origin` are rejected with `403`.
- `OPTIONS` preflight for `/sse` and `/messages` returns the allowed methods and headers.

## Security Headers

All responses should include conservative headers:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store` for non-SSE responses
- `X-Accel-Buffering: no` on SSE responses to help reverse proxies stream promptly

## Configuration

Add these environment variables:

```dotenv
MCP_VARIABLE_API_KEYS=
MCP_VARIABLE_ALLOWED_ORIGINS=
MCP_VARIABLE_MAX_SESSIONS=100
MCP_VARIABLE_RATE_LIMIT_WINDOW_MS=60000
MCP_VARIABLE_RATE_LIMIT_MAX=120
```

CLI flags are not required for secrets. The server will read the security options from environment variables only.

## Testing

Add SSE server tests for:

- Existing unauthenticated local behavior still works.
- API-key-protected `/sse` rejects missing and invalid keys.
- API-key-protected `/sse` and `/messages` accept valid keys.
- Session limit rejects new sessions with `503`.
- Rate limit returns `429` with `Retry-After`.
- CORS preflight and disallowed origins behave as configured.

Run the full project checks after source changes:

```bash
npm test
npm run typecheck
npm run build
```
