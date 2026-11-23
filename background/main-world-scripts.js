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

  function isRegistered(callback) {
    try {
      chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }, (list) => {
        void chrome.runtime.lastError;
        callback(Array.isArray(list) && list.length > 0);
      });
    } catch (e) {
      callback(false);
    }
  }

  // 광고 차단 상태에 맞춰 등록을 맞춘다.
  function syncMainWorldScripts(enabled) {
    queue = queue.then(function () {
      return new Promise(function (resolve) {
        if (!chrome.scripting || !chrome.scripting.registerContentScripts) {
          resolve(); // 지원하지 않는 브라우저는 조용히 건너뜀
          return;
        }
        isRegistered(function (has) {
          if (enabled && !has) {
            chrome.scripting.registerContentScripts([SCRIPT_CONFIG], function () {
              if (chrome.runtime.lastError) {
                console.error("[MAIN world 스크립트] 등록 실패:", chrome.runtime.lastError.message);
              }
              resolve();
            });
          } else if (!enabled && has) {
            chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }, function () {
              void chrome.runtime.lastError;
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
    return queue;
  }

  self.syncMainWorldScripts = syncMainWorldScripts;
})();