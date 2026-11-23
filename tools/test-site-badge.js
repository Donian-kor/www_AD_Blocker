// background.js 사이트별 뱃지 동작 테스트
// 실행: node tools/test-site-badge.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "background.js"), "utf8");

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? "PASS" : "FAIL") + ": " + name);
  if (!ok) {
    console.log("  기대값:", JSON.stringify(expected));
    console.log("  실제값:", JSON.stringify(actual));
    failures++;
  }
}

// === chrome API 모형 ===
const badge = { text: "" };
const storage = {
  siteCounts: {
    "youtube.com": { net: 13, dom: 0 },
    "news.example.com": { net: 5, dom: 0 },
    "google.com": { net: 7, dom: 0 }
  },
  adBlockerEnabled: true,
  adBlockerStats: {
    blockedAds: 0,
    blockedRequests: 0,
    removedDomAds: 0,
    blockedLog: [],
    lastReset: 0
  }
};

const tabs = [
  { id: 1, url: "https://www.youtube.com/watch?v=abc", active: true },
  { id: 2, url: "https://www.google.com/search?q=x", active: false }
];
let mockActiveTabId = 1;

const listeners = {
  onRuleMatched: null,
  onMessage: null,
  onActivated: null,
  onUpdated: null,
  onRemoved: null,
  onFocusChanged: null,
  onContextMenu: null,
  sentMessages: []
};

const chrome = {
  runtime: {
    lastError: undefined,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener(fn) { listeners.onMessage = fn; } }
  },
  storage: {
    local: {
      get(keys, cb) {
        const out = {};
        keys.forEach((k) => { if (storage[k] !== undefined) out[k] = storage[k]; });
        cb(out);
      },
      set(obj, cb) {
        Object.assign(storage, obj);
        if (cb) cb();
      }
    },
    onChanged: { addListener() {} }
  },
  tabs: {
    query(query, cb) {
      if (query && query.active) {
        cb(tabs.filter((t) => t.id === mockActiveTabId));
      } else {
        cb(tabs.slice());
      }
    },
    get(tabId, cb) {
      cb(tabs.find((t) => t.id === tabId));
    },
    sendMessage(tabId, message, options, cb) {
      listeners.sentMessages.push({ tabId, message, options });
      if (cb) cb({ ok: true });
    },
    onActivated: { addListener(fn) { listeners.onActivated = fn; } },
    onUpdated: { addListener(fn) { listeners.onUpdated = fn; } },
    onRemoved: { addListener(fn) { listeners.onRemoved = fn; } }
  },
  contextMenus: {
    removeAll(cb) { if (cb) cb(); },
    create() {},
    onClicked: { addListener(fn) { listeners.onContextMenu = fn; } }
  },
  windows: {
    WINDOW_ID_NONE: -1,
    onFocusChanged: { addListener(fn) { listeners.onFocusChanged = fn; } }
  },
  action: {
    setBadgeText({ text }) { badge.text = text; },
    setBadgeBackgroundColor() {}
  },
  declarativeNetRequest: {
    onRuleMatchedDebug: { addListener(fn) { listeners.onRuleMatched = fn; } },
    getEnabledRulesets(cb) { if (cb) cb([]); },
    getAvailableStaticRuleCount(cb) { if (cb) cb(0); },
    updateEnabledRulesets(opts, cb) { if (cb) cb(); },
    updateDynamicRules(opts, cb) { if (cb) cb(); }
  }
};

// background.js는 importScripts로 모듈을 로드한다. Node VM에서도 같은 순서로
// 실제 파일을 실행해 AppState·stats 등 의존성을 채운다 (빈 스텁으로 두면 실패).
const sandbox = { chrome, URL, console, setTimeout, clearTimeout, Date, JSON, Map, Object, Number, String, Math };
sandbox.self = sandbox;
sandbox.importScripts = (...files) => {
  files.forEach((file) => {
    const code = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  });
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

function activate(tabId) {
  mockActiveTabId = tabId;
  listeners.onActivated({ tabId });
}

function navigate(tabId, url) {
  const tab = tabs.find((t) => t.id === tabId);
  tab.url = url;
  listeners.onUpdated(tabId, { url, status: "loading" }, tab);
}

(async () => {
  // 1) 시작 시 활성 탭(유튜브)의 저장된 숫자
  check("시작 시 유튜브 13", badge.text, "13");

  // 1-1) 우클릭 메뉴가 올바른 프레임으로 메시지를 보내는지
  listeners.onContextMenu({ menuItemId: "yab-block-element", frameId: 0 }, { id: 1 });
  listeners.onContextMenu({ menuItemId: "yab-clear-site", frameId: 0 }, { id: 1 });
  check("우클릭 차단 메뉴 메시지", listeners.sentMessages[0], {
    tabId: 1,
    message: { type: "blockLastRightClicked" },
    options: { frameId: 0 }
  });
  check("사이트 차단 해제 메뉴 메시지", listeners.sentMessages[1], {
    tabId: 1,
    message: { type: "clearSiteBlocks" },
    options: { frameId: 0 }
  });

  // 2) 같은 사이트 안에서 페이지 이동해도 유지
  navigate(1, "https://www.youtube.com/watch?v=xyz");
  check("유튜브 다른 페이지 이동 후 13 유지", badge.text, "13");

  // 3) 다른 사이트로 이동하면 그 사이트의 저장된 숫자
  navigate(1, "https://news.example.com/article");
  check("뉴스 사이트 이동 시 5", badge.text, "5");

  // 4) 탭 전환 시 각 탭의 사이트 숫자
  activate(2);
  check("구글 탭 전환 시 7", badge.text, "7");
  activate(1);
  check("뉴스 탭으로 복귀 시 5", badge.text, "5");

  // 5) 네트워크 차단 1건 추가 → 같은 사이트 누적
  listeners.onRuleMatched({
    tabId: 1,
    request: { url: "https://ads.doubleclick.net/pagead/ads" }
  });
  check("네트워크 차단 후 6", badge.text, "6");

  // 6) DOM 제거 2건 추가
  listeners.onMessage(
    { type: "adRemoved", count: 2 },
    { tab: { id: 1, url: "https://news.example.com/article" } },
    () => {}
  );
  check("DOM 제거 후 8", badge.text, "8");

  // 7) 뉴스 사이트 다른 페이지로 이동해도 누적 유지
  navigate(1, "https://news.example.com/other");
  check("뉴스 다른 페이지에서도 8 유지", badge.text, "8");

  // 8) 탭을 오가도 각 사이트 숫자 유지
  activate(2);
  check("구글 탭 다시 7", badge.text, "7");
  activate(1);
  check("뉴스 탭 다시 8", badge.text, "8");

  // 9) 저장소에 기록되는지 확인 (1초 디바운스 대기)
  await new Promise((resolve) => setTimeout(resolve, 1200));
  check("저장된 뉴스 카운트", storage.siteCounts["news.example.com"], { net: 6, dom: 2 });

  if (failures > 0) {
    console.error("실패: " + failures + "건");
    process.exit(1);
  }
  console.log("모든 사이트별 뱃지 테스트 통과");
})();
