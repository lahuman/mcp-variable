#!/usr/bin/env node
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server as HttpServer,
  type ServerResponse
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { createMcpServer, resolveCsvPath } from "./server.js";

type Env = Record<string, string | undefined>;

export type SseServerOptions = {
  csvPath: string;
  host: string;
  port: number;
  ssePath: string;
  messagesPath: string;
  apiKeys: string[];
  allowedOrigins: string[];
  maxSessions: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
};

export type SseHttpServer = {
  options: SseServerOptions;
  server: HttpServer;
  listen: () => Promise<void>;
  close: () => Promise<void>;
  address: () => AddressInfo | string | null;
};

type SseSession = {
  transport: SSEServerTransport;
  mcpServer: McpServer;
};

type RateLimitEntry = {
  windowStart: number;
  count: number;
};

type RequestRejection = {
  statusCode: number;
  message: string;
  headers?: Record<string, string>;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_SSE_PATH = "/sse";
const DEFAULT_MESSAGES_PATH = "/messages";
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 120;
const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
const CORS_ALLOWED_HEADERS = "Authorization, X-API-Key, Content-Type, MCP-Protocol-Version";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value after ${flag}`);
  }
  return value;
}

function parsePort(value: string, source: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid ${source}: ${value}. Expected an integer between 1 and 65535.`);
  }
  return port;
}

function parsePositiveInteger(value: string, source: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid ${source}: ${value}. Expected a positive integer.`);
  }
  return number;
}

function parseCommaSeparatedList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  );
}

function normalizeEndpointPath(path: string, source: string): string {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    throw new Error(`Invalid ${source}: endpoint path cannot be empty`);
  }
  if (trimmedPath.includes("?") || trimmedPath.includes("#")) {
    throw new Error(`Invalid ${source}: endpoint path must not include query or fragment`);
  }
  return trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
}

export function resolveSseServerOptions(
  args = process.argv.slice(2),
  env: Env = process.env
): SseServerOptions {
  const host = readFlag(args, "--host") ?? env.MCP_VARIABLE_HOST ?? DEFAULT_HOST;
  const portFlag = readFlag(args, "--port");
  const port = parsePort(portFlag ?? env.MCP_VARIABLE_PORT ?? String(DEFAULT_PORT), portFlag ? "--port" : "MCP_VARIABLE_PORT");
  const ssePath = normalizeEndpointPath(
    readFlag(args, "--sse-path") ?? env.MCP_VARIABLE_SSE_PATH ?? DEFAULT_SSE_PATH,
    "--sse-path"
  );
  const messagesPath = normalizeEndpointPath(
    readFlag(args, "--messages-path") ?? env.MCP_VARIABLE_MESSAGES_PATH ?? DEFAULT_MESSAGES_PATH,
    "--messages-path"
  );
  const maxSessions = parsePositiveInteger(
    env.MCP_VARIABLE_MAX_SESSIONS ?? String(DEFAULT_MAX_SESSIONS),
    "MCP_VARIABLE_MAX_SESSIONS"
  );
  const rateLimitWindowMs = parsePositiveInteger(
    env.MCP_VARIABLE_RATE_LIMIT_WINDOW_MS ?? String(DEFAULT_RATE_LIMIT_WINDOW_MS),
    "MCP_VARIABLE_RATE_LIMIT_WINDOW_MS"
  );
  const rateLimitMax = parsePositiveInteger(
    env.MCP_VARIABLE_RATE_LIMIT_MAX ?? String(DEFAULT_RATE_LIMIT_MAX),
    "MCP_VARIABLE_RATE_LIMIT_MAX"
  );

  return {
    csvPath: resolveCsvPath(args, env),
    host,
    port,
    ssePath,
    messagesPath,
    apiKeys: parseCommaSeparatedList(env.MCP_VARIABLE_API_KEYS),
    allowedOrigins: parseCommaSeparatedList(env.MCP_VARIABLE_ALLOWED_ORIGINS),
    maxSessions,
    rateLimitWindowMs,
    rateLimitMax
  };
}

function getRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "localhost";
  return new URL(req.url ?? "/", `http://${host}`);
}

function sendText(
  res: ServerResponse,
  statusCode: number,
  text: string,
  headers: Record<string, string> = {}
): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    ...headers
  });
  res.end(text);
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(html);
}

