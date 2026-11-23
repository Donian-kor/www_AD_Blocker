// www_AD_Blocker - Content Script
// YouTube 페이지에 주입되어 광고를 CSS로 숨기고 통계를 보고한다.
// 광고를 DOM에서 제거하거나 video 재생 위치를 조작하면 유튜브 광고 차단 감지에
// 노출되므로, 화면 은닉은 CSS에만 맡긴다. (AdGuard AdBlock Ultimate 과 같은 방식)

(function () {
  "use strict";
  // 통계 보고는 큰 페이지에서만 (중복 방지)
  const IS_TOP_FRAME = typeof window === "undefined" || window === window.top;
  // 유튜브 스튜디오는 광고 차단 대상이 아니므로 건너뜀
  if (typeof location !== "undefined" && location.hostname === "studio.youtube.com") return;

  // === 활성화 상태 관리 ===
  // 주의: 여기에 "이 확장"을 식별할 수 있는 흔적을 남기면 유튜브 광고 차단 감지에
  // 그대로 노출된다. 과거에는 <html> 에 data-yab-* 속성을 심고
  // window.postMessage({source:"yab-extension"}) 을 방송했는데, 페이지의 어떤
  // 스크립트든 이 두 가지를 1줄로 읽어 확장을 특정할 수 있었다.
  // MAIN world 스크립트와의 통신이 필요 없어져(스크립틀릿 미사용) 전부 제거했다.
  let enabled = true;
  // "광고 허용 사이트"에서는 마스터 토글과 상관없이 끈다.
  let siteAllowed = false;
  let hideStyle = null;

  function applyEnabled(value) {
    enabled = value !== false && !siteAllowed;
    if (hideStyle) hideStyle.disabled = !enabled;
  }

  function loadEnabled() {
    chrome.storage.local.get(["adBlockerEnabled", "allowedSites"], (result) => {
      siteAllowed = !!(self.YabAllowlist &&
        self.YabAllowlist.isAllowed(self.YabAllowlist.topHostname(), result.allowedSites || []));
      applyEnabled(result.adBlockerEnabled !== undefined ? result.adBlockerEnabled : true);
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.adBlockerEnabled) {
      applyEnabled(changes.adBlockerEnabled.newValue);
    }
  });

  // 팝업에서 오는 toggle 메시지 수신
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "toggle") {
      applyEnabled(message.enabled);
    }
  });

  // === CSS로 광고 요소 즉시 숨김 (그려지기 전에 차단해 깜빡임 방지) ===
  // style 요소에 id 를 붙이지 않는다. id 는 페이지에서 getElementById 로
  // 바로 조회되므로 확장 식별 표식이 된다. 참조는 클로저 변수로만 유지한다.
  function injectAdStyles() {
    if (hideStyle) return;
    const style = document.createElement("style");
    hideStyle = style;
    const adSelectors = [
      "#masthead-ad",
      "#player-ads",
      "ytd-ad-slot-renderer",
      "ytd-promoted-sparkles-web-renderer",
      "ytd-promoted-video-renderer",
      "ytd-in-feed-ad-layout-renderer",
      "ytd-display-ad-renderer",
      "ytd-banner-promo-renderer",
      "ytd-companion-slot-renderer",
      "ytd-merch-shelf-renderer",
      "ytd-inline-survey-renderer",
      "ytm-ad-banner-renderer",
      ".ytp-ad-overlay-container",
      ".ytp-ad-overlay-slot",
      ".ytp-ad-player-overlay",
      ".ytp-ad-progress-list",
      "[data-ad-t]",
      "[data-ad-slot]"
    ];
    // 유튜브 홈 그리드의 광고는 ytd-rich-item-renderer 셀 안에 들어 있다.
    // 광고 렌더러만 숨기면 셀이 빈 채로 남아 325x260px 공간이 보이므로 셀째로 숨긴다.
    const adGridCellSelector = "ytd-rich-item-renderer:has(ytd-ad-slot-renderer," +
      "ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer," +
      "ytd-in-feed-ad-layout-renderer,ytd-display-ad-renderer," +
      "ytd-banner-promo-renderer,[data-ad-slot])";
    style.textContent = adSelectors.join(",") + "," + adGridCellSelector + "{display:none !important}";
    (document.head || document.documentElement).appendChild(style);
  }

  injectAdStyles();

  // === 광고 DOM 제거 ===
  const AD_SELECTORS = [
    // 데스크탑 유튜브 광고
    "#masthead-ad",
    "#player-ads",
    "ytd-ad-slot-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-display-ad-renderer",
    "ytd-banner-promo-renderer",
    "ytd-companion-slot-renderer",
    // 모바일/공통
    ".ytm-ad-banner-renderer",
    ".ad-banner",
    ".video-ads",
    ".ytp-ads-dialog",
    ".ytp-ad-overlay",
    ".ytp-ad-overlay-container",
    ".ytp-ad-image-overlay",
    ".ytp-ad-text-overlay",
    ".ytp-ad-button",
    ".ad-interrupting",
    "#player .ytp-ad-player-overlay",
    "#ad-player",
    ".html5-video-player .ad-",
    ".ytp-progress-list .ytp-ad",
    ".ytm-ad-slot-renderer",
    ".ytm-promoted-sparkles-video-renderer",
    ".ad-card",
    ".ads-card",
    ".skip-ads-button",
    ".ytp-button.ad-skip-button",
    ".ytm-ad-list-renderer",
    ".video-renderer .ad-badge",
    ".ad-under-video",
    ".ytp-ads",
    ".ytm-ad-player-overlay",
    // 최신 레이아웃 / 공통 광고 속성
    "ytd-merch-shelf-renderer",
    "ytd-inline-survey-renderer",
    ".ytp-ad-progress-list",
    "[data-ad-t]",
    "[data-ad-slot]"
  ];

  let removedCount = 0;

  // 유튜브 광고는 DOM에서 지우지 않고 "감지"만 한다.
  // 광고 요소를 remove() 하거나 video.currentTime 을 조작하는 동작은
  // 유튜브의 광고 차단 감지에 그대로 노출되어 경고를 유발한다.
  // (AdGuard AdBlock Ultimate 도 유튜브에서 DOM 제거·탐색 하지 않고 CSS 은닉만 한다.)
  // 실제 화면 은닉은 위 injectAdStyles()의 CSS가 담당한다.
  //
  // 이미 센 요소는 다시 세지 않는다. (WeakSet 으로 중복 방지)
  // 요소를 DOM 에서 지우지 않기 때문에, 중복 검사를 하지 않으면
  // 2초마다 같은 광고가 계속 다시 잡혀 숫자가 무한히 올라간다.
  // WeakSet 은 요소가 문서에서 사라지면 자동으로 정리되어 메모리 누수도 없다.
  const countedAds = new WeakSet();

  function countAds(selector) {
    let found;
    try {
      found = document.querySelectorAll(selector);
    } catch (e) {
      return 0; // 잘못된 선택자는 무시
    }
    let added = 0;
    for (const el of found) {
      if (countedAds.has(el)) continue; // 이미 센 요소
      countedAds.add(el);
      added++;
    }
    if (added > 0) removedCount += added;
    return added > 0;
  }

  function cleanupAds() {
    if (!enabled) return;
    AD_SELECTORS.forEach(countAds);
  }

  // === 영상 광고 자동 스킵은 하지 않는다 ===
  // "건너뛰기 버튼 클릭"과 "광고 끝으로 이동(video.currentTime 조작)"은 둘 다
  // 광고가 정상 재생되지 않았다는 명백한 신호라 유튜브 광고 차단 감지에 노출된다.
  // 프리롤 광고는 youtube-main.js가 플레이어 응답에서 광고 데이터를 걷어내 처리한다.

  // === MutationObserver ===
  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    let changed = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        changed = true;
        break;
      }
    }
    if (changed) {
      setTimeout(cleanupAds, 300);
      setTimeout(cleanupAds, 1000);
    }
  });

  // content.js가 document_start에 실행되므로 이 시점엔 document.body가 없을 수 있다.
  // body가 준비된 뒤 observe 한다 (없으면 documentElement로 대체).
  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) return false;
    try {
      observer.observe(target, { childList: true, subtree: true });
      return true;
    } catch (e) {
      return false;
    }
  }
  if (!startObserver()) {
    const retry = () => {
      if (startObserver()) {
        document.removeEventListener("readystatechange", retry);
      }
    };
    document.addEventListener("readystatechange", retry);
  }

  // 그리드 셀 정리도 하지 않는다. (general-blocker.js 가 유튜브에서 꺼져 있어
  // 셀이 비는 상황 자체가 발생하지 않고, DOM 조작은 감지 신호가 된다.)

  // 주기적 재확인 (DOM 을 건드리지 않고 개수만 센다)
  setInterval(() => {
    cleanupAds();
  }, 2000);

  // 초기 실행
  setTimeout(() => {
    cleanupAds();
  }, 1000);

  // YouTube SPA 네비게이션 감지
  let lastUrl = location.href;
  const navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(cleanupAds, 1500);
    }
  });
  // document_start 시점엔 document.body가 없을 수 있어 준비된 뒤 observe 한다.
  function startNavObserver() {
    const target = document.body || document.documentElement;
    if (!target) return false;
    try {
      navObserver.observe(target, { subtree: true, childList: true });
      return true;
    } catch (e) {
      return false;
    }
  }
  if (!startNavObserver()) {
    const retryNav = () => {
      if (startNavObserver()) document.removeEventListener("readystatechange", retryNav);
    };
    document.addEventListener("readystatechange", retryNav);
  }

  // 제거된 광고 수를 주기적으로 background에 보고 (에러 핸들링 추가)
  setInterval(() => {
    if (!enabled) return;
    if (removedCount > 0) {
      const reportCount = removedCount;
      removedCount = 0;
      if (!IS_TOP_FRAME) return; //iframe에서는 제거만 하고 보고는 하지 않음
      try {
        chrome.runtime.sendMessage({
          type: "adRemoved",
          count: reportCount,
          kinds: { video: reportCount },
          source: "video",
        }, () => {
          // chrome.runtime.lastError 무시 (background가 종료된 경우 등)
          if (chrome.runtime.lastError) {
            // 조용히 실패 처리
          }
        });
      } catch (e) {
        // 메시지 전송 실패 시 무시
      }
    }
  }, 3000);

  // 초기 상태 로드
  loadEnabled();
  console.log("www_AD_Blocker: 활성화됨");
})();