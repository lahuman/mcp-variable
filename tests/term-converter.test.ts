import { mkdtemp, readFile, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "vitest";

import { CsvLoadError, loadCsvFile, parseCsvText } from "../src/csvLoader.js";
import { buildDictionary } from "../src/dictionary.js";
import { createConvertTermsHandler, createSearchTermsHandler } from "../src/mcpTool.js";
import { convertTerms } from "../src/matcher.js";
import { searchTerms } from "../src/search.js";
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

  test("parses a large CSV text through the parser without file I/O", () => {
    const largeRows = Array.from({ length: 75_000 }, (_, index) => {
      const sequence = String(index + 1).padStart(5, "0");
      return `대용량테스트${sequence},BULK_TEST_${sequence},명,명V100,VARCHAR(100),,,대용량테스트,System,2026-06-23 00:00:00`;
    });

    const loaded = parseCsvText(csv(largeRows));

    expect(loaded).toHaveLength(75_000);
    expect(loaded[0]).toMatchObject({
      termName: "대용량테스트00001",
      physicalName: "BULK_TEST_00001"
    });
    expect(loaded.at(-1)).toMatchObject({
      termName: "대용량테스트75000",
      physicalName: "BULK_TEST_75000"
    });
  });

  test("parser-only malformed CSV errors include parser details", () => {
    const malformed = csv([
      "정상용어,NORMAL_NM,명,명V100,VARCHAR(100),,,테스트,System,2026-06-23 00:00:00",
      '깨진용어,BROKEN_NM,명,명V100,VARCHAR(100),,,"닫히지 않은 정의,테스트,System,2026-06-23 00:00:00'
    ]);

    expect(() => parseCsvText(malformed)).toThrow(CsvLoadError);
    expect(() => parseCsvText(malformed)).toThrow(/Failed to parse CSV text/);
    expect(() => parseCsvText(malformed)).toThrow(/Quote Not Closed|Invalid Closing Quote|CSV/);
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

  test("separates suffix domains from row domain types", () => {
    const dictionary = buildDictionary([
      {
        termName: "문서내용",
        physicalName: "DOC_CN",
        domainType: "내용",
        domain: "내용V4000",
        dataType: "VARCHAR(4000)"
      },
      {
        termName: "문서제목",
        physicalName: "DOC_TTL",
        domainType: "명",
        domain: "명V256",
        dataType: "VARCHAR(256)"
      },
      {
        termName: "영문명",
        physicalName: "ENG_NM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      },
      {
        termName: "영문성명",
        physicalName: "ENG_FLNM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      },
      {
        termName: "한자성명",
        physicalName: "CHNCRT_FLNM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      }
    ]);

    expect(dictionary.domainTermToPhysical.get("명")).toEqual(new Set(["NM"]));
    expect(dictionary.domainTermToPhysical.get("제목")).toEqual(new Set(["TTL"]));
    expect(dictionary.domainTermToPhysical.get("성명")).toEqual(new Set(["FLNM"]));
    expect(dictionary.physicalToTerms.has("TTL")).toBe(false);
    expect(dictionary.physicalToTerms.has("FLNM")).toBe(false);
    expect(dictionary.attributeByTerm.get("문서제목")?.components).toEqual([
      { term: "문서", physical: "DOC", role: "word" },
      { term: "제목", physical: "TTL", role: "domain" }
    ]);
    expect(dictionary.attributeByTerm.get("영문성명")?.components).toEqual([
      { term: "영문", physical: "ENG", role: "word" },
      { term: "성명", physical: "FLNM", role: "domain" }
    ]);
    expect(dictionary.attributeByTerm.get("한자성명")?.components).toEqual([
      { term: "한자", physical: "CHNCRT", role: "word" },
      { term: "성명", physical: "FLNM", role: "domain" }
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

  test("composes suffix-domain terms without exact attributes", () => {
    const dictionary = buildDictionary([
      {
        termName: "정비내용",
        physicalName: "MTNC_CN",
        domainType: "내용",
        domain: "내용V4000",
        dataType: "VARCHAR(4000)"
      },
      {
        termName: "계정명",
        physicalName: "ACNT_NM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      },
      {
        termName: "정보내용",
        physicalName: "INFO_CN",
        domainType: "내용",
        domain: "내용V4000",
        dataType: "VARCHAR(4000)"
      },
      {
        termName: "문서내용",
        physicalName: "DOC_CN",
        domainType: "내용",
        domain: "내용V4000",
        dataType: "VARCHAR(4000)"
      },
      {
        termName: "문서제목",
        physicalName: "DOC_TTL",
        domainType: "명",
        domain: "명V256",
        dataType: "VARCHAR(256)"
      },
      {
        termName: "영문명",
        physicalName: "ENG_NM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      },
      {
        termName: "영문성명",
        physicalName: "ENG_FLNM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      }
    ]);

    const composed = convertTerms(dictionary, {
      text: "정비계정정보명",
      direction: "term_to_physical",
      outputCase: "snake"
    });

    expect(composed).toMatchObject({
      convertedText: "MTNC_ACNT_INFO_NM",
      confidence: "composed",
      unmatched: []
    });
    expect(composed.matches[0]?.components).toEqual([
      { term: "정비", physical: "MTNC", role: "word" },
      { term: "계정", physical: "ACNT", role: "word" },
      { term: "정보", physical: "INFO", role: "word" },
      { term: "명", physical: "NM", role: "domain" }
    ]);

    expect(
      convertTerms(dictionary, {
        text: "정보명",
        direction: "term_to_physical",
        outputCase: "snake"
      })
    ).toMatchObject({
      convertedText: "INFO_NM",
      confidence: "composed",
      unmatched: []
    });
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

  test("keeps unmatched Korean groups separated by matched terms", () => {
    const dictionary = buildDictionary([
      {
        termName: "계정정보",
        physicalName: "ACNT_INFO",
        domainType: "정보",
        domain: "정보V100",
        dataType: "VARCHAR(100)"
      }
    ]);

    const result = convertTerms(dictionary, {
      text: "주요계정정보명",
      direction: "term_to_physical",
      outputCase: "snake"
    });

    expect(result).toMatchObject({
      convertedText: "주요ACNT_INFO명",
      confidence: "partial",
      unmatched: ["주요", "명"]
    });
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

  test("suggests reverse-checked Korean term when physical tokens map to a more standard term", () => {
    const dictionary = buildDictionary([
      {
        termName: "애플리케이션명",
        physicalName: "APP_NM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      },
      {
        termName: "정보명",
        physicalName: "INFO_NM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      },
      {
        termName: "앱정보명",
        physicalName: "APP_INFO_NM",
        domainType: "명",
        domain: "명V100",
        dataType: "VARCHAR(100)"
      }
    ]);

    const result = convertTerms(dictionary, {
      text: "앱정보명",
      direction: "term_to_physical",
      outputCase: "lowerCamel"
    });

    expect(result).toMatchObject({
      convertedText: "appInfoNm",
      annotatedText: "애플리케이션정보명",
      reverseCheck: {
        physical: "APP_INFO_NM",
        suggestedTerm: "애플리케이션정보명",
        annotatedText: "애플리케이션정보명",
        confidence: "composed",
        components: [
          { term: "애플리케이션", physical: "APP", role: "word" },
          { term: "정보", physical: "INFO", role: "word" },
          { term: "명", physical: "NM", role: "domain" }
        ]
      }
    });
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

describe("term search", () => {
  const searchRows: TermRow[] = [
    {
      termName: "자동차등록번호",
      physicalName: "VHCL_REG_NO",
      domainType: "번호",
      domain: "번호V40",
      dataType: "VARCHAR(40)",
      definition: "자동차를 등록할 때 부여한 번호",
      requestTask: "자동차관리"
    },
    {
      termName: "차량정비점명",
      physicalName: "VHCL_MTNC_SHOP_NM",
      domainType: "명",
      domain: "명V100",
      dataType: "VARCHAR(100)",
      definition: "차량 정비점의 명칭",
      requestTask: "자동차정비"
    },
    {
      termName: "정비점주소",
      physicalName: "MTNC_SHOP_ADDR",
      domainType: "주소",
      domain: "주소V200",
      dataType: "VARCHAR(200)",
      definition: "정비점의 소재지 주소",
      requestTask: "정비업무"
    },
    {
      termName: "등록일자",
      physicalName: "REG_YMD",
      domainType: "일자",
      domain: "일자V8",
      dataType: "VARCHAR(8)",
      definition: "등록한 일자",
      requestTask: "공통"
    }
  ];

  test("finds registered dictionary rows by Korean keyword", () => {
    const result = searchTerms(buildDictionary(searchRows), {
      query: "정비점",
      fields: ["termName", "definition"],
      limit: 10
    });

    expect(result).toMatchObject({
      query: "정비점",
      total: 2,
      limit: 10,
      offset: 0,
      warnings: []
    });
    expect(result.items.map((item) => item.termName)).toEqual(["정비점주소", "차량정비점명"]);
    expect(result.items[0]).toMatchObject({
      termName: "정비점주소",
      physicalName: "MTNC_SHOP_ADDR",
      matchedFields: [
        {
          field: "termName",
          value: "정비점주소",
          matchType: "startsWith"
        },
        {
          field: "definition",
          value: "정비점의 소재지 주소",
          matchType: "startsWith"
        }
      ]
    });
  });

  test("supports physical-name search without requiring exact case", () => {
    const result = searchTerms(buildDictionary(searchRows), {
      query: "vhcl",
      fields: ["physicalName"],
      limit: 10
    });

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.physicalName)).toEqual([
      "VHCL_REG_NO",
      "VHCL_MTNC_SHOP_NM"
    ]);
    expect(result.items[0]?.matchedFields).toEqual([
      {
        field: "physicalName",
        value: "VHCL_REG_NO",
        matchType: "startsWith"
      }
    ]);
  });

  test("applies match mode and pagination after ranking", () => {
    const result = searchTerms(buildDictionary(searchRows), {
      query: "자동차",
      fields: ["termName", "definition", "requestTask"],
      matchMode: "contains",
      limit: 1,
      offset: 1
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.termName).toBe("차량정비점명");
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

  test("returns dictionary search content and structured search results", async () => {
    const file = await writeTempCsv(
      "tool-search",
      csv([
        "자동차등록번호,VHCL_REG_NO,번호,번호V40,VARCHAR(40),,자동차를 등록할 때 부여한 번호,자동차관리,System,2026-06-25 10:00:00",
        "정비점주소,MTNC_SHOP_ADDR,주소,주소V200,VARCHAR(200),,정비점의 소재지 주소,정비업무,System,2026-06-25 10:00:00"
      ])
    );
    const handler = createSearchTermsHandler(new TermDictionaryService(file));

    const result = await handler({
      query: "정비점",
      fields: ["termName", "definition"],
      limit: 5
    });

    expect(result.structuredContent).toMatchObject({
      query: "정비점",
      total: 1,
      limit: 5,
      offset: 0,
      items: [
        {
          termName: "정비점주소",
          physicalName: "MTNC_SHOP_ADDR",
          matchedFields: [
            {
              field: "termName",
              value: "정비점주소",
              matchType: "startsWith"
            },
            {
              field: "definition",
              value: "정비점의 소재지 주소",
              matchType: "startsWith"
            }
          ]
        }
      ]
    });
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(result.structuredContent, null, 2)
      }
    ]);
  });
});
