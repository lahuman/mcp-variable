# mcp-variable

CSV 사전을 기반으로 한글 용어명과 물리명을 변환하는 Node.js/TypeScript MCP 서버입니다.
기본 데이터 파일은 `data/terms.csv`이며, 행정안전부 공공데이터 공통표준용어 CSV를 우리 MCP 스키마로 변환한 결과입니다.

이 MCP는 AI 클라이언트가 웹 검색이나 추측 대신 표준 도메인 사전을 직접 조회하도록 돕습니다.
개발자는 한글 용어명, 물리명, camel 변수명을 빠르게 오가며 확인할 수 있고, 사전에 없는 용어는 신규 추가 요청 대상으로 바로 구분할 수 있습니다.

## 특장점

- **표준 사전 기반 변환**: 사내 또는 공공 표준 용어 사전을 CSV로 두고, AI가 해당 사전을 MCP tool로 조회합니다.
- **한글/물리명/변수명 왕복 지원**: `등록일자` -> `REG_YMD`, `rotngRsltVal` -> `라우팅결과값`처럼 개발자가 실제로 쓰는 방향을 지원합니다.
- **대량 변수명 생성**: 여러 줄의 한글 용어명을 한 번에 넣어 `lowerCamel` 변수명 목록으로 변환할 수 있습니다.
- **등록 사전 검색**: `정비점`, `자동차`, `VHCL`처럼 키워드를 넣어 이미 등록된 사전 항목을 확인할 수 있습니다.
- **미등록 용어 판단**: 사전에 없는 항목은 `confidence: "none"`과 `unmatched`로 반환해 신규 용어 등록 필요 여부를 빠르게 판단합니다.
- **안전한 조합 규칙**: 검증된 단어/도메인 매핑만 조합하고, 애매한 경우에는 후보와 경고를 반환해 잘못된 표준명을 만들지 않습니다.
- **로컬 `stdio` MCP**: 별도 HTTP 서버 없이 MCP 클라이언트가 로컬 프로세스로 실행할 수 있어 설치와 테스트가 단순합니다.

## 기능

- `stdio` 기반 로컬 MCP 서버
- MCP tool: `convert_terms`, `search_terms`
- 한글 용어명 -> 물리명 변환
- 물리명 snake case 또는 물리명 기반 camel case -> 한글 용어명 변환
- 등록된 사전 row 키워드 검색
- 여러 줄 입력을 줄 단위로 일괄 변환하고 `items`, `summary` 반환
- 한글 -> 물리명 변환 결과를 토큰 단위로 다시 확인해 더 표준적인 한글명이 있으면 `reverseCheck`, `annotatedText`로 제안
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

SSE 기반 HTTP 서버로 실행할 때:

```bash
npm run build
node dist/server_sse.js --csv ./data/terms.csv --host 127.0.0.1 --port 3000
```

SSE 엔드포인트는 기본적으로 `GET /sse`, 메시지 POST 엔드포인트는 `/messages`입니다.
개발 중에는 `npm run dev:sse -- --csv ./data/terms.csv`로 바로 실행할 수 있습니다.

CSV 경로 우선순위:

1. `--csv <path>`
2. `MCP_VARIABLE_CSV`
3. `./data/terms.csv`

## Docker Compose로 SSE 서버 배포

SSE 서버를 컨테이너로 빌드하고 백그라운드 실행할 때는 다음 명령을 사용합니다.

```bash
cp .env.example .env
docker compose up -d --build
```

Docker Compose v1 환경에서는 같은 파일로 `docker-compose up -d --build`를 사용할 수 있습니다.

기본 설정:

- 가이드 페이지: `GET http://127.0.0.1:3000/index.html` 또는 `GET http://127.0.0.1:3000/`
- 공개 URL: `http://127.0.0.1:3000/sse`
- health check: `GET http://127.0.0.1:3000/health`
- 메시지 POST 엔드포인트: `/messages`
- 가이드 파일: `public/index.html`
- 사전 파일: 호스트의 `./data/terms.csv`를 컨테이너의 `/app/data/terms.csv`로 읽기 전용 마운트

`.env`에서 다음 값을 바꿀 수 있습니다.

```dotenv
MCP_VARIABLE_PORT=3000
MCP_VARIABLE_SSE_PATH=/sse
MCP_VARIABLE_MESSAGES_PATH=/messages
MCP_VARIABLE_CSV_SOURCE=./data/terms.csv
MCP_VARIABLE_API_KEYS=
MCP_VARIABLE_ALLOWED_ORIGINS=
MCP_VARIABLE_MAX_SESSIONS=100
MCP_VARIABLE_RATE_LIMIT_WINDOW_MS=60000
MCP_VARIABLE_RATE_LIMIT_MAX=120
```

