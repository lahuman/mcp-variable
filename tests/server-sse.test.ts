import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, describe, expect, test } from "vitest";

import { createSseHttpServer, resolveSseServerOptions } from "../src/server_sse.js";

const HEADER =
  "용어명,물리명,도메인유형,도메인,데이터타입,코드명,정의,요청업무,최종요청자,최종수정일시";

let activeServers: Array<ReturnType<typeof createSseHttpServer>> = [];

function csv(rows: string[]): string {
  return ["\uFEFF" + HEADER, ...rows].join("\n");
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
      messagesPath: "/messages"
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
      messagesPath: "/rpc"
    });
  });

  test("rejects invalid port values", () => {
    expect(() => resolveSseServerOptions(["--port", "0"], {})).toThrow(/Invalid --port/);
    expect(() => resolveSseServerOptions(["--port", "65536"], {})).toThrow(/Invalid --port/);
    expect(() => resolveSseServerOptions(["--port", "abc"], {})).toThrow(/Invalid --port/);
  });
});

describe("SSE MCP server", () => {
  test("serves the registered MCP tools over HTTP plus SSE", async () => {
    const csvPath = join(tmpdir(), `mcp-variable-sse-${Date.now()}.csv`);
    await writeFile(
      csvPath,
      csv(["등록일자,REG_YMD,일자,일자V8,VARCHAR(8),,,EDA,System Manager,2023-12-01 15:34:44"]),
      "utf8"
    );

    const server = createSseHttpServer({
      csvPath,
      host: "127.0.0.1",
      port: 0,
      ssePath: "/sse",
      messagesPath: "/messages"
    });
    activeServers.push(server);

    await server.listen();
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Expected HTTP server to listen on a TCP address");
    }

    const client = new Client({ name: "mcp-variable-sse-test", version: "0.0.0" });
    const transport = new SSEClientTransport(new URL(`http://127.0.0.1:${address.port}/sse`));

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
});
