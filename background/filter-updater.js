// background/filter-updater.js - 필터 전체 업데이트 로직

// === 필터 업데이트 소스 정의 ===
// shared/filter-registry.js에서 그룹별 URL·상한을 자동 생성한다.
// (로컬 file: 소스는 런타임 업데이트에서 제외)
const FILTER_SOURCES = {};
for (const group of FilterRegistry.FILTER_GROUPS) {
  const sources = FilterRegistry.getGroupSources(group.id).filter((s) => !!s.url);
  FILTER_SOURCES[group.id] = {
    limit: sources.reduce((sum, s) => sum + (s.limit || 0), 0),
    urls: sources.map((s) => s.url),
  };
}

const COMMIT_ID_START = 1000;    // 업데이트 규칙 ID 대역 (기존 1~68, 100~109와 충돌 없음)
const DYNAMIC_RULE_LIMIT = 30000; // Chrome 전체 동적 규칙 한도
// "광고 허용 사이트" 규칙(최대 1000개)과 내장 규칙 몫을 미리 남겨 둔다.
// 필터 업데이트가 한도를 다 쓰면 허용 규칙을 넣을 자리가 없어 예외가 동작하지 않는다.
const MAX_DYNAMIC_RULES = DYNAMIC_RULE_LIMIT - 1500;
const MAX_FILTER_BYTES = 10 * 1024 * 1024; // 파일 10MB 제한 (AdGuard Base 약 7MB 대응)
const FETCH_TIMEOUT_MS = 10000;
const UPDATE_DEBOUNCE_MS = 10000;
let lastUpdateAt = 0;
let updateInProgress = false;
let staticUrlFilters = null; // 정적 규칙에 이미 있는 urlFilter 집합 (중복 제거용)

// 정적 필터 인덱스 로드 (패키지 내장 JSON)
async function loadStaticIndex() {
  if (staticUrlFilters) return staticUrlFilters;
  try {
    const res = await fetch(chrome.runtime.getURL("filters/static-index.json"));
    const data = await res.json();
    staticUrlFilters = new Set(data.urlFilters || []);
    console.log("[정적 필터 인덱스] " + staticUrlFilters.size + "개 로드");
  } catch (e) {
    console.error("[정적 필터 인덱스] 로드 실패:", e.message);
    staticUrlFilters = new Set();
  }
  return staticUrlFilters;
}

async function fetchFilterText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (text.length > MAX_FILTER_BYTES) throw new Error("파일 크기 초과 (" + Math.round(text.length / 1024 / 1024) + "MB)");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function convertFilterText(text, limit) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cancelled = new Set();
  for (const line of lines) {
    if (!line.startsWith("!") && !line.startsWith("[") && line.includes("badfilter")) {
      cancelled.add(FilterConverter.normalizeBadfilter(line));
    }
  }
  const rules = [];
  const seen = new Set();
  for (const line of lines) {
    if (!line || line.startsWith("!") || line.startsWith("[") || line.includes("#")) continue;
    if (line.startsWith("/")) continue;
    if (cancelled.has(FilterConverter.normalizeBadfilter(line))) continue;
    const rule = FilterConverter.convertLine(line);
    if (!rule) continue;
    const key = JSON.stringify([rule.action.type, rule.condition]);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
    if (rules.length >= limit) break;
  }
  return rules;
}

function dnrUpdate(options) {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(options, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

// 규칙 배열의 지문 계산 (내용이 같은지 비교용)
function rulesFingerprint(rules) {
  let h = 5381;
  for (const r of rules) {
    const s = r.action.type + "|" + JSON.stringify(r.condition);
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h = h | 0;
    }
  }
  return (h >>> 0).toString(36);
}

async function updateFilters() {
  const now = Date.now();
  if (updateInProgress) return { ok: false, reason: "진행 중" };
  if (now - lastUpdateAt < UPDATE_DEBOUNCE_MS) return { ok: false, reason: "너무 빠른 재요청" };
  updateInProgress = true;
  lastUpdateAt = now;

  try {
    // 정적 필터에 이미 있는 도메인 집합 로드 (중복 제거용)
    const staticSet = await loadStaticIndex();
    let duplicateCount = 0;

    const allRules = [];
    for (const groupKey of Object.keys(FILTER_SOURCES)) {
      const src = FILTER_SOURCES[groupKey];
      let groupRules = [];
      for (const url of src.urls) {
        try {
          const text = await fetchFilterText(url);
          const converted = convertFilterText(text, src.limit - groupRules.length);
          groupRules = groupRules.concat(converted);
        } catch (e) {
          console.error("[필터 업데이트] " + url + " 실패: " + e.message);
        }
      }
      // 정적 필터에 이미 있는 규칙은 제외 (신규 도메인만 동적으로 등록)
      const fresh = groupRules.filter((r) => {
        if (r.condition && r.condition.urlFilter && staticSet.has(r.condition.urlFilter)) {
          duplicateCount++;
          return false;
        }
        return true;
      });
      allRules.push(...fresh.slice(0, src.limit));
    }

    if (allRules.length === 0) {
      updateInProgress = false;
      return { ok: true, count: 0, unchanged: true, reason: "정적 필터에 모두 포함됨" };
    }
    if (allRules.length > MAX_DYNAMIC_RULES) allRules.length = MAX_DYNAMIC_RULES;

    const committed = allRules.map((r, i) => Object.assign({}, r, { id: COMMIT_ID_START + i }));
    const newFingerprint = rulesFingerprint(committed);

    // 이전 규칙 지문과 비교 — 내용이 같으면 새로 등록할 필요 없음
    const prevState = await new Promise((resolve) => {
      chrome.storage.local.get(["dynamicRuleCount", "filterFingerprint"], (res) => resolve(res));
    });

    if (prevState.filterFingerprint === newFingerprint) {
      updateInProgress = false;
      return { ok: true, count: committed.length, unchanged: true };
    }

    // 1단계: 이전 업데이트 규칙 모두 제거 (한도 여유 확보)
    const prev = prevState.dynamicRuleCount || 0;
    const oldIds = [];
    for (let i = 0; i < prev; i++) oldIds.push(COMMIT_ID_START + i);

    if (oldIds.length > 0) {
      await dnrUpdate({ removeRuleIds: oldIds });
    }

    // 2단계: 새 규칙 추가 (이제 한도 여유가 있음)
    await dnrUpdate({ addRules: committed });

    // 업데이트 이력 기록 (최근 20개)
    const historyEntry = {
      at: now,
      added: committed.length,
      duplicates: duplicateCount,
      total: committed.length,
    };

    chrome.storage.local.get(["updateHistory"], (res) => {
      const history = Array.isArray(res.updateHistory) ? res.updateHistory : [];
      history.unshift(historyEntry);
      if (history.length > 20) history.length = 20;
      chrome.storage.local.set({
        updateStatus: { updatedAt: now, count: committed.length },
        dynamicRuleCount: committed.length,
        filterFingerprint: newFingerprint,
        updateHistory: history,
      });
    });
    updateInProgress = false;
    return { ok: true, count: committed.length, unchanged: false, duplicates: duplicateCount, historyEntry };
  } catch (e) {
    updateInProgress = false;
    return { ok: false, reason: e.message };
  }
}

// === 메시지 핸들러: 필터 업데이트 ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "updateFilters") {
    updateFilters().then((result) => sendResponse(result));
    return true;
  }
  if (message.type === "getUpdateHistory") {
    chrome.storage.local.get(["updateHistory"], (res) => {
      sendResponse({ history: Array.isArray(res.updateHistory) ? res.updateHistory : [] });
    });
    return true;
  }
});
