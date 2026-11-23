// background/stats.js - 통계 수집/저장, 사이트별 카운트, 툴바 뱃지, 탭 추적
// AppState(background/state.js)를 통해 다른 모듈과 상태를 공유한다.

// 차단 주소 로그는 최대 5,000개까지만 보관 (전체 차단 횟수는 blockedRequests에 별도 누적)
const MAX_LOG_ENTRIES = 5000;
// DOM 제거 기록도 별도로 최대 5,000개 보관 (네트워크 로그와 저장 키 분리)
const MAX_DOM_LOG_ENTRIES = 5000;
const DOM_SAVE_DELAY_MS = 3000;
let saveTimer = null;
let siteSaveTimer = null;
let domSaveTimer = null;

// 저장된 통계 로드
function loadStats() {
  chrome.storage.local.get(["adBlockerStats"], (result) => {
    if (result.adBlockerStats) {
      // 이전 버전에 없던 필드도 기본값으로 채움
      AppState.stats = Object.assign(
        { blockedAds: 0, blockedRequests: 0, removedDomAds: 0, blockedLog: [], lastBlockAt: 0, lastReset: Date.now() },
        result.adBlockerStats
      );
      if (!Array.isArray(AppState.stats.blockedLog)) AppState.stats.blockedLog = [];
    } else {
      saveStats();
    }
  });
}

// 통계 저장 (1초 단위로 묶어서 저장 - 요청 폭주 대비)
function saveStats() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    chrome.storage.local.set({ adBlockerStats: AppState.stats });
  }, 1000);
}

function siteOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "") || null;
  } catch (e) {
    return null;
  }
}

function getSiteCount(site) {
  if (!site) return null;
  if (!AppState.siteCounts.has(site)) AppState.siteCounts.set(site, { net: 0, dom: 0 });
  return AppState.siteCounts.get(site);
}

function siteTotal(site) {
  const c = site ? AppState.siteCounts.get(site) : null;
  return c ? c.net + c.dom : 0;
}

// 뱃지 숫자 형식은 shared/badge-format.js 에 있다. (단위 축약 + 4자 제한)
// tools/test-badge-format.js 에서 단위 검증한다.
function formatBadge(total) {
  // 모듈이 로드되지 않은 상태에서 예외가 나면 뱃지 갱신 자체가 멈춰
  // 이전 숫자가 그대로 남는다. 그런 경우를 대비해 최소한의 동작을 보장한다.
  if (typeof BadgeFormat === "undefined" || !BadgeFormat || typeof BadgeFormat.format !== "function") {
    console.error("[뱃지] shared/badge-format.js 로드 실패 — 임시 형식 사용");
    if (total <= 0) return "";
    if (total >= 1000000) return Math.floor(total / 1000000) + "M";
    if (total >= 10000) return Math.floor(total / 1000) + "k";
    if (total >= 1000) return (total / 1000).toFixed(1) + "k";
    return String(total);
  }
  return BadgeFormat.format(total);
}

// 탭이 현재 보고 있는 사이트를 구한다. 매핑이 없으면 tabs.get으로 한 번만 조회한다.
function resolveTabSite(tabId, callback) {
  if (tabId === undefined || tabId === null || tabId < 0) {
    callback(null);
    return;
  }
  if (AppState.tabSites.has(tabId)) {
    callback(AppState.tabSites.get(tabId));
    return;
  }
  const waiting = AppState.pendingTabLookups.get(tabId);
  if (waiting) {
    waiting.push(callback);
    return;
  }
  AppState.pendingTabLookups.set(tabId, [callback]);
  chrome.tabs.get(tabId, (tab) => {
    const callbacks = AppState.pendingTabLookups.get(tabId) || [];
    AppState.pendingTabLookups.delete(tabId);
    const site = !chrome.runtime.lastError && tab && tab.url ? siteOf(tab.url) : null;
    if (site) AppState.tabSites.set(tabId, site);
    callbacks.forEach((cb) => cb(site));
  });
}

// 뱃지 색상 (배경 빨강 + 글자 흰색).
// setBadgeTextColor 는 Chrome 110+ 에서 지원하므로 없어도 조용히 넘어간다.
const BADGE_BACKGROUND_COLOR = "#e94560";
const BADGE_TEXT_COLOR = "#ffffff";

function applyBadgeStyle() {
  chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
  }
}

// 현재 활성 탭의 뱃지만 갱신 (다른 탭 이벤트에는 반응하지 않음)
function updateBadgeForTab(tabId) {
  if (!AppState.enabledState) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (tabId !== AppState.activeTabId) return;
  resolveTabSite(tabId, (site) => {
    if (tabId !== AppState.activeTabId) return;
    applyBadgeStyle();
    chrome.action.setBadgeText({ text: formatBadge(siteTotal(site)) });
  });
}

