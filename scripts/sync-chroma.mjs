#!/usr/bin/env node
import { resolve } from "node:path";

const csvPath = process.argv[2] ? resolve(process.argv[2]) : resolve("data/terms.csv");
const collectionName = process.env.MCP_VARIABLE_CHROMA_COLLECTION ?? "mcp_variable_terms";
const host = process.env.MCP_VARIABLE_CHROMA_HOST ?? "localhost";
const port = process.env.MCP_VARIABLE_CHROMA_PORT ? Number(process.env.MCP_VARIABLE_CHROMA_PORT) : 8000;
const ssl = process.env.MCP_VARIABLE_CHROMA_SSL === "true";
const batchSize = process.env.MCP_VARIABLE_CHROMA_BATCH_SIZE
  ? Number(process.env.MCP_VARIABLE_CHROMA_BATCH_SIZE)
  : 500;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid MCP_VARIABLE_CHROMA_PORT: ${process.env.MCP_VARIABLE_CHROMA_PORT}`);
}
if (!Number.isInteger(batchSize) || batchSize < 1) {
  throw new Error(`Invalid MCP_VARIABLE_CHROMA_BATCH_SIZE: ${process.env.MCP_VARIABLE_CHROMA_BATCH_SIZE}`);
}

const [{ ChromaClient }, { loadCsvFile }, { buildDictionary }] = await Promise.all([
  import("chromadb"),
  import("../dist/csvLoader.js"),
  import("../dist/dictionary.js")
]);

const rows = await loadCsvFile(csvPath);
const dictionary = buildDictionary(rows);
const documents = buildSemanticDocuments(dictionary);
const client = new ChromaClient({
  host,
  port,
  ssl,
  database: process.env.MCP_VARIABLE_CHROMA_DATABASE
});
const collection = await getOrCreateCollection(client, collectionName);

for (let index = 0; index < documents.length; index += batchSize) {
  const batch = documents.slice(index, index + batchSize);
  await collection.upsert({
    ids: batch.map((item) => item.id),
    documents: batch.map((item) => item.document),
    metadatas: batch.map((item) => item.metadata)
  });
}

console.log(
  JSON.stringify(
    {
      csvPath,
      collectionName,
      rows: rows.length,
      documents: documents.length,
      host,
      port,
      ssl
    },
    null,
    2
  )
);

async function getOrCreateCollection(client, name) {
  try {
    return await client.getCollection({ name });
  } catch {
    return client.createCollection({ name });
  }
}

function buildSemanticDocuments(dictionary) {
  const documents = [];
  const seen = new Set();

  for (const entry of dictionary.attributeByTerm.values()) {
    appendDocument(documents, seen, {
      id: `term:${entry.term}`,
      document: [
        entry.term,
        entry.physical,
        entry.row.domainType,
        entry.row.domain,
        entry.row.dataType,
        entry.row.codeName,
        entry.row.definition,
        entry.row.requestTask
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: buildMetadata("term", entry.term, entry.physical, entry.row)
    });

    for (const component of entry.components) {
      appendDocument(documents, seen, {
        id: `${component.role}:${component.term}:${component.physical}`,
        document: [component.term, component.physical, component.role, entry.row.definition, entry.row.requestTask]
          .filter(Boolean)
          .join("\n"),
        metadata: buildMetadata(component.role, component.term, component.physical, entry.row)
      });
    }
  }

  return documents;
}

function appendDocument(documents, seen, document) {
  if (seen.has(document.id)) {
    return;
  }
  seen.add(document.id);
  documents.push(document);
}

function buildMetadata(target, termName, physicalName, row) {
  return stripUndefined({
    target,
    termName,
    physicalName,
    domainType: row.domainType,
    domain: row.domain,
    dataType: row.dataType,
    codeName: row.codeName,
    definition: row.definition,
    requestTask: row.requestTask,
    finalRequester: row.finalRequester,
    finalModifiedAt: row.finalModifiedAt
  });
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
