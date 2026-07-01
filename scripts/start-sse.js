#!/usr/bin/env node
import { spawn } from "node:child_process";

const csvPath = process.env.MCP_VARIABLE_CSV ?? "/app/data/terms.csv";

await runNodeScript("scripts/prebuild-cache.mjs", [csvPath]);

if (shouldSyncChroma()) {
  await waitForChroma();
  if (process.env.MCP_VARIABLE_CHROMA_SYNC_BLOCKING === "true") {
    await runNodeScript("scripts/sync-chroma.mjs", [csvPath], { fatal: true });
  } else {
    void runNodeScript("scripts/sync-chroma.mjs", [csvPath], { fatal: false });
  }
}

const server = spawn(process.execPath, ["dist/server_sse.js"], {
  stdio: "inherit",
  env: process.env
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function shouldSyncChroma() {
  return (
    process.env.MCP_VARIABLE_CHROMA_SYNC_ON_START !== "false" &&
    Boolean(process.env.MCP_VARIABLE_CHROMA_HOST || process.env.MCP_VARIABLE_CHROMA_COLLECTION)
  );
}

async function waitForChroma() {
  const timeoutMs = readPositiveInteger(process.env.MCP_VARIABLE_CHROMA_STARTUP_TIMEOUT_MS, 60_000);
  const intervalMs = readPositiveInteger(process.env.MCP_VARIABLE_CHROMA_STARTUP_INTERVAL_MS, 1_000);
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const { ChromaClient } = await import("chromadb");
      const client = new ChromaClient({
        host: process.env.MCP_VARIABLE_CHROMA_HOST ?? "localhost",
        port: process.env.MCP_VARIABLE_CHROMA_PORT
          ? Number(process.env.MCP_VARIABLE_CHROMA_PORT)
          : 8000,
        ssl: process.env.MCP_VARIABLE_CHROMA_SSL === "true",
        database: process.env.MCP_VARIABLE_CHROMA_DATABASE
      });
      await client.heartbeat();
      return;
    } catch (error) {
      lastError = error;
      await delay(intervalMs);
    }
  }

  throw new Error(
    `Timed out waiting for Chroma after ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function runNodeScript(script, args, options = { fatal: true }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(formatScriptExit(script, code, signal));
      if (options.fatal) {
        reject(error);
        return;
      }
      console.error(error.message);
      resolve();
    });
  });
}

function formatScriptExit(script, code, signal) {
  let message = `${script} exited with ${signal ?? code}`;
  if (script === "scripts/sync-chroma.mjs" && signal === "SIGKILL") {
    message +=
      "; Chroma sync was likely killed by the container memory limit. Lower MCP_VARIABLE_CHROMA_BATCH_SIZE or set MCP_VARIABLE_CHROMA_SYNC_ON_START=false.";
  }
  return message;
}

function readPositiveInteger(value, fallback) {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