function sendNoContent(res: ServerResponse, headers: Record<string, string> = {}): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(204, {
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    ...headers
  });
  res.end();
}

function getHeaderValue(req: IncomingMessage, headerName: string): string | undefined {
  const headerValue = req.headers[headerName.toLowerCase()];
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return headerValue;
}

function getRequestApiKey(req: IncomingMessage): string | undefined {
  const authorization = getHeaderValue(req, "authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  const apiKey = getHeaderValue(req, "x-api-key")?.trim();
  return apiKey || undefined;
}

function safeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function rejectInvalidApiKey(req: IncomingMessage, options: SseServerOptions): RequestRejection | undefined {
  if (options.apiKeys.length === 0) {
    return undefined;
  }

  const requestApiKey = getRequestApiKey(req);
  if (!requestApiKey) {
    return {
      statusCode: 401,
      message: "Missing API key"
    };
  }

  if (!options.apiKeys.some((apiKey) => safeStringEquals(requestApiKey, apiKey))) {
    return {
      statusCode: 403,
      message: "Invalid API key"
    };
  }

  return undefined;
}

function getCorsHeaders(req: IncomingMessage, options: SseServerOptions): Record<string, string> {
  const origin = getHeaderValue(req, "origin");
  if (!origin || !options.allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    Vary: "Origin"
  };
}

function rejectInvalidOrigin(req: IncomingMessage, options: SseServerOptions): RequestRejection | undefined {
  const origin = getHeaderValue(req, "origin");
  if (!origin || options.allowedOrigins.length === 0 || options.allowedOrigins.includes(origin)) {
    return undefined;
  }

  return {
    statusCode: 403,
    message: "Origin not allowed"
  };
}

function getClientId(req: IncomingMessage): string {
  const forwardedFor = getHeaderValue(req, "x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwardedFor || req.socket.remoteAddress || "unknown";
}

function rejectRateLimitedRequest(
  req: IncomingMessage,
  options: SseServerOptions,
  rateLimits: Map<string, RateLimitEntry>,
  now = Date.now()
): RequestRejection | undefined {
  const clientId = getClientId(req);
  const entry = rateLimits.get(clientId);

  if (!entry || now - entry.windowStart >= options.rateLimitWindowMs) {
    rateLimits.set(clientId, {
      windowStart: now,
      count: 1
    });
    return undefined;
  }

  entry.count += 1;
  if (entry.count <= options.rateLimitMax) {
    return undefined;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((options.rateLimitWindowMs - (now - entry.windowStart)) / 1000));
  return {
    statusCode: 429,
    message: "Too many requests",
    headers: {
      "Retry-After": String(retryAfterSeconds)
    }
  };
}

function getPublicOrigin(req: IncomingMessage): string {
  const forwardedProto = getHeaderValue(req, "x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "http";
  const host = req.headers.host ?? "127.0.0.1";
  return `${protocol}://${host}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function createIndexHtml(req: IncomingMessage, options: SseServerOptions): string {
  const origin = getPublicOrigin(req);
  const sseUrl = `${origin}${options.ssePath}`;
  const displayOrigin = escapeHtml(origin);
  const displaySseUrl = escapeHtml(sseUrl);
  const displaySsePath = escapeHtml(options.ssePath);
  const displayMessagesPath = escapeHtml(options.messagesPath);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mcp-variable SSE Guide</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #596579;
      --line: #d9dee8;
      --accent: #0f766e;
      --code: #111827;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
    }
    main {
      width: min(960px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0 56px;
    }
    header {
      border-bottom: 1px solid var(--line);
      padding-bottom: 24px;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 36px;
      line-height: 1.15;
      letter-spacing: 0;
    }
    h2 {
      margin: 32px 0 12px;
      font-size: 22px;
      letter-spacing: 0;
    }
    p { margin: 0 0 12px; }
    ul { padding-left: 22px; }
    li { margin: 7px 0; }
    code {
      border: 1px solid var(--line);
      border-radius: 4px;
      background: #eef2f7;
      padding: 1px 5px;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.95em;
    }
    pre {
      margin: 12px 0;
      overflow-x: auto;
      border-radius: 6px;
      background: var(--code);
      color: #f9fafb;
      padding: 16px;
      font-size: 14px;
      line-height: 1.45;
    }
    pre code {
      border: 0;
      background: transparent;
      color: inherit;
      padding: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin: 16px 0 8px;
    }
    .endpoint {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
      padding: 14px;
    }
    .endpoint strong {
      display: block;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .note {
      border-left: 4px solid var(--accent);
      background: #eefbf8;
      padding: 12px 14px;
      margin: 16px 0;
    }
    @media (max-width: 560px) {
      main { width: min(100% - 24px, 960px); padding-top: 28px; }
      h1 { font-size: 30px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>mcp-variable</h1>
      <p>공공데이터 공통표준용어 사전을 기반으로 한국어 업무 용어와 물리명, 코드 변수명을 변환하는 로컬/HTTP SSE MCP 서버입니다.</p>
    </header>

    <section>
      <h2>엔드포인트</h2>
      <div class="grid">
        <div class="endpoint"><strong>GET /index.html</strong><span>프로젝트 설명과 연결 가이드</span></div>
        <div class="endpoint"><strong>GET /health</strong><span>서버 상태 확인</span></div>
        <div class="endpoint"><strong>GET ${displaySsePath}</strong><span>MCP SSE 수신 스트림</span></div>
        <div class="endpoint"><strong>POST ${displayMessagesPath}</strong><span>MCP JSON-RPC 메시지 전송</span></div>
      </div>
    </section>

    <section>
      <h2>MCP 클라이언트 설정</h2>
      <p>URL 기반 SSE MCP 연결을 지원하는 클라이언트에서는 다음처럼 등록합니다.</p>
      <pre><code>{
  "mcpServers": {
    "mcp-variable-sse": {
      "type": "sse",
      "url": "${displaySseUrl}",
      "headers": {
        "Authorization": "Bearer &lt;api-key&gt;"
      }
    }
  }
}</code></pre>
    </section>

    <section>
      <h2>API 키 사용</h2>
      <p>API 키가 설정된 서버에서는 아래 헤더 중 하나를 보내야 합니다.</p>
      <pre><code>Authorization: Bearer &lt;api-key&gt;
X-API-Key: &lt;api-key&gt;</code></pre>
      <div class="note">실제 키는 서버의 <code>MCP_VARIABLE_API_KEYS</code> 환경변수로만 설정하고, 공개 페이지나 URL query string에 노출하지 마세요.</div>
    </section>

    <section>
      <h2>제공 도구</h2>
      <ul>
        <li><code>convert_terms</code>: 한국어 업무 용어를 물리명/변수명으로, 또는 물리명을 한국어 용어로 변환합니다.</li>
        <li><code>search_terms</code>: CSV 사전에 등록된 용어 행을 검색합니다.</li>
      </ul>
      <pre><code>입력: 등록일자
출력: regYmd
confidence: exact</code></pre>
    </section>

    <section>
      <h2>직접 점검</h2>
      <pre><code>curl ${displayOrigin}/health
curl -N -H "Authorization: Bearer &lt;api-key&gt;" ${displaySseUrl}</code></pre>
    </section>
  </main>
</body>
</html>`;
}

export function createSseRequestHandler(
  options: SseServerOptions,
  sessions = new Map<string, SseSession>(),
  rateLimits = new Map<string, RateLimitEntry>()
): RequestListener {
  return (req, res) => {
    void handleSseRequest(req, res, options, sessions, rateLimits).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      sendText(res, 500, "Internal server error");
    });
  };
}

async function handleSseRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: SseServerOptions,
  sessions: Map<string, SseSession>,
  rateLimits: Map<string, RateLimitEntry>
): Promise<void> {
  const requestUrl = getRequestUrl(req);
  const requestPath = requestUrl.pathname;
  const isSsePath = requestPath === options.ssePath;
  const isMessagesPath = requestPath === options.messagesPath;
  const isMcpTransportPath = isSsePath || isMessagesPath;
  const corsHeaders = getCorsHeaders(req, options);

  if (req.method === "GET" && (requestPath === "/" || requestPath === "/index.html")) {
    sendHtml(res, 200, createIndexHtml(req, options));
    return;
  }

  if (req.method === "OPTIONS" && isMcpTransportPath && options.allowedOrigins.length > 0) {
    const rejection = rejectInvalidOrigin(req, options);
    if (rejection) {
      sendText(res, rejection.statusCode, rejection.message);
      return;
    }

    sendNoContent(res, corsHeaders);
    return;
  }

  if (req.method === "GET" && isSsePath) {
    const rejection =
      rejectInvalidOrigin(req, options) ??
      rejectRateLimitedRequest(req, options, rateLimits) ??
      rejectInvalidApiKey(req, options);
    if (rejection) {
      sendText(res, rejection.statusCode, rejection.message, { ...corsHeaders, ...rejection.headers });
      return;
    }

    if (sessions.size >= options.maxSessions) {
      sendText(res, 503, "Too many active sessions", corsHeaders);
      return;
    }

    await establishSseSession(res, options, sessions, corsHeaders);
    return;
  }

  if (req.method === "POST" && isMessagesPath) {
    const rejection =
      rejectInvalidOrigin(req, options) ??
      rejectRateLimitedRequest(req, options, rateLimits) ??
      rejectInvalidApiKey(req, options);
    if (rejection) {
      sendText(res, rejection.statusCode, rejection.message, { ...corsHeaders, ...rejection.headers });
      return;
    }

    await handlePostMessage(req, res, requestUrl, sessions, corsHeaders);
    return;
  }

  if (req.method === "GET" && requestPath === "/health") {
    sendJson(res, 200, {
      status: "ok",
      name: "mcp-variable",
      transport: "sse",
      sessions: sessions.size
    });
    return;
  }

  if (isMcpTransportPath) {
    sendText(res, 405, "Method not allowed");
    return;
  }

  sendText(res, 404, "Not found");
}

