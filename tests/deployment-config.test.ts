import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

describe("Docker Compose Chroma deployment", () => {
  test("runtime dependencies include Chroma client and default embedding package", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toHaveProperty("chromadb");
    expect(packageJson.dependencies).toHaveProperty("@chroma-core/default-embed");
  });

  test("runs Chroma alongside the SSE server and passes semantic configuration", async () => {
    const compose = await readFile(join(process.cwd(), "docker-compose.yml"), "utf8");

    expect(compose).toContain("chroma:");
    expect(compose).toContain("image: chromadb/chroma");
    expect(compose).toContain("mcp-variable-chroma");
    expect(compose).toContain("chroma-data:/data");
    expect(compose).toContain("grep -q ':1F40 .* 0A ' /proc/net/tcp /proc/net/tcp6");
    expect(compose).toContain("depends_on:");
    expect(compose).toContain("MCP_VARIABLE_CHROMA_HOST: chroma");
    expect(compose).toContain("MCP_VARIABLE_CHROMA_PORT: \"8000\"");
    expect(compose).toContain("MCP_VARIABLE_CHROMA_COLLECTION: \"${MCP_VARIABLE_CHROMA_COLLECTION:-mcp_variable_terms}\"");
    expect(compose).toContain("MCP_VARIABLE_CHROMA_SYNC_ON_START: \"${MCP_VARIABLE_CHROMA_SYNC_ON_START:-true}\"");
    expect(compose).toContain("MCP_VARIABLE_CHROMA_BATCH_SIZE: \"${MCP_VARIABLE_CHROMA_BATCH_SIZE:-32}\"");
    expect(compose).toContain("chroma-data:");
  });

  test("runtime image includes scripts needed for cache prebuild and Chroma sync", async () => {
    const dockerfile = await readFile(join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toContain("COPY --from=build --chown=node:node /app/scripts ./scripts");
    expect(dockerfile).toContain("CMD [\"node\", \"scripts/start-sse.js\"]");
  });

  test("SSE startup keeps running when Chroma sync is configured as non-blocking", async () => {
    const startScript = await readFile(join(process.cwd(), "scripts", "start-sse.js"), "utf8");

    expect(startScript).toContain("MCP_VARIABLE_CHROMA_SYNC_BLOCKING");
    expect(startScript).toContain("runNodeScript(\"scripts/sync-chroma.mjs\", [csvPath], { fatal: false })");
    expect(startScript).toContain("MCP_VARIABLE_CHROMA_BATCH_SIZE");
  });

  test("Chroma sync defaults to a small embedding batch for memory-constrained containers", async () => {
    const syncScript = await readFile(join(process.cwd(), "scripts", "sync-chroma.mjs"), "utf8");

    expect(syncScript).toContain("const DEFAULT_CHROMA_BATCH_SIZE = 32");
    expect(syncScript).toContain("event: \"chroma-sync-start\"");
    expect(syncScript).toContain("event: \"chroma-sync-progress\"");
  });

  test("example environment file exposes Chroma compose knobs", async () => {
    const envExample = await readFile(join(process.cwd(), ".env.example"), "utf8");

    expect(envExample).toContain("MCP_VARIABLE_CHROMA_PUBLISHED_PORT=8000");
    expect(envExample).toContain("MCP_VARIABLE_CHROMA_COLLECTION=mcp_variable_terms");
    expect(envExample).toContain("MCP_VARIABLE_CHROMA_SYNC_ON_START=true");
    expect(envExample).toContain("MCP_VARIABLE_CHROMA_SYNC_BLOCKING=false");
    expect(envExample).toContain("MCP_VARIABLE_CHROMA_BATCH_SIZE=32");
    expect(envExample).toContain("MCP_VARIABLE_CHROMA_STARTUP_TIMEOUT_MS=60000");
  });
});
