# RepoSize 기술 백서 (Technical Whitepaper)

**버전**: 1.0.0
**작성일**: 2026년 7월 23일
**작성자**: JTech
**참고 문서**: 기획 아이디어 (GitHub Repo Size 표시 확장), 기존 확장 프로그램 분석 (harshjv/github-repo-size 등), Chrome Manifest V3 정책, GitHub REST API 문서

## 1. 프로젝트 개요 (Project Overview)

### 1.1. 프로젝트 명
**RepoSize**

### 1.2. 목적 (Purpose)
GitHub 저장소 페이지에서 파일 다운로드(ZIP)나 클론을 하기 전에 저장소의 실제 크기를 즉시 확인할 수 있게 한다.

- 사용자가 수백 MB ~ 수 GB 규모의 저장소를 무심코 다운로드하는 것을 방지한다.
- 기존 확장 프로그램들이 공통적으로 겪는 문제(UI 깨짐, 공개 저장소에도 토큰 강제, 캐싱 부재, 유지보수 중단)를 해결한 현대적인 대안을 제공한다.
- 최소한의 권한과 초경량 구조로 GitHub 네이티브 경험에 완벽하게 녹아드는 도구를 목표로 한다.

### 1.3. 핵심 차별점 (Key Differentiators)
1. **Robustness (견고성)**: MutationObserver와 다중 Fallback Selector를 사용해 GitHub의 빈번한 UI 변경에도 깨지지 않도록 설계. 단일 CSS Selector에 의존하지 않음.
2. **Zero-Friction Public Access**: 공개 저장소는 Personal Access Token 없이도 즉시 동작. 비공개 저장소와 Rate Limit 완화를 위해서만 선택적으로 토큰을 사용.
3. **Intelligent UX**: 단순 숫자 표시를 넘어, 용량 경고(Warning Badge), 스마트 캐싱, 단위 선택(Binary/Decimal), 깔끔한 GitHub 네이티브 스타일 매칭을 제공.

---

## 2. 상세 기능 요구사항 (Detailed Requirements)

### 2.1. 실행 환경 및 인터페이스 (Runtime & Interface)
- **플랫폼 (Platform)**: Google Chrome / Chromium 계열 브라우저 (Edge, Brave, Arc 등 포함)
- **Manifest 버전**: Manifest V3
- **지원 인터페이스**:
  - **Popup UI**: 확장 아이콘 클릭 시 간단한 상태 확인 + 빠른 설정 + PAT 입력 창
  - **Options Page**: 상세 설정 (단위, 표시 위치, 경고 임계값, 캐시 TTL, PAT 관리)
  - **Content Script UI**: GitHub 저장소 페이지 헤더에 크기 Badge를 자연스럽게 삽입
  - **Context Menu / Side Panel / Omnibox**: 사용하지 않음 (최소 권한 원칙)
- **테마 정책 (Theme Policy)**: GitHub의 다크/라이트 모드를 자동으로 감지하여 완전히 동일한 색상 토큰을 사용. CSS Variables 기반.

### 2.2. 사용자 상호작용 로직 (Interaction Logic)
- **이벤트 트리거 (Trigger)**:
  - **자동 실행 조건**: `https://github.com/*/*` 패턴의 저장소 메인 페이지 진입 시 Content Script 자동 실행
  - **Browser Action**: 확장 아이콘 클릭 시 Popup 표시
  - **Page Interaction**: 크기 Badge 클릭 시 상세 정보 툴팁 또는 미니 팝오버 표시
- **동작 흐름 (Action Flow)**:
  1. Content Script가 현재 URL이 저장소 메인 페이지인지 판별 (`owner/repo` 형태)
  2. 캐시에 유효한 데이터가 있는지 확인 → 있으면 즉시 UI 삽입
  3. 캐시 미스 시 Background Service Worker에 크기 조회 요청
  4. Service Worker가 GitHub API 호출 (`/repos/{owner}/{repo}`)
  5. 결과 캐싱 후 Content Script로 전달
  6. Content Script가 헤더 영역에 크기 Badge 삽입 및 MutationObserver로 지속 감시
- **검증 규칙 (Validation)**:
  - URL이 실제 저장소 페이지인지 정규식으로 검증
  - API 응답의 `size` 필드 존재 여부 확인
  - Rate Limit 초과 시 사용자에게 친절한 안내 + 토큰 설정 유도
  - 잘못된 PAT 입력 시 명확한 오류 메시지

