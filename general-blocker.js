// general-blocker.js — 일반 웹사이트의 인라인 DOM 광고를 CSS로 숨긴다.
// tryblock.org 계열 테스트 페이지와, 흔히 쓰이는 광고 클래스/속성을 대상으로 한다.
// DNR(네트워크 차단)로 잡히지 않는 페이지 내부 광고를 여기서 처리한다.
(function () {
  "use strict";
  // 광고 제거는 모든 프레임에서 하지만, 통계 보고는 큰 페이지에서만 한다 (중복 방지)
  const IS_TOP_FRAME = typeof window === "undefined" || window === window.top;
  if (typeof location === "undefined") return;
  // 유튜브는 content.js/youtube-main.js가 전담하므로 중복 처리하지 않는다.
  // (광고 요소를 general-blocker가 먼저 지우면 유튜브의 감지 로직이 오작동한다)
  if (/(^|\.)youtube\.com$/.test(location.hostname)) return;
  if (window.__yabGeneralInstalled) return;
  window.__yabGeneralInstalled = true;

  let enabled = true;
  // "광고 허용 사이트"에서는 마스터 토글과 상관없이 이 스크립트를 끈다.
  let siteAllowed = false;

  // 숨길 광고 선택자. 광고 전용 클래스/속성만 골라 오차단을 줄인다.
  const SELECTORS = [
    // tryblock.org 기본/중급/고급 테스트
    ".ad-container", ".banner-ad", ".demo-ad", ".ad-content", ".ad-label",
    ".ad-button", ".banner-container", ".banner-image", ".banner-content",
    ".banner-title", ".banner-description", ".sidebar-ad", ".sponsored-content",
    ".sponsored-container", ".sponsored-image", ".sponsored-title",
    ".sponsored-description", ".sponsored-footer", ".advertiser",
    ".inline-ad-container", ".inline-ad-wrapper", ".inline-ad-content",
    ".dynamic-ad", ".interactive-ad", ".floating-ad", ".video-overlay-ad",
    ".overlay-content", ".overlay-message", ".deceptive-ad", ".popup-chain",
    ".popup-preview", ".anti-adblock-test", ".anti-adblock-message",
    ".fake-download-button", ".fake-alert", ".fake-redirect",
    ".trigger-popup", ".fake-close-button",
    // 악성 리디렉션 체인 (고급 테스트)
    ".redirect-test", ".redirect-preview", ".redirect-icon",
    // 광고 차단 우회 챌린지의 감지 결과 메시지
    ".test-area .text-center", ".test-area .text-red-400",
    // 일반 사이트에서 흔한 광고 클래스
    ".adsbygoogle", ".advertisement", ".advert", ".ad-banner", ".ad-slot",
    ".ad-wrapper", ".ad-unit", ".ad-overlay", ".ad-modal", ".ad-popup",
    ".sponsor", ".promoted", "[data-ad]", "[data-ad-slot]",
    "[aria-label='advertisement']", "ins.adsbygoogle",
    "iframe[src*='googlesyndication']", "iframe[src*='doubleclick']",
    // dogdrip.net 전용 광고 슬롯 (고유 마커 enjgioijew + 좌측 배너 클래스)
    "iframe[enjgioijew]", ".clayerbox-left-ad", ".clayerbox-right-ad",
    // d3ward.com 코스메틱 필터 테스트 대상
    "#cts_test", "#ad_ctd",
    // raymondhill.net/ublock 코스메틱 필터 테스트 대상 (광고 슬롯만, 대조군 iframe은 유지)
    "#ADSLOT_1",
    // canyoublockit.com 자체 호스팅 광고 (설명용 이미지는 건드리지 않고 광고 마커만)
    "#adsense.an-sponsored", ".an-advert-banner",
    "#interads", "#interads-bar", "#interads-cnt", "#interads-tit",
    ".interads-close", ".interads-kkcount-down",
    ".fluid_controls_ad_markers_holder", ".sg-popup-id-6",
    // down.mdiaload.com 구글 광고 슬롯/iframe + 추적 베이트
    ".demand-supply", "iframe[id^='google_ads_iframe_']",
    "[id*='google_ads_iframe_']", "[id^='mdiaload.com_']",
    // 해외 파일 공유 사이트(gigafile/gofile/akirabox/buzzheavier) 광고 컨테이너
    // - gigafile: 광고 슬롯/배너/오버레이
    "#smarttag-adx-inst", "#im_interstitial_b", ".iminterstitial", "#gStickyAd",
    "#gigafile_pc_overlay", ".gSticky-slot", "[id^='gigafile-slot-']",
    ".banner_type_sky", ".banner_type_336", ".banner_type_468",
    "#wrap_banner_billboard", ".text-ad", ".textAd", ".text_ad",
    // - gofile: 광고 슬롯
    "#ad-slot", "[id='ad-slot']",
    // - akirabox/buzzheavier: 광고 오버레이/스폰서
    "[class*='advert']", "[class*='sponsored']", ".ad-overlay",
    // chzzk.naver.com 전용 — 치지직 동영상/방송 광고 (플레이어 제외, 광고 마커만)
    // 실제 DOM 확인(2026-11-20): webplayer-internal-core-ad-ui = 광고 UI,
    // pzp-ad-break-indicator = "광고 후 계속됩니다", pzp-pc__midroll-dim = 미드롤 딤
    "[class*='ad-banner']", "[class*='ad-overlay']", "[class*='ad-video']",
    "[class*='advertisement']", "[class*='sponsor-banner']",
    "[data-ad-type]", "[data-ad-slot]", "[data-ad-area]",
    "[class*='ad_marker']", "[class*='ad-marker']",
    ".webplayer-internal-core-ad-ui",
    ".pzp-ad-break-indicator", ".pzp-pc__ad-break-indicator",
    ".pzp-pc__midroll-dim", ".pzp-midroll-dimmed",
    "[data-nlog-area='event_popup']"
  ].join(",");

  const STYLE_ID = "yab-general-hide-style";
  const RULE = SELECTORS + "{display:none !important;visibility:hidden !important;opacity:0 !important;height:0 !important;overflow:hidden !important}";

  // dogdrip.net은 광고 영역이 "보이는 상태"여야 서버가 정상 이용자로 판단한다.
  // display:none 대신 화면 밖으로 밀어내 광고는 안 보이게 하되, 감지 스크립트는 속인다.
  const DOGDRIP_HIDE_SELECTORS = "iframe[enjgioijew],.clayerbox-left-ad,.clayerbox-right-ad,.ddnad-wrapper,ins.kakao_ad_area,.ddnad";
  const DOGDRIP_RULE = DOGDRIP_HIDE_SELECTORS +
    "{position:absolute !important;left:-99999px !important;top:-99999px !important;visibility:visible !important;opacity:0 !important;pointer-events:none !important}";
  const isDogdrip = /(^|\.)dogdrip\.net$/.test(location.hostname);

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = isDogdrip ? DOGDRIP_RULE : RULE;
    (document.head || document.documentElement).appendChild(style);
  }

  function applyEnabled(value) {
    enabled = value !== false && !siteAllowed;
    const style = document.getElementById(STYLE_ID);
    if (style) style.disabled = !enabled;
  }

  // 저장된 토글 상태 로드 + 변경 감지
  try {
    chrome.storage.local.get(["adBlockerEnabled", "allowedSites"], (res) => {
      // 허용 사이트면 광고 요소를 숨기지 않는다.
      // (스타일은 그려지기 전에 이미 주입했으므로 여기서 끈다)
      siteAllowed = !!(self.YabAllowlist &&
        self.YabAllowlist.isAllowed(self.YabAllowlist.topHostname(), res.allowedSites || []));
      applyEnabled(res.adBlockerEnabled !== undefined ? res.adBlockerEnabled : true);
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.adBlockerEnabled) applyEnabled(changes.adBlockerEnabled.newValue);
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "toggle") applyEnabled(message.enabled);
    });
  } catch (e) {
    // storage 접근 불가 시 기본 활성 유지
  }

  injectStyle();

  // 동적으로 추가되는 광고 요소도 숨긴다 (스타일은 이미 !important라 새 요소도 바로 적용됨)
  // 추가로 DOM에서 완전히 제거해 체크/카운팅 로직이 오인하지 않게 한다.
  let removedCount = 0;
  function removeAds() {
    if (!enabled) return;
    // dogdrip은 광고 요소를 DOM에 남겨야 서버 감지를 우회할 수 있다 (CSS 숨김만 적용)
    if (isDogdrip) return;
    let removed = 0;
    const kinds = {};
    try {
      document.querySelectorAll(SELECTORS).forEach((el) => {
        if (el && el.parentNode) {
          // 원본 class/id는 저장하지 않고 종류 코드만 남긴다.
          const kind = (self.BlockCategory && self.BlockCategory.elementKind(el)) || "other";
          kinds[kind] = (kinds[kind] || 0) + 1;
          el.remove();
          removed++;
        }
      });
    } catch (e) {}
    if (removed > 0) {
      removedCount += removed;
      if (!IS_TOP_FRAME) return; //iframe에서는 제거만 하고 보고는 하지 않음
      try {
        chrome.runtime.sendMessage({ type: "adRemoved", count: removed, kinds, source: "general" }, () => {
          void chrome.runtime.lastError;
        });
      } catch (e) {}
    }
  }

  const observer = new MutationObserver(() => {
    if (!enabled) return;
    // 스타일이 이미 숨기므로 제거는 여유 있게 배치 처리
    clearTimeout(observer._t);
    observer._t = setTimeout(removeAds, 250);
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true });

  window.addEventListener("DOMContentLoaded", () => setTimeout(removeAds, 300));
  setTimeout(removeAds, 800);
})();
