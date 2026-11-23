// background/rules.js - DNR 규칙 정의·활성화, 필터 상태 마이그레이션, 툴바 아이콘
// AppState(background/state.js)를 통해 전체 ON/OFF 상태를 공유한다.

// === 광고 차단 규칙 ===
// 광고 전용 도메인만 전체 차단. 영상 재생용 도메인(googlevideo 등)은 차단하지 않음
const adBlockRules = [
  // 광고/추적 전용 도메인 (YouTube 필수 리소스와 무관)
  { id: 1, priority: 1, action: { type: "block" }, condition: { urlFilter: "||doubleclick.net^" } },
  { id: 2, priority: 1, action: { type: "block" }, condition: { urlFilter: "||googlesyndication.com^" } },
  { id: 3, priority: 1, action: { type: "block" }, condition: { urlFilter: "||googleadservices.com^" } },
  { id: 4, priority: 1, action: { type: "block" }, condition: { urlFilter: "||google-analytics.com^" } },
  { id: 5, priority: 1, action: { type: "block" }, condition: { urlFilter: "||googletagmanager.com^" } },
  // YouTube 광고 스탯/추적 경로
  // 주의: youtube.com/api/stats/ads 는 유튜브의 "광고 차단 감지" 신호로 쓰이므로
  //       차단하지 않는다. 필터 목록(list-kr·filterslists-ko)에도 block 규칙이 있어
  //       아래 youtubeAllowRules(priority 100)로 덮어쓴다.
  //       (광고 자체는 youtube-main.js / content.js가 처리)
  // 구글 검색/콘텐츠 광고 경로
  { id: 8, priority: 1, action: { type: "block" }, condition: { urlFilter: "||google.com/pagead/" } },
  // 참고 필터(AdAway / NoriDev / List-KR) 기준 광고 전용 도메인 추가
  { id: 9,  priority: 1, action: { type: "block" }, condition: { urlFilter: "||2mdn.net^" } },
  { id: 10, priority: 1, action: { type: "block" }, condition: { urlFilter: "||googletagservices.com^" } },
  { id: 11, priority: 1, action: { type: "block" }, condition: { urlFilter: "||adservice.google.com^" } },
  { id: 12, priority: 1, action: { type: "block" }, condition: { urlFilter: "||ad.daum.net^" } },
  { id: 13, priority: 1, action: { type: "block" }, condition: { urlFilter: "||ad.naver.com^" } },
  { id: 14, priority: 1, action: { type: "block" }, condition: { urlFilter: "||wcs.naver.net^" } },
  // d3ward.com 광고 차단 테스트에서 누락된 도메인/스크립트
  // priority 11: 정적 필터의 allow(priority 10) 규칙을 덮어 차단되도록 보장
  { id: 15, priority: 11, action: { type: "block" }, condition: { urlFilter: "||udc.yahoo.com^" } },
  { id: 16, priority: 11, action: { type: "block" }, condition: { urlFilter: "||metrics.icloud.com^" } },
  { id: 17, priority: 11, action: { type: "block" }, condition: { urlFilter: "||iadsdk.apple.com^" } },
  { id: 18, priority: 11, action: { type: "block" }, condition: { urlFilter: "||d3ward.com/js/widget/ads.js" } },
  { id: 19, priority: 11, action: { type: "block" }, condition: { urlFilter: "||d3ward.com/js/pagead.js" } },
  // paileactivist/toolz (d3ward 구버전) 테스트에서 누락된 도메인
  { id: 20, priority: 11, action: { type: "block" }, condition: { urlFilter: "||ads.google.com^" } },
  { id: 21, priority: 11, action: { type: "block" }, condition: { urlFilter: "||affiliationjs.s3.amazonaws.com^" } },
  { id: 22, priority: 11, action: { type: "block" }, condition: { urlFilter: "||advertising-api-eu.amazon.com^" } },
  { id: 23, priority: 11, action: { type: "block" }, condition: { urlFilter: "||ads.facebook.com^" } },
  { id: 24, priority: 11, action: { type: "block" }, condition: { urlFilter: "||advertising.twitter.com^" } },
  { id: 25, priority: 11, action: { type: "block" }, condition: { urlFilter: "||ads-dev.pinterest.com^" } },
  { id: 26, priority: 11, action: { type: "block" }, condition: { urlFilter: "||widgets.pinterest.com^" } },
  { id: 27, priority: 11, action: { type: "block" }, condition: { urlFilter: "||ads.reddit.com^" } },
  { id: 28, priority: 11, action: { type: "block" }, condition: { urlFilter: "||d.reddit.com^" } },
  { id: 29, priority: 11, action: { type: "block" }, condition: { urlFilter: "||data.mistat.intl.xiaomi.com^" } },
  { id: 30, priority: 11, action: { type: "block" }, condition: { urlFilter: "||tracking.intl.miui.com^" } },
  { id: 31, priority: 11, action: { type: "block" }, condition: { urlFilter: "||tracking.india.miui.com^" } },
  { id: 32, priority: 11, action: { type: "block" }, condition: { urlFilter: "||securemetrics.apple.com^" } },
  { id: 33, priority: 11, action: { type: "block" }, condition: { urlFilter: "||supportmetrics.apple.com^" } },
  // raymondhill.net/ublock 네트워크 필터 테스트용 광고 iframe
  { id: 34, priority: 11, action: { type: "block" }, condition: { urlFilter: "||raymondhill.net/ublock/ad.html" } },
  { id: 35, priority: 11, action: { type: "block" }, condition: { urlFilter: "||usrpubtrck.com^" } },

  // === 해외 파일 공유 사이트 광고/추적 도메인 (v3.0) ===
  // gigafile / gofile / akirabox / buzzheavier 에서 사용하는 광고·추적·리다이렉트 도메인
  // - GigaFile: Ad-Shield, Geniee, i-mobile, tapad, gliastudios
  { id: 36, priority: 11, action: { type: "block" }, condition: { urlFilter: "||ad-shield.io^" } },
  { id: 37, priority: 11, action: { type: "block" }, condition: { urlFilter: "||geniee.jp^" } },
  { id: 38, priority: 11, action: { type: "block" }, condition: { urlFilter: "||genieesspv.jp^" } },
  { id: 39, priority: 11, action: { type: "block" }, condition: { urlFilter: "||i-mobile.co.jp^" } },
  { id: 40, priority: 11, action: { type: "block" }, condition: { urlFilter: "||3-q.cc^" } },
  { id: 41, priority: 11, action: { type: "block" }, condition: { urlFilter: "||tapad.com^" } },
  { id: 42, priority: 11, action: { type: "block" }, condition: { urlFilter: "||gliastudios.com^" } },
  { id: 43, priority: 11, action: { type: "block" }, condition: { urlFilter: "||shop.gliastudios.com^" } },
  // - 공통: 애드터스크(Adsterra) 계열 팝오버/언더 리다이렉트
  { id: 44, priority: 11, action: { type: "block" }, condition: { urlFilter: "||highperformanceformat.com^" } },
  { id: 45, priority: 11, action: { type: "block" }, condition: { urlFilter: "||effectivecpmnetwork.com^" } },
  { id: 46, priority: 11, action: { type: "block" }, condition: { urlFilter: "||profitablecpmrate.com^" } },
  { id: 47, priority: 11, action: { type: "block" }, condition: { urlFilter: "||profitablegatecpm.com^" } },
  { id: 48, priority: 11, action: { type: "block" }, condition: { urlFilter: "||clickadu.com^" } },
  { id: 49, priority: 11, action: { type: "block" }, condition: { urlFilter: "||hilltopads.net^" } },
  { id: 50, priority: 11, action: { type: "block" }, condition: { urlFilter: "||popads.net^" } },
  { id: 51, priority: 11, action: { type: "block" }, condition: { urlFilter: "||popcash.net^" } },
  { id: 52, priority: 11, action: { type: "block" }, condition: { urlFilter: "||onclickads.net^" } },
  { id: 53, priority: 11, action: { type: "block" }, condition: { urlFilter: "||onclksrv.com^" } },
  { id: 54, priority: 11, action: { type: "block" }, condition: { urlFilter: "||adcash.com^" } },
  { id: 55, priority: 11, action: { type: "block" }, condition: { urlFilter: "||exoclick.com^" } },
  { id: 56, priority: 11, action: { type: "block" }, condition: { urlFilter: "||exosrv.com^" } },
  { id: 57, priority: 11, action: { type: "block" }, condition: { urlFilter: "||juicyads.com^" } },
  { id: 58, priority: 11, action: { type: "block" }, condition: { urlFilter: "||admaven.com^" } },
  { id: 59, priority: 11, action: { type: "block" }, condition: { urlFilter: "||monetag.com^" } },
  { id: 60, priority: 11, action: { type: "block" }, condition: { urlFilter: "||adskeeper.com^" } },
  { id: 61, priority: 11, action: { type: "block" }, condition: { urlFilter: "||adpushup.com^" } },
  { id: 62, priority: 11, action: { type: "block" }, condition: { urlFilter: "||propellerads.com^" } },
  { id: 63, priority: 11, action: { type: "block" }, condition: { urlFilter: "||propellerclick.com^" } },
  { id: 64, priority: 11, action: { type: "block" }, condition: { urlFilter: "||adsterra.com^" } },
  { id: 65, priority: 11, action: { type: "block" }, condition: { urlFilter: "||adsco.re^" } },
  { id: 66, priority: 11, action: { type: "block" }, condition: { urlFilter: "||pushpros.com^" } },
  { id: 67, priority: 11, action: { type: "block" }, condition: { urlFilter: "||trafficforce.com^" } },
  { id: 68, priority: 11, action: { type: "block" }, condition: { urlFilter: "||clickfuse.com^" } },
];