### 2.3. 권한 및 보안 정책 (Permissions & Security)
- **필수 권한 (Required Permissions)**:
  - `storage`: 설정값 및 캐시 저장
  - `activeTab`: 현재 탭 정보 접근 (최소화)
- **호스트 권한 (Host Permissions)**:
  - `https://api.github.com/*`: 저장소 크기 조회 목적
  - `https://github.com/*`: Content Script 주입 대상
- **보안 정책 (Security Policy)**:
  - 최소 권한 원칙 철저히 준수
  - Personal Access Token은 `chrome.storage.local`에만 저장하며, 절대 로그에 출력하지 않음
  - 외부 스크립트 로드 금지
  - DOM 조작 시 `textContent` 위주로 사용하고, 필요 시 sanitization 적용
  - Content Security Policy를 최대한 엄격하게 유지

### 2.4. 데이터 모델 및 저장소 (Data Model & Storage)
1. **Settings**:
   - `unit`: `"binary"` | `"decimal"` (기본값: binary → MiB/GiB)
   - `displayPosition`: `"header"` | `"about"` | `"both"` (기본값: header)
   - `warningThresholdMB`: number (기본값: 500)
   - `cacheTTLHours`: number (기본값: 24)
   - `showEstimatedZip`: boolean (기본값: false)
   - `pat`: string | null

2. **Cache**:
   - Key: `repo:{owner}/{repo}`
   - Value: `{ sizeKB: number, fetchedAt: number, fullName: string }`

3. **SessionState**:
   - 현재 탭의 로딩 상태, 마지막 에러 메시지 등 (메모리)

- **저장소 정책**:
  - `chrome.storage.local`: 설정 + 캐시 (용량이 크지 않음)
  - `chrome.storage.sync`: 사용하지 않음 (PAT 보안상 로컬 전용 권장)
  - 캐시는 TTL 기반으로 자동 만료 처리

### 2.5. 출력 및 성능 기준 (Output & Performance)
- **출력 형식**:
  - Content Script: GitHub 헤더에 작은 Badge (`971.6 MiB` 형태)
  - 큰 용량일 경우 경고 색상 (주황/빨강) 적용
  - Popup: 현재 페이지 크기 요약 + 설정 바로가기
- **품질 기준 (QA Standards)**:
  - Content Script 주입 및 Badge 표시: 800ms 이내 (캐시 히트 시 200ms 이내)
  - 메모리 사용량: 평상시 5MB 이하 목표
  - 번들 크기: Content Script 15KB 이하, 전체 확장 80KB 이하 목표
  - GitHub 다크/라이트 모드 완벽 대응
  - API 실패 시 사용자에게 방해되지 않는 방식으로 안내

---

## 3. 기술 스택 및 라이브러리 (Tech Stack)

### 3.1. Core
- **Extension Platform**: Chrome Extension Manifest V3
- **Frontend UI**: Vanilla TypeScript + 최소한의 DOM 조작 (Popup/Options는 가벼운 HTML/CSS/TS)
- **Background Runtime**: Service Worker
- **Storage**: chrome.storage.local
- **External Backend**: 없음 (GitHub API 직접 호출)

### 3.2. Libraries & Tools
1. **TypeScript** (필수)
   - 버전: 5.x
   - 용도: 전체 타입 안정성
2. **Vite** (필수)
   - 용도: 번들링, HMR, Manifest 복사, 멀티 엔트리 포인트 관리
3. **없음 (의도적)**
   - React, Vue, jQuery, lodash 등 무거운 라이브러리 사용 금지
   - 목적: 초경량 유지 및 실행 속도 극대화
4. **개발 도구**
   - `@crxjs/vite-plugin` 또는 수동 Vite 설정으로 Manifest V3 지원
   - ESLint + Prettier

---

## 4. 아키텍처 및 로직 (Architecture & Logic)

### 4.1. 확장 프로그램 구성 요소 (Extension Components)
- **Manifest**: 권한, content_scripts 매칭, action, options_page 선언
- **Popup**: 간단한 상태 표시 + PAT 입력 + Options 링크
- **Options Page**: 모든 설정 UI
- **Background Service Worker**: API 호출, 캐시 관리, 메시지 라우팅
- **Content Scripts**: URL 감지, 캐시 확인, Badge 삽입, MutationObserver

### 4.2. 메시징 및 상태 관리 전략 (Messaging & State Management)
- **메시징 방식**:
  - Content Script → Background: `GET_REPO_SIZE`
  - Background → Content Script: `REPO_SIZE_RESULT` / `REPO_SIZE_ERROR`
  - Popup ↔ Background: 설정 조회/저장
