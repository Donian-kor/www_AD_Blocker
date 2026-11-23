# www_AD_Blocker

크롬(Chrome)에서 웹사이트 광고와 추적기를 차단하는 Manifest V3 확장 프로그램입니다.
개발자 모드에서 폴더 또는 ZIP을 불러와 사용합니다.

**현재 버전: 0.37**

## 주요 기능

- **동영상 사이트 광고 차단** — 광고 소재 도메인을 동영상 사이트에서만 허용하고 요청 body를 광고 없는 클라이언트로 위조해 애초에 광고가 오지 않게 처리, 플레이어 응답의 `adSlots` / `playerAds` / `adPlacements` / `adBreakHeartbeatParams` 제거, Shorts `isAd` 플래그 무력화, 자동 음소거 해제
- **네트워크 광고 차단** — 5개 카테고리·34개 소스(소스별 개별 토글), 정적 271,415개 + 동적 신규 규칙(최대 28,500개 한도)를 DNR로 차단
- **인라인 광고 차단** — 네트워크 차단으로 잡히지 않는 배너·사이드바·스폰서·팝업·오버레이 광고를 CSS 숨김 + DOM 제거 (`general-blocker.js`)
- **광고 감지 우회** — 감지 경고창·베이트 요소를 숨기고, dogdrip.net 서버 감지도 우회
- **사이트별 누적 차단 수** — 툴바 뱃지와 팝업에 표시, 탭 전환·새로고침 후에도 유지
- **차단 URL 목록** — 팝업의 「총 차단」 클릭 시 확인
- **ON/OFF 토글** — 팝업에서 즉시 전환. 토글 시 현재 페이지가 자동 새로고침되고, OFF 상태에서는 툴바 아이콘이 회색으로 바뀌어 시각적으로 확인 가능
- **요소 차단** — 광고 영역 우클릭 → 「이 요소 차단」. 우클릭이 막힌 사이트에서는 팝업의 **「🎯 요소 차단 모드」** 버튼을 누른 뒤, 차단할 요소 위에 마우스를 올리면 **파란 테두리로 하이라이트**되고 클릭하면 차단 목록에 저장됩니다. `ESC`로 취소 가능. 사이트별 저장 (설정 페이지에서 선택자 직접 편집 가능)
- **해외 파일 공유 사이트 차단** — gigafile·gofile·akirabox·buzzheavier의 배너/전면 광고, 팝오버·팝언더, 가짜 다운로드 버튼 차단 (실제 다운로드는 유지)
- **최신 필터 업데이트** — 설정 페이지의 **"최신 필터 업데이트" 버튼을 누를 때만** 실행. 정적 필터 271,415개와 **중복된 도메인은 제외하고 신규 도메인만** 동적으로 등록 (변경 없으면 안내). 정적 필터 자체는 재배포 시 갱신
- **설정 페이지** — 라이트 테마·사이드바(필터 목록/내 차단 목록/**차단 기록**/출처 및 라이선스), 통계 상단 고정, 카테고리 → 소스 2단 토글
- **차단 기록** — 자동 차단 내역을 **네트워크 차단 / DOM 제거로 나누어** 각각 최근 5,000건까지 사이트별로 묶어 표시 (`options/blocked-log-tab.js`). 검색, 펼쳐서 개별 기록 확인 가능. 총 차단 건수는 상단 통계 패널과 중복되므로 이 탭에는 별도 요약을 두지 않습니다. **마지막 차단 시점**은 상단 통계 패널의 「통계 초기화」 버튼 옆에 표시됩니다.
  - 네트워크 기록: 차단된 요청의 주소·시간. `MAX_LOG_ENTRIES`(5,000건)로 조정 가능.
  - DOM 기록: 사이트·제거한 광고 요소 개수·시간. `_domLog` 전용 저장 키(`adBlockerDomLog`)와 `MAX_DOM_LOG_ENTRIES`(5,000건)로 관리하며, 3초 디바운스로 저장.
  - 두 기록은 **저장 키가 분리**되어 있어 서로 용량에 영향을 주지 않습니다. 요소 HTML/선택자는 저장하지 않습니다.
  - 기록이 상한에 도달하면 오래된 순서대로 자동으로 사라집니다. 화면에 표시되는 건수는 현재까지 쌓인 기록이며, 사용 환경에 따라 상한보다 적을 수 있습니다.
  - 총 차단 건수는 기록과 별개로 무제한 누적되며 팝업의 「총 차단」과 동일합니다.
  - **중복 보고 방지**: 광고 제거는 모든 iframe에서 수행하지만, 통계 보고는 최상위 프레임에서만 합니다. 또한 0.4초 안에 들어온 같은 사이트 보고는 개수를 합쳐 한 줄로 기록하므로(예: 4+4+2 → 10개 한 줄), 여러 스크립트가 동시에 보고해도 일지가 깔끔합니다.