// === 규칙 활성화/비활성화 ===
// dogdrip.net은 광고 분석 스크립트가 로드되고 광고 영역이 보여야 서버가 정상 이용자로 판단한다.
// 차단 시 "광고 허용" 페이지로 리다이렉트되므로, dogdrip에서만 감지용 스크립트를 허용한다.
const DOGDRIP_DETECTION_DOMAINS = [
  "googletagmanager.com", "google-analytics.com", "googlesyndication.com",
  "doubleclick.net", "coupang.com", "optad360.io", "veta.naver.com",
  "cloudflareinsights.com", "daumcdn.net"
];
const dogdripAllowRules = DOGDRIP_DETECTION_DOMAINS.map((domain, i) => ({
  id: 101 + i,
  priority: 100,
  action: { type: "allow" },
  condition: { urlFilter: "||" + domain + "^", initiatorDomains: ["dogdrip.net"] }
}));

// 유튜브의 광고 차단 감지 신호로 쓰이는 경로를 허용한다.
// AdGuard AdBlock Ultimate 은 유튜브에 네트워크 차단 규칙을 하나도 두지 않는다.
// list-kr·filterslists-ko·easyprivacy 필터 목록에 아래 경로의 block 규칙이 들어 있어
// 정적 규칙(priority 1~10)을 덮어쓰도록 priority 100을 쓴다.
// gen_204·csi_204·player_204·api/stats/qoe 는 광고와 무관한 정상 재생에도 매 시청
// 마다 나가는 텔레메트리라, 막히면 유튜브가 비정상 클라이언트로 판단할 수 있다.
// 광고 차단 자체는 youtube-main.js / content.js가 담당하므로 이 허용 규칙과 무관하다.
const YOUTUBE_ALLOW_PATHS = [
  "||youtube.com/api/stats/",
  "||youtube.com/pagead/",
  "||youtube.com/youtubei/v1/player/ad_break",
  "||youtube.com/youtubei/v1/log_event",
  "||youtube.com/ptracking?",
  "||youtube.com/pcs/activeview?",
  "||youtube.com/gen_204",
  "||youtube.com/csi_204?",
  "||youtube.com/player_204?",
  "||youtube.com/set_awesome?",
  "||youtube.com/get_video?",
  "||fcmatch.youtube.com^"
];
const YOUTUBE_ALLOW_RULE_BASE_ID = 110;
const youtubeAllowRules = YOUTUBE_ALLOW_PATHS.map((urlFilter, i) => ({
  id: YOUTUBE_ALLOW_RULE_BASE_ID + i,
  priority: 100,
  action: { type: "allow" },
  condition: { urlFilter }
}));