// DOM 제거 기록 로드 / 저장 (네트워크 로그와 별도 키, 3초 디바운스)
function loadDomLog() {
  chrome.storage.local.get(["adBlockerDomLog"], (result) => {
    const stored = result && result.adBlockerDomLog;
    AppState.domLog = Array.isArray(stored) ? stored.slice(0, MAX_DOM_LOG_ENTRIES) : [];
  });
}

function saveDomLog() {
  if (domSaveTimer) return;
  domSaveTimer = setTimeout(() => {
    domSaveTimer = null;
    chrome.storage.local.set({ adBlockerDomLog: AppState.domLog });
  }, DOM_SAVE_DELAY_MS);
}

// 사이트별 카운트를 local 저장소에 보관 (브라우저를 껐다 켜도 유지)
function saveSiteCounts() {
  if (siteSaveTimer) return;
  siteSaveTimer = setTimeout(() => {
    siteSaveTimer = null;
    const obj = {};
    AppState.siteCounts.forEach((value, key) => { obj[key] = value; });
    chrome.storage.local.set({ siteCounts: obj });
  }, 1000);
}

// 통계 초기화
function resetStats() {
  AppState.stats = {
    blockedAds: 0,
    blockedRequests: 0,
    removedDomAds: 0,
    blockedLog: [],
    lastBlockAt: 0,
    lastReset: Date.now(),
  };
  saveStats();

  // 사이트별 카운트·DOM 기록·뱃지도 함께 초기화
  AppState.siteCounts.clear();
  saveSiteCounts();
  AppState.domLog = [];
  saveDomLog();
  updateBadgeForTab(AppState.activeTabId);
}

// === 리스너 등록 ===

// 워커 시작 시 저장된 사이트별 카운트 복원
chrome.storage.local.get(["siteCounts"], (result) => {
  const stored = result && result.siteCounts;
  if (stored && typeof stored === "object") {
    Object.keys(stored).forEach((key) => {
      const value = stored[key];
      if (value && typeof value.net === "number") {
        AppState.siteCounts.set(key, { net: value.net || 0, dom: value.dom || 0 });
      }
    });
    updateBadgeForTab(AppState.activeTabId);
  }
});

// 네트워크 요청 차단 로그
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  AppState.stats.blockedRequests++;
  AppState.stats.lastBlockAt = Date.now();

  // 차단 요청이 발생한 탭의 "현재 사이트"에 누적
  const tabId = info ? info.tabId : -1;
  resolveTabSite(tabId, (site) => {
    if (!site) return;
    getSiteCount(site).net++;
    saveSiteCounts();
    updateBadgeForTab(tabId);
  });

  const url = info && info.request ? info.request.url : null;
  if (url) {
    // 어떤 필터가 막았는지(rulesetId)와 주소 단서로 분류해 함께 저장한다.
    const cls = (typeof BlockCategory !== "undefined" && BlockCategory)
      ? BlockCategory.classifyNetwork({ url, rulesetId: info.rulesetId, ruleId: info.ruleId })
      : { category: "unknown", source: "" };
    AppState.stats.blockedLog.unshift({
      url, time: Date.now(), category: cls.category, source: cls.source,
    });
    if (AppState.stats.blockedLog.length > MAX_LOG_ENTRIES) {
      AppState.stats.blockedLog.length = MAX_LOG_ENTRIES;
    }
  }
  saveStats();
});

// 탭 전환 / 페이지 이동 감지
chrome.tabs.onActivated.addListener(({ tabId }) => {
  AppState.activeTabId = tabId;
  updateBadgeForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "loading") {
    const site = siteOf(changeInfo.url || (tab && tab.url));
    if (site) AppState.tabSites.set(tabId, site);
    else if (changeInfo.url) AppState.tabSites.delete(tabId);
    updateBadgeForTab(tabId);
  }
});

// 탭이 닫히면 탭-사이트 연결만 삭제 (사이트별 카운트는 유지)
chrome.tabs.onRemoved.addListener((tabId) => {
  AppState.tabSites.delete(tabId);
  AppState.pendingTabLookups.delete(tabId);
});

// 창 포커스가 바뀌어도 활성 탭 기준으로 갱신
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (tabs[0]) {
      AppState.activeTabId = tabs[0].id;
      updateBadgeForTab(AppState.activeTabId);
    }
  });
});

// 초기 탭-사이트 매핑 복원 + 활성 탭 확인 후 뱃지 표시
chrome.tabs.query({}, (tabs) => {
  tabs.forEach((tab) => {
    const site = siteOf(tab.url);
    if (site) AppState.tabSites.set(tab.id, site);
    else AppState.tabSites.delete(tab.id);
  });
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (activeTabs) => {
    if (activeTabs[0]) {
      AppState.activeTabId = activeTabs[0].id;
      updateBadgeForTab(AppState.activeTabId);
    }
  });
});
