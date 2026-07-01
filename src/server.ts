#!/usr/bin/env node
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  convertTermsInputSchema,
  convertTermsOutputSchema,
  createConvertTermsHandler,
  createSearchTermsHandler,
  createSuggestTermsHandler,
  searchTermsInputSchema,
  searchTermsOutputSchema,
  suggestTermsInputSchema,
  suggestTermsOutputSchema
} from "./mcpTool.js";
import { TermDictionaryService } from "./service.js";

export function resolveCsvPath(args = process.argv.slice(2), env = process.env): string {
  const csvFlagIndex = args.indexOf("--csv");
  if (csvFlagIndex >= 0) {
    const csvPath = args[csvFlagIndex + 1];
    if (!csvPath) {
      throw new Error("Missing CSV path after --csv");
    }
    return csvPath;
  }

  return env.MCP_VARIABLE_CSV ?? join(process.cwd(), "data", "terms.csv");
}

export function createMcpServer(csvPath: string): McpServer {
  const server = new McpServer({
    name: "mcp-variable",
    version: "0.1.0"
  });
  const service = new TermDictionaryService(csvPath);
  const convertHandler = createConvertTermsHandler(service);
  const searchHandler = createSearchTermsHandler(service);
  const suggestHandler = createSuggestTermsHandler(service);

  server.registerTool(
    "convert_terms",
    {
      title: "Convert Korean Terms and Physical Names",
      description:
        "Convert Korean business terms to physical names, or physical snake/camel names back to Korean terms, using a CSV dictionary.",
      inputSchema: convertTermsInputSchema,
      outputSchema: convertTermsOutputSchema
    },
    async (input) => convertHandler(input)
  );

  server.registerTool(
    "search_terms",
    {
      title: "Search Registered Dictionary Terms",
      description:
        "Search registered CSV dictionary rows by keyword across Korean terms, physical names, domains, definitions, and request tasks.",
      inputSchema: searchTermsInputSchema,
      outputSchema: searchTermsOutputSchema
    },
    async (input) => searchHandler(input)
  );

  server.registerTool(
    "suggest_terms",
    {
      title: "Suggest Similar Terms",
      description:
        "Suggest similar registered terms, words, or domains using optional Chroma vector search. Deterministic conversion results are not changed by these suggestions.",
      inputSchema: suggestTermsInputSchema,
      outputSchema: suggestTermsOutputSchema
    },
    async (input) => suggestHandler(input)
  );

  return server;
}

async function main(): Promise<void> {
  const server = createMcpServer(resolveCsvPath());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