// 유튜브 광고 도메인 허용 (dogdrip.net 와 같은 원리).
// 유튜브는 광고 소재를 못 불러오면 그 자체를 "광고 차단 감지"로 보고 경고를 띄운다.
// 따라서 youtube.com에서 시작되는 요청에 한해서만 광고 도메인을 열어주고,
// 다른 사이트의 광고는 계속 차단한다. 화면의 광고는 content.js가 숨기고 스킵한다.
const YOUTUBE_AD_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "2mdn.net",
  "googletagservices.com",
  "adservice.google.com",
  "ads.google.com",
  "google-analytics.com",
  "googletagmanager.com"
];
const YOUTUBE_AD_ALLOW_RULE_BASE_ID = 130;
const youtubeAdAllowRules = YOUTUBE_AD_DOMAINS.map((domain, i) => ({
  id: YOUTUBE_AD_ALLOW_RULE_BASE_ID + i,
  priority: 100,
  action: { type: "allow" },
  condition: { urlFilter: "||" + domain + "^", initiatorDomains: ["youtube.com"] }
}));

// 1~68: 이전 버전에서 등록된 잔여 규칙까지 모두 제거하기 위해 넓게 지정
// 100: YouTube Studio 허용 규칙 / 101~109: dogdrip 감지 우회 허용 규칙
// 110+: 유튜브 감지 신호 경로 허용 / 130+: 유튜브 광고 도메인 허용
//      (둘 다 YOUTUBE_ALLOW_PATHS / YOUTUBE_AD_DOMAINS 개수를 따름)
// 재적용 시 중복 ID 오류를 막기 위해 모두 함께 제거한다.
const ALL_RULE_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
  60, 61, 62, 63, 64, 65, 66, 67, 68,
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
  ...Array.from({ length: YOUTUBE_ALLOW_PATHS.length }, (_, i) => YOUTUBE_ALLOW_RULE_BASE_ID + i),
  ...Array.from({ length: YOUTUBE_AD_DOMAINS.length }, (_, i) => YOUTUBE_AD_ALLOW_RULE_BASE_ID + i)
];

