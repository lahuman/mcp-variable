import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, test } from "vitest";

import { createSseHttpServer, resolveSseServerOptions, type SseServerOptions } from "../src/server_sse.js";

const HEADER =
  "용어명,물리명,도메인유형,도메인,데이터타입,코드명,정의,요청업무,최종요청자,최종수정일시";

let activeServers: Array<ReturnType<typeof createSseHttpServer>> = [];

const DEFAULT_SECURITY_OPTIONS = {
  apiKeys: [],
  allowedOrigins: [],
  maxSessions: 100,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 120
};

function csv(rows: string[]): string {
  return ["\uFEFF" + HEADER, ...rows].join("\n");
}

async function writeTestCsv(name: string): Promise<string> {
  const csvPath = join(tmpdir(), `mcp-variable-${name}-${Date.now()}.csv`);
  await writeFile(
    csvPath,
    csv(["등록일자,REG_YMD,일자,일자V8,VARCHAR(8),,,EDA,System Manager,2023-12-01 15:34:44"]),
    "utf8"
  );
  return csvPath;
}

function createTestOptions(overrides: Partial<SseServerOptions> = {}): SseServerOptions {
  return {
    csvPath: join(process.cwd(), "data", "terms.csv"),
    host: "127.0.0.1",
    port: 0,
    ssePath: "/sse",
    messagesPath: "/messages",
    ...DEFAULT_SECURITY_OPTIONS,
    ...overrides
  };
}

function serverBaseUrl(server: ReturnType<typeof createSseHttpServer>): string {
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Expected HTTP server to listen on a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function textResponse(url: string, init?: RequestInit): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(url, init);
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    await response.body?.cancel();
    return { status: response.status, body: "", headers: response.headers };
  }
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

afterEach(async () => {
  await Promise.all(activeServers.map((server) => server.close()));
  activeServers = [];
});

