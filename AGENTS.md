# 길담 프로젝트 인수인계

이 문서는 다음 개발 세션에서 현재 상태를 빠르게 파악하고 안전하게 이어서 작업하기 위한 프로젝트 컨텍스트다. 실제 코드와 설정이 이 문서와 다르면 실제 코드를 우선하고, 변경 후 이 문서도 함께 갱신한다.

## 프로젝트 개요

- 서비스명: 길담
- 목적: 국내 자동차·도보 여행을 날짜별 일정과 경로로 관리하는 모바일 중심 웹 앱
- 로컬 주소: `http://localhost:3000`
- 공개 주소: `https://gildam-trip.changuk83.chatgpt.site`
- 프런트엔드: React 19, TypeScript, vinext/Next 호환 구조
- 서버 API: Cloudflare Worker `gildam-api`
- 데이터베이스: Cloudflare D1 `gildam-db`
- 현재 인증 상태: 회원가입·로그인 연결 전이며 모든 데이터는 임시 사용자 ID `1`로 처리

## 주요 파일

- `app/page.tsx`: 대부분의 화면, 여행·일정·내 장소 상태와 상호작용
- `app/globals.css`: 전체 UI 및 모바일 반응형 스타일
- `app/NaverMap.tsx`: 네이버 지도, 마커, 전체 경로 표시
- `app/api/places/search/route.ts`: 로컬 개발용 장소 검색 API
- `app/api/routes/route.ts`: 로컬 개발용 자동차 경로 API
- `api-worker/src/index.ts`: 배포용 검색·경로·상태 저장 API
- `api-worker/wrangler.jsonc`: Worker, D1, CORS, 호출 제한 설정
- `api-worker/migrations/`: D1 스키마 이력
- `.openai/hosting.json`: 공개 사이트 호스팅 설정

## 현재 구현 기능

### 여행과 날짜

- 여러 여행을 여행 탭에서 생성·선택·관리
- 새 여행 생성 시 이름과 선택적인 시작일·종료일 입력
- 시작일과 종료일이 있으면 해당 기간만큼 날짜별 일정 자동 생성
- 일수 제한 없음
- 첫 화면에서 표시할 여행 우선순위:
  1. 오늘이 여행 기간에 포함된 여행
  2. 가장 가까운 시작 예정 여행
  3. 가장 최근의 마지막 여행
- 날짜 추가·수정·삭제 지원
- 날짜 삭제 시 확인창 표시
- 일정 화면이 손가락을 따라 움직이는 좌우 스와이프로 이전 날·다음 날을 전환하며, 후보 카드·지도·날짜 탭·버튼 영역은 제스처 충돌을 피하도록 제외
- 전날 목적지를 변경하면 다음 날 출발지도 함께 변경

### 일정과 경로

- 출발지, 목적지, 경유지 검색 및 설정
- 경유지 최대 30곳
- 경유지 드래그 순서 변경
- 각 장소 사이에 장소 추가
- 장소별 메모 작성·수정
- 각 일정 장소에 메인 장소와 복수 후보지 등록
- 좌우 스와이프와 화살표·페이지 표시로 메인/후보 조회
- 후보를 메인으로 변경 가능
- 네이버 Directions API 결과로 구간별 거리와 예상 시간 표시
- 지도에 `S`, 경유지 번호, `G` 마커와 전체 경로 표시
- 지도 확대·축소 버튼은 제거된 상태
- TMAP, 카카오내비, 네이버지도 앱 실행 아이콘 제공

### 내 장소

- 내 장소 화면 상단에서 검색 영역 활성화
- 검색 결과는 기존 목록을 밀지 않는 레이어로 표시
- 검색 결과를 내 장소로 저장할 때 카테고리 선택
- 장소별 메모 지원
- 카테고리 추가·삭제·이름 수정
- 한 장소가 여러 카테고리를 가질 수 있음
- 새 여행 생성 시 여행 이름과 동일한 카테고리 자동 생성
- 해당 여행 일정에 들어간 장소는 그 여행 카테고리에도 자동 등록

### 모바일 UI

- 일정·여행·내 장소 하단 탭 고정
- iOS 입력 포커스 시 자동 확대를 막기 위해 모바일 입력 폰트 크기 고려
- 장소 추가 시 화면 최상단 이동 후 검색창 자동 포커스
- 장소 추가 화면 상단은 노선도 형태로 삽입 위치와 일차를 표시
- 내 장소 제목과 추가 버튼 영역은 스크롤 중 고정

## 데이터 저장 방식

- 브라우저에는 다음 `localStorage` 키를 사용한다.
  - `gildam-trips`
  - `gildam-trip-days` (이전 데이터 마이그레이션용)
  - `gildam-saved-places`
  - `gildam-saved-categories`
  - `gildam-device-id`
- `NEXT_PUBLIC_API_BASE_URL`이 설정되면 Worker의 `/api/state`와 동기화한다.
- 변경 후 700ms 디바운스로 전체 상태를 `PUT`한다.
- 현재 Worker는 기기 ID를 받지만 조회·저장은 항상 `DEFAULT_USER_ID = "1"`을 사용한다.
- 로그인 도입 시 `DEFAULT_USER_ID` 고정 로직을 실제 인증 사용자 ID로 교체해야 한다.

## 서버 API