// === 필터 활성화 상태 관리 ===
// manifest.json의 declarative_net_request.rule_resources와 1:1 대응
// 소스 ID -> 규칙셋 ID 목록. filterStates는 항상 소스 키로 저장한다.
const FILTER_TO_RULESET_IDS = {
  "noridev": ["noridev_1"],
  "turtlecute": ["turtlecute_1"],
  "d3host": ["d3host_1"],
  "list-kr": ["list-kr_1"],
  "filterslists-ko": ["filterslists-ko_1"],
  "extra-hosts": ["extra-hosts_1"],
  "anti-cv-en": ["anti-cv-en_1"],
  "anti-cv-zh": ["anti-cv-zh_1"],
  "anti-cv-cs": ["anti-cv-cs_1"],
  "anti-cv-fr": ["anti-cv-fr_1"],
  "anti-cv-de": ["anti-cv-de_1"],
  "anti-cv-pl": ["anti-cv-pl_1"],
  "anti-cv-ru": ["anti-cv-ru_1"],
  "anti-cv-es": ["anti-cv-es_1"],
  "fanboy-social": ["fanboy-social_1"],
  "url-tracking": ["url-tracking_1"],
  "uassets-privacy": ["uassets-privacy_1"],
  "fanboy-annoyance": ["fanboy-annoyance_1"],
  "nocoin": ["nocoin_1"],
  "urlhaus": ["urlhaus_1", "urlhaus_2", "urlhaus_3", "urlhaus_4", "urlhaus_5"],
  "uassets-badware": ["uassets-badware_1"],
  "uassets-resource-abuse": ["uassets-resource-abuse_1"],
  "uassets-filters": ["uassets-filters_1"],
  "uassets-general": ["uassets-general_1"],
  "uassets-2024": ["uassets-2024_1"],
  "uassets-2025": ["uassets-2025_1"],
  "uassets-2026": ["uassets-2026_1"],
  "peter-lowe": ["peter-lowe_1"],
  "easylist": ["easylist_1", "easylist_2"],
  "easyprivacy": ["easyprivacy_1", "easyprivacy_2"],
  "ultimate": ["ultimate_1"],
};

