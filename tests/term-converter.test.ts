import { mkdtemp, readFile, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "vitest";

import { loadCsvFile } from "../src/csvLoader.js";
import { buildDictionary } from "../src/dictionary.js";
import { createConvertTermsHandler } from "../src/mcpTool.js";
import { convertTerms } from "../src/matcher.js";
import { TermDictionaryService } from "../src/service.js";
import type { TermRow } from "../src/types.js";

const HEADER =
  "용어명,  물리명, 도메인유형,도메인,데이터타입,코드명,정의,요청업무,최종요청자,최종수정일시";
let mtimeOffsetMs = 2_000;

function csv(rows: string[]): string {
  return ["\uFEFF" + HEADER, ...rows].join("\n");
}

async function writeTempCsv(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `mcp-variable-${name}-`));
  const file = join(dir, "terms.csv");
  await writeFile(file, content, "utf8");
  return file;
}

async function bumpMtime(path: string): Promise<void> {
  mtimeOffsetMs += 2_000;
  const next = new Date(Date.now() + mtimeOffsetMs);
  await utimes(path, next, next);
}

const rows: TermRow[] = [
  {
    termName: "등록일자",
    physicalName: "REG_YMD",
    domainType: "일자",
    domain: "일자V8",
    dataType: "VARCHAR(8)"
  },
  {
    termName: "라우팅값",
    physicalName: "ROTNG_VAL",
    domainType: "값",
    domain: "값V10",
    dataType: "VARCHAR(10)"
  },
  {
    termName: "결과값",
    physicalName: "RSLT_VAL",
    domainType: "값",
    domain: "값V10",
    dataType: "VARCHAR(10)"
  },
  {
    termName: "라우팅결과값",
    physicalName: "ROTNG_RSLT_VAL",
    domainType: "값",
    domain: "값V10",
    dataType: "VARCHAR(10)",
    definition: "라우팅결과값"
  }
];

describe("CSV loading", () => {
  test("parses UTF-8 BOM CSV and trims header/value whitespace", async () => {
    const file = await writeTempCsv(
      "loader",
      csv(["등록일자, REG_YMD ,일자,일자V8,VARCHAR(8),,,EDA,System Manager, 2023-12-01 15:34:44"])
    );

    const loaded = await loadCsvFile(file);

    expect(loaded).toEqual([
      expect.objectContaining({
        termName: "등록일자",
        physicalName: "REG_YMD",
        domainType: "일자",
        dataType: "VARCHAR(8)",
        finalModifiedAt: "2023-12-01 15:34:44"
      })
    ]);
  });
});

describe("dictionary building", () => {
  test("keeps exact attributes and creates verified word/domain mappings", () => {
    const dictionary = buildDictionary(rows);

    expect(dictionary.attributeByTerm.get("라우팅결과값")?.physical).toBe("ROTNG_RSLT_VAL");
    expect(dictionary.attributeByPhysical.get("ROTNG_RSLT_VAL")?.term).toBe("라우팅결과값");
    expect(dictionary.termToPhysical.get("라우팅")).toEqual(new Set(["ROTNG"]));
    expect(dictionary.termToPhysical.get("결과")).toEqual(new Set(["RSLT"]));
    expect(dictionary.domainTermToPhysical.get("값")).toEqual(new Set(["VAL"]));
    expect(dictionary.attributeByTerm.get("라우팅결과값")?.components).toEqual([
      { term: "라우팅", physical: "ROTNG", role: "word" },
      { term: "결과", physical: "RSLT", role: "word" },
      { term: "값", physical: "VAL", role: "domain" }
    ]);
  });

  test("does not invent word mappings from an unverified multi-token compound", () => {
    const dictionary = buildDictionary([
      {
        termName: "라우팅결과값",
        physicalName: "ROTNG_RSLT_VAL",
        domainType: "값",
        domain: "값V10",
        dataType: "VARCHAR(10)"
      }
    ]);

    expect(dictionary.termToPhysical.has("라우팅")).toBe(false);
    expect(dictionary.termToPhysical.has("결과")).toBe(false);
    expect(dictionary.warnings).toContain(
      "Could not verify word segmentation for 라우팅결과값 -> ROTNG_RSLT_VAL"
    );
  });
});

