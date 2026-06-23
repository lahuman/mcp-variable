# Reverse Check 기능 정리

## 목적

한글명을 물리명 또는 camel 표기법으로 변환할 때, 변환된 물리 토큰을 다시 한글명으로 확인해 더 표준적인 한글명이 있으면 결과에 함께 알려준다.

예를 들어 `앱정보명`이 `appInfoNm`으로 변환되었고, 물리 토큰 `APP`가 사전에서 `애플리케이션`으로 확인되면 다음처럼 반환한다.

```json
{
  "convertedText": "appInfoNm",
  "annotatedText": "애플리케이션정보명",
  "reverseCheck": {
    "physical": "APP_INFO_NM",
    "suggestedTerm": "애플리케이션정보명",
    "confidence": "composed"
  }
}
```

## 출력 계약

- `convertedText`는 코드나 SQL에서 바로 사용할 물리명 또는 camel 식별자만 유지한다.
- `annotatedText`는 reverse check로 확인된 추천 한글명만 담는다.
- `reverseCheck`는 추천 한글명을 만든 근거를 담는다.
- 추천 한글명이 입력 한글명과 같으면 `annotatedText`와 `reverseCheck`를 반환하지 않는다.
- 물리 토큰이 애매하거나 일부만 확인되면 추천 한글명을 확정하지 않고 기존 `warnings`, `candidates`, `unmatched` 흐름을 따른다.

## 동작 방식

1. `term_to_physical` 변환이 끝난 뒤 `convertedText`를 물리명 snake case로 정규화한다.
2. 물리 토큰을 `_` 기준으로 분리한다.
3. 마지막 토큰은 도메인 토큰으로 보고 `domainPhysicalToTerms`에서 한글명을 찾는다.
4. 앞쪽 토큰은 단어 토큰으로 보고 `physicalToTerms`에서 한글명을 찾는다.
5. 모든 토큰이 고유하게 확인되면 한글명을 이어 붙여 `suggestedTerm`을 만든다.
6. `suggestedTerm`이 입력 한글명과 다를 때만 `annotatedText`와 `reverseCheck`를 붙인다.

## 구현 내역

- `src/matcher.ts`
  - `term_to_physical` 결과에 reverse check 단계를 추가했다.
  - 물리명 -> 한글명 조합 로직을 `composePhysicalTokensToTerm`으로 분리해 기존 `physical_to_term`과 공유하게 했다.
  - 일괄 변환에서는 각 `items`의 reverse check 결과를 유지하고, 필요하면 줄 단위 `annotatedText` 요약을 만든다.
- `src/types.ts`
  - `ReverseCheck` 타입을 추가했다.
  - `ConvertTermsOutput`에 선택 필드 `annotatedText`, `reverseCheck`를 추가했다.
- `src/mcpTool.ts`
  - MCP structured output schema에 `annotatedText`, `reverseCheck`를 추가했다.
- `tests/term-converter.test.ts`
  - `앱정보명 -> appInfoNm` 결과가 `애플리케이션정보명`을 추천하는 회귀 테스트를 추가했다.
- `README.md`, `AGENTS.md`, `AGENTS_INIT.md`, `skills/mcp-variable-naming/SKILL.md`
  - 새 출력 필드와 사용 규칙을 문서화했다.

## 검증

변경 후 다음 명령으로 확인한다.

```bash
npm test
npm run typecheck
npm run build
```

빌드된 `dist` 모듈에서도 다음 형태가 나와야 한다.

```json
{
  "convertedText": "appInfoNm",
  "annotatedText": "애플리케이션정보명",
  "suggestedTerm": "애플리케이션정보명",
  "confidence": "composed"
}
```