다른 사전 파일을 사용하려면 `MCP_VARIABLE_CSV_SOURCE`에 호스트 기준 CSV 경로를 지정합니다.

```dotenv
MCP_VARIABLE_CSV_SOURCE=/absolute/path/to/terms.csv
```

공개 SSE 서버는 필요에 따라 앱 레벨 보안을 켤 수 있습니다.

- `MCP_VARIABLE_API_KEYS`: 쉼표로 구분한 API 키 목록입니다. 비워두면 기존처럼 인증 없이 동작합니다.
- `MCP_VARIABLE_ALLOWED_ORIGINS`: 브라우저 클라이언트용 CORS 허용 origin 목록입니다. 비워두면 CORS 응답을 내지 않습니다.
- `MCP_VARIABLE_MAX_SESSIONS`: 동시에 열 수 있는 SSE 세션 수입니다.
- `MCP_VARIABLE_RATE_LIMIT_WINDOW_MS`: rate limit 집계 시간 창입니다.
- `MCP_VARIABLE_RATE_LIMIT_MAX`: 시간 창 안에서 클라이언트별로 허용할 `/sse`, `/messages` 요청 수입니다.

현재 배포에서 사용할 API 키를 서버에 설정하려면 `.env`에 다음처럼 넣습니다.

```dotenv
MCP_VARIABLE_API_KEYS=variable-mcp-with-dataportal
```

API 키를 설정한 경우 클라이언트는 다음 중 하나의 헤더를 보내야 합니다.

```http
Authorization: Bearer <api-key>
X-API-Key: <api-key>
```

`/index.html` 가이드 페이지에는 실제 키를 표시하지 않습니다. 키를 URL query string에 넣는 방식은 로그와 공유 URL에 노출되기 쉬워 지원하지 않습니다.

상태 확인과 종료:

```bash
docker compose ps
docker compose logs -f mcp-variable-sse
curl http://127.0.0.1:3000/health
docker compose down
```

## MCP 설정 예시

빌드 후 로컬 `stdio` MCP 클라이언트 설정에 다음처럼 등록합니다.

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

SSE 서버를 별도 프로세스로 먼저 실행하는 경우:

```bash
npm run start:sse -- --csv ./data/terms.csv --host 127.0.0.1 --port 3000
```

URL 기반 MCP 연결을 지원하는 클라이언트의 `mcp.json`에는 다음처럼 등록합니다.

```json
{
  "mcpServers": {
    "mcp-variable-sse": {
      "type": "sse",
      "url": "http://127.0.0.1:3000/sse"
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

한글 -> 물리명 또는 camel 표기 변환에서 결과 물리 토큰을 다시 한글로 조합했을 때 입력과 다른 표준 한글명이 확인되면, `convertedText`는 식별자만 유지하고 `reverseCheck`와 `annotatedText`를 함께 반환합니다.

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

## Tool: `search_terms`

등록된 CSV 사전 항목을 키워드로 검색합니다. 변환이 아니라 “이미 등록된 항목을 눈으로 확인”하는 기능입니다.

입력:

```ts
{
  query: string;
  fields?: Array<
    | "termName"
    | "physicalName"
    | "domainType"
    | "domain"
    | "dataType"
    | "codeName"
    | "definition"
    | "requestTask"
  >;
  matchMode?: "contains" | "startsWith" | "exact";
  limit?: number;
  offset?: number;
}
```

예시:

```json
{
  "query": "정비점",
  "fields": ["termName", "definition", "requestTask"],
  "limit": 20
}
```

```json
{
  "query": "VHCL",
  "fields": ["physicalName"],
  "matchMode": "startsWith"
}
```

출력의 `items`에는 CSV 사전 row와 함께 `score`, `matchedFields`가 포함됩니다.
`matchedFields`는 어떤 필드가 `exact`, `startsWith`, `contains` 중 어떤 방식으로 매칭됐는지 보여줍니다.

## 개발

```bash
npm test
npm run typecheck
npm run build
```

## 추가 문서

- `docs/reverse-check.md`: 한글 -> 물리명 변환 결과를 다시 한글명으로 확인하는 reverse check 기능의 목적, 출력 계약, 구현 내역, 검증 방법을 정리합니다.

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
