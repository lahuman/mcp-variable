#!/usr/bin/env node
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server as HttpServer,
  type ServerResponse
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
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
const INDEX_HTML_PATH = join(process.cwd(), "public", "index.html");

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

async function readIndexHtml(): Promise<string> {
  return readFile(INDEX_HTML_PATH, "utf8");
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
    try {
      sendHtml(res, 200, await readIndexHtml());
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      sendText(res, 500, "Index page unavailable");
    }
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
