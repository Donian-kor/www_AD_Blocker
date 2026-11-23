// options/allowlist-tab.js - "광고 허용 사이트" 탭
// 사용자는 주소만 붙여넣으면 되고, 도메인 추출·중복 제거는 shared/allowlist.js 가 한다.
import "../shared/allowlist.js";

const API = self.YabAllowlist;

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(res);
    });
  });
}

function render(sites) {
  const list = document.getElementById("allowList");
  const count = document.getElementById("allowCount");
  list.textContent = "";
  if (count) count.textContent = sites.length + "개";

  if (sites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "허용한 사이트가 없습니다. 모든 사이트에서 광고를 차단합니다.";
    list.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "site-card";
  sites.forEach((site) => {
    const row = document.createElement("div");
    row.className = "selector-row";

    const text = document.createElement("span");
    text.className = "selector-text";
    text.textContent = site;
    row.appendChild(text);

    const delBtn = document.createElement("button");
    delBtn.className = "danger tiny";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      const res = await send({ type: "removeAllowedSite", site });
      if (res && res.sites) render(res.sites);
    });

    row.appendChild(delBtn);
    card.appendChild(row);
  });
  list.appendChild(card);
}

async function reload() {
  const res = await send({ type: "getAllowedSites" });
  render((res && res.sites) || []);
}

function showMessage(text, isError) {
  const box = document.getElementById("allowMessage");
  if (!box) return;
  box.textContent = text;
  box.className = isError ? "allow-message error" : "allow-message";
  if (!text) return;
  setTimeout(() => {
    if (box.textContent === text) {
      box.textContent = "";
      box.className = "allow-message";
    }
  }, 4000);
}

async function addFromInput() {
  const input = document.getElementById("allowInput");
  const raw = input.value;
  const site = API.normalizeSite(raw);
  if (!site) {
    showMessage("주소를 알아볼 수 없습니다. 예: news.example.com", true);
    return;
  }

  const res = await send({ type: "addAllowedSite", site });
  if (!res || !res.success) {
    if (res && res.error === "limit") {
      showMessage("사이트는 최대 " + res.max + "개까지 추가할 수 있습니다.", true);
    } else {
      showMessage("추가하지 못했습니다.", true);
    }
    return;
  }
  input.value = "";
  if (res.duplicate) {
    showMessage(site + " 은(는) 이미 목록에 있습니다.", false);
  } else {
    showMessage(site + " 을(를) 허용 목록에 추가했습니다. 열려 있는 탭은 새로고침 후 적용됩니다.", false);
  }
  render(res.sites || []);
}

export function initAllowlistTab() {
  const input = document.getElementById("allowInput");
  const addBtn = document.getElementById("allowAddBtn");
  const clearBtn = document.getElementById("allowClearBtn");

  if (addBtn) addBtn.addEventListener("click", addFromInput);
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addFromInput();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (!confirm("허용 사이트를 모두 삭제하시겠습니까?")) return;
      const res = await send({ type: "clearAllowedSites" });
      render((res && res.sites) || []);
      showMessage("모든 허용 사이트를 삭제했습니다.", false);
    });
  }

  // 팝업에서 토글해도 이 목록이 즉시 갱신되도록 한다.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[API.STORAGE_KEY]) return;
    render(API.normalizeList(changes[API.STORAGE_KEY].newValue));
  });

  reload();
}