// 모든 rule_resources ID (평탄화된 목록)
const STATIC_RULESET_IDS = Object.values(FILTER_TO_RULESET_IDS).flat();

// 이전 버전 키(6개 그룹 + 10개 소스 그룹) -> 소스 ID 매핑 (마이그레이션용)
const LEGACY_GROUP_MAP = {
  // 최초 6개 그룹
  ads: ["easylist", "easyprivacy", "ultimate", "peter-lowe", "uassets-filters", "uassets-general", "uassets-2024", "uassets-2025", "uassets-2026"],
  privacy: ["fanboy-social", "url-tracking", "uassets-privacy"],
  anti_circumvention: ["anti-cv-en", "anti-cv-zh", "anti-cv-cs", "anti-cv-fr", "anti-cv-de", "anti-cv-pl", "anti-cv-ru", "anti-cv-es"],
  annoyances: ["fanboy-annoyance"],
  security: ["nocoin", "urlhaus", "uassets-badware", "uassets-resource-abuse"],
  // 2단 구조의 10개 소스 그룹
  easylist: ["easylist", "easyprivacy"],
  adguard: ["ultimate"],
  peterlowe: ["peter-lowe"],
  uassets: ["uassets-filters", "uassets-general", "uassets-2024", "uassets-2025", "uassets-2026"],
  korean: ["noridev", "turtlecute", "d3host", "list-kr", "filterslists-ko", "extra-hosts"],
  social: ["fanboy-social", "url-tracking", "uassets-privacy"],
  anti_cv: ["anti-cv-en", "anti-cv-zh", "anti-cv-cs", "anti-cv-fr", "anti-cv-de", "anti-cv-pl", "anti-cv-ru", "anti-cv-es"],
  malware: ["urlhaus", "uassets-badware", "uassets-resource-abuse"],
  mining: ["nocoin"],
};

// 이전 버전 filterStates를 소스 키로 변환해 저장
function migrateFilterStates(callback) {
  chrome.storage.local.get(["filterStates"], (res) => {
    const old = res.filterStates || {};
    const sourceKeys = new Set(Object.keys(FILTER_TO_RULESET_IDS));
    const hasLegacy = Object.keys(LEGACY_GROUP_MAP).some((k) => k in old) ||
      Object.keys(old).some((k) => !sourceKeys.has(k));
    if (!hasLegacy) { if (callback) callback(); return; }
    const next = {};
    // 기존 소스 키는 유지
    for (const key of Object.keys(old)) if (sourceKeys.has(key)) next[key] = old[key];
    for (const [legacyKey, newKeys] of Object.entries(LEGACY_GROUP_MAP)) {
      if (!(legacyKey in old)) continue;
      const value = old[legacyKey];
      for (const key of newKeys) if (!(key in next)) next[key] = value;
    }
    chrome.storage.local.set({ filterStates: next }, () => {
      console.log("[필터 마이그레이션] 완료:", Object.keys(next).join(", "));
      if (callback) callback();
    });
  });
}