async function establishSseSession(
  res: ServerResponse,
  options: SseServerOptions,
  sessions: Map<string, SseSession>,
  corsHeaders: Record<string, string>
): Promise<void> {
  for (const [headerName, headerValue] of Object.entries({
    ...SECURITY_HEADERS,
    ...corsHeaders,
    "X-Accel-Buffering": "no"
  })) {
    res.setHeader(headerName, headerValue);
  }

  const transport = new SSEServerTransport(options.messagesPath, res);
  const mcpServer = createMcpServer(options.csvPath);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, {
    transport,
    mcpServer
  });

  transport.onclose = () => {
    sessions.delete(sessionId);
  };
  transport.onerror = (error) => {
    console.error(`SSE transport error for session ${sessionId}: ${error.message}`);
  };

  try {
    await mcpServer.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    if (!res.headersSent) {
      sendText(res, 500, "Error establishing SSE stream");
    }
    throw error;
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL,
  sessions: Map<string, SseSession>,
  corsHeaders: Record<string, string>
): Promise<void> {
  for (const [headerName, headerValue] of Object.entries({
    ...SECURITY_HEADERS,
    "Cache-Control": "no-store",
    ...corsHeaders
  })) {
    res.setHeader(headerName, headerValue);
  }

  const sessionId = requestUrl.searchParams.get("sessionId");
  if (!sessionId) {
    sendText(res, 400, "Missing sessionId parameter", corsHeaders);
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    sendText(res, 404, "Session not found", corsHeaders);
    return;
  }

  await session.transport.handlePostMessage(req, res);
}

