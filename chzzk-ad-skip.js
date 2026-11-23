// chzzk-ad-skip.js — 치지직(CHZZK) 동영상 광고 자동 스킵
// 네트워크 차단으로 막지 못한 광고가 재생될 때, 카운트다운이 끝나면 SKIP 버튼을 자동 클릭한다.
// 2026-11-20 실제 크롬 조사 결과 기반:
//   .ad_info_area > .skip_area > [data-role="countDownTxt"]  (카운트다운 숫자)
//   button.btn_skip  (처음엔 .hide, 카운트다운 종료 시 활성화)
(function () {
  "use strict";
  // 통계 보고는 큰 페이지에서만 (중복 방지)
  const IS_TOP_FRAME = typeof window === "undefined" || window === window.top;
  if (typeof location === "undefined") return;
  if (!/chzzk\.naver\.com$/.test(location.hostname)) return;
  if (window.__yabChzzkSkipInstalled) return;
  window.__yabChzzkSkipInstalled = true;

  let enabled = true;
  // "광고 허용 사이트"에서는 마스터 토글과 상관없이 끈다.
  let siteAllowed = false;
  let skippedCount = 0;
  let pollTimer = null;
  let observer = null;

  function trySkip() {
    if (!enabled) return;
    const adArea = document.querySelector(".ad_info_area");
    if (!adArea) return; // 광고 없음

    const btn = adArea.querySelector("button.btn_skip");
    if (!btn) return;

    // .hide 클래스가 제거되고 실제로 보일 때만 클릭
    const hidden = btn.classList.contains("hide");
    const visible = !!(btn.offsetWidth || btn.offsetHeight);
    if (!hidden && visible && !btn.disabled) {
      try {
        btn.click();
        skippedCount++;
        if (IS_TOP_FRAME) {
          chrome.runtime.sendMessage({ type: "adRemoved", count: 1 }, () => {
            void chrome.runtime.lastError;
          });
        }
        console.log("[치지직 광고 스킵] SKIP 클릭 (" + skippedCount + "회)");
      } catch (e) {
        /* 무시 */
      }
    }
  }

  function startPolling() {
    if (pollTimer) return;
    // 카운트다운이 끝나는 순간을 놓치지 않도록 250ms 간격 확인
    pollTimer = setInterval(trySkip, 250);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // DOM 변화로 광고가 생기면 폴링 시작
  observer = new MutationObserver(() => {
    if (!enabled) return;
    if (document.querySelector(".ad_info_area")) startPolling();
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true });

  // 토글 상태 로드 + 변경 감지
  try {
    chrome.storage.local.get(["adBlockerEnabled", "allowedSites"], (res) => {
      const allowed = !!(self.YabAllowlist &&
        self.YabAllowlist.isAllowed(self.YabAllowlist.topHostname(), res.allowedSites || []));
      siteAllowed = allowed;
      enabled = !allowed && res.adBlockerEnabled !== false;
      if (enabled && document.querySelector(".ad_info_area")) startPolling();
      else stopPolling();
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.adBlockerEnabled) {
        enabled = !siteAllowed && changes.adBlockerEnabled.newValue !== false;
        if (!enabled) stopPolling();
      }
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "toggle") {
        enabled = !siteAllowed && message.enabled !== false;
        if (!enabled) stopPolling();
      }
    });
  } catch (e) {
    /* storage 접근 불가 시 기본 활성 */
  }

  // 초기 실행
  if (document.querySelector(".ad_info_area")) startPolling();
  window.addEventListener("DOMContentLoaded", () => setTimeout(trySkip, 300));
})();
