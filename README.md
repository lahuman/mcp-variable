# mcp-variable

CSV 사전을 기반으로 한글 용어명과 물리명을 변환하는 Node.js/TypeScript MCP 서버입니다.
기본 데이터 파일은 `data/terms.csv`이며, 행정안전부 공공데이터 공통표준용어 CSV를 우리 MCP 스키마로 변환한 결과입니다.

이 MCP는 AI 클라이언트가 웹 검색이나 추측 대신 표준 도메인 사전을 직접 조회하도록 돕습니다.
개발자는 한글 용어명, 물리명, camel 변수명을 빠르게 오가며 확인할 수 있고, 사전에 없는 용어는 신규 추가 요청 대상으로 바로 구분할 수 있습니다.

## 특장점

- **표준 사전 기반 변환**: 사내 또는 공공 표준 용어 사전을 CSV로 두고, AI가 해당 사전을 MCP tool로 조회합니다.
- **한글/물리명/변수명 왕복 지원**: `등록일자` -> `REG_YMD`, `rotngRsltVal` -> `라우팅결과값`처럼 개발자가 실제로 쓰는 방향을 지원합니다.
- **대량 변수명 생성**: 여러 줄의 한글 용어명을 한 번에 넣어 `lowerCamel` 변수명 목록으로 변환할 수 있습니다.
- **미등록 용어 판단**: 사전에 없는 항목은 `confidence: "none"`과 `unmatched`로 반환해 신규 용어 등록 필요 여부를 빠르게 판단합니다.
- **안전한 조합 규칙**: 검증된 단어/도메인 매핑만 조합하고, 애매한 경우에는 후보와 경고를 반환해 잘못된 표준명을 만들지 않습니다.
- **로컬 `stdio` MCP**: 별도 HTTP 서버 없이 MCP 클라이언트가 로컬 프로세스로 실행할 수 있어 설치와 테스트가 단순합니다.

## 기능

- `stdio` 기반 로컬 MCP 서버
- 범용 MCP tool: `convert_terms`
- 한글 용어명 -> 물리명 변환
- 물리명 snake case 또는 물리명 기반 camel case -> 한글 용어명 변환
- 여러 줄 입력을 줄 단위로 일괄 변환하고 `items`, `summary` 반환
- CSV 수정 시 다음 요청에서 자동 재로딩
- 검증된 단어/도메인 매핑으로만 신규 용어 조합
- 애매한 매핑은 확정하지 않고 `candidates`, `warnings`, `unmatched`로 반환

## 기본 제공 데이터

현재 저장소의 `data/terms.csv`는 행정안전부 공공데이터 공통표준용어 원본 CSV를 이 MCP에서 사용하는 스키마로 변환한 데이터입니다.

- 원본 기준 파일명: `행정안전부_공공데이터 공통표준용어_20251101.csv`
- 제공 기관: 행정안전부
- 변환 결과: 13,171개 용어 행
- 제외 기준: 원본의 `개정구분명(폐기 또는 변경)` 값이 `폐기`인 행은 제외
- 활용 목적: 공공데이터 표준 용어를 기반으로 한글 용어명, 물리명, 변수명 변환을 빠르게 제공

## CSV 형식

필수 헤더:

```csv
용어명,물리명,도메인유형,도메인,데이터타입
```

전체 예시:

```csv
용어명,물리명,도메인유형,도메인,데이터타입,코드명,정의,요청업무,최종요청자,최종수정일시
등록일자,REG_YMD,일자,일자V8,VARCHAR(8),,,EDA,System Manager,2023-12-01 15:34:44
라우팅결과값,ROTNG_RSLT_VAL,값,값V10,VARCHAR(10),,라우팅결과값,공통인프라/통합운영관리시스템,김정식,2025-02-02 11:22:12
```

## 실행

```bash
npm install
npm run build
node dist/server.js --csv ./data/terms.csv
```

CSV 경로 우선순위:

1. `--csv <path>`
2. `MCP_VARIABLE_CSV`
3. `./data/terms.csv`

## MCP 설정 예시

빌드 후 MCP 클라이언트 설정에 다음처럼 등록합니다.

```json
{
  "mcpServers": {
    "mcp-variable": {
      "command": "node",
      "args": [
        "/Users/k/DEV/mcp-variable/dist/server.js",
        "--csv",
        "/Users/k/DEV/mcp-variable/data/terms.csv"
      ]
    }
  }
}
```

## Tool: `convert_terms`

