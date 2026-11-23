// element-blocker.js - 우클릭한 광고 요소를 사이트별로 기억해 숨긴다.
// 모든 사이트(iframe 포함)에 주입된다.
(function () {
  "use strict";
  // 통계 보고는 큰 페이지에서만 (중복 방지)
  const IS_TOP_FRAME = typeof window === "undefined" || window === window.top;
  // YouTube Studio는 광고 차단 대상이 아니므로 전부 건너뜀
  if (typeof location !== "undefined" && location.hostname === "studio.youtube.com") return;

  const STORAGE_KEY = "blockedSelectors";
  const MAX_PER_SITE = 200;
  const STYLE_ID = "yab-blocked-style";
  const TOAST_ID = "yab-block-toast";
  const AD_ATTRS = ["data-ad-t", "data-ad-slot", "data-ad-unit", "data-ad"];
  const PICK_STYLE_ID = "yab-pick-highlight-style";
  const PICK_ATTR = "data-yab-pick";

  // === 선택자 생성용 순수 함수 (Node 테스트에서도 사용) ===
  function escapeCss(value) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch);
  }

  // 무작위로 생성된 ID/클래스(해시, 긴 숫자 등)는 선택자에서 제외
  function isStableToken(value) {
    if (!value || value.length > 48) return false;
    if (/^\d+$/.test(value)) return false;
    if (/^(css|sc|jsx|emotion|styled)-[a-z0-9-]{4,}$/i.test(value)) return false;
    if (/[a-f0-9]{10,}/i.test(value)) return false;
    if (/\d{4,}/.test(value)) return false;
    if (value.length >= 10 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) return false;
    return true;
  }

  // 영상 플레이어 자체는 실수로 숨기면 재생이 깨지므로 차단 대상에서 제외
  function isPlayerElement(el) {
    if (!el) return false;
    if (el.tagName === "VIDEO") return true;
    if (el.id === "movie_player" || el.id === "player") return true;
    if (Array.from(el.classList || []).includes("html5-video-player")) return true;
    return false;
  }

  function buildSelector(el, root) {
    if (!el || el.nodeType !== 1) return null;
    if (isPlayerElement(el)) return null;
    root = root || document.body;
    if (!root || el === root) return null;
    if (typeof document !== "undefined" && el === document.documentElement) return null;

    // 광고 전용 data 속성이 있으면 같은 광고 슬롯을 한 번에 차단 (예: arca.live)
    for (const attr of AD_ATTRS) {
      if (el.hasAttribute && el.hasAttribute(attr)) return "[" + attr + "]";
    }

    if (el.id && isStableToken(el.id)) return "#" + escapeCss(el.id);

    const parts = [];
    let node = el;
    let depth = 0;

    while (node && node.nodeType === 1 && node !== root && depth < 8) {
      let part = node.tagName.toLowerCase();
      const classes = Array.from(node.classList || []).filter(isStableToken).slice(0, 3);
      if (classes.length) part += "." + classes.map(escapeCss).join(".");

      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children || []).filter((c) => c.tagName === node.tagName);
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);

      // 안정적인 ID를 가진 조상을 만나면 거기서 경로를 끊는다.
      if (node.id && isStableToken(node.id)) {
        parts[0] = "#" + escapeCss(node.id);
        break;
      }

      node = parent;
      depth++;
    }

    if (node === root) {
      parts.unshift(root.tagName ? root.tagName.toLowerCase() : "body");
    }

    // 태그 하나만 있는 선택자(span 등)는 너무 광범위하므로 거부
    if (parts.length === 1 && !/[.#\[]/.test(parts[0])) return null;

    const selector = parts.join(" > ");
    return selector.length <= 600 ? selector : null;
  }

  // 클릭한 요소에서 가까운 "광고 컨테이너"를 찾는다.
  function findBlockTarget(el, root) {
    root = root || document.body;
    if (!el || el.nodeType !== 1) return el;

    let node = el;
    for (let i = 0; node && node !== root && i < 4; i++) {
      const cls = node.classList ? Array.from(node.classList).join(" ") : "";
      const id = node.id || "";
      let data = "";
      if (node.getAttribute) {
        for (const attr of AD_ATTRS) {
          const value = node.getAttribute(attr);
          if (value) data += " " + attr + " " + value;
        }
      }

      const hint = (cls + " " + id + " " + data).toLowerCase();
      if (/advert|sponsor|promo|(^|[\s_-])(ad|ads|banner)([\s_-]|$)/.test(hint)) {
        // 유튜브 플레이어처럼 영상이 들어있는 큰 컨테이너는 잘못 숨기지 않도록 제외
        if (!isPlayerElement(node) && (!node.querySelector || !node.querySelector("video"))) {
          return node;
        }
      }
      node = node.parentElement;
    }
    return el;
  }

  // Node 테스트용 (브라우저 content script에서는 module이 없으므로 실행되지 않음)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { isStableToken, buildSelector, findBlockTarget };
    return;
  }

  // === 브라우저에서만 실행 ===
  let lastTarget = null;
  let enabled = true;
  let selectors = [];

  // === 요소 차단 모드 (우클릭이 막힌 사이트용 요소 선택기) ===
  let picking = false;
  let pickTarget = null;
  let pickHandlers = null;

  function setPickTarget(el) {
    if (pickTarget && pickTarget.removeAttribute) pickTarget.removeAttribute(PICK_ATTR);
    pickTarget = el && el.nodeType === 1 ? el : null;
    if (pickTarget && pickTarget.setAttribute) pickTarget.setAttribute(PICK_ATTR, "");
  }

  function injectPickStyle() {
    if (document.getElementById(PICK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PICK_STYLE_ID;
    style.textContent = "[" + PICK_ATTR + "]{outline:3px solid #2563eb !important;outline-offset:-3px;cursor:crosshair !important}";
    (document.head || document.documentElement).appendChild(style);
  }

  function stopPick(notify) {
    if (!picking) return;
    picking = false;
    setPickTarget(null);
    if (pickHandlers) {
      window.removeEventListener("mousemove", pickHandlers.move, true);
      window.removeEventListener("click", pickHandlers.click, true);
      window.removeEventListener("keydown", pickHandlers.key, true);
      pickHandlers = null;
    }
    const style = document.getElementById(PICK_STYLE_ID);
    if (style) style.remove();
    if (notify) showToast("요소 차단 모드를 종료했습니다.");
  }

  function startPick() {
    if (picking) return;
    if (!enabled) {
      showToast("광고 차단이 꺼져 있습니다. 팝업에서 켜 주세요.");
      return;
    }
    picking = true;
    injectPickStyle();
    showToast("차단할 요소 위에 마우스를 두고 클릭하세요. ESC 취소");

    const move = (e) => {
      if (!picking) return;
      let el = null;
      try { el = document.elementFromPoint(e.clientX, e.clientY); } catch (err) { /* 무시 */ }
      setPickTarget(el);
    };
    const click = (e) => {
      if (!picking) return;
      e.preventDefault();          // 링크 이동 등 페이지 동작 방지
      e.stopImmediatePropagation();
      const raw = pickTarget || e.target;
      const target = findBlockTarget(raw, document.body);
      const selector = buildSelector(target, document.body);
      stopPick(false);
      if (!selector) {
        showToast("이 요소는 차단할 수 없습니다. 다른 요소를 선택해 주세요.");
        return;
      }
      saveSelector(selector, (ok) => {
        showToast(ok ? "광고 요소를 차단했습니다." : "저장에 실패했습니다.");
      }, target);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stopPick(true);
      }
    };
    pickHandlers = { move, click, key };
    window.addEventListener("mousemove", move, true);
    window.addEventListener("click", click, true);
    window.addEventListener("keydown", key, true);
  }

  // iframe 안에서도 상위 사이트 기준으로 규칙을 저장한다.
  function siteKey() {
    try {
      const origins = location.ancestorOrigins;
      if (origins && origins.length > 0) {
        const top = new URL(origins[0]);
        if (top.protocol === "http:" || top.protocol === "https:") {
          return top.hostname.replace(/^www\./, "");
        }
      }
    } catch (e) {
      // 접근 실패 시 현재 프레임 기준으로 처리
    }
    return location.hostname.replace(/^www\./, "") || "";
  }

  function applySelectors() {
    let style = document.getElementById(STYLE_ID);
    if (!enabled || selectors.length === 0) {
      if (style) style.textContent = "";
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    // 선택자마다 별도 규칙으로 넣어 잘못된 선택자 하나가 전체를 막지 않게 한다.
    style.textContent = selectors.map((s) => s + "{display:none !important}").join("\n");
  }

  function loadState() {
    chrome.storage.local.get([STORAGE_KEY, "adBlockerEnabled"], (res) => {
      enabled = res.adBlockerEnabled !== undefined ? res.adBlockerEnabled : true;
      const all = res[STORAGE_KEY] || {};
      const key = siteKey();
      selectors = key && Array.isArray(all[key]) ? all[key] : [];
      applySelectors();
    });
  }

  // 수동 차단도 DOM 기록에 남긴다 (출처: manual). 원본 class/id는 저장하지 않는다.
  function reportManualBlock(element) {
    if (!IS_TOP_FRAME) return;
    const kind = (self.BlockCategory && self.BlockCategory.elementKind(element)) || "other";
    try {
      chrome.runtime.sendMessage({
        type: "adRemoved",
        count: 1,
        kinds: { [kind]: 1 },
        source: "manual",
      }, () => { void chrome.runtime.lastError; });
    } catch (e) {}
  }

  function saveSelector(selector, done, element) {
    const key = siteKey();
    if (!key) {
      done(false);
      return;
    }
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const all = res[STORAGE_KEY] || {};
      const list = Array.isArray(all[key]) ? all[key].slice() : [];
      const isNew = !list.includes(selector);
      if (isNew) list.push(selector);
      while (list.length > MAX_PER_SITE) list.shift();
      all[key] = list;

      chrome.storage.local.set({ [STORAGE_KEY]: all }, () => {
        if (chrome.runtime.lastError) {
          done(false);
          return;
        }
        selectors = list;
        applySelectors();
        if (isNew) reportManualBlock(element);
        done(true);
      });
    });
  }

  function removeSelector(selector) {
    const key = siteKey();
    if (!key) return;
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const all = res[STORAGE_KEY] || {};
      const list = Array.isArray(all[key]) ? all[key].slice() : [];
      const index = list.indexOf(selector);
      if (index === -1) return;
      list.splice(index, 1);
      if (list.length > 0) all[key] = list;
      else delete all[key];
      chrome.storage.local.set({ [STORAGE_KEY]: all });
    });
  }

  function clearSiteBlocks() {
    const key = siteKey();
    if (!key) return;
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const all = res[STORAGE_KEY] || {};
      if (!all[key] || all[key].length === 0) {
        showToast("이 사이트에 직접 차단한 요소가 없습니다.");
        return;
      }
      delete all[key];
      chrome.storage.local.set({ [STORAGE_KEY]: all }, () => {
        selectors = [];
        applySelectors();
        showToast("이 사이트의 직접 차단 요소를 모두 해제했습니다.");
      });
    });
  }

  let toastTimer = null;
  function showToast(message, undoSelector) {
    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();

    const box = document.createElement("div");
    box.id = TOAST_ID;
    box.style.cssText = [
      "all:initial",
      "position:fixed",
      "left:50%",
      "bottom:24px",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "gap:10px",
      "max-width:calc(100vw - 32px)",
      "padding:10px 14px",
      "border-radius:8px",
      "background:#1a1a2e",
      "color:#fff",
      "font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif",
      "box-shadow:0 4px 16px rgba(0,0,0,.45)",
      "pointer-events:auto"
    ].join(";");

    const text = document.createElement("span");
    text.style.cssText = "all:initial;color:#fff;font:13px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;";
    text.textContent = message;
    box.appendChild(text);

    if (undoSelector) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "실행 취소";
      btn.style.cssText = "all:initial;cursor:pointer;border:0;border-radius:5px;padding:5px 9px;background:#e94560;color:#fff;font:12px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;";
      btn.addEventListener("click", () => {
        removeSelector(undoSelector);
        box.remove();
      });
      box.appendChild(btn);
    }

    (document.body || document.documentElement).appendChild(box);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.remove(), 5000);
  }

  window.addEventListener(
    "contextmenu",
    (event) => {
      lastTarget = event.target;
    },
    true
  );

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "startElementPick") {
      startPick();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "stopElementPick") {
      stopPick(true);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "blockLastRightClicked") {
      if (!enabled) {
        showToast("광고 차단이 꺼져 있습니다. 팝업에서 켜 주세요.");
        sendResponse({ ok: false, reason: "disabled" });
        return;
      }

      const target = lastTarget && lastTarget.isConnected ? lastTarget : null;
      if (!target) {
        showToast("차단할 요소를 찾지 못했습니다. 다시 우클릭해 주세요.");
        sendResponse({ ok: false, reason: "no-target" });
        return;
      }

      const blockTarget = findBlockTarget(target, document.body);
      const selector = buildSelector(blockTarget, document.body);
      if (!selector) {
        showToast("이 요소는 차단할 수 없습니다. 광고 영역을 다시 우클릭해 주세요.");
        sendResponse({ ok: false, reason: "no-selector" });
        return;
      }

      saveSelector(selector, (ok) => {
        if (ok) {
          showToast("광고 요소를 차단했습니다.", selector);
          sendResponse({ ok: true, selector });
        } else {
          showToast("차단 규칙을 저장하지 못했습니다.");
          sendResponse({ ok: false, reason: "save-failed" });
        }
      }, blockTarget);
      return true;
    }

    if (message.type === "clearSiteBlocks") {
      clearSiteBlocks();
      sendResponse({ ok: true });
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) {
      const all = changes[STORAGE_KEY].newValue || {};
      const key = siteKey();
      selectors = key && Array.isArray(all[key]) ? all[key] : [];
      applySelectors();
    }
    if (changes.adBlockerEnabled) {
      enabled = changes.adBlockerEnabled.newValue !== false;
      applySelectors();
    }
  });

  loadState();
})();