describe("SSE server options", () => {
  test("uses default local SSE settings with the shared CSV resolver", () => {
    expect(resolveSseServerOptions([], {})).toEqual({
      csvPath: join(process.cwd(), "data", "terms.csv"),
      host: "127.0.0.1",
      port: 3000,
      ssePath: "/sse",
      messagesPath: "/messages",
      apiKeys: [],
      allowedOrigins: [],
      maxSessions: 100,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 120
    });
  });

  test("accepts CLI overrides for CSV, host, port, and endpoint paths", () => {
    expect(
      resolveSseServerOptions(
        [
          "--csv",
          "/tmp/terms.csv",
          "--host",
          "0.0.0.0",
          "--port",
          "4321",
          "--sse-path",
          "mcp",
          "--messages-path",
          "rpc"
        ],
        {}
      )
    ).toEqual({
      csvPath: "/tmp/terms.csv",
      host: "0.0.0.0",
      port: 4321,
      ssePath: "/mcp",
      messagesPath: "/rpc",
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

  test("rejects invalid port values", () => {
    expect(() => resolveSseServerOptions(["--port", "0"], {})).toThrow(/Invalid --port/);
    expect(() => resolveSseServerOptions(["--port", "65536"], {})).toThrow(/Invalid --port/);
    expect(() => resolveSseServerOptions(["--port", "abc"], {})).toThrow(/Invalid --port/);
  });

  test("rejects invalid security limit values", () => {
    expect(() => resolveSseServerOptions([], { MCP_VARIABLE_MAX_SESSIONS: "0" })).toThrow(
      /Invalid MCP_VARIABLE_MAX_SESSIONS/
    );
    expect(() => resolveSseServerOptions([], { MCP_VARIABLE_RATE_LIMIT_WINDOW_MS: "0" })).toThrow(
      /Invalid MCP_VARIABLE_RATE_LIMIT_WINDOW_MS/
    );
    expect(() => resolveSseServerOptions([], { MCP_VARIABLE_RATE_LIMIT_MAX: "0" })).toThrow(
      /Invalid MCP_VARIABLE_RATE_LIMIT_MAX/
    );
  });
});

describe("SSE MCP server", () => {
  test("serves a public index guide without exposing configured API keys", async () => {
    const server = createSseHttpServer(
      createTestOptions({
        csvPath: await writeTestCsv("index"),
        apiKeys: ["variable-mcp-with-dataportal"]
      })
    );
    activeServers.push(server);

    await server.listen();
    const baseUrl = serverBaseUrl(server);

    const index = await textResponse(`${baseUrl}/index.html`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(index.body).toContain("mcp-variable");
    expect(index.body).toContain("/health");
    expect(index.body).toContain("/sse");
    expect(index.body).toContain("/messages");
    expect(index.body).toContain("Authorization: Bearer &lt;api-key&gt;");
    expect(index.body).toContain("X-API-Key: &lt;api-key&gt;");
    expect(index.body).not.toContain("variable-mcp-with-dataportal");

    const root = await textResponse(`${baseUrl}/`);
    expect(root.status).toBe(200);
    expect(root.body).toContain("mcp-variable");
    expect(root.body).not.toContain("variable-mcp-with-dataportal");

    const escaped = await textResponse(`${baseUrl}/index.html`, {
      headers: {
        "X-Forwarded-Proto": 'https"><script>alert(1)</script>'
      }
    });
    expect(escaped.status).toBe(200);
    expect(escaped.body).not.toContain("<script>alert(1)</script>");
  });

  test("serves the registered MCP tools over HTTP plus SSE", async () => {
    const csvPath = await writeTestCsv("sse");

    const server = createSseHttpServer(createTestOptions({ csvPath }));
    activeServers.push(server);

    await server.listen();

    const client = new Client({ name: "mcp-variable-sse-test", version: "0.0.0" });
    const transport = new SSEClientTransport(new URL(`${serverBaseUrl(server)}/sse`));

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(["convert_terms", "search_terms"]);

      const result = await client.callTool({
        name: "convert_terms",
        arguments: {
          text: "등록일자",
          direction: "term_to_physical"
        }
      });

      expect(result.structuredContent).toMatchObject({
        convertedText: "REG_YMD",
        confidence: "exact"
      });
    } finally {
      await client.close();
    }
  });

  test("requires a valid API key for SSE sessions when API keys are configured", async () => {
    const server = createSseHttpServer(
      createTestOptions({
        csvPath: await writeTestCsv("auth"),
        apiKeys: ["secret"]
      })
    );
    activeServers.push(server);

    await server.listen();
    const baseUrl = serverBaseUrl(server);

    await expect(textResponse(`${baseUrl}/sse`)).resolves.toMatchObject({
      status: 401,
      body: "Missing API key"
    });
    await expect(
      textResponse(`${baseUrl}/sse`, {
        headers: {
          Authorization: "Bearer wrong"
        }
      })
    ).resolves.toMatchObject({
      status: 403,
      body: "Invalid API key"
    });
    await expect(
      textResponse(`${baseUrl}/messages?sessionId=missing`, {
        method: "POST",
        headers: {
          "X-API-Key": "wrong"
        }
      })
    ).resolves.toMatchObject({
      status: 403,
      body: "Invalid API key"
    });
    await expect(
      textResponse(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "X-API-Key": "secret"
        }
      })
    ).resolves.toMatchObject({
      status: 400,
      body: "Missing sessionId parameter"
    });

    const response = await fetch(`${baseUrl}/sse`, {
      headers: {
        Authorization: "Bearer secret"
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
  });

  test("handles configured CORS preflight and rejects disallowed origins", async () => {
    const server = createSseHttpServer(
      createTestOptions({
        csvPath: await writeTestCsv("cors"),
        allowedOrigins: ["https://term2var.kro.kr"]
      })
    );
    activeServers.push(server);

    await server.listen();
    const baseUrl = serverBaseUrl(server);

    const preflight = await fetch(`${baseUrl}/messages`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://term2var.kro.kr",
        "Access-Control-Request-Method": "POST"
      }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://term2var.kro.kr");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("X-API-Key");

    const allowedPost = await textResponse(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        Origin: "https://term2var.kro.kr"
      }
    });
    expect(allowedPost.status).toBe(400);
    expect(allowedPost.headers.get("access-control-allow-origin")).toBe("https://term2var.kro.kr");

    await expect(
      textResponse(`${baseUrl}/sse`, {
        headers: {
          Origin: "https://example.com"
        }
      })
    ).resolves.toMatchObject({
      status: 403,
      body: "Origin not allowed"
    });
  });

  test("rejects new SSE sessions after the maximum active session count", async () => {
    const server = createSseHttpServer(
      createTestOptions({
        csvPath: await writeTestCsv("sessions"),
        maxSessions: 1
      })
    );
    activeServers.push(server);

    await server.listen();
    const baseUrl = serverBaseUrl(server);

    const first = await fetch(`${baseUrl}/sse`);
    expect(first.status).toBe(200);

    await expect(textResponse(`${baseUrl}/sse`)).resolves.toMatchObject({
      status: 503,
      body: "Too many active sessions"
    });

    await first.body?.cancel();
  });

  test("rate limits repeated SSE and message requests per client", async () => {
    const server = createSseHttpServer(
      createTestOptions({
        csvPath: await writeTestCsv("rate-limit"),
        rateLimitWindowMs: 1000,
        rateLimitMax: 2
      })
    );
    activeServers.push(server);

    await server.listen();
    const baseUrl = serverBaseUrl(server);
    const init = {
      method: "POST",
      headers: {
        "X-Forwarded-For": "203.0.113.10"
      }
    };

    expect((await textResponse(`${baseUrl}/messages?sessionId=missing`, init)).status).toBe(404);
    expect((await textResponse(`${baseUrl}/messages?sessionId=missing`, init)).status).toBe(404);

    const limited = await textResponse(`${baseUrl}/messages?sessionId=missing`, init);
    expect(limited.status).toBe(429);
    expect(limited.body).toBe("Too many requests");
    expect(limited.headers.get("retry-after")).toBe("1");
  });
});
