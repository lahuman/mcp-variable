#!/usr/bin/env node
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server as HttpServer,
  type ServerResponse
} from "node:http";
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

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_SSE_PATH = "/sse";
const DEFAULT_MESSAGES_PATH = "/messages";

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

  return {
    csvPath: resolveCsvPath(args, env),
    host,
    port,
    ssePath,
    messagesPath
  };
}

function getRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "localhost";
  return new URL(req.url ?? "/", `http://${host}`);
}

function sendText(res: ServerResponse, statusCode: number, text: string): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

export function createSseRequestHandler(
  options: SseServerOptions,
  sessions = new Map<string, SseSession>()
): RequestListener {
  return (req, res) => {
    void handleSseRequest(req, res, options, sessions).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      sendText(res, 500, "Internal server error");
    });
  };
}

async function handleSseRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: SseServerOptions,
  sessions: Map<string, SseSession>
): Promise<void> {
  const requestUrl = getRequestUrl(req);
  const requestPath = requestUrl.pathname;

  if (req.method === "GET" && requestPath === options.ssePath) {
    await establishSseSession(res, options, sessions);
    return;
  }

  if (req.method === "POST" && requestPath === options.messagesPath) {
    await handlePostMessage(req, res, requestUrl, sessions);
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

  if (requestPath === options.ssePath || requestPath === options.messagesPath) {
    sendText(res, 405, "Method not allowed");
    return;
  }

  sendText(res, 404, "Not found");
}

async function establishSseSession(
  res: ServerResponse,
  options: SseServerOptions,
  sessions: Map<string, SseSession>
): Promise<void> {
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
  sessions: Map<string, SseSession>
): Promise<void> {
  const sessionId = requestUrl.searchParams.get("sessionId");
  if (!sessionId) {
    sendText(res, 400, "Missing sessionId parameter");
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    sendText(res, 404, "Session not found");
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
