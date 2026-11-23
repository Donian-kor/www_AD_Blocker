// filehost-blocker.js — 해외 파일 공유 사이트의 광고·팝오버/언더·가짜 다운로드를 차단한다.
// 대상: gigafile.nu, gofile.io, akirabox.com/.to, buzzheavier.com(/bzzhr.to)
// - 광고/추적 iframe·스크립트를 차단하고 DOM에서 제거한다.
// - document.body 클릭/터치로 열리는 팝오버/언더(window.open)를 무력화한다.
// - 다운로드 버튼 클릭 시 발생하는 외부 광고 리다이렉트를 차단한다.
// - 가짜 다운로드 버튼(광고 링크)을 숨기고, 실제 다운로드 버튼은 살려둔다.
(function () {
  "use strict";
  // 광고 제거는 모든 프레임에서 하지만, 통계 보고는 큰 페이지에서만 한다 (중복 방지)
  const IS_TOP_FRAME = typeof window === "undefined" || window === window.top;
  if (typeof location === "undefined") return;

  const host = location.hostname.replace(/^www\./, "");
  const isGigafile = /(^|\.)gigafile\.nu$/.test(host) || /^\d+\.gigafile\.nu$/.test(host);
  const isGofile = /(^|\.)gofile\.(io|to)$/.test(host);
  const isAkira = /(^|\.)akirabox\.(com|to)$/.test(host);
  const isBuzz = /(^|\.)buzzheavier\.com$/.test(host) || /(^|\.)bzzhr\.to$/.test(host);
  if (!isGigafile && !isGofile && !isAkira && !isBuzz) return;
  if (window.__yabFilehostInstalled) return;
  window.__yabFilehostInstalled = true;

  let enabled = true;
  // "광고 허용 사이트"에서는 마스터 토글과 상관없이 끈다.
  let siteAllowed = false;

  // === 광고/추적 도메인 (이들 사이트가 사용하는 광고 네트워크) ===
  // network-level DNR 차단과 별개로, 심층/리다이렉트 복구용으로 프레임·스크립트 제거에 사용
  const AD_HOST_RE = /(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.com|2mdn\.net|googletagservices\.com|adshield|geniee\.jp|genieesspv\.jp|i-mobile\.co\.jp|3-q\.cc|tapad\.com|pubmatic\.com|rubiconproject\.com|openx\.net|adnxs\.com|criteo\.com|taboola\.com|outbrain\.com|mgid\.com|propellerads|propellerclick|adsterra|highperformanceformat|effectivecpmnetwork|profitablecpmrate|clickadu|hilltopads|popads\.net|popcash\.net|onclickads|onclksrv|adcash|exoclick|exosrv|juicyads|admaven|monetag|adskeeper|adpushup|smartadserver|contextweb)/i;

  // === 숨길 광고 컨테이너 선택자 (사이트 공통 + 사이트별) ===
  const COMMON_AD_SELECTORS = [
    "ins.adsbygoogle",
    "[id^='div-gpt-ad']",
    "[id^='google_ads_iframe_']",
    "[id*='google_ads_iframe_']",
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='adshield']",
    "iframe[id^='aswift']",
    "iframe#google_esf",
    "iframe#goog_plcm_frame",
    ".adsbygoogle",
    ".ad-slot",
    "[class*='ad-slot']",
    "[class*='adsbygoogle']",
    "[id*='ad-slot']"
  ];
  const SITE_SELECTORS = [];
  if (isGigafile) {
    // GigaFile: 광고 슬롯/배너/오버레이/전면 interstitial (실제 업로드는 건드리지 않음)
    SITE_SELECTORS.push(
      "#smarttag-adx-inst",
      "#im_interstitial_b",
      ".iminterstitial",
      "#gStickyAd",
      "#gigafile_pc_overlay",
      ".gSticky-slot",
      "[id^='gigafile-slot-']",
      ".banner_type_sky",
      ".banner_type_billboard",
      ".banner_type_336",
      ".banner_type_468",
      "#wrap_banner_billboard",
      ".text-ad",
      ".textAd",
      ".text_ad",
      ".text_ads"
    );
  } else if (isGofile) {
    // Gofile: 광고 슬롯(리디자인으로 숨김 상태지만 명시적으로 차단)
    SITE_SELECTORS.push("#ad-slot", "[id='ad-slot']");
  } else if (isAkira) {
    // AkiraBox: 다운로드 페이지 광고 오버레이/팝업 컨테이너
    SITE_SELECTORS.push(
      "[id*='interstitial']",
      "[class*='interstitial']",
      "[id*='sponsor']",
      "[class*='sponsor']",
      "[id*='sponsored']",
      "[class*='sponsored']"
    );
  } else if (isBuzz) {
    // BuzzHeavier: 광고 오버레이/팝업 컨테이너
    SITE_SELECTORS.push(
      "[id*='modal'][id*='ad']",
      "[class*='advert']",
      "[class*='sponsored']",
      "[class*='ad-overlay']",
      "[id*='overlay'][id*='ad']"
    );
  }
  const ALL_SELECTORS = [...COMMON_AD_SELECTORS, ...SITE_SELECTORS].join(",");
  const STYLE_ID = "yab-filehost-hide-style";

  // === 가짜 다운로드 판별 ===
  // 실제 다운로드 버튼/링크는 보존하고, 광고성 버튼만 숨긴다.
  // "실제 다운로드"로 간주하는 신호 (이 중 하나라도 있으면 보존)
  function isRealDownload(el) {
    if (!el || !el.getAttribute) return false;
    const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").toString().toLowerCase();
    const id = (el.id || "").toLowerCase();
    const txt = (el.textContent || "").toLowerCase();
    const href = (el.getAttribute("href") || "").toLowerCase();
    const hxget = (el.getAttribute("hx-get") || el.getAttribute("data-hx-get") || "").toLowerCase();

    // BuzzHeavier: 실제 다운로드는 hx-get에 /download
    if (isBuzz && /\/download/.test(hxget)) return true;
    // AkiraBox: 실제 다운로드는 "download" 클래스/텍스트 + 내부 경로(/file)
    if (isAkira && /(^|\s|-)download(\s|-|$)/.test(cls + " " + id) && /akirabox|\/download|\/file/i.test(href + " " + hxget)) return true;
    // Gofile: 실제 다운로드는 data-action=download
    if (isGofile && (el.getAttribute("data-action") === "download" || /(^|\s)download/.test(cls))) return true;
    // GigaFile: 실제 다운로드는 / dl. 경로 또는 다운로드 폼
    if (isGigafile && /(\/dl\.|\/download|dl\.gigafile|download\.gif|method=['"]?post)/i.test(href + " " + el.outerHTML.slice(0, 300))) return true;

    // 일반: 다운로드 텍스트/클래스가 있고, href가 광고 도메인이 아니면 실제 다운로드로 본다
    const looksDownload = /download|dl\b|get ?file|다운로드/.test(txt + " " + cls + " " + id);
    if (looksDownload && href && !AD_HOST_RE.test(href) && !/^javascript:/i.test(href) && href !== "#" && !/ads?\b|sponsor|banner|pop/i.test(cls)) {
      return true;
    }
    return false;
  }

  // 광고성(가짜) 다운로드 버튼: href가 광고 도메인, target=_blank로 외부, 또는 onclick으로 팝업
  function isFakeDownload(el) {
    if (!el || !el.getAttribute) return false;
    const href = (el.getAttribute("href") || "");
    const onclick = (el.getAttribute("onclick") || "");
    if (AD_HOST_RE.test(href)) return true;
    if (onclick && /window\.open|popup|popunder/i.test(onclick)) return true;
    return false;
  }

  // === 팝오버/언더 무력화 ===
  // 1) body 클릭/터치로 window.open 호출 → 광고 URL이면 차단
  function blockAdWindowOpen() {
    const nativeOpen = window.open;
    window.open = function (url, name, features) {
      if (!enabled) return nativeOpen.apply(this, arguments);
      try {
        const u = typeof url === "string" ? url : "";
        // 팝오버/언더로 뜨는 광고 도메인, 또는 target="_blank"로 외부 광고
        if (AD_HOST_RE.test(u)) {
          return null; // 광고 창 열기 차단
        }
        // 사용자가 실제로 클릭한 요소가 다운로드 버튼이 아니면(배경 클릭) 팝업 무시
        // 단, 정상적인 새 탭 열기(사용자 의도)는 막지 않도록 최소한만 차단
      } catch (e) {}
      return nativeOpen.apply(this, arguments);
    };
  }

  // 2) target="_blank" 앵커의 광고 링크 클릭 차단 (캡처 단계)
  //    실제 다운로드 버튼은 통과시킨다.
  function isBlockedAnchor(a) {
    if (!a || !a.getAttribute) return false;
    const href = (a.getAttribute("href") || "");
    if (AD_HOST_RE.test(href)) return true;
    // 다운로드가 아닌데 target=_blank로 외부 광고 페이지로 → 차단
    const txt = (a.textContent || "").toLowerCase();
    if (a.target === "_blank" && /^https?:/i.test(href) && !isRealDownload(a)) {
      // onclick로 팝업을 여는 경우도 포함
      const onclick = (a.getAttribute("onclick") || "").toLowerCase();
      if (/window\.open|popup|popunder/.test(onclick)) return true;
    }
    return false;
  }

  function onDocumentClick(e) {
    if (!enabled) return;
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a && isBlockedAnchor(a)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // === DOM 제거 ===
  let removedCount = 0;
  function removeAds() {
    if (!enabled) return;
    let removed = 0;
    const kinds = {};
    try {
      document.querySelectorAll(ALL_SELECTORS).forEach((el) => {
        if (el && el.parentNode) {
          const kind = (self.BlockCategory && self.BlockCategory.elementKind(el)) || "other";
          kinds[kind] = (kinds[kind] || 0) + 1;
          el.remove();
          removed++;
        }
      });
      // 가짜 다운로드 버튼(광고 링크) 숨김
      document.querySelectorAll("a, button").forEach((el) => {
        if (isFakeDownload(el) && !isRealDownload(el)) {
          // 광고 버튼만 제거
          if (el.parentNode) {
            kinds.fakeButton = (kinds.fakeButton || 0) + 1;
            el.remove();
            removed++;
          }
        }
      });
    } catch (e) {}
    if (removed > 0) {
      removedCount += removed;
      if (!IS_TOP_FRAME) return; //iframe에서는 제거만 하고 보고는 하지 않음
      try {
        chrome.runtime.sendMessage({ type: "adRemoved", count: removed, kinds, source: "filehost" }, () => {
          void chrome.runtime.lastError;
        });
      } catch (e) {}
    }
  }

  // === 스타일 주입 (깜빡임 방지) ===
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ALL_SELECTORS + "{display:none !important;height:0 !important;overflow:hidden !important}";
    (document.head || document.documentElement).appendChild(style);
  }

  function applyEnabled(value) {
    enabled = value !== false && !siteAllowed;
    const style = document.getElementById(STYLE_ID);
    if (style) style.disabled = !enabled;
  }

  // === 토글 연동 ===
  try {
    chrome.storage.local.get(["adBlockerEnabled", "allowedSites"], (res) => {
      // 허용 사이트면 광고 요소를 숨기지 않는다.
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
  } catch (e) {}

  injectStyle();

  // 이벤트 가드 등록
  blockAdWindowOpen();
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("touchend", onDocumentClick, true);

  // MutationObserver: 동적 추가 광고 제거
  const observer = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(observer._t);
    observer._t = setTimeout(removeAds, 250);
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true });

  window.addEventListener("DOMContentLoaded", () => setTimeout(removeAds, 300));
  setTimeout(removeAds, 800);
})();