// background/allowlist.js - "광고 허용 사이트" 저장 및 네트워크 규칙 적용
//
// 허용 사이트에서는 우리 확장이 요청을 막지 않아야 광고가 정상적으로 보인다.
// Chrome declarativeNetRequest 의 allowAllRequests 규칙 1개로
// "그 사이트의 페이지 + 그 페이지 안의 iframe 요청"까지 모두 허용한다.
//
// 우선순위를 1000 으로 두면 내장 차단 규칙(1~11)과 고정 허용 규칙(100)보다
// 항상 위에 있어, 어떤 필터가 켜져 있어도 허용이 이긴다.
// (같은 우선순위면 allow/allowAllRequests 가 block 보다 우선한다.)
(function () {
  "use strict";

  const API = self.YabAllowlist;
  const STORAGE_KEY = API.STORAGE_KEY;
  // 규칙 ID 대역: 300000 ~ 300999
  // (1~139: 내장/고정 규칙, 1000~: 필터 자동 업데이트 규칙과 겹치지 않는다)
  const RULE_ID_BASE = 300000;
  const RULE_PRIORITY = 1000;

  function readSites(callback) {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      callback(API.normalizeList(res && res[STORAGE_KEY]));
    });
  }

  // 사이트 1개당 규칙 1개. 그 사이트의 문서(main_frame)를 기준으로
  // 프레임 안의 모든 요청을 허용한다.
  function buildRules(sites) {
    return sites.map((site, index) => ({
      id: RULE_ID_BASE + index,
      priority: RULE_PRIORITY,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: [site],
        resourceTypes: ["main_frame", "sub_frame"],
      },
    }));
  }

  // 이전에 등록했을 수 있는 ID 전부 (사이트가 줄어도 남지 않게 함께 제거)
  function allRuleIds() {
    const ids = [];
    for (let i = 0; i < API.MAX_SITES; i++) ids.push(RULE_ID_BASE + i);
    return ids;
  }

  // applyRules() 등 여러 경로에서 동시에 불릴 수 있어 순차 실행한다.
  let queue = Promise.resolve();

  function applyAllowlist(masterOn) {
    const run = () => new Promise((resolve) => {
      readSites((sites) => {
        const rules = masterOn ? buildRules(sites) : [];
        const options = { removeRuleIds: allRuleIds() };
        if (rules.length) options.addRules = rules;
        chrome.declarativeNetRequest.updateDynamicRules(options, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.error("[허용 사이트] 규칙 적용 실패:", err.message);
          }
          resolve();
        });
      });
    });
    queue = queue.then(run, run);
    return queue;
  }

  // 목록을 저장하고 즉시 규칙에 반영한다.
  function saveSites(sites, callback) {
    const normalized = API.normalizeList(sites);
    chrome.storage.local.set({ [STORAGE_KEY]: normalized }, () => {
      readMaster((masterOn) => {
        applyAllowlist(masterOn).then(() => {
          if (callback) callback(normalized);
        });
      });
    });
  }

  function readMaster(callback) {
    chrome.storage.local.get(["adBlockerEnabled"], (res) => {
      callback(res && res.adBlockerEnabled !== undefined ? res.adBlockerEnabled : true);
    });
  }

  function withSites(callback) {
    readSites(callback);
  }

  // === 메시지 처리 ===
  // 옵션 페이지와 팝업이 모두 이 경로로만 저장한다 (저장 위치를 한 곳으로 모읍니다).
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;

    if (message.type === "getAllowedSites") {
      withSites((sites) => sendResponse({ sites }));
      return true;
    }

    if (message.type === "addAllowedSite") {
      const site = API.normalizeSite(message.site);
      if (!site) {
        sendResponse({ success: false, error: "invalid" });
        return true;
      }
      withSites((sites) => {
        if (sites.length >= API.MAX_SITES && sites.indexOf(site) < 0) {
          sendResponse({ success: false, error: "limit", max: API.MAX_SITES });
          return;
        }
        if (sites.indexOf(site) >= 0) {
          sendResponse({ success: true, site, duplicate: true, sites });
          return;
        }
        saveSites(sites.concat(site), (next) => {
          sendResponse({ success: true, site, sites: next });
        });
      });
      return true;
    }

    if (message.type === "removeAllowedSite") {
      const site = API.normalizeSite(message.site);
      withSites((sites) => {
        saveSites(sites.filter((s) => s !== site), (next) => {
          sendResponse({ success: true, sites: next });
        });
      });
      return true;
    }

    if (message.type === "setSiteAllowed") {
      // 팝업의 "이 사이트 광고 허용" 토글
      const site = API.normalizeSite(message.site);
      if (!site) {
        sendResponse({ success: false, error: "invalid" });
        return true;
      }
      withSites((sites) => {
        const allowed = message.allowed !== false;
        const next = allowed
          ? sites.concat(site)
          : sites.filter((s) => s !== site);
        if (allowed && sites.indexOf(site) < 0 && sites.length >= API.MAX_SITES) {
          sendResponse({ success: false, error: "limit", max: API.MAX_SITES });
          return;
        }
        saveSites(next, (saved) => {
          sendResponse({ success: true, site, allowed, sites: saved });
        });
      });
      return true;
    }

    if (message.type === "clearAllowedSites") {
      saveSites([], (next) => sendResponse({ success: true, sites: next }));
      return true;
    }

    return undefined;
  });

  // 다른 경로(개발자 도구 등)로 저장소가 바뀌어도 규칙이 어긋나지 않게 맞춘다.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    readMaster((masterOn) => applyAllowlist(masterOn));
  });

  self.applyAllowlist = applyAllowlist;
  self.allowlist = { RULE_ID_BASE, RULE_PRIORITY, buildRules };
})();
