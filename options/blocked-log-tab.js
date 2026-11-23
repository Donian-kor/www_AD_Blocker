// options/blocked-log-tab.js - 자동 차단 기록 (네트워크 / DOM 각각 최대 5,000건)
// 데이터: stats.blockedLog(네트워크), AppState.domLog(DOM), 전체 차단 횟수
// 분류 표시: shared/block-category.js (전역 BlockCategory)

const BC = (typeof self !== "undefined" && self.BlockCategory) ||
  (typeof BlockCategory !== "undefined" ? BlockCategory : null);

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "알 수 없는 주소";
  } catch (e) {
    return "알 수 없는 주소";
  }
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch (e) {
    return url;
  }
}

function timeAgo(ts) {
  if (!ts || Number.isNaN(ts)) return "-";
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return "방금 전";
  if (diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + "분 전";
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + "시간 전";
  return new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function fullTime(ts) {
  if (!ts || Number.isNaN(ts)) return "";
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function catInfo(key) {
  if (BC && BC.categoryOf) return BC.categoryOf(key);
  return { label: key || "미분류", color: "#64748b", bg: "#f1f5f9" };
}

function kindInfo(key) {
  if (BC && BC.domKindOf) return BC.domKindOf(key);
  return { label: key || "기타", color: "#64748b", bg: "#f1f5f9" };
}

function sourceInfo(key) {
  return BC && BC.domSourceOf ? BC.domSourceOf(key) : (key || "기타");
}

function makeBadge(info, text) {
  const span = document.createElement("span");
  span.className = "log-cat-badge";
  span.textContent = text || info.label;
  span.style.color = info.color;
  span.style.backgroundColor = info.bg;
  span.style.borderColor = info.color + "33";
  return span;
}

// 이전 기록에는 category가 없으므로 URL 단서로 보완한다.
function categoryOfEntry(entry) {
  const saved = entry && entry.category;
  if (saved && saved !== "unknown") return saved;
  return BC && BC.classifyUrl ? BC.classifyUrl(entry && entry.url ? entry.url : "") : "unknown";
}

function kindOfKey(fullKey) {
  const i = String(fullKey || "").indexOf(":");
  return i < 0 ? String(fullKey || "") : String(fullKey).slice(i + 1);
}

function sourceOfKey(fullKey) {
  const i = String(fullKey || "").indexOf(":");
  return i < 0 ? "" : String(fullKey).slice(0, i);
}

export function initBlockedLogTab() {
  const container = document.getElementById("siteLogList");
  const searchInput = document.getElementById("logSearch");
  const filterSelect = document.getElementById("logCategoryFilter");
  const modeButtons = document.querySelectorAll(".log-tab-btn");
  if (!container) return;

  let networkLog = [];
  let domLog = [];
  let mode = "network";   // "network" | "dom"
  let keyword = "";
  let filterKey = "";

  function currentLog() {
    return mode === "dom" ? domLog : networkLog;
  }

  function fillFilter() {
    if (!filterSelect) return;
    filterSelect.textContent = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "전체 분류";
    filterSelect.appendChild(all);

    const map = mode === "dom" ? (BC ? BC.DOM_KINDS : {}) : (BC ? BC.CATEGORIES : {});
    Object.keys(map).forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = mode === "dom" ? BC.domKindOf(key).label : BC.categoryOf(key).label;
      filterSelect.appendChild(option);
    });
    filterKey = "";
    filterSelect.value = "";
  }

  function matchesFilter(entry) {
    if (!filterKey) return true;
    if (mode === "network") return categoryOfEntry(entry) === filterKey;
    const kinds = entry.kinds || {};
    return Object.keys(kinds).some((key) => kindOfKey(key) === filterKey);
  }

  function searchText(entry, host) {
    if (mode === "dom") {
      const kinds = entry.kinds || {};
      const labels = Object.keys(kinds).map((key) =>
        kindInfo(kindOfKey(key)).label + " " + sourceInfo(sourceOfKey(key)));
      return (host + " " + labels.join(" ")).toLowerCase();
    }
    return ((entry.url || "") + " " + catInfo(categoryOfEntry(entry)).label + " " +
      (entry.source || "")).toLowerCase();
  }

  // 사이트 카드 상단 요약: 분류별 건수 + DOM 총 제거 개수
  function buildSummary(items) {
    const counts = new Map();
    let elements = 0;
    items.forEach((entry) => {
      if (mode === "dom") {
        elements += Number(entry.count) || 0;
        const kinds = entry.kinds || {};
        Object.keys(kinds).forEach((key) => {
          const kind = kindOfKey(key);
          counts.set(kind, (counts.get(kind) || 0) + (Number(kinds[key]) || 0));
        });
      } else {
        const key = categoryOfEntry(entry);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });

    const summary = document.createElement("div");
    summary.className = "site-log-summary";
    if (mode === "dom" && elements > 0) {
      const total = document.createElement("span");
      total.className = "site-log-summary-total";
      total.textContent = "총 " + elements + "개 제거";
      summary.appendChild(total);
    }
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([key, n]) => {
      const info = mode === "dom" ? kindInfo(key) : catInfo(key);
      const chip = makeBadge(info, info.label + " " + n);
      chip.classList.add("log-summary-chip");
      summary.appendChild(chip);
    });
    return summary;
  }

  function render() {
    container.textContent = "";
    const entries = currentLog();

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "log-empty-state";
      empty.textContent = mode === "dom"
        ? "아직 DOM 제거 기록이 없습니다. 광고 요소가 숨겨지면 여기에 표시됩니다."
        : "아직 차단 기록이 없습니다. 광고가 막히면 여기에 표시됩니다.";
      container.appendChild(empty);
      return;
    }

    // 사이트별로 묶기 (최신 기록 순서 유지)
    const groups = new Map();
    for (const entry of entries) {
      const host = mode === "dom"
        ? (entry.site || "알 수 없는 사이트")
        : hostOf(entry && entry.url ? entry.url : "");
      if (keyword && !searchText(entry, host).includes(keyword)) continue;
      if (!matchesFilter(entry)) continue;
      if (!groups.has(host)) groups.set(host, []);
      groups.get(host).push(entry);
    }

    if (groups.size === 0) {
      const empty = document.createElement("div");
      empty.className = "log-empty-state";
      empty.textContent = "검색 결과가 없습니다.";
      container.appendChild(empty);
      return;
    }

    // 건수 많은 사이트부터
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [host, items] of sorted) {
      const card = document.createElement("div");
      card.className = "site-log-card";

      const head = document.createElement("div");
      head.className = "site-log-head";

      const name = document.createElement("span");
      name.className = "site-log-name";
      name.textContent = host;

      const count = document.createElement("span");
      count.className = "site-log-count";
      count.textContent = items.length + "건";

      const arrow = document.createElement("span");
      arrow.className = "site-log-arrow";
      arrow.textContent = "▼";

      head.appendChild(name);
      head.appendChild(count);
      head.appendChild(arrow);

      const body = document.createElement("div");
      body.className = "site-log-body";

      const summary = buildSummary(items);
      if (summary.childNodes.length) body.appendChild(summary);

      for (const entry of items.slice(0, 50)) {
        const row = document.createElement("div");
        row.className = "site-log-row";

        const time = document.createElement("span");
        time.className = "site-log-time";
        time.textContent = timeAgo(entry.time);
        time.title = fullTime(entry.time);

        const detail = document.createElement("span");
        if (mode === "dom") {
          const kinds = entry.kinds || {};
          const keys = Object.keys(kinds);
          if (keys.length) {
            detail.className = "site-log-kinds";
            keys.sort().forEach((key) => {
              const kind = kindOfKey(key);
              const source = sourceOfKey(key);
              const chip = makeBadge(kindInfo(kind),
                (source ? sourceInfo(source) + " " : "") + kindInfo(kind).label + " " + kinds[key]);
              detail.appendChild(chip);
            });
            detail.title = host + "에서 " + (entry.count || 1) + "개 제거 · " + fullTime(entry.time);
          } else {
            detail.className = "site-log-path";
            detail.textContent = "광고 요소 " + (entry.count || 1) + "개 제거 (이전 기록)";
            detail.title = host + "에서 " + (entry.count || 1) + "개 제거 · " + fullTime(entry.time);
          }
        } else {
          detail.className = "site-log-detail";
          detail.appendChild(makeBadge(catInfo(categoryOfEntry(entry))));
          const path = document.createElement("span");
          path.className = "site-log-path";
          path.textContent = pathOf(entry.url || "");
          path.title = entry.url || "";
          detail.appendChild(path);
          if (entry.source) {
            const src = document.createElement("span");
            src.className = "log-source";
            src.textContent = entry.source;
            detail.appendChild(src);
          }
          detail.title = entry.url || "";
        }

        row.appendChild(time);
        row.appendChild(detail);
        body.appendChild(row);
      }

      head.addEventListener("click", () => {
        const open = body.classList.toggle("open");
        arrow.textContent = open ? "▲" : "▼";
      });

      card.appendChild(head);
      card.appendChild(body);
      container.appendChild(card);
    }
  }

  function load() {
    chrome.runtime.sendMessage({ type: "getBlockedLog" }, (res) => {
      networkLog = (res && res.log) || [];
      render();
    });
    chrome.runtime.sendMessage({ type: "getDomLog" }, (res) => {
      domLog = (res && res.log) || [];
      render();
    });
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.log || "network";
      fillFilter();
      render();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      keyword = searchInput.value.trim().toLowerCase();
      render();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      filterKey = filterSelect.value;
      render();
    });
  }

  fillFilter();
  load();

  // 통계 초기화·토글 변경·DOM 기록 저장 시 목록 갱신
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.adBlockerStats || changes.adBlockerDomLog || changes.adBlockerEnabled)) {
      load();
    }
  });
}
