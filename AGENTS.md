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
- 여행 탭에서는 별도 열기 버튼 없이 여행 카드 전체를 눌러 해당 일정을 엶
- 여행 카드는 한 화면에 여러 개가 보이도록 컴팩트한 높이와 여백을 사용
- 여행 이름 수정은 제목 오른쪽의 작고 단순한 단색 연필 아이콘으로 제공
- 새 여행 생성 시 이름과 선택적인 시작일·종료일 입력
- 시작일과 종료일이 있으면 해당 기간만큼 날짜별 일정 자동 생성
- 일수 제한 없음
- 첫 화면에서 표시할 여행 우선순위:
  1. 오늘이 여행 기간에 포함된 여행
  2. 가장 가까운 시작 예정 여행
  3. 가장 최근의 마지막 여행
- 여행 탭에서는 오늘 이후 시작하는 여행 중 시작일이 가장 가까운 여행을 목록 최상단에 표시
- 시작일이 오늘보다 미래인 여행은 여행 목록 상태를 `예정`으로 표시
- 날짜 추가·수정·삭제 지원
- 날짜 삭제 시 확인창 표시
- 일정 화면이 손가락을 따라 움직이는 좌우 스와이프로 이전 날·다음 날을 전환하며, 이동할 날짜의 일정 미리보기 페이지가 옆에서 함께 들어옴. 후보 카드·지도·날짜 탭·버튼 영역은 제스처 충돌을 피하도록 제외
- 세로 스크롤로 날짜 스와이프 판정이 취소되거나 임계값 미달로 복귀할 때 `daySwipeAnimating` 상태를 반드시 해제해 iOS 내부 스크롤을 막는 영구 `translate3d` 레이어가 남지 않게 함
- 전날 목적지를 변경하면 다음 날 출발지도 함께 변경

### 일정과 경로

- 출발지, 목적지, 경유지 검색 및 설정
- 경유지 최대 30곳
- 경유지 드래그 순서 변경
- 각 장소 사이에 장소 추가
- 장소별 메모 작성·수정
- 각 일정 장소에 메인 장소와 복수 후보지 등록
- 중간 경유지와 후보지의 장소명은 한 줄 말줄임 없이 여러 줄로 자연스럽게 줄바꿈해 전체 표시
- 후보지로 등록한 장소도 내 장소에 자동 저장하고 현재 여행 이름 카테고리를 함께 부여
- 좌우 스와이프와 화살표·페이지 표시로 메인/후보 조회
- 후보지 슬라이드가 선택되면 일정 변경 없이 지도 마커와 경로가 해당 후보 좌표로 미리보기 전환
- 후보를 메인으로 변경 가능
- 네이버 Directions API 결과로 구간별 거리와 예상 시간 표시
- 각 경유지와 목적지의 구간 정보는 `이전 장소 → 현재 장소` 기준으로 표시하고 출발지에는 표시하지 않음
- 지도에 `S`, 경유지 번호, `G` 마커와 전체 경로 표시
- 동일한 출발지·경유지 순서·목적지 경로 응답은 Cloudflare Cache API에 6시간 저장하며, 경로 구성이 바뀌면 새 캐시 키로 자동 재계산
- 일정 경로 캐시 키는 `사용자 ID(현재 1) + 여행 ID + 일차 ID + schedule/preview + 경로 좌표 순서`로 구성
- 실제 경로 요청은 별도 배포된 `api-worker`의 `/api/routes`를 사용하므로 Cloudflare Cache API 로직도 이 Worker에 유지
- 연속된 두 장소가 동일 좌표이면 해당 구간은 네이버 경로 계산에서 제외하고 `이전 장소와 같은 위치`로 표시하며, 전체 경로가 동일 좌표이면 외부 API를 호출하지 않음
- 경로 API 응답 전에는 예시 경로선을 표시하지 않고 실제 계산 결과가 도착한 뒤에만 경로선을 그림
- 일정 화면에서 핀 버튼을 켜면 상단 여행 정보·날짜·지도 배치는 유지하고 지도 아래 일정 목록만 독립적으로 세로 스크롤
- 지도 고정 중에는 여행 제목 카드와 날짜 탭을 접어 지도 및 일정 목록의 세로 공간을 확보하고, 고정 해제 시 다시 표시
- 지도 고정 중 일정 목록은 날짜 전환 스와이프와 분리된 독립 세로 스크롤 영역으로 동작
- 지도 고정 레이아웃은 모바일 스크롤 중 재계산 비용이 큰 `:has()` 대신 루트의 `map-pinned` 클래스로 제어
- 일정 목록에서는 세로 제스처는 목록 스크롤, 가로 제스처는 이전·다음 날짜 전환으로 판정
- 일정 화면의 스와이프용 transform은 실제 스와이프 중에만 적용하고 앱의 가로 넘침은 `overflow-x: clip`으로 처리
- 날짜 스와이프 미리보기는 실제 화면과 여행 카드·날짜 카드·핀 행·지도·일정 제목의 높이와 위치를 동일하게 유지
- 지도 확대·축소 버튼은 제거된 상태
- TMAP, 카카오내비, 네이버지도 앱 실행 아이콘 제공
- `/google-test`에서 기존 국내 일정과 분리된 Google 해외 지도 시험 화면 제공
- Google Routes와 Places Search Along Route를 조합해 해외 샘플 경로 주변 장소와 경유 거리·시간 조회

