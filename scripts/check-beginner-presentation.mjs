import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("docs/mcp-variable-beginner-presentation.html", "utf8");

const requiredText = [
  "mcp-variable",
  "오늘의 이야기",
  "AI가 변수명을 찍으면 생기는 일",
  "개발자가 가장 힘들어 하는 변수명 짓기",
  "용어 사전",
  "도메인 사전",
  "물리명 규칙",
  "MCP란?",
  "Host, Client, Server",
  "mcp-variable은 어디에 붙나요?",
  "Skill 로 MCP 최대한 활용 하기",
  "Skill이 하는 일",
  "설정 방법",
  "MCP 설정 JSON",
  "사용 방법",
  "DTO 필드명 만들기",
  "DB 컬럼명 만들기",
  "confidence 읽는 법",
  "6.9%",
  "13,171",
  "REG_DTM",
  "regDtm",
  "convert_terms",
  "Skill을 따라",
  "DTO 필드명으로 변환해줘",
  "참고 자료",
  "https://arxiv.org/abs/2103.07487",
  "https://modelcontextprotocol.io/docs/getting-started/intro",
  "https://modelcontextprotocol.io/docs/learn/architecture"
];

for (const text of requiredText) {
  assert(html.includes(text), `Missing required text: ${text}`);
}

const slideMatches = html.match(/<section class="slide"/g) ?? [];
assert.equal(slideMatches.length, 20, "Expected exactly 20 slides");
assert(slideMatches.length <= 20, "Expected no more than 20 slides");

const dotMatches = html.match(/class="dot/g) ?? [];
assert.equal(dotMatches.length, slideMatches.length, "Expected one navigation dot per slide");

assert.match(html, /@media \(max-width: 760px\)/, "Missing mobile breakpoint");
assert.match(html, /IntersectionObserver/, "Missing active slide observer");
assert(!html.includes("REG_YMD"), "Old sample physical name REG_YMD should be replaced");
assert(!html.includes("regYmd"), "Old sample variable name regYmd should be replaced");
assert(
  !html.includes("웹 검색, 일반 지식, 추측을 사용하지 마세요."),
  "Skill-based prompt should stay concise instead of repeating all tool rules"
);

console.log("Beginner presentation static check passed.");
