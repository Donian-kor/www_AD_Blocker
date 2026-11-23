// anti-bypass.js — 광고 차단 감지(anti-adblock) 무력화 후킹 (AakScript 기반 강화)
// 전체 사이트(http/https) document_start에서 가장 먼저 실행
(function () {
  "use strict";
  // 유튜브는 youtube-main.js / content.js가 전담하므로 건너뜀.
  // (getComputedStyle 래핑·bait 요소 삽입·console 래핑은 유튜브 광고 차단 감지의 신호가 된다)
  if (typeof location !== "undefined" && /(^|\.)youtube\.com$/.test(location.hostname)) return;

  // ============================================================
  // 1. AakScript 기반 fakeFuckAdBlock 인스턴스 생성
  //    많은 사이트가 window.fuckAdBlock 또는 유사 객체로 감지함
  // ============================================================
  (function () {
    function FakeClass(instanceName, className) {
      var self = this;
      var callNotDetected = false;
      this.debug = {
        set: function () { return self; },
        get: function () { return false; }
      };
      this.onDetected = function (cb) { this.on(true, cb); return this; };
      this.onNotDetected = function (cb) { this.on(false, cb); return this; };
      this.on = function (detected, cb) {
        if (!detected) {
          callNotDetected = cb;
          setTimeout(cb, 1); // "감지되지 않았음" 콜백 즉시 실행
        }
        return this;
      };
      this.setOption = function () { return this; };
      this.options = {
        set: function () { return self; },
        get: function () { return false; }
      };
      this.check = function () {
        if (callNotDetected) callNotDetected();
      };
      this.emitEvent = function () { return this; };
      this.clearEvent = function () {};
    }

    try {
      Object.defineProperty(window, "fuckAdBlock", {
        value: new FakeClass(),
        configurable: false,
        writable: false
      });
    } catch (e) {}

    try {
      Object.defineProperty(window, "FuckAdBlock", {
        value: FakeClass,
        configurable: false,
        writable: false
      });
    } catch (e) {}
  })();

  // ============================================================
  // 2. bait 요소 생성 (AakScript addBaitElement 방식 강화)
  //    광고 감지 스크립트가 숨겨진 bait 요소를 찾아 차단 여부를 판단함
  // ============================================================
  var baitConfigs = [
    { tag: "div", attrs: { class: "ads" } },
    { tag: "span", attrs: { id: "ads" } },
    { tag: "div", attrs: { class: "ad-banner" } },
    { tag: "div", attrs: { id: "ad-content" } },
    { tag: "div", attrs: { class: "ad-slot" } },
    { tag: "div", attrs: { class: "ad-container" } },
    { tag: "div", attrs: { class: "advert" } }
  ];
  baitConfigs.forEach(function (cfg) {
    try {
      var bait = document.createElement(cfg.tag);
      for (var k in cfg.attrs) {
        if (cfg.attrs.hasOwnProperty(k)) bait.setAttribute(k, cfg.attrs[k]);
      }
      bait.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;";
      bait.innerHTML = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="width:1px;height:1px;">';
      (document.head || document.documentElement).appendChild(bait);
    } catch (e) {}
  });

  // ============================================================
  // 3. 광고 로딩 감지 함수 오버라이드
  // ============================================================
  try {
    Object.defineProperty(window, "google_adsbygoogle_loaded", {
      get: function () { return true; },
      set: function () {},
      configurable: false
    });
  } catch (e) {}

  // ============================================================
  // 4. getComputedStyle 오버라이드 — 광고 요소를 항상 "보임"으로 반환
  // ============================================================
  (function () {
    var nativeGetComputed = window.getComputedStyle;
    window.getComputedStyle = function (elt, pseudoElt) {
      var style = nativeGetComputed ? nativeGetComputed.call(window, elt, pseudoElt) : elt.currentStyle ? elt.currentStyle : {};
      if (elt && elt.tagName) {
        var text = ((elt.id || "") + " " + (elt.className || "") + " ").toLowerCase();
        if (/(^|[\s_-])(ad|ads|advert|banner|sponsor|promo)([\s_-]|$)/.test(text)) {
          var proxyStyle = Object.create ? Object.create(style) : {};
          // Proxy 대신 직접 속성 덮어쓰기
          try {
            style.display = "block";
            style.visibility = "visible";
            style.opacity = "1";
          } catch (e) {}
        }
      }
      return style;
    };
  })();

  // ============================================================
  // 5. chrome.runtime 존재 감지 무력화
  // ============================================================
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      sendMessage: function () {},
      connect: function () { return { postMessage: function () {}, disconnect: function () {} }; },
      onMessage: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } },
      getURL: function () { return ""; },
      getManifest: function () { return {}; },
      onInstalled: { addListener: function () {} },
      onStartup: { addListener: function () {} }
    };
  }

  // ============================================================
  // 6. console 덮어쓰기 감지 무력화 (원본 유지)
  // ============================================================
  (function () {
    var nativeLog = console.log;
    console.log = function () {
      try { nativeLog.apply(console, arguments); } catch (e) {}
    };
  })();

  // ============================================================
  // 7. 광고 차단 감지 요소 자동 제거 (간단 버전)
  //    허용 사이트에서는 실행하지 않는다 (파일 끝 호출부 참고)
  // ============================================================
  function hideAdblockWarnings() {
    var selectorsToHide = [
      ".anti-adblock", "#anti-adblock", ".adblock-warning",
      ".adblock-detected", "#adblock-detected", ".disable-adblock",
      ".ddnad-wrapper", "ins.adsbygoogle", "[class*='adsbygoogle']",
      "iframe[src*='googlesyndication']", "iframe[src*='doubleclick']",
      // List-KR / NoriDev Adblock Warning Removal List 참고 확장
      "#adblock-modal", "#adBlockAlert", "#adblockDetect", "#ad_blocker",
      "#adb-warning", "#adblock-overlay", "#adblock_tooltip", "#anti_adblock",
      ".ad-block-detected", ".adblock-notice", ".adblocker-message",
      ".adblock-modal", ".adblock-overlay", ".ads-blocked",
      "[class*='adblock-warning']", "[id*='adblock-detected']",
      // tryblock.org 광고 차단 우회 챌린지의 감지 결과 메시지
      ".test-area .text-center", ".test-area .text-red-400"
    ];
    var observer = new MutationObserver(function () {
      selectorsToHide.forEach(function (sel) {
        try {
          document.querySelectorAll(sel).forEach(function (el) {
            el.style.display = "none";
            el.style.visibility = "hidden";
          });
        } catch (e) {}
      });
    });
    try {
      // document_start 시점에는 documentElement/body가 아직 없을 수 있다.
      // document는 항상 존재하므로 이를 감시해 이후 추가되는 노드를 놓치지 않는다.
      observer.observe(document, { childList: true, subtree: true });
    } catch (e) {}
  }

  // ============================================================
  // 8. dogdrip.net 전용 지속 차단 규칙 (CSS 강제 적용)
  // ============================================================
  function hideAdSlots() {
    var css = 
      '.ddnad-wrapper, .ddnad-wrapper * { display:none !important; visibility:hidden !important; height:0 !important; overflow:hidden !important; } ' +
      'ins.adsbygoogle, ins.adsbygoogle * { display:none !important; visibility:hidden !important; height:0 !important; overflow:hidden !important; } ' +
      'iframe[src*="googlesyndication"], iframe[src*="doubleclick"], iframe[src*="googleads"] { display:none !important; visibility:hidden !important; } ';
    try {
      var style = document.createElement('style');
      style.type = 'text/css';
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}

    // MutationObserver만 사용하여 새로 추가되는 요소 숨김 (CPU/네트워크 부담 최소)
    // setInterval 제거 — 지속 감시는 observer가 담당
  }

  // 허용 사이트(광고 허용)에서는 광고 요소·경고를 숨기지 않는다.
  // 1·4·5·6(감지 무력화)은 광고를 가리지 않으므로 그대로 두고,
  // 실제로 광고를 가리는 7·8만 건너뛴다.
  function hideExtras() {
    hideAdblockWarnings();
    hideAdSlots();
  }

  if (self.YabAllowlist && self.YabAllowlist.runUnlessAllowed) {
    self.YabAllowlist.runUnlessAllowed(hideExtras);
  } else {
    hideExtras();
  }
})();
