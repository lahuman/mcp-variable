import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("docs/mcp-variable-application-presentation.html", "utf8");

const requiredText = [
  "mcp-variable",
  "업무 변수명 표준화",
  "등록일자 -> REG_YMD -> regYmd",
  "13,171",
  "추측할 때 생기는 불일치",
  "6.9%",
  "웹 검색이나 기억에 기대지 않습니다",
  "적용 업무",
  "DTO 필드",
  "API payload key",
  "DB 컬럼과 물리명",
  "SQL alias와 검색 조건",
  "코드 리뷰와 리팩터링",
  "취향에서 사전 근거로",
  "적용 방법",
  "MCP 서버 빌드와 연결",
  "Skill 워크플로우",
  "convert_terms 입력 예시",
  "confidence 판단 규칙",
  "적용 효과",
  "추측에서 표준으로",
  "같은 workflow에서 확인합니다",
  "변수명은 추측하지 않고 사전에 확인한다",
  "Skill을 따라 DTO 필드명으로 변환해줘",
  "REG_YMD",
  "USE_YN",
  "USER_NO",
  "regYmd",
  "useYn",
  "userNo",
  "direction",
  "term_to_physical",
  "lowerCamel",
  "snake",
  "reverseCheck",
  "https://arxiv.org/abs/2103.07487",
  "https://modelcontextprotocol.io/docs/getting-started/intro",
  "https://modelcontextprotocol.io/docs/learn/architecture"
];

for (const text of requiredText) {
  assert(html.includes(text), `Missing required text: ${text}`);
}

const slideMatches = html.match(/<section class="slide"/g) ?? [];
assert.equal(slideMatches.length, 16, "Expected exactly 16 slides");

const dotMatches = html.match(/class="dot/g) ?? [];
assert.equal(dotMatches.length, slideMatches.length, "Expected one navigation dot per slide");

assert.match(html, /@media \(max-width: 760px\)/, "Missing mobile breakpoint");
assert.match(html, /IntersectionObserver/, "Missing active slide observer");
assert(!html.includes("TODO"), "Presentation must not contain TODO placeholders");
assert(!html.includes("TBD"), "Presentation must not contain TBD placeholders");

console.log("Application presentation static check passed.");