### 내 장소

- 내 장소 화면 상단에서 검색 영역 활성화
- 검색 결과는 기존 목록을 밀지 않는 레이어로 표시
- 일정에 장소를 추가하거나 후보지를 검색할 때 결과마다 이전 장소 기준 직선거리를 표시
- 일정 내 장소 검색은 카카오 Local REST API를 이전 장소와 다음 장소 중심으로 각각 한 번씩, 최대 2회만 호출한다. 후보지 검색일 때는 원래 메인 장소 중심 검색을 1회 추가하고, 모든 결과를 메인 장소와 가까운 순으로 우선 정렬한다. 일반 장소 검색은 직선 우회 거리가 짧은 순으로 정렬하며, 합계가 10곳 미만이면 네이버 검색 결과 최대 5곳을 합쳐 최대 20곳을 제공한다.
- 검색 결과를 내 장소로 저장할 때 카테고리 선택
- 장소별 메모 지원
- 카테고리 추가·삭제·이름 수정
- 한 장소가 여러 카테고리를 가질 수 있음
- 새 여행 생성 시 여행 이름과 동일한 카테고리 자동 생성
- 해당 여행 일정에 들어간 장소는 그 여행 카테고리에도 자동 등록

### 모바일 UI

- 일정·여행·내 장소 하단 탭 고정
- 일정 상단 초록색 요약 영역은 여행 제목만 간결하게 표시
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
- `POST /api/google/route-search`: Google 해외 경로와 경로 주변 장소 검색, IP당 분당 10회
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
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GOOGLE_MAPS_API_KEY=
```

- `NEXT_PUBLIC_*` 값은 브라우저 번들에 노출될 수 있으므로 비밀키를 넣지 않는다.
- 네이버 Secret은 Cloudflare Worker secret으로 관리한다.
- 카카오내비는 클라이언트 JavaScript SDK를 사용하므로 **JavaScript 키**가 필요하다.
- 카카오 개발자 콘솔의 JavaScript SDK 도메인에 공개 사이트 원본 주소를 등록해야 한다.
- 현재 카카오내비 좌표 전달 형식은 `x=경도`, `y=위도`, `coordType="wgs84"`로 올바르다.
- Google 브라우저 키는 Maps JavaScript API만 허용하고 웹사이트 출처로 제한한다.
- Google 브라우저 키를 포함한 배포 빌드는 `.env.local` 값을 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 빌드 환경변수로 명시적으로 전달한다.
- Google 서버 키는 Routes API와 Places API (New)만 허용하며 Worker secret으로 관리한다.
- Google Places 콘텐츠는 네이버 지도 위에 표시하지 않고 `/google-test`의 Google 지도에서만 표시한다.

Cloudflare Worker에 필요한 바인딩/비밀값 이름:

```text
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
NAVER_MAP_CLIENT_SECRET
NAVER_SEARCH_CLIENT_ID
NAVER_SEARCH_CLIENT_SECRET
GOOGLE_MAPS_API_KEY
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