입력:

```ts
{
  text: string;
  direction?: "auto" | "term_to_physical" | "physical_to_term";
  outputCase?: "snake" | "lowerCamel" | "upperCamel";
  maxCandidates?: number;
}
```

예시:

```json
{
  "text": "라우팅결과값",
  "direction": "auto"
}
```

```json
{
  "text": "rotngRsltVal",
  "direction": "auto"
}
```

여러 용어를 한 번에 낙타 표기법으로 변환할 때는 `text`에 줄바꿈 목록을 넣습니다.
`convertedText`는 같은 순서의 줄바꿈 결과이고, `items`에는 각 줄별 상세 결과가 들어갑니다.

```json
{
  "text": "등록일자\n라우팅결과값",
  "direction": "term_to_physical",
  "outputCase": "lowerCamel"
}
```

## 개발

```bash
npm test
npm run typecheck
npm run build
```

## 스킬과 에이전트 지침

프로그램 작성 중 변수명, DTO 필드명, API payload key, SQL alias 등을 만들 때
`mcp-variable` 사전을 먼저 사용하도록 Gemini/Antigravity 기준의 스킬과 에이전트 지침을 함께 제공합니다.

- `skills/mcp-variable-naming/SKILL.md`: Gemini/Antigravity 세션에서 우선 참고할 변수명 생성 스킬입니다.
- `AGENTS.md`: 이 저장소에서 작업하는 에이전트가 따라야 할 프로젝트 전반 규칙입니다.
- `AGENTS_INIT.md`: Gemini/Antigravity에서 새 세션을 시작할 때 붙여 넣기 좋은 초기 규칙입니다.

기본 규칙:

- 한글 업무 용어 기반 이름은 임의 번역, 웹 검색, 모델 추측으로 만들지 않고 `convert_terms` 결과를 사용합니다.
- 코드 식별자, DTO 필드, API payload key는 기본적으로 `outputCase: "lowerCamel"`을 사용합니다.
- DB 컬럼, SQL alias, 물리명은 기본적으로 `outputCase: "snake"`를 사용합니다.
- `confidence: "exact"`는 그대로 사용하고, `confidence: "composed"`는 `warnings`를 확인한 뒤 사용합니다.
- `confidence: "partial"` 또는 `confidence: "none"`은 확정 이름으로 사용하지 않고 사용자에게 사전 등록 또는 도메인 확인이 필요하다고 알립니다.
- 없는 단어, 도메인, 전체 용어는 코드나 문서에 `TODO(mcp-variable)` 주석을 남겨 사용자가 사전에 추가할 수 있게 합니다.

미등록 용어 주석 예시:

```ts
// TODO(mcp-variable): "아라"는 사전에 등록되지 않은 용어입니다. confidence=none.
// 사용자가 단어/도메인을 사전에 추가한 뒤 convert_terms를 다시 실행해 표준 변수명을 확정해야 합니다.
const temporaryValue = value;
```

도메인 확인 필요 주석 예시:

```ts
// TODO(mcp-variable): "처리상태구분"의 도메인 "구분" 매핑을 확인할 수 없습니다. confidence=partial.
// 사용자가 한글 도메인명과 물리 토큰을 사전에 추가/확인한 뒤 convert_terms를 다시 실행해야 합니다.
const temporaryProcessingStatusValue = value;
```

예시 프롬프트:

```text
Follow skills/mcp-variable-naming/SKILL.md and use the mcp-variable MCP convert_terms tool to generate DTO field names for 등록일자, 라우팅결과값.
```

```text
Follow AGENTS_INIT.md. When a term, word, or domain is missing, leave TODO(mcp-variable) comments for dictionary registration.
```

## 공공표준용어 CSV 재변환

행정안전부 공공데이터 공통표준용어 원본 CSV를 다시 반영할 때는 다음 명령을 사용합니다.

```bash
npm run convert:public-standard -- "/path/to/행정안전부_공공데이터 공통표준용어_YYYYMMDD.csv" data/terms.csv
```

변환 규칙:

- `공통표준용어명` -> `용어명`
- `공통표준용어영문약어명` -> `물리명`
- `공통표준도메인명` -> `도메인`
- 도메인명의 한글 prefix -> `도메인유형`
- 도메인명의 suffix `V/C/N/D` -> `VARCHAR/CHAR/NUMBER/DATE`
- `개정구분명(폐기 또는 변경)`이 `폐기`인 행은 제외