describe("term conversion", () => {
  test("converts exact Korean attributes to physical names", () => {
    const result = convertTerms(buildDictionary(rows), {
      text: "등록일자",
      direction: "term_to_physical"
    });

    expect(result).toMatchObject({
      direction: "term_to_physical",
      input: "등록일자",
      convertedText: "REG_YMD",
      confidence: "exact"
    });
    expect(result.matches[0]).toMatchObject({
      source: "등록일자",
      target: "REG_YMD",
      type: "attribute"
    });
  });

  test("converts snake and physical camel names back to Korean attributes", () => {
    const dictionary = buildDictionary(rows);

    expect(
      convertTerms(dictionary, { text: "ROTNG_RSLT_VAL", direction: "physical_to_term" }).convertedText
    ).toBe("라우팅결과값");

    const camelResult = convertTerms(dictionary, {
      text: "rotngRsltVal",
      direction: "auto"
    });

    expect(camelResult).toMatchObject({
      direction: "physical_to_term",
      convertedText: "라우팅결과값",
      confidence: "exact"
    });
  });

  test("composes a new physical name from verified word and domain mappings", () => {
    const result = convertTerms(buildDictionary(rows), {
      text: "등록결과값",
      direction: "term_to_physical"
    });

    expect(result).toMatchObject({
      convertedText: "REG_RSLT_VAL",
      confidence: "composed"
    });
    expect(result.matches[0]?.components).toEqual([
      { term: "등록", physical: "REG", role: "word" },
      { term: "결과", physical: "RSLT", role: "word" },
      { term: "값", physical: "VAL", role: "domain" }
    ]);
  });

  test("returns candidates and warnings instead of confirming ambiguous compounds", () => {
    const dictionary = buildDictionary(rows);
    const ambiguous = buildDictionary([
      ...rows,
      {
        termName: "상태값",
        physicalName: "STAT_VAL",
        domainType: "값",
        domain: "값V10",
        dataType: "VARCHAR(10)"
      },
      {
        termName: "상태값",
        physicalName: "STS_VAL",
        domainType: "값",
        domain: "값V10",
        dataType: "VARCHAR(10)"
      }
    ]);

    expect(convertTerms(dictionary, { text: "미등록결과값" }).confidence).toBe("partial");

    const result = convertTerms(ambiguous, { text: "상태결과값" });

    expect(result.confidence).toBe("partial");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("Ambiguous"))).toBe(true);
  });

  test("applies lowerCamel and UpperCamel output cases", () => {
    const dictionary = buildDictionary(rows);

    expect(
      convertTerms(dictionary, {
        text: "라우팅결과값",
        direction: "term_to_physical",
        outputCase: "lowerCamel"
      }).convertedText
    ).toBe("rotngRsltVal");

    expect(
      convertTerms(dictionary, {
        text: "라우팅결과값",
        direction: "term_to_physical",
        outputCase: "upperCamel"
      }).convertedText
    ).toBe("RotngRsltVal");
  });

  test("converts newline-separated terms in bulk with per-line items", () => {
    const result = convertTerms(buildDictionary(rows), {
      text: "등록일자\n라우팅결과값",
      direction: "term_to_physical",
      outputCase: "lowerCamel"
    });

    expect(result).toMatchObject({
      direction: "term_to_physical",
      input: "등록일자\n라우팅결과값",
      convertedText: "regYmd\nrotngRsltVal",
      confidence: "exact",
      summary: {
        total: 2,
        exact: 2,
        composed: 0,
        partial: 0,
        none: 0
      }
    });
    expect(result.items?.map((item) => item.convertedText)).toEqual(["regYmd", "rotngRsltVal"]);
  });
});

describe("reloadable service", () => {
  test("reloads changed CSV files and keeps the last good index after reload failure", async () => {
    const file = await writeTempCsv(
      "service",
      csv(["등록일자,REG_YMD,일자,일자V8,VARCHAR(8),,,EDA,System Manager,2023-12-01 15:34:44"])
    );
    const service = new TermDictionaryService(file);

    expect((await service.convert({ text: "등록일자" })).convertedText).toBe("REG_YMD");

    await writeFile(
      file,
      csv(["등록일자,REG_DT,일자,일자V8,VARCHAR(8),,,EDA,System Manager,2023-12-01 15:34:44"]),
      "utf8"
    );
    await bumpMtime(file);

    expect((await service.convert({ text: "등록일자" })).convertedText).toBe("REG_DT");

    await writeFile(file, "broken\nvalue", "utf8");
    await bumpMtime(file);

    const afterFailure = await service.convert({ text: "등록일자" });
    expect(afterFailure.convertedText).toBe("REG_DT");
    expect(afterFailure.warnings.some((warning) => warning.includes("Reload failed"))).toBe(true);
  });
});

describe("MCP tool handler", () => {
  test("returns text content and structuredContent", async () => {
    const file = await writeTempCsv(
      "tool",
      csv(["라우팅결과값,ROTNG_RSLT_VAL,값,값V10,VARCHAR(10),,라우팅결과값,EDA,김정식,2025-02-02 11:22:12"])
    );
    const handler = createConvertTermsHandler(new TermDictionaryService(file));

    const result = await handler({
      text: "rotngRsltVal",
      direction: "auto",
      maxCandidates: 3
    });

    expect(result.structuredContent).toMatchObject({
      direction: "physical_to_term",
      convertedText: "라우팅결과값",
      confidence: "exact"
    });
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(result.structuredContent, null, 2)
      }
    ]);

    const rendered = await readFile(file, "utf8");
    expect(rendered).toContain("라우팅결과값");
  });

  test("returns bulk conversion content and structured per-line items", async () => {
    const file = await writeTempCsv(
      "tool-bulk",
      csv([
        "등록일자,REG_YMD,일자,일자V8,VARCHAR(8),,,EDA,System Manager,2023-12-01 15:34:44",
        "라우팅결과값,ROTNG_RSLT_VAL,값,값V10,VARCHAR(10),,라우팅결과값,EDA,김정식,2025-02-02 11:22:12"
      ])
    );
    const handler = createConvertTermsHandler(new TermDictionaryService(file));

    const result = await handler({
      text: "등록일자\n라우팅결과값",
      direction: "term_to_physical",
      outputCase: "lowerCamel"
    });

    expect(result.structuredContent).toMatchObject({
      direction: "term_to_physical",
      convertedText: "regYmd\nrotngRsltVal",
      confidence: "exact",
      summary: {
        total: 2,
        exact: 2,
        composed: 0,
        partial: 0,
        none: 0
      }
    });
    expect(result.structuredContent.items?.map((item) => item.convertedText)).toEqual([
      "regYmd",
      "rotngRsltVal"
    ]);
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(result.structuredContent, null, 2)
      }
    ]);
  });
});