## 설치 방법

### ZIP 배포판 (권장)

1. [GitHub Release v0.36](https://github.com/Donian-kor/www_AD_Blocker/releases/tag/v0.36)에서 `www_AD_Blocker-v0.36.zip` 다운로드
2. 압축 해제 (`manifest.json`이 들어있는 폴더 확인)
3. `chrome://extensions/` 접속 → **개발자 모드** ON
4. **압축해제된 확장 프로그램을 로드합니다** → 2번 폴더 선택
5. 이미 열린 탭은 **F5 새로고침**

### 소스에서 설치

1. `git clone` 또는 저장소 다운로드
2. 위 3~5단계 동일하게 진행

> Release ZIP에는 `tools/`, `_metadata/` 등 개발용 파일이 제외되어 있습니다.

## 파일 구조

```
manifest.json          확장 설정(권한, 스크립트, 규칙 세트 37개)
background.js          진입점 — 모듈 로드, 메시지 핸들러, 우클릭 메뉴
background/            state.js(공유 상태) · stats.js(통계·뱃지) · rules.js(DNR 규칙) · filter-updater.js(필터 업데이트)
shared/                filter-converter.js · filter-registry.js · build-meta.js · badge-format.js (빌드/런타임 공용)
options/               main.js · config.js · stats.js · filters-tab.js · blocked-tab.js · licenses-tab.js
youtube-main.js        동영상 사이트 MAIN world 응답 후킹
content.js             동영상 사이트 DOM 정리/광고 스킵
general-blocker.js     일반 사이트 인라인 광고 숨김 (tryblock, dogdrip, d3ward, uBO 테스트)
popunder-blocker.js    skidrowreloaded 클릭 리다이렉트(popunder) 차단 (MAIN world)
filehost-blocker.js    해외 파일 공유 사이트(gigafile/gofile/akirabox/buzzheavier) 광고·팝업·가짜 다운로드 차단
anti-bypass.js         광고 차단 감지 무력화
element-blocker.js     우클릭 요소 차단 + 요소 차단 모드 (하이라이트 선택)
popup.html / popup.js  팝업 UI
options.html           설정 페이지 (options/main.js 모듈 로드)
filters/               DNR 정적 규칙셋 37개 + static-index.json
tools/                 필터 생성기·검증기·테스트 (배포 ZIP 미포함)
_metadata/             DNR 인덱스 캐시 (배포 ZIP 미포함)
```

## 개발

```bash
node tools/build-filters.js --all              # 31개 소스 → 37개 규칙셋 전체 재생성
node tools/build-filters.js --all --offline    # tools/tmp 캐시 사용 (재다운로드 없음)
node tools/build-filters.js --source=noridev   # 특정 소스만 빌드

node tools/validate-rules.js         # 규칙 검증
node tools/test-main-hook.js         # 동영상 사이트 후킹 테스트
node tools/test-site-badge.js        # 사이트별 뱃지 테스트
node tools/test-element-blocker.js   # 우클릭 요소 차단 테스트
node tools/test-filehost-blocker.js  # 해외 파일 공유 사이트 차단 테스트
```

## 테스트 사이트 검증 내역

실제 크롬에서 아래 테스트 사이트들을 열어 차단 동작을 확인하고, 미차단 항목을 규칙에 반영했습니다.

| 사이트 | 테스트 내용 | 결과 / 조치 |
|---|---|---|
| [tryblock.org](https://tryblock.org/ko/adblock-test) | 기본/중급/고급 인라인 DOM 광고 3단계 | 배너·사이드바·스폰서·동적·오버레이·가짜 다운로드·리디렉션 체인 전부 숨김 |
| [tryblock.org 우회](https://tryblock.org/webgeeker/adblock-bypass) | 광고 탐지 우회 챌린지 | 감지 결과 메시지(`.test-area .text-center`) 숨김 |
| [dogdrip.net](https://www.dogdrip.net/) | 실제 한국 커뮤니티 | 고유 광고 마커 `enjgioijew` iframe 차단, 서버 측 "광고 허용" 감지 우회 (분석 스크립트 허용 + 화면 밖 이동) |
| [d3ward.com](https://d3ward.com/adblock) | 135개 도메인/스크립트/코스메틱 | 128 → 133+ 차단. 누락 도메인·`ads.js` 경로·우선순위 수정, d3Host 리스트 통합 |
| [paileactivist/toolz](https://paileactivist.github.io/toolz/adblock.html) | d3ward 구버전 80개 | 88% → 미차단 14개 도메인(Google/Amazon/Facebook/Twitter/Pinterest/Reddit/Apple/Xiaomi) 규칙 추가 |
| [raymondhill.net/ublock](https://raymondhill.net/ublock/tests.html) | uBO 공식 네트워크+코스메틱 | 광고 iframe(`ad.html`) 차단, `#ADSLOT_1` 코스메틱 제거 (대조군 iframe은 유지) |
| [canyoublockit.com](https://canyoublockit.com/testing/) | 셀프호스팅 배너·인터스티셜·네이티브·팝언더·푸시·대체콘텐츠 | 광고 마커(`#adsense`, `#interads*`, `.an-advert-banner` 등) 숨김, 설명용 이미지는 유지 |
| [down.mdiaload.com](https://down.mdiaload.com/download5295101) | 구글 광고 슬롯/iframe + 추적 | 다운로드 대기화면의 `.demand-supply`·`google_ads_iframe_*`·`usrpubtrck.com` 차단 |
| [skidrowreloaded.com](https://www.skidrowreloaded.com/) | 추적 베이트 + 클릭 리다이렉트(popunder) | `usrpubtrck.com` 차단, `aclib.runPop` popunder 무력화 (아무 데나 클릭해도 광고 사이트로 이동 안 함) |
| [obfusgated.com](https://obfusgated.com/tools/ad-block-test) | 267개 도메인 | 55개 미차단 도메인을 `extra-hosts` 규칙셋에 추가 (AppLovin, Vungle, Supersonic, Consent/CMP, Video Ads 등) |
| [ipcheck.ing](https://ipcheck.ing/tools/adblocktest) | 196개 도메인/스크립트 | 26개 미차단 도메인(Pangle, Baidu, LINE, vivo, Amazon devices 등) 추가 |
| [superadblocktest.com](https://superadblocktest.com/) | 482개 도메인 | 105개 미차단 중 신규 48개 추가 (CMP 동의관리, 실험플랫폼, 모바일 애트리뷰션, Live Chat, FreeWheel 등) |
| [gigafile.nu](https://gigafile.nu/) | 배너·전면(인테리셔널) 광고 + Ad-Shield 광고 차단 감지 | 광고 슬롯·iframe·오버레이 제거, Ad-Shield 광고 도메인 차단 (DOM+네트워크 병행) |
| [gofile.io](https://gofile.io/) | 다운로드 페이지 광고 슬롯 | `#ad-slot` 광고 영역 제거, 실제 다운로드 버튼 유지 |
| [akirabox.com](https://akirabox.com/) | 다운로드 클릭 시 가짜 팝업/리다이렉트 | 팝오버·팝언더·외부 광고 링크 차단 |
| [buzzheavier.com](https://buzzheavier.com/) | 팝오버/언더 + 가짜 다운로드 | 팝업/리다이렉트 차단, 실제 다운로드(hx-get /download) 버튼 보존 |
| 동영상 사이트 | 영상 전/중·Shorts·피드·배너 | 광고 필드·DOM 0개, 영상 정상 재생 확인 |

## 보안 관련 사항

- **위험 코드 없음** — `eval`, `new Function`, `document.write`를 사용하지 않습니다. 필터 파일도 실행 코드가 아닌 DNR 차단 규칙으로 변환해 씁니다.
- **XSS 방지** — 차단 로그·출처 표는 `textContent` + DOM API로 렌더링합니다. `innerHTML`은 고정 문자열(빈 로그 안내, 1px GIF)에만 사용합니다.
- **안전한 통신** — 필터 소스 30개 전부 HTTPS이며, 10초 타임아웃·10MB 용량 제한을 적용합니다.
- **최소 노출** — `web_accessible_resources`는 `filters/static-index.json` 하나뿐입니다. 저장소에 API 키·비밀번호·서명 키가 없고, `.gitignore`에 `*.pem`·`*.zip`·`tools/tmp/`를 등록했습니다.
- **MAIN world 제한** — 페이지 영역에 코드를 넣는 스크립트는 동영상 사이트·치지직·skidrowreloaded 3개 사이트에만 주입합니다.
- **토글 메시지 위조 방지** — 격리 세계(content script)가 페이지 로드마다 **랜덤 토큰**을 생성해 DOM에 심고, MAIN world(`youtube-main.js`, `popunder-blocker.js`)는 이 토큰이 일치하는 메시지만 수용합니다. 웹사이트가 고정 문자열(`yab-extension`)만으로 "광고 차단 꺼짐"을 위조할 수 없습니다. (`tools/test-main-hook.js`에 위조 토큰 거부 테스트 포함)

> 참고: 토큰은 같은 페이지의 DOM에 저장되므로, 페이지 스크립트가 의도적으로 읽으면 흉내낼 수 있습니다. 다만 무작위 값이라 사전에 알고 있는 문자열로는 속일 수 없어 위조 난이도가 크게 올라갑니다.

## 자주 묻는 질문 (FAQ)

### 다른 광고 차단기랑 같이 쓰는데 광고가 안 막혀요

광고 차단기는 **하나만 켜 주세요.** 두 개 이상 켜면 서로 방해해서 오히려 광고가 안 막힐 수 있습니다.

먼저 다른 광고 차단기를 꺼 보고, 페이지를 새로고침(F5)해 보세요. 그래도 안 되면 `chrome://extensions`에서 이 확장의 **↻ 새로고침** 버튼을 눌러 주세요.

그래도 안 막히면 **어느 사이트에서 어떤 광고가** 안 막히는지 알려주시면 확인하겠습니다.

## 개선 내역 (버전별)

- **v0.37**: 사이트별 **「광고 허용」 목록(화이트리스트)** 추가 — 팝업의 사이트 토글 또는 설정 페이지의 새 「광고 허용」 탭에서 사이트를 등록하면, 그 사이트의 문서 요청은 네트워크 광고 차단을 건너뜁니다(최대 1,000개 사이트). 허용한 사이트에서도 직접 지정한 **요소 차단**은 그대로 동작하고, 동영상 사이트를 허용하면 광고 차단 훅을 등록하지 않아 재생 방해 요소가 남지 않습니다. 마스터 OFF 시 허용 규칙도 함께 해제되며, 허용 규칙 자리를 확보하기 위해 필터 자동 업데이트 한도를 30,000개에서 28,500개로 조정했습니다.

- **v0.36**: 동영상 사이트 광고 차단 감지 경고·재생 차단 해결 — 광고 소재 도메인을 동영상 사이트 요청에 한해 허용하고 요청 body를 광고 없는 클라이언트로 위조, 텔레메트리 12개 경로 허용, 감지 콜백(`onAbnormalityDetected`)·`[native code]` 검사 타이머 무력화, 자동 음소거 해제. 동영상 사이트에서는 광고 DOM 제거·영상 탐색을 하지 않고 CSS 은닉만 사용. 툴바 뱃지 9999 상한 해소(최대 999B), DOM 차단 수 중복 집계 수정, 뱃지 글자색 흰색 적용.

- **v0.35**: 우클릭이 막힌 사이트용 **요소 차단 모드** 추가 — 팝업 버튼 → 마우스 위 요소가 파란 테두리로 실시간 하이라이트 → 클릭 시 차단, ESC 취소, iframe 포함 모든 프레임 지원. 필터 개수 뱃지에 동적 규칙 수 자동 합산.

- **초기**: `Promise.then` 후킹 무한 재귀 수정, 동영상 사이트 광고 키/Shorts 처리 확대, DOM 전체 제거, Observer 등록 수정, DNR 로드 오류(`||*`·중복 ID) 수정
- **v1.2**: 한국 도메인 + Turtlecute 규칙셋 추가
- **v1.3~v1.5**: 일반 사이트 인라인 광고 차단(`general-blocker.js`), tryblock 3단계/우회 챌린지 대응
- **v1.6~v1.7**: dogdrip 광고 iframe 차단 및 서버 측 감지 우회
- **v1.8~v1.9**: d3ward 테스트 미차단 항목 보완, d3Host 리스트(131개) 통합
- **v2.0**: paileactivist/toolz 미차단 14개 도메인 추가
- **v2.1**: uBO 공식 테스트의 광고 iframe·`#ADSLOT_1` 차단 추가, README 정리
- **v2.2**: canyoublockit 자체 호스팅 광고(배너·인터스티셜·네이티브·팝언더 등) 대응, 토글 ON/OFF 시 페이지 자동 새로고침 및 OFF 시 회색 아이콘 적용
- **v2.3**: down.mdiaload 다운로드 대기화면 구글 광고 슬롯/iframe 차단, `usrpubtrck.com` 추적 도메인 차단 추가
- **v2.4**: skidrowreloaded의 화면 클릭 시 광고 사이트로 이동하는 popunder(`aclib.runPop`)를 MAIN world에서 무력화
- **v2.5**: obfusgated(55)+ipcheck(26) 테스트 미차단 도메인 72개를 `extra-hosts` 규칙셋에 추가 (정적 allow를 덮도록 priority 11 적용)
- **v2.6**: superadblocktest 미차단 105개 중 신규 48개 도메인 추가 (보조 규칙셋 총 454개)
- **v2.7**: 잔여 4개 도메인(`redirector.googlevideo.com`, `analytics.x.com`, `ads.x.com`, `mon.tiktokv.com`) 추가 (총 458개)
- **v2.8**: `redirector.googlevideo.com` 차단 제거 — 동영상 사이트 영상 로딩이 약 5초 지연되는 문제가 확인되어 예외 처리 (나머지 3개는 유지, 총 457개)
- **v2.9**: `s.youtube.com` 차단 제거 — 광고 도메인이 아닌 시청 통계/재생 위치 저장용 telemetry라 차단 불필요 (광고 전용 `ads.youtube.com`은 유지, 총 456개)
- **v3.0**: 해외 파일 공유 사이트(gigafile·gofile·akirabox·buzzheavier) 광고·팝오버/언더·가짜 다운로드 차단 추가 — DNR 광고 도메인 33개 추가, `filehost-blocker.js` 신규 도입 (실제 다운로드 버튼은 보존)
- **v3.1**: 동영상 사이트 홈 그리드에서 광고 렌더러만 제거되어 빈 칸(325×260px)이 남던 문제 수정 — 광고를 감싼 `ytd-rich-item-renderer` 셀째로 숨기고 제거
- **v3.2**: 필터를 6개 그룹(보안/광고/한국/개인정보/광고 감지 대응/성가신요소)으로 재구성, List-KR 추가, 설정 페이지 탭 UI + 라이트 테마, 모듈화(shared/options/background)
- **v3.3**: 최신 필터 업데이트 기능 구현 (버튼 1개, 2단계 교체, 미변경 감지 '신규 업데이트가 없습니다'), 동적 규칙 한도 초과 오류 수정, 보안 필터 첫 행 배치, 통계 패널 재배치(총 차단 강조·재설정 우측), 설정/팝업 라이트 테마 및 배경 박스 제거, 새 아이콘(방패/AD) 적용
- **v0.34**: 설치/재로드 시 자동 업데이트 제거 (버튼 누를 때만 실행되도록 변경), 정적 필터 27만 개(272,248개)와 **중복된 도메인은 동적 등록에서 제외**하고 신규 도메인만 업데이트 (`filters/static-index.json` 인덱스(당시 259,853개 → 현재 268,221개), web_accessible_resources 등록). 실제 테스트에서 29,136개 중복 제거 후 474개 신규만 등록. 인위적 상한 제거, validate-rules 오인 수정. 이후 소스 단위 필터 토글(31소스·37규칙셋), 그룹 간 중복 51,509개 제거(271,415개), Chrome 정적 규칙 한도 대응, background 모듈화, **MAIN world 토글 메시지에 랜덤 토큰 검증 추가**, DOM 제거 기록 추가 및 중복 보고 방지, 차단 기록 탭·팝업 바로가기, 상단 통계 패널에 마지막 차단 시점 표시, 필터 개수 뱃지에 동적 규칙 자동 합산, 사이드바 UI 및 토글 색상 정리

## 참고 자료

- [uBlock Origin / uBOL-home](https://github.com/uBlockOrigin/uBOL-home), [uBlock](https://github.com/gorhill/uBlock) — 동영상 사이트 응답 후킹·필터 기법
- [raymondhill.net/ublock 테스트](https://raymondhill.net/ublock/tests.html) — 네트워크/코스메틱 차단 검증
- [NoriDev-AdBlock-Filter](https://github.com/noridev/NoriDev-AdBlock-Filter), [List-KR](https://github.com/List-KR/List-KR), [filterslists-ko](https://github.com/FilteringDev/filterslists-ko) — 한국 광고 도메인/필터
- [AdAway](https://github.com/AdAway/AdAway), [hagezi/dns-blocklists](https://github.com/hagezi/dns-blocklists) — 호스트 기반 차단 참고 (hagezi는 규모가 커 미포함)
- [Turtlecute Host List](https://adblock.turtlecute.org/d3host.adblock), [d3ward d3Host](https://raw.githubusercontent.com/d3ward/toolz/master/src/d3host.txt) — 호스트 목록 (보조 규칙셋 포함)
- [tryblock.org](https://tryblock.org/ko), [d3ward.com](https://d3ward.com/adblock), [paileactivist/toolz](https://paileactivist.github.io/toolz/adblock.html), [canyoublockit.com](https://canyoublockit.com/testing/), [raymondhill.net/ublock](https://raymondhill.net/ublock/tests.html), [obfusgated.com](https://obfusgated.com/tools/ad-block-test), [ipcheck.ing](https://ipcheck.ing/tools/adblocktest), [superadblocktest.com](https://superadblocktest.com/) — 차단 테스트 사이트

## 라이선스

이 프로젝트는 **CC BY-NC-SA 4.0** (Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International) 라이선스를 따릅니다.

- 저작자를 표시하고 비상업적 용도로 사용하는 한 공유·수정이 가능합니다.
- 수정·변형한 결과물은 동일한 라이선스로 배포해야 합니다.
- 상업적 이용은 별도 문의가 필요합니다.
- 자세한 내용은 [LICENSE](LICENSE) 파일과 [공식 라이선스 전문](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode)을 참고하세요.

> 내장된 필터 데이터(Turtlecute, d3Host)도 CC BY-NC-SA이며, EasyList/EasyPrivacy는 CC BY-SA 3.0입니다. 프로젝트 라이선스를 이에 맞췄습니다.

## 주의

- 통계는 `chrome.declarativeNetRequest.onRuleMatchedDebug`를 사용하므로 **개발자 모드 확장에서만** 동작합니다.
- 사이트별 차단 수는 `chrome.storage.local`의 `siteCounts`, 직접 차단 요소는 `blockedSelectors`에 저장됩니다.
- 정적 규칙 파일 수정 후에는 확장을 **재로드(↻)** 해야 반영됩니다.
- **최신 필터 업데이트**는 정적 필터 271,415개에 없는 **신규 도메인만** 동적으로 등록합니다. 정적 필터 자체는 재배포 시에만 바뀌고, 신규 도메인이 없으면 "신규 업데이트가 없습니다"로 안내합니다.
- 동적 규칙은 확장 삭제 시 초기화됩니다. **재설치 후에는 "최신 필터 업데이트" 버튼을 눌러야** 동적 규칙이 채워집니다 (자동 업데이트 없음).
- `redirector.googlevideo.com`은 동영상 사이트 스트리밍 리다이렉터로, 차단 시 영상 로딩이 지연되어 의도적으로 예외 처리했습니다 (테스트 점수보다 실제 이용 우선).