import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { parse } from "csv-parse/sync";

type SourceRow = Record<string, string | undefined>;

const HEADERS = [
  "용어명",
  "물리명",
  "도메인유형",
  "도메인",
  "데이터타입",
  "코드명",
  "정의",
  "요청업무",
  "최종요청자",
  "최종수정일시"
] as const;

const SOURCE_COLUMNS = {
  termName: "공통표준용어명",
  definition: "공통표준용어설명",
  physicalName: "공통표준용어영문약어명",
  domain: "공통표준도메인명",
  allowedValues: "허용값",
  storageFormat: "저장 형식",
  displayFormat: "표현 형식",
  codeName: "행정표준코드명",
  owner: "소관기관명",
  synonyms: "용어 이음동의어 목록",
  edition: "제정차수",
  revisionType: "개정구분명(폐기 또는 변경)",
  revisionItem: "개정항목",
  revisionReason: "개정사유"
} as const;

interface ConversionSummary {
  source: string;
  destination: string;
  inputRows: number;
  outputRows: number;
  excludedDeprecatedRows: number;
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function parseDomain(domain: string, storageFormat: string): { domainType: string; dataType: string } {
  const match = domain.match(/^(.+?)([VCND])(\d+)?(?:,(\d+))?$/);
  if (!match) {
    return {
      domainType: domain,
      dataType: storageFormat
    };
  }

  const [, domainType, typeCode, precision, scale] = match;
  if (typeCode === "V") {
    return { domainType: domainType!, dataType: `VARCHAR(${precision})` };
  }
  if (typeCode === "C") {
    return { domainType: domainType!, dataType: `CHAR(${precision})` };
  }
  if (typeCode === "N") {
    return {
      domainType: domainType!,
      dataType: scale ? `NUMBER(${precision},${scale})` : `NUMBER(${precision})`
    };
  }

  return { domainType: domainType!, dataType: "DATE" };
}

function finalModifiedAt(edition: string, sourceFile: string): string {
  const editionMatch = edition.match(/(\d{4})-(\d{2})/);
  if (editionMatch) {
    return `${editionMatch[1]}-${editionMatch[2]}-01 00:00:00`;
  }

  const fileDateMatch = basename(sourceFile).match(/(\d{4})(\d{2})(\d{2})/);
  if (fileDateMatch) {
    return `${fileDateMatch[1]}-${fileDateMatch[2]}-${fileDateMatch[3]} 00:00:00`;
  }

  return "";
}

function convertRow(row: SourceRow, sourceFile: string): string[] | undefined {
  const revisionType = clean(row[SOURCE_COLUMNS.revisionType]);
  if (revisionType === "폐기") {
    return undefined;
  }

  const termName = clean(row[SOURCE_COLUMNS.termName]);
  const physicalName = clean(row[SOURCE_COLUMNS.physicalName]).toUpperCase();
  const domain = clean(row[SOURCE_COLUMNS.domain]);
  const { domainType, dataType } = parseDomain(domain, clean(row[SOURCE_COLUMNS.storageFormat]));
  const edition = clean(row[SOURCE_COLUMNS.edition]);
  const owner = clean(row[SOURCE_COLUMNS.owner]) || "행정안전부";

  return [
    termName,
    physicalName,
    domainType,
    domain,
    dataType,
    clean(row[SOURCE_COLUMNS.codeName]),
    clean(row[SOURCE_COLUMNS.definition]),
    `공공데이터 공통표준용어 ${edition}`.trim(),
    owner,
    finalModifiedAt(edition, sourceFile)
  ];
}

function validateHeaders(row: SourceRow): void {
  const missing = Object.values(SOURCE_COLUMNS).filter((header) => !(header in row));
  if (missing.length > 0) {
    throw new Error(`Missing source CSV columns: ${missing.join(", ")}`);
  }
}

async function convertFile(sourceFile: string, destinationFile: string): Promise<ConversionSummary> {
  const source = await readFile(sourceFile, "utf8");
  const records = parse(source, {
    bom: true,
    columns: (headers: string[]) => headers.map((header) => header.trim()),
    skip_empty_lines: true,
    trim: true
  }) as SourceRow[];

  if (records.length > 0) {
    validateHeaders(records[0]!);
  }

  const outputRows: string[][] = [];
  let excludedDeprecatedRows = 0;
  for (const record of records) {
    const converted = convertRow(record, sourceFile);
    if (!converted) {
      excludedDeprecatedRows += 1;
      continue;
    }
    outputRows.push(converted);
  }

  const csv = [HEADERS, ...outputRows]
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
  await writeFile(destinationFile, `${csv}\n`, "utf8");

  return {
    source: sourceFile,
    destination: destinationFile,
    inputRows: records.length,
    outputRows: outputRows.length,
    excludedDeprecatedRows
  };
}

async function main(): Promise<void> {
  const sourceFile = process.argv[2];
  const destinationFile = process.argv[3] ?? join(process.cwd(), "data", "terms.csv");

  if (!sourceFile) {
    throw new Error("Usage: tsx scripts/convert-public-standard-terms.ts <source.csv> [destination.csv]");
  }

  const summary = await convertFile(sourceFile, destinationFile);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
