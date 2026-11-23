// www_AD_Blocker - Background Service Worker (진입점)
// 모듈은 importScripts로 로드하며, 상태는 background/state.js의 AppState를 공유한다.
importScripts("shared/filter-converter.js");
importScripts("shared/filter-registry.js");
importScripts("shared/build-meta.js");
importScripts("shared/badge-format.js");
importScripts("shared/allowlist.js");
importScripts("background/state.js");
importScripts("background/main-world-scripts.js");
importScripts("background/stats.js");
importScripts("background/rules.js");
importScripts("background/allowlist.js");
importScripts("background/filter-updater.js");

// === 확장 프로그램 설치 / 시작 시 ===
chrome.runtime.onInstalled.addListener(() => {
  initRules();
  loadStats();
  loadDomLog();
  console.log("www_AD_Blocker: 규칙 등록 완료");
});

chrome.runtime.onStartup.addListener(() => {
  initRules();
  loadStats();
  loadDomLog();
});

// === 전체 ON/OFF 토글 상태 변경 감지 ===
chrome.storage.onChanged.addListener((changes) => {
  if (changes.adBlockerEnabled) {
    const enabled = changes.adBlockerEnabled.newValue;
    AppState.enabledState = enabled;
    applyRules(enabled);
    updateBadgeForTab(AppState.activeTabId);
  }
});

// === DOM 제거 기록 합치기 ===
// 여러 스크립트/프레임이 짧은 시간에 같은 사이트 보고를 보내면 한 줄로 합친다.
// (지운 개수는 더해서 보존, 일지는 깔끔하게)
const pendingDomLog = new Map();
const DOM_MERGE_MS = 400;

function queueDomLog(site, count) {
  let item = pendingDomLog.get(site);
  if (!item) {
    item = { count: 0, timer: null };
    pendingDomLog.set(site, item);
  }
  item.count += count;
  if (item.timer) clearTimeout(item.timer);
  item.timer = setTimeout(() => {
    pendingDomLog.delete(site);
    AppState.domLog.unshift({ site, count: item.count, time: Date.now() });
    if (AppState.domLog.length > MAX_DOM_LOG_ENTRIES) AppState.domLog.length = MAX_DOM_LOG_ENTRIES;
    saveDomLog();
  }, DOM_MERGE_MS);
}

// === 메시지 핸들러 ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "applyFilterStates" && message.states) {
    // 소스 키 상태를 그대로 저장하고, 규칙셋 확장은 applyStaticRulesetsByState에서 수행
    saveFilterStates(message.states, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  else if (message.type === "toggleMaster") {
    // 설정 페이지에서 전체 ON/OFF가 바뀜 → 규칙·아이콘·뱃지 반영
    const enabled = message.enabled !== false;
    AppState.enabledState = enabled;
    applyRules(enabled);
    updateBadgeForTab(AppState.activeTabId);
    sendResponse({ success: true });
    return true;
  }
  else if (message.type === "adRemoved") {
    const count = message.count || 1;
    AppState.stats.removedDomAds += count;
    AppState.stats.lastBlockAt = Date.now();
    saveStats();

    // content script가 보낸 페이지 URL 기준으로 사이트에 누적
    const tabId = sender && sender.tab ? sender.tab.id : -1;
    const pageUrl = sender && sender.tab ? sender.tab.url : "";
    const site = siteOf(pageUrl);

    // DOM 제거 기록 (짧은 시간 내 같은 사이트 보고는 합쳐서 한 줄로 저장)
    queueDomLog(site || "알 수 없는 사이트", count);
    if (site) {
      if (tabId >= 0) AppState.tabSites.set(tabId, site);
      getSiteCount(site).dom += count;
      saveSiteCounts();
    }
    updateBadgeForTab(tabId);

    sendResponse({ success: true });
  }
  else if (message.type === "adBlocked") {
    AppState.stats.blockedAds++;
    saveStats();
    sendResponse({ success: true });
  }
  else if (message.type === "getStats") {
    // 로그 배열은 제외하고 요약만 전송 (2초마다 호출되므로 가볍게 유지)
    sendResponse({
      blockedAds: AppState.stats.blockedAds,
      blockedRequests: AppState.stats.blockedRequests,
      removedDomAds: AppState.stats.removedDomAds,
      lastBlockAt: AppState.stats.lastBlockAt || 0,
      lastReset: AppState.stats.lastReset,
    });
  }
  else if (message.type === "resetStats") {
    resetStats();
    sendResponse({ success: true });
  }
  else if (message.type === "getBlockedLog") {
    sendResponse({ log: AppState.stats.blockedLog || [] });
  }
  else if (message.type === "getDomLog") {
    sendResponse({ log: AppState.domLog || [] });
  }
  else if (message.type === "getTabCount") {
    // 탭이 현재 보고 있는 사이트에 저장된 누적 차단 수
    resolveTabSite(message.tabId, (site) => {
      const c = site ? AppState.siteCounts.get(site) : null;
      sendResponse({
        total: c ? c.net + c.dom : 0,
        net: c ? c.net : 0,
        dom: c ? c.dom : 0,
        site: site || "",
      });
    });
    return true;
  }
  return true;
});

// === 우클릭 요소 차단 메뉴 ===
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "yab-block-element",
      title: "이 요소 차단",
      contexts: ["all"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
    chrome.contextMenus.create({
      id: "yab-clear-site",
      title: "이 사이트의 직접 차단 요소 모두 해제",
      contexts: ["all"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
}

setupContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id === undefined) return;
  const frameId = info.frameId === undefined ? 0 : info.frameId;

  if (info.menuItemId === "yab-block-element") {
    // 우클릭한 프레임의 content script가 마지막 우클릭 요소를 차단한다.
    chrome.tabs.sendMessage(tab.id, { type: "blockLastRightClicked" }, { frameId }, () => {
      void chrome.runtime.lastError;
    });
  } else if (info.menuItemId === "yab-clear-site") {
    chrome.tabs.sendMessage(tab.id, { type: "clearSiteBlocks" }, { frameId: 0 }, () => {
      void chrome.runtime.lastError;
    });
  }
});

// 서비스 워커가 시작될 때마다 규칙을 현재 코드 기준으로 재적용
// (확장 새로고침 시 onInstalled가 안 불릴 수 있으므로)
initRules();
loadStats();
loadDomLog();