- **상태 관리 원칙**:
  - 캐시와 설정은 모두 `chrome.storage.local`에 중앙 집중
  - Content Script는 상태를 최소한으로만 유지 (표시용)
  - Service Worker는 이벤트 기반으로만 동작 (장기 상태 없음)

```typescript
// 메시지 예시
chrome.runtime.sendMessage({
  type: 'GET_REPO_SIZE',
  payload: { owner: 'DalerMehndi', repo: 'enha.github.io' }
});
```

### 4.3. 주요 동작 파이프라인 (Main Workflow)
1. **초기화 (Init)**: Service Worker 활성화, 기본 설정값 시드
2. **주입 (Inject)**: `github.com/{owner}/{repo}` 페이지 진입 → Content Script 실행
3. **캐시 확인**: storage에서 해당 레포 캐시 조회
4. **API 호출 (필요 시)**: Background에서 `https://api.github.com/repos/{owner}/{repo}` 호출
5. **변환 및 표시**: KB → 사람이 읽기 좋은 단위로 변환 후 Badge 삽입
6. **감시 (Observe)**: MutationObserver로 GitHub이 헤더를 다시 렌더링해도 Badge 유지
7. **후처리**: 불필요 리스너 정리 없음 (페이지 단위 생명주기)

### 4.4. 핵심 알고리즘 (Core Algorithms)
- **Size Formatter**:
  ```typescript
  function formatSize(kb: number, unit: 'binary' | 'decimal'): string {
    const base = unit === 'binary' ? 1024 : 1000;
    if (kb < base) return `${kb} KB`;
    const mb = kb / base;
    if (mb < base) return `${mb.toFixed(1)} ${unit === 'binary' ? 'MiB' : 'MB'}`;
    const gb = mb / base;
    return `${gb.toFixed(2)} ${unit === 'binary' ? 'GiB' : 'GB'}`;
  }
  ```
- **Robust Injector**: 여러 후보 Selector를 순차적으로 시도하고, 실패 시 MutationObserver로 헤더 출현을 대기
- **Cache Manager**: TTL 기반 만료 + 수동 강제 새로고침 지원
- **Rate Limit Handler**: 403/429 응답 시 토큰 유무에 따라 다른 안내 메시지 표시

---

## 5. UI 구현 가이드 (Implementation Guide)

### 5.1. 디자인 토큰 (Design Tokens)
GitHub의 실제 디자인 시스템을 최대한 모방한다.

- **Colors (Light)**:
  - Badge Background: `#f6f8fa`
  - Badge Border: `#d0d7de`
  - Text: `#57606a`
  - Warning: `#bf8700` / `#9a6700`
  - Danger: `#cf222e`
- **Colors (Dark)**:
  - Badge Background: `#161b22`
  - Badge Border: `#30363d`
  - Text: `#8b949e`
  - Warning / Danger: GitHub 다크 테마 경고색 그대로 사용
- **Typography**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Spacing**: GitHub의 4px 기반 스케일 준수
- **Radius**: `6px` (GitHub 기본)
- **Font Size**: `12px` (Badge), `14px` (Popup)

### 5.2. 공통 UI 컴포넌트 (Shared Components)
- **Size Badge**: 
  - 기본 형태: `971.6 MiB`
  - 경고 시: `⚠ 1.2 GiB` (색상 변경)
  - 클릭 가능 (상세 정보)
- **Loading Skeleton**: 작은 회색 바 (로딩 중)
- **Error Indicator**: 작은 빨간 점 + 툴팁
- **Popup Card**: GitHub 스타일의 카드형 레이아웃
- **Toggle / Input**: 네이티브에 가깝게, 커스텀 최소화

### 5.3. 접근성 및 사용성 (Accessibility & Usability)
- Badge에 `title` 또는 `aria-label`로 전체 정보 제공
- 키보드로 포커스 가능
- 색상만으로 정보를 전달하지 않음 (아이콘 + 텍스트 병행)
- Popup 폭 360px 내외로 제한하여 가독성 유지

---

## 6. 파일 구조 (File Structure)