export function createSseHttpServer(options: SseServerOptions): SseHttpServer {
  const sessions = new Map<string, SseSession>();
  const server = createServer(createSseRequestHandler(options, sessions));

  return {
    options,
    server,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        if (server.listening) {
          resolve();
          return;
        }

        const handleError = (error: Error) => {
          server.off("listening", handleListening);
          reject(error);
        };
        const handleListening = () => {
          server.off("error", handleError);
          resolve();
        };

        server.once("error", handleError);
        server.once("listening", handleListening);
        server.listen(options.port, options.host);
      }),
    close: async () => {
      await Promise.all(
        Array.from(sessions.values(), async (session) => {
          try {
            await session.mcpServer.close();
          } catch (error) {
            console.error(error instanceof Error ? error.message : error);
          }
        })
      );
      sessions.clear();

      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }

        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    address: () => server.address()
  };
}

function formatAddress(options: SseServerOptions, address: AddressInfo | string | null): string {
  if (typeof address === "object" && address !== null) {
    return `http://${options.host}:${address.port}${options.ssePath}`;
  }
  return `http://${options.host}:${options.port}${options.ssePath}`;
}

async function main(): Promise<void> {
  const options = resolveSseServerOptions();
  const server = createSseHttpServer(options);
  await server.listen();

  console.log(`mcp-variable SSE server listening at ${formatAddress(options, server.address())}`);
  console.log(`MCP messages endpoint: ${options.messagesPath}`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
