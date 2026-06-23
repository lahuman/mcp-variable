import { readFile } from "node:fs/promises";

import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";

import type { TermRow } from "./types.js";
import { normalizePhysicalName } from "./physical.js";

const REQUIRED_HEADERS = ["용어명", "물리명", "도메인유형", "도메인", "데이터타입"] as const;

const HEADER_TO_FIELD = new Map<string, keyof TermRow>([
  ["용어명", "termName"],
  ["물리명", "physicalName"],
  ["도메인유형", "domainType"],
  ["도메인", "domain"],
  ["데이터타입", "dataType"],
  ["코드명", "codeName"],
  ["정의", "definition"],
  ["요청업무", "requestTask"],
  ["최종요청자", "finalRequester"],
  ["최종수정일시", "finalModifiedAt"]
]);

export class CsvLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CsvLoadError";
  }
}

export async function loadCsvFile(filePath: string): Promise<TermRow[]> {
  const buffer = await readFile(filePath);
  const utf8 = buffer.toString("utf8");

  try {
    return parseCsvText(utf8);
  } catch (utf8Error) {
    const cp949 = iconv.decode(buffer, "cp949");
    try {
      return parseCsvText(cp949);
    } catch {
      throw new CsvLoadError(`Failed to parse CSV file: ${filePath}`, {
        cause: utf8Error
      });
    }
  }
}

function parseCsvText(text: string): TermRow[] {
  const records = parse(text.replace(/^\uFEFF/, ""), {
    bom: true,
    columns: (headers: string[]) => headers.map((header) => header.trim()),
    skip_empty_lines: true,
    trim: true
  }) as Array<Record<string, string | undefined>>;

  if (records.length === 0) {
    return [];
  }

  const headers = new Set(Object.keys(records[0] ?? {}).map((header) => header.trim()));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missingHeaders.length > 0) {
    throw new CsvLoadError(`Missing required CSV headers: ${missingHeaders.join(", ")}`);
  }

  return records.map((record, index) => normalizeRecord(record, index + 2));
}

function normalizeRecord(record: Record<string, string | undefined>, lineNumber: number): TermRow {
  const normalized: Partial<TermRow> = {};

  for (const [header, field] of HEADER_TO_FIELD.entries()) {
    const value = record[header]?.trim();
    if (value) {
      normalized[field] = value;
    }
  }

  for (const header of REQUIRED_HEADERS) {
    const field = HEADER_TO_FIELD.get(header);
    if (!field || !normalized[field]) {
      throw new CsvLoadError(`Missing required value "${header}" at CSV line ${lineNumber}`);
    }
  }

  return {
    termName: normalized.termName!,
    physicalName: normalizePhysicalName(normalized.physicalName!),
    domainType: normalized.domainType!,
    domain: normalized.domain!,
    dataType: normalized.dataType!,
    codeName: normalized.codeName,
    definition: normalized.definition,
    requestTask: normalized.requestTask,
    finalRequester: normalized.finalRequester,
    finalModifiedAt: normalized.finalModifiedAt
  };
}