```text
RepoSize/
├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── manifest.json
├── src/
│   ├── background/
│   │   └── index.ts                 # Service Worker 엔트리
│   ├── content/
│   │   ├── index.ts                 # Content Script 메인
│   │   ├── injector.ts              # Badge 삽입 로직
│   │   ├── observer.ts              # MutationObserver
│   │   └── styles.css               # Badge 전용 최소 CSS
│   ├── popup/
│   │   ├── index.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── options/
│   │   ├── index.html
│   │   ├── options.ts
│   │   └── options.css
│   ├── shared/
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── storage.ts               # chrome.storage 래퍼
│   │   ├── formatter.ts             # size 변환 유틸
│   │   └── api.ts                   # GitHub API 호출 로직
│   └── assets/
├── dist/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 7. Manifest 및 배포 정책 (Manifest & Deployment)

### 7.1. Manifest 설계 원칙
- 필요한 권한만 선언
- `host_permissions`는 `api.github.com`과 `github.com`으로 제한
- Content Script는 `https://github.com/*/*`에만 매칭 (불필요한 페이지 주입 방지)

```json
{
  "manifest_version": 3,
  "name": "RepoSize",
  "version": "1.0.0",
  "description": "Show accurate repository size on GitHub before you download or clone.",
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png"
    }
  },
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  "options_page": "options/index.html",
  "permissions": ["storage"],
  "host_permissions": [
    "https://api.github.com/*",
    "https://github.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://github.com/*/*"],
      "js": ["content/index.js"],
      "css": ["content/styles.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 7.2. 배포 및 운영 정책
- **개발 빌드**: `vite build --watch` + Chrome Unpacked Extension 로드
- **검수 절차**: 권한 최소화 검토, 개인정보 처리 방침(토큰 저장) 명시
- **배포 채널**: Chrome Web Store
- **버전 관리**: Semantic Versioning
- **업데이트 정책**: GitHub UI 변경 시 우선적으로 대응 업데이트 배포

---

## 8. 개발 시 주의사항 (Implementation Notes)

1. **보안 (Security)**:
   - PAT는 절대 콘솔에 출력하지 말 것
   - API 요청 헤더에 토큰을 넣을 때만 사용하고, 저장소에 평문 노출 금지
   - Content Script에서 불필요한 `innerHTML` 사용 금지

2. **성능 최적화 (Optimization)**:
   - Content Script는 가능한 한 가볍게 (DOM 쿼리 최소화)
   - MutationObserver는 필요한 노드만 관찰하고 disconnect 시점을 명확히 관리
   - 캐시를 적극 활용하여 API 호출 최소화

3. **호환성 (Compatibility)**:
   - GitHub은 React 기반 SPA이므로 `document_idle` 이후에도 헤더가 늦게 나타날 수 있음 → Observer 필수
   - `turbo` 또는 새로운 네비게이션 방식에 대비한 URL 변경 감지 필요

4. **이슈 대응 (Known Issues)**:
   - GitHub API Rate Limit (비인증 60회/시간) → 캐싱으로 완화
   - 매우 큰 모노레포의 경우 크기 정보가 실제 클론 크기와 차이가 날 수 있음 (히스토리 포함) → UI에 명시
   - Private 저장소는 반드시 PAT 필요

---

## 9. 테스트 및 검증 항목 (Testing & Validation)

### 9.1. 기능 테스트
- 공개 저장소에서 토큰 없이 정상 표시되는지
- 캐시 히트/미스 동작 확인
- 다크/라이트 모드 전환 시 Badge 스타일 정상 반영
- GitHub 페이지 내부 네비게이션(Turbolinks 스타일) 후에도 Badge가 유지되는지
- 500MB / 1GB 이상 저장소에서 경고 색상이 제대로 나오는지
- Options에서 단위 변경 시 즉시 반영되는지
- 잘못된 PAT 입력 시 오류 처리

### 9.2. 비기능 테스트
- Content Script 번들 크기 측정
- 메모리 누수 여부 (Observer 정리 확인)
- Rate Limit 상황 시뮬레이션
- Chrome Web Store 심사 기준(권한 설명, 개인정보) 충족 여부

### 9.3. 디버깅 포인트
- `chrome://extensions` → Service Worker 콘솔
- Content Script 콘솔 (페이지 개발자 도구)
- Network 탭에서 `api.github.com` 호출 확인
- storage 상태 직접 조회

---

## 10. 향후 확장 계획 (Future Roadmap)

1. **폴더/파일 단위 크기 표시** (선택적 기능): 트리 뷰에서 폴더 hover 시 크기 표시
2. **Download ZIP 예상 크기** 개선: 텍스트 비율 기반 추정 또는 사용자 피드백 수집
3. **다국어 지원**: 한국어 / 영어 / 일본어
4. **Firefox / Edge 최적화** 버전
5. **Repository Health 지표** 추가 (Stars, Open Issues, Last Push 등을 함께 보여주는 미니 대시보드)

---