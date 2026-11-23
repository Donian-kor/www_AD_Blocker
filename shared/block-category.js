// shared/block-category.js - 차단 기록 분류 (네트워크 / DOM)
// background(importScripts)와 설정 페이지(ES module)에서 함께 쓴다.
// 분류는 "어떤 목록/규칙이 막았는지" + URL 단서에 기반한 추정이며,
// 스크립트 내용을 분석한 결과는 아니다.

(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BlockCategory = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 네트워크 차단 카테고리
  const CATEGORIES = {
    ads:        { label: "광고",           color: "#e94560", bg: "#ffedf0" },
    privacy:    { label: "개인정보 추적",   color: "#b45309", bg: "#fff7ed" },
    malware:    { label: "악성코드·피싱",   color: "#b91c1c", bg: "#fef2f2" },
    anti:       { label: "차단 우회",       color: "#7c3aed", bg: "#f5f3ff" },
    annoyance:  { label: "성가신 요소",     color: "#0369a1", bg: "#f0f9ff" },
    mining:     { label: "크립토재킹",      color: "#a16207", bg: "#fefce8" },
    custom:     { label: "직접 차단",       color: "#475569", bg: "#f1f5f9" },
    unknown:    { label: "미분류",          color: "#64748b", bg: "#f1f5f9" },
  };

  // 규칙셋 ID -> 카테고리. manifest의 rule_resources id를 그대로 사용한다.
  const RULESET_CATEGORY = {
    // 광고
    noridev_1: "ads", turtlecute_1: "ads", d3host_1: "ads",
    "list-kr_1": "ads", "filterslists-ko_1": "ads", "extra-hosts_1": "ads",
    easylist_1: "ads", easylist_2: "ads", ultimate_1: "ads",
    "peter-lowe_1": "ads",
    "uassets-filters_1": "ads", "uassets-general_1": "ads",
    "uassets-2024_1": "ads", "uassets-2025_1": "ads", "uassets-2026_1": "ads",
    // 개인정보 추적
    easyprivacy_1: "privacy", easyprivacy_2: "privacy",
    "url-tracking_1": "privacy", "uassets-privacy_1": "privacy",
    "fanboy-social_1": "privacy",
    // 성가신 요소
    "fanboy-annoyance_1": "annoyance",
    // 보안
    urlhaus_1: "malware", urlhaus_2: "malware", urlhaus_3: "malware",
    urlhaus_4: "malware", urlhaus_5: "malware",
    "uassets-badware_1": "malware", "uassets-resource-abuse_1": "malware",
    nocoin_1: "mining",
    // 차단 우회 감지
    "anti-cv-en_1": "anti", "anti-cv-zh_1": "anti", "anti-cv-cs_1": "anti",
    "anti-cv-fr_1": "anti", "anti-cv-de_1": "anti", "anti-cv-pl_1": "anti",
    "anti-cv-ru_1": "anti", "anti-cv-es_1": "anti",
  };

  // DOM 제거 종류
  const DOM_KINDS = {
    banner:      { label: "배너·인라인",       color: "#e94560", bg: "#ffedf0" },
    overlay:     { label: "오버레이·전면",     color: "#7c3aed", bg: "#f5f3ff" },
    popup:       { label: "팝업·모달",         color: "#0369a1", bg: "#f0f9ff" },
    fakeButton:  { label: "가짜 다운로드 버튼", color: "#b45309", bg: "#fff7ed" },
    redirect:    { label: "리다이렉트 유도",   color: "#b91c1c", bg: "#fef2f2" },
    video:       { label: "동영상 광고",       color: "#be185d", bg: "#fdf2f8" },
    antiAdblock: { label: "차단감지 우회",     color: "#7c3aed", bg: "#f5f3ff" },
    tracking:    { label: "추적 베이트",       color: "#b45309", bg: "#fff7ed" },
    other:       { label: "기타",              color: "#64748b", bg: "#f1f5f9" },
  };

  const DOM_SOURCES = {
    general:  "일반",
    filehost: "파일호스팅",
    video:    "동영상",
    manual:   "수동",
  };

  // 확인된 1자사(자체 도메인) 추적기 — 목록 이름보다 이 쪽이 정확하다.
  const URL_OVERRIDES = [
    [/tcafe21\.com\/plugin\/perf\//i, "privacy"],
    [/\/plugin\/perf\/js\/(?:fp-metrics|cache-sync-lite)\.min\.js/i, "privacy"],
    [/\/plugin\/perf\/api\/(?:register|pixel_tracker|etag_tracker)\.php/i, "privacy"],
    [/openfpcdn\.io\/fingerprintjs/i, "privacy"],
  ];

  // 일반적인 주소 단서 기반 추정 (구체적인 것부터)
  const URL_HEURISTICS = [
    [/urlhaus|malware|phishing|trojan|exploit/i, "malware"],
    [/coinhive|cryptonight|miner\.js|\/nocoin/i, "mining"],
    [/anti-?adblock|adblock-?(?:detect|warning|notice)|adblockdetect/i, "anti"],
    [/fingerprint|fp-metrics|analytics|googletagmanager|pixel|track(?:er|ing)?|telemetry|metrics|stats/i, "privacy"],
    [/doubleclick|googlesyndication|googleadservices|adsbygoogle|pagead|adservice|advert|\/ads?\/|banner|adslot/i, "ads"],
    [/popup|overlay|interstitial|modal|cookie-?consent|social-share/i, "annoyance"],
  ];

  function categoryOf(key) {
    return CATEGORIES[key] || CATEGORIES.unknown;
  }

  function domKindOf(key) {
    return DOM_KINDS[key] || DOM_KINDS.other;
  }

  function domSourceOf(key) {
    return DOM_SOURCES[key] || key || "기타";
  }

  // ruleset_2 처럼 끝에 숫자가 붙은 형태를 소스 이름으로 정리
  function sourceOf(rulesetId) {
    if (!rulesetId) return "";
    if (rulesetId === "_dynamic") return "내 규칙";
    return String(rulesetId).replace(/_\d+$/, "");
  }

  function classifyUrl(url) {
    if (!url || typeof url !== "string") return "unknown";
    for (const [re, category] of URL_OVERRIDES) if (re.test(url)) return category;
    for (const [re, category] of URL_HEURISTICS) if (re.test(url)) return category;
    return "unknown";
  }

  // info: { url, rulesetId, ruleId } -> { category, source }
  function classifyNetwork(info) {
    const data = info || {};
    const url = data.url || "";
    let category = classifyUrl(url);
    if (category === "unknown") {
      category = RULESET_CATEGORY[data.rulesetId] || RULESET_CATEGORY[String(data.rulesetId || "").replace(/_\d+$/, "_1")] || "unknown";
    }
    if (category === "unknown" && data.rulesetId === "_dynamic") category = "custom";
    return { category, source: sourceOf(data.rulesetId) };
  }

  // 제거된 요소의 id/class에서 종류를 추정한다. 원본 문자열은 저장하지 않는다.
  function elementKind(el) {
    if (!el) return "other";
    let cls = "";
    try {
      cls = typeof el.className === "string" ? el.className : (el.getAttribute("class") || "");
    } catch (e) {}
    const s = ((typeof el.id === "string" ? el.id : "") + " " + cls).toLowerCase();

    if (/anti.?adblock|adblock.?detect|adblock.?warn|anti_adblock|adblocker/.test(s)) return "antiAdblock";
    if (/fake.?download|fake.?button|download.?btn.?ad/.test(s)) return "fakeButton";
    if (/redirect|deceptive|fake.?alert|fake.?close/.test(s)) return "redirect";
    if (/midroll|preroll|postroll|ad.?video|webplayer|pzp|ad.?marker|ad.?break/.test(s)) return "video";
    if (/overlay|interstitial|dimmed|gsticky|im_interstitial/.test(s)) return "overlay";
    if (/popup|modal|event_popup|sg-popup/.test(s)) return "popup";
    if (/banner|sponsor|advert|adsbygoogle|ad[-_ ]?(slot|unit|wrapper|container|box|area)|text.?ad|textad|promoted|iframe|ins/.test(s)) return "banner";
    // 광고 선택자로 골라진 요소이므로 기본값은 배너로 둔다.
    return "banner";
  }

  // { kind: n } 형태를 정리 (0 이하 제거, 알파벳순)
  function normalizeKinds(kinds) {
    const out = {};
    if (!kinds || typeof kinds !== "object") return out;
    Object.keys(kinds).forEach(function (key) {
      const n = Number(kinds[key]);
      if (!key || !Number.isFinite(n) || n <= 0) return;
      out[key] = (out[key] || 0) + n;
    });
    return out;
  }

  return {
    CATEGORIES: CATEGORIES,
    DOM_KINDS: DOM_KINDS,
    DOM_SOURCES: DOM_SOURCES,
    categoryOf: categoryOf,
    domKindOf: domKindOf,
    domSourceOf: domSourceOf,
    sourceOf: sourceOf,
    classifyUrl: classifyUrl,
    classifyNetwork: classifyNetwork,
    elementKind: elementKind,
    normalizeKinds: normalizeKinds,
  };
});