- `GET /health`: 상태 확인
- `GET /api/places/search?q=...`: 네이버 API HUB 지역 검색 후 결과가 없으면 Geocoding 주소 검색, IP당 분당 30회
- `POST /api/routes`: 네이버 자동차 경로 계산, IP당 분당 10회
- `GET /api/state`: 사용자 상태 조회, IP당 분당 60회
- `PUT /api/state`: 사용자 상태 전체 저장, IP당 분당 10회
- CORS 허용 출처는 `api-worker/wrangler.jsonc`의 `ALLOWED_ORIGINS`에서 관리한다.
- 네이버 Directions API의 한 요청 경유지 제한을 처리하기 위해 여러 요청으로 나누어 전체 경로를 합친다.

## 환경변수와 비밀키

로컬 프런트엔드 루트의 `.env.local`에 다음 이름을 사용한다. 실제 값은 문서나 Git에 기록하지 않는다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_SECRET=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=
```

- `NEXT_PUBLIC_*` 값은 브라우저 번들에 노출될 수 있으므로 비밀키를 넣지 않는다.
- 네이버 Secret은 Cloudflare Worker secret으로 관리한다.
- 카카오내비는 클라이언트 JavaScript SDK를 사용하므로 **JavaScript 키**가 필요하다.
- 카카오 개발자 콘솔의 JavaScript SDK 도메인에 공개 사이트 원본 주소를 등록해야 한다.
- 현재 카카오내비 좌표 전달 형식은 `x=경도`, `y=위도`, `coordType="wgs84"`로 올바르다.

Cloudflare Worker에 필요한 바인딩/비밀값 이름:

```text
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
NAVER_MAP_CLIENT_SECRET
NAVER_SEARCH_CLIENT_ID
NAVER_SEARCH_CLIENT_SECRET
```

## 로컬 실행과 확인

Node.js `22.13.0` 이상을 사용한다. 과거 Homebrew Node 14가 오래된 ICU 라이브러리를 참조해 `dyld` 오류가 발생했으므로 Node 14는 사용하지 않는다.

```bash
npm install
npm run dev
npm run build
npm test
```

- UI 변경 후 최소한 `npm run build`로 확인한다.
- 모바일 변경은 iPhone Safari 크기에서 입력 포커스, 가로 넘침, 내부 세로 스크롤, 하단 고정 탭을 확인한다.
- 지도/검색/내비게이션 변경은 실제 키가 있는 환경에서 별도로 확인한다.

## Cloudflare Worker 작업

프로젝트 루트에서 로컬 Wrangler를 사용한다.

```bash
npx wrangler login
npx wrangler d1 migrations apply gildam-db --remote --config api-worker/wrangler.jsonc
npx wrangler deploy --config api-worker/wrangler.jsonc
```

- 새 DB 변경은 기존 migration을 수정하지 말고 새 번호의 migration을 추가한다.
- 배포 전 Worker secret과 D1 binding을 확인한다.
- API를 수정했다면 `/health`, 검색, 경로, 상태 읽기·쓰기를 확인한다.

## 프런트엔드 배포

- 공개 사이트는 `.openai/hosting.json`을 사용하는 Sites 배포 구조다.
- 배포 요청을 받으면 먼저 빌드/테스트하고, 현재 프로젝트에 연결된 Sites 호스팅 절차를 사용한다.
- 배포 후 공개 주소에서 버전 반영 여부와 모바일 레이아웃을 확인한다.
- 프런트엔드만 변경했다면 Worker를 불필요하게 재배포하지 않는다.
- 사용자는 여러 수정을 모아 한 번에 배포하기를 선호할 수 있으므로, 대화 중 배포 시점을 확인한다.

## 현재 주의사항과 후속 과제

- 카카오내비 앱은 실행되지만 사용자 기기에서 오류가 보고됐다. 좌표 순서와 WGS84 형식은 정상이다. 우선 확인할 항목은 JavaScript 키 종류, 카카오 개발자 콘솔의 JavaScript SDK 도메인 등록, 실제 앱 안의 오류 문구다.
- 카카오 JavaScript SDK 도메인 후보: `https://gildam-trip.changuk83.chatgpt.site`
- 인증이 없고 모든 접속자가 사용자 ID `1` 데이터를 공유하므로 실제 공개 서비스 전에 회원가입·로그인과 사용자별 권한 분리가 필수다.
- 현재 상태 저장은 전체 삭제 후 재삽입 방식이다. 데이터가 커지거나 동시 사용이 생기면 증분 저장과 충돌 제어가 필요하다.
- 클라이언트와 Worker 양쪽에 로컬용 API 구현이 있으므로 변경 시 동작 차이가 생기지 않게 함께 확인한다.
- 기존 `README.md`는 vinext starter 설명이 대부분이므로 사용자용 README로 별도 정리할 여지가 있다.

## 작업 원칙

- 기존 사용자 데이터와 무관한 파일 변경을 보존한다.
- 비밀키 값을 출력하거나 커밋하지 않는다.
- 모바일 우선 UI와 현재의 초록색 길담 디자인 언어를 유지한다.
- `prompt()`는 인앱 브라우저에서 지원되지 않으므로 사용하지 않고 앱 내부 모달/입력 UI를 사용한다.
- 장소 좌표는 항상 `longitude`(경도), `latitude`(위도) 명칭을 유지해 순서 혼동을 방지한다.
- 기능 변경 후 이 문서의 구현 상태와 주의사항도 갱신한다.
