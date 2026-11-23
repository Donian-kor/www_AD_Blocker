// background/main-world-scripts.js - MAIN world 콘텐츠 스크립트 동적 등록
//
// youtube-main.js 는 manifest.json 에 정적으로 선언하지 않고, 광고 차단이
// 켜져 있을 때만 chrome.scripting 으로 등록한다.
//
// 이유: manifest 정적 선언은 광고 차단이 꺼져 있어도 항상 로드된다. 정적으로
//      선언된 MAIN world 스크립트는 격리 world 에서 상태를 전달받을 수 없어
//      <html data-yab-*> 같은 속성이나 window.postMessage 방송이 필요하고,
//      이 둘은 페이지의 어떤 스크립트든 읽을 수 있는 확장 식별 흔적이 된다.
//      동적 등록을 쓰면 꺼짐 상태에서는 페이지에 아무것도 남기지 않는다.
//
// 같은 이유로 "광고 허용 사이트"에 동영상 사이트가 들어 있으면 아예 등록하지 않는다.
// MAIN world 스크립트는 chrome.storage 를 읽을 수 없어 스스로 판단할 수 없기 때문에,
// 주입 자체를 막는 방법만이 확실하다.
//
// 등록/해제는 이후 페이지 로드에 적용된다. (현재 열린 탭은 F5 필요)
(function () {
  "use strict";

  const SCRIPT_ID = "yab-youtube-main";
  const SCRIPT_CONFIG = {
    id: SCRIPT_ID,
    matches: ["*://*.youtube.com/*"],
    js: ["youtube-main.js"],
    runAt: "document_start",
    world: "MAIN",
    persistAcrossSessions: true
  };

  // 여러 경로에서 동시에 호출될 수 있어 순차 큐로 직렬화한다.
  let queue = Promise.resolve();

  function getRegistered(callback) {
    try {
      chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }, (list) => {
        void chrome.runtime.lastError;
        callback(Array.isArray(list) && list.length > 0 ? list[0] : null);
      });
    } catch (e) {
      callback(null);
    }
  }

  function readAllowedSites(callback) {
    if (typeof YabAllowlist === "undefined") {
      callback([]);
      return;
    }
    chrome.storage.local.get([YabAllowlist.STORAGE_KEY], (res) => {
      callback(YabAllowlist.normalizeList(res && res[YabAllowlist.STORAGE_KEY]));
    });
  }

  // 허용 목록에 동영상 사이트가 있으면 후킹을 주입하지 않는다.
  function isVideoSiteAllowed(sites) {
    return sites.some((site) => site === "youtube.com" || /\.youtube\.com$/.test(site));
  }

  // 광고 차단 상태와 허용 사이트 목록에 맞춰 등록을 맞춘다.
  function syncMainWorldScripts(enabled) {
    const run = () => new Promise((resolve) => {
      if (!chrome.scripting || !chrome.scripting.registerContentScripts) {
        resolve(); // 지원하지 않는 브라우저는 조용히 건너뜀
        return;
      }
      readAllowedSites((sites) => {
        const shouldRun = enabled && !isVideoSiteAllowed(sites);
        getRegistered((script) => {
          const done = () => resolve();

          if (!shouldRun) {
            if (!script) {
              done();
              return;
            }
            chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }, () => {
              void chrome.runtime.lastError;
              done();
            });
            return;
          }

          if (script) {
            done(); // 이미 등록되어 있음
            return;
          }

          chrome.scripting.registerContentScripts([SCRIPT_CONFIG], () => {
            if (chrome.runtime.lastError) {
              console.error("[MAIN world 스크립트] 등록 실패:", chrome.runtime.lastError.message);
            }
            done();
          });
        });
      });
    });

    queue = queue.then(run, run);
    return queue;
  }

  self.syncMainWorldScripts = syncMainWorldScripts;
})();