// 규칙셋별 규칙 수 (빌드 메타데이터) — 정적 규칙 한도 계산에 사용
const RULESET_SIZES = (self.BuildMeta && self.BuildMeta.rulesets) || {};

// 한도가 부족할 때 우선 유지할 소스 순서 (구체적·실용적인 필터부터)
const PRIORITY_SOURCES = [
  "noridev", "turtlecute", "d3host", "list-kr", "filterslists-ko", "extra-hosts",
  "anti-cv-en", "anti-cv-zh", "anti-cv-cs", "anti-cv-fr", "anti-cv-de", "anti-cv-pl",
  "anti-cv-ru", "anti-cv-es", "fanboy-social", "url-tracking", "uassets-privacy",
  "fanboy-annoyance", "nocoin", "uassets-filters", "uassets-general", "uassets-2024",
  "uassets-2025", "uassets-2026", "peter-lowe", "easylist", "easyprivacy", "ultimate",
  "uassets-badware", "uassets-resource-abuse", "urlhaus",
];

function dnrCall(name, ...args) {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest[name](...args, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

// 필터 활성화 상태를 저장소에 저장하고 정적 규칙셋에 즉시 반영
function saveFilterStates(states, callback) {
  chrome.storage.local.set({ filterStates: states }, () => {
    applyStaticRulesetsByState(states, true, callback);
  });
}

// 소스 키 상태를 rule_resources ID 상태로 확장
function expandFilterStates(states) {
  const expanded = {};
  Object.keys(FILTER_TO_RULESET_IDS).forEach((sourceKey) => {
    const isOn = states[sourceKey] !== undefined ? states[sourceKey] : true;
    FILTER_TO_RULESET_IDS[sourceKey].forEach((rid) => {
      expanded[rid] = isOn;
    });
  });
  return expanded;
}

// 정적 규칙 적용은 동시에 여러 번 호출될 수 있으므로 직렬화한다
let staticRulesQueue = Promise.resolve();

// Chrome 정적 규칙 한도(보장 30,000 + 전역 공유) 안에서 규칙셋을 활성화한다.
// 한도를 넘겨 전체 활성화가 실패하는 것을 막기 위해 여유분을 먼저 확인한다.
async function doApplyStaticRulesets(states, masterOn) {
  try {
    if (!masterOn) {
      const current = await dnrCall("getEnabledRulesets");
      if (current.length) await dnrCall("updateEnabledRulesets", { disableRulesetIds: current });
      return;
    }

    // 켜진 소스의 규칙셋을 우선순위 순으로 수집
    const expanded = expandFilterStates(states);
    const desired = [];
    for (const source of PRIORITY_SOURCES) {
      for (const rid of FILTER_TO_RULESET_IDS[source] || []) {
        if (expanded[rid]) desired.push(rid);
      }
    }

    const current = await dnrCall("getEnabledRulesets");
    const available = await dnrCall("getAvailableStaticRuleCount");
    // 현재 우리 확장이 쓰는 규칙 수 + 추가로 쓸 수 있는 수 = 전체 가용 예산
    const currentTotal = current.reduce((sum, id) => sum + (RULESET_SIZES[id] || 0), 0);
    let budget = currentTotal + available;

    const toEnable = [];
    for (const rid of desired) {
      const size = RULESET_SIZES[rid] || 0;
      if (size > budget) continue; // 예산에 안 맞으면 건너뜀 (나머지는 계속 시도)
      toEnable.push(rid);
      budget -= size;
    }
    const enableSet = new Set(toEnable);
    const toDisable = current.filter((id) => !enableSet.has(id));

    const options = {};
    if (toDisable.length) options.disableRulesetIds = toDisable;
    if (toEnable.length) options.enableRulesetIds = toEnable;
    if (Object.keys(options).length) await dnrCall("updateEnabledRulesets", options);

    const enabledCount = toEnable.reduce((sum, id) => sum + (RULESET_SIZES[id] || 0), 0);
    console.log("[정적 규칙] " + toEnable.length + "/" + desired.length + " 규칙셋, " +
      enabledCount.toLocaleString() + "개 규칙 활성화 (여유 " + available + ")");
    if (toEnable.length < desired.length) {
      console.warn("[정적 규칙] Chrome 정적 규칙 한도로 일부 규칙셋이 비활성화되었습니다.");
    }
  } catch (e) {
    console.error("정적 규칙 적용 실패:", e.message);
    throw e;
  }
}

// 직렬화된 진입점
function applyStaticRulesetsByState(states, masterOn, callback) {
  const run = () => doApplyStaticRulesets(states, masterOn);
  staticRulesQueue = staticRulesQueue.then(run, run);
  staticRulesQueue.then(
    () => { if (callback) callback(); },
    (e) => { if (callback) callback(e); }
  );
}

// 전체 ON/OFF 토글 시 정적 규칙셋 적용
function applyStaticRulesets(enabled) {
  if (enabled) {
    chrome.storage.local.get(["filterStates"], (result) => {
      applyStaticRulesetsByState(result.filterStates || {}, true);
    });
  } else {
    applyStaticRulesetsByState({}, false);
  }
}

// ON/OFF 상태에 따라 툴바 아이콘을 교체한다 (OFF 시 회색 아이콘)
function updateActionIcon(enabled) {
  if (!chrome.action || !chrome.action.setIcon) return;
  const iconPath = enabled
    ? { 16: "icon16.png", 48: "icon48.png", 128: "icon128.png" }
    : { 16: "icon16-off.png", 48: "icon48-off.png", 128: "icon128-off.png" };
  chrome.action.setIcon({ path: iconPath }, () => void chrome.runtime.lastError);
}

function applyRules(enabled) {
  applyStaticRulesets(enabled);
  updateActionIcon(enabled);
  // MAIN world 스크립트(youtube-main.js)도 켜짐 상태에 맞춰 등록/해제한다.
  // 정적 선언을 쓰지 않으므로 꺼짐 상태에서 페이지에 흔적을 남기지 않는다.
  if (typeof syncMainWorldScripts === "function") syncMainWorldScripts(enabled);
  // YouTube Studio 허용 규칙은 항상 적용 (광고 차단 대상이 아님)
  const studioAllowRule = { id: 100, priority: 100, action: { type: "allow" }, condition: { domainType: "firstParty", domains: ["studio.youtube.com"] } };
  // 항상 적용되는 허용 규칙: Studio + 유튜브 감지 신호/광고 도메인 + dogdrip 감지 우회
  const alwaysAllowRules = [
    studioAllowRule,
    ...youtubeAllowRules,
    ...youtubeAdAllowRules,
    ...dogdripAllowRules
  ];
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      addRules: enabled ? [...alwaysAllowRules, ...adBlockRules] : alwaysAllowRules,
      removeRuleIds: ALL_RULE_IDS
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error("규칙 적용 실패:", chrome.runtime.lastError.message);
      }
    }
  );
}

// 저장된 활성화 상태 로드 후 규칙 적용
function initRules() {
  migrateFilterStates(() => {
    chrome.storage.local.get(["adBlockerEnabled"], (result) => {
      const enabled = result.adBlockerEnabled !== undefined ? result.adBlockerEnabled : true;
      AppState.enabledState = enabled;
      applyRules(enabled);
      updateBadgeForTab(AppState.activeTabId);
    });
  });
}
