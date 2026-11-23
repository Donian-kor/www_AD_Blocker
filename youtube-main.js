// www_AD_Blocker - MAIN world 스크립틀릿
// 유튜브 페이지의 "메인 세계"에서 실행되어 플레이어 응답의 광고 데이터를 제거한다.
// (content script는 격리된 세계라 페이지의 Promise/JSON.parse에 접근할 수 없음)
// 참고: uBlock Origin uAssets 의 ytInitialPlayerResponse set-constant / json-prune 기법
(function () {
  "use strict";
  // 유튜브 스튜디오는 광고 차단 대상이 아니므로 건너뜀
  if (typeof location !== "undefined" && location.hostname === "studio.youtube.com") return;
  if (window.__yabInstalled) return;
  window.__yabInstalled = true;

  // content.js(격리 world)가 document_start에 심어주는 초기 토글 상태를 기다린다.
  // 저장소 읽기가 비동기라 값이 아직 없을 수 있으므로, 최대 몇 번 확인한 뒤 시작한다.
  // OFF 상태면 후킹을 아예 설치하지 않아 유튜브의 "광고 차단 감지"를 피한다.
  function readEnabledFlag() {
    try {
      const v = document.documentElement && document.documentElement.getAttribute("data-yab-enabled");
      return v === "1" ? true : v === "0" ? false : null;
    } catch (e) { return null; }
  }

  let enabled = true;

  // content script(격리 세계)에서 토글 상태를 전달받을 때 토큰을 확인한다.
  // 고정 문자열만으로 위조할 수 없도록 매 로드마다 생성된 토큰을 사용한다.
  // startHooking 안팎 어디서든 쓸 수 있도록 여기 정의한다.
  function readStateToken() {
    try {
      return document.documentElement
        ? document.documentElement.getAttribute("data-yab-state-token")
        : null;
    } catch (e) {
      return null;
    }
  }

  // OFF 상태에서 설치하는 최소 리스너: 토글이 켜지면 value=true 메시지를 받는다.
  function installToggleListenerOnly() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== "yab-extension" || data.type !== "enabled") return;
      const token = readStateToken();
      if (!token || data.token !== token) return;
      enabled = data.value !== false;
    });
  }

  function boot() {
    const flag = readEnabledFlag();
    if (flag === null) {
      // 아직 상태가 안 심어졌으면 짧게 반복 (storage 콜백 대기)
      if (!boot._n) boot._n = 0;
      if (boot._n++ < 20) { setTimeout(boot, 5); return; }
    }
    if (flag === false) {
      enabled = false;
      installToggleListenerOnly();
      return;
    }
    startHooking();
  }

  function startHooking() {
  // 광고 데이터 키 (uBO filters.txt / uAssets 기준)
  const AD_KEYS = ["adSlots", "playerAds", "adPlacements", "adBreakHeartbeatParams"];
  const NESTED_KEYS = ["playerResponse", "playerMicroformatRenderer"];
  const AD_KEY_REGEX = /"(adSlots|playerAds|adPlacements|adBreakHeartbeatParams)"\s*:/g;

  // content script(격리 세계)에서 토글 상태를 전달받는다.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "yab-extension" || data.type !== "enabled") return;
    const token = readStateToken();
    if (!token || data.token !== token) return; // 토큰 불일치 → 위조로 간주
    enabled = data.value !== false;
  });

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // 객체 한 겹에서 광고 키를 제거한다 (playerResponse 같은 중첩 구조는 호출부에서 처리)
  function deleteAdKeys(obj) {
    if (!obj || typeof obj !== "object") return;
    for (const key of AD_KEYS) {
      if (hasOwn(obj, key)) delete obj[key];
    }
    // 자동 음소거 해제.
    // 광고 응답에는 playerConfig.audioConfig.muteOnStart = true 가 들어와 유튜브가
    // 음소거 상태로 시작한다. 정상 시청 페이지에서는 이 값을 지운다.
    // (미니플레이어의 자동 재생 음소거는 정상 동작이므로 건드리지 않는다.)
    try {
      const audio = obj.playerConfig && obj.playerConfig.audioConfig;
      if (audio && audio.muteOnStart === true) {
        const isWatch = location.href.indexOf("/watch") !== -1;
        const hasCards = !!obj.cards;
        const isMiniplayer = !!(obj.playabilityStatus && obj.playabilityStatus.miniplayer);
        if (!isMiniplayer && (isWatch || hasCards)) delete audio.muteOnStart;
      }
    } catch (e) { /* 무시 */ }
    // Shorts / 광고 클라이언트 파라미터의 isAd 플래그를 false로 되돌린다
    if (obj.adClientParams && typeof obj.adClientParams === "object") {
      obj.adClientParams.isAd = false;
    }
  }

  function cleanObject(value) {
    if (!value || typeof value !== "object") return value;
    deleteAdKeys(value);

    // playerResponse 로 한 번 더 감싼 구조도 처리
    for (const key of NESTED_KEYS) {
      const nested = value[key];
      if (nested && typeof nested === "object") deleteAdKeys(nested);
    }

    // Shorts 광고: reel_watch_sequence / get_watch 응답의 entries[].command...adClientParams.isAd
    // ytInitialData 처럼 앱 셸 데이터에도 적용되므로, 예상 못 한 형태가 와도
    // 예외를 페이지 쪽으로 흘리지 않도록 try/catch 로 감싼다.
    try {
      const entryArrays = [];
      if (value.reelWatchSequenceResponse && value.reelWatchSequenceResponse.entries) {
        entryArrays.push(value.reelWatchSequenceResponse.entries);
      }
      if (value.entries) entryArrays.push(value.entries);
      for (const entries of entryArrays) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const endpoint = entry && entry.command && entry.command.reelWatchEndpoint;
          if (endpoint && endpoint.adClientParams) endpoint.adClientParams.isAd = false;
        }
      }
    } catch (e) { /* 앱 셸 데이터는 건드리지 않는다 */ }
    return value;
  }

  function cleanText(text) {
    if (typeof text !== "string") return text;
    if (
      text.indexOf("adSlots") === -1 &&
      text.indexOf("playerAds") === -1 &&
      text.indexOf("adPlacements") === -1 &&
      text.indexOf("adBreakHeartbeatParams") === -1
    ) {
      return text;
    }
    return text.replace(AD_KEY_REGEX, '"no_ads":');
  }

  function clean(value) {
    if (!enabled) return value;
    return typeof value === "string" ? cleanText(value) : cleanObject(value);
  }

  // === 1) 광고 차단 "감지" 자체를 무력화 ===
  // AdGuard 필터 목록(filter_1)에 이번에 추가된 유튜브 대응을 이식한 부분이다.
  // 지금까지의 후킹은 "광고 데이터를 지우는" 쪽만 있었고, 유튜브가 감지 결과를
  // 서버/플레이어로 보고하는 경로는 그대로 두어 경고가 계속 떴다.

  // 1-1) 감지 결과 보고 콜백(onAbnormalityDetected)을 빈 함수로 교체한다.
  //      유튜브는 광고 데이터가 사라진 것을 감지하면 이 콜백으로 이상 징후를 보고한다.
  const DETECT_CALLBACK = "onAbnormalityDetected";
  // 1-2) 네이티브 함수 여부 검사 타이머(17초)를 즉시 실행되게 단축한다.
  //      콜백 소스에 "[native code]" 가 있고 지연이 17000ms 인 것만 대상.
  //      페이지 초기화가 덜 끝난 시점에 검사가 돌아가도록 해 "정상"으로 판정되게 한다.
  const AD_CHECK_DELAY = 17000;
  const AD_CHECK_FACTOR = 0.001;
  // 1-3) 유튜브가 붙이는 about:blank iframe 이 후킹 여부를 별도로 검사하지 못하게
  //      페이지의 fetch·Request 를 그 iframe 에 물려준다.
  function neutralizeDetection() {
    const nativeSetTimeout = window.setTimeout;
    if (typeof nativeSetTimeout === "function") {
      try {
        window.setTimeout = new Proxy(nativeSetTimeout, {
          apply(target, thisArg, args) {
            try {
              const cb = args[0];
              if (args[1] === AD_CHECK_DELAY && typeof cb === "function" &&
                  Function.prototype.toString.call(cb).indexOf("[native code]") !== -1) {
                args[1] = Math.max(1, Math.round(AD_CHECK_DELAY * AD_CHECK_FACTOR));
              }
            } catch (e) { /* 검사 실패는 원래 동작 유지 */ }
            return Reflect.apply(target, thisArg, args);
          }
        });
      } catch (e) { /* 재정의 불가 환경은 건너뜀 */ }
    }

    if (typeof Node !== "undefined" && Node.prototype && Node.prototype.appendChild) {
      try {
        Node.prototype.appendChild = new Proxy(Node.prototype.appendChild, {
          apply(target, thisArg, args) {
            const node = Reflect.apply(target, thisArg, args);
            try {
              if (!node || typeof HTMLIFrameElement === "undefined" || !(node instanceof HTMLIFrameElement)) return node;
              if (node.src !== "" && node.src !== "about:blank") return node;
              const win = node.contentWindow;
              if (!win) return node;
              win.fetch = window.fetch;
              win.Request = window.Request;
            } catch (e) { /* iframe 접근 불가 */ }
            return node;
          }
        });
      } catch (e) { /* 재정의 불가 환경은 건너뜀 */ }
    }
  }

  // === 2) Promise.then 콜백 후킹 ===
  // ① 감지 보고 콜백은 빈 함수로 바꾸고, ② 플레이어 응답을 다루는 콜백
  //    (.next( 또는 jsonpResponseCtor)의 값을 정리한다.
  // Proxy로 감싸 Function.prototype.toString 이 "[native code]" 로 보이게 한다.
  neutralizeDetection();
  const nativeThen = Promise.prototype.then;
  Promise.prototype.then = new Proxy(nativeThen, {
    apply(target, thisArg, args) {
      if (enabled && typeof args[0] === "function") {
        const src = Function.prototype.toString.call(args[0]);
        if (src.indexOf(DETECT_CALLBACK) !== -1) {
          args[0] = function () {};
        } else if (src.indexOf(".next(") !== -1 || src.indexOf("jsonpResponseCtor") !== -1) {
          // 원본을 지역 변수로 반드시 캡처한다.
          // (그냥 args[0]를 재할당하면 클로저가 새 함수를 가리켜 무한 재귀가 발생한다)
          const original = args[0];
          args[0] = function (value) {
            return original.call(this, clean(value));
          };
        }
      }
      return Reflect.apply(target, thisArg, args);
    }
  });

  // === 3) JSON.parse 후킹 ===
  const nativeParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const result = nativeParse.call(this, text, reviver);
    if (!enabled) return result;
    // 재생 불가 응답이면 다음 params 값으로 스푸핑 단계를 전진시킨다.
    try {
      const status = result && result.playabilityStatus && result.playabilityStatus.status;
      if (status === "LOGIN_REQUIRED" || status === "CONTENT_CHECK_REQUIRED") advanceSpoof();
    } catch (e) { /* 무시 */ }
    return cleanObject(result);
  };

  // === 4) Response.json 후킹 ===
  if (window.Response && window.Response.prototype && window.Response.prototype.json) {
    const nativeJson = window.Response.prototype.json;
    window.Response.prototype.json = function () {
      return nativeJson.call(this).then(clean);
    };
  }

  // === 5) XMLHttpRequest 응답 후킹 (uBO trusted-replace-xhr-response 대응) ===
  // 유튜브는 /youtubei/v1/player, /get_watch 응답을 XHR로 읽기도 한다.
  if (typeof XMLHttpRequest !== "undefined" && XMLHttpRequest.prototype) {
    ["responseText", "response"].forEach((prop) => {
      try {
        const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
        if (!desc || typeof desc.get !== "function") return;
        Object.defineProperty(XMLHttpRequest.prototype, prop, {
          configurable: true,
          get: function () {
            return clean(desc.get.call(this));
          }
        });
      } catch (e) {
        // 브라우저가 redefining을 막으면 이 후킹만 건너뛴다
      }
    });
  }

  // === 6) 초기 플레이어 응답 후킹 ===
  // 인라인 스크립트로 넣는 ytInitialPlayerResponse 는 JSON.parse를 거치지 않는다.
  // document_start 시점에 setter를 미리 정의해 나중에 대입되는 값을 잡는다.
  //
  // 주의: ytInitialData 는 후킹하지 않는다.
  //   ytInitialData 는 홈·탐색·가이드(왼쪽 사이드 메뉴) 등 앱 셸 전체를 렌더링하는
  //   데이터다. 여기에 setter를 걸고 광고 키를 정리하면 셸 렌더링에 영향을 줄 수
  //   있다. 광고 차단에 ytInitialData 후킹은 필요 없다(광고는 플레이어 응답에
  //   들어 있고, 홈 화면 광고는 content.js 의 CSS가 숨긴다).
  //   실제로 이 후킹이 왼쪽 사이드 메뉴를 사라지게 만들었다.
  function hookInitial(name) {
    try {
      let initial = window[name];
      if (initial && typeof initial === "object") cleanObject(initial);
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          return initial;
        },
        set(value) {
          initial = enabled ? cleanObject(value) : value;
        }
      });
    } catch (e) {
      // 정의 실패는 무시 (일반적인 경우 문제 없음)
    }
  }
  hookInitial("ytInitialPlayerResponse");

  // === 7) 요청 스푸핑 (AdGuard filter_1 "pyv" 스크립틀릿 이식) ===
  // 지금까지의 후킹은 "응답에서 광고 데이터를 지우는" 쪽만 했다.
  // 그러나 서버는 계속 광고 config를 내려주고, 플레이어는 광고를 재생하려다
  // 실패하거나 화면에서 숨겨지므로 "광고 차단을 쓰는 클라이언트"로 보고된다.
  // AdGuard 는 요청 body 자체를 "광고를 받지 않는 클라이언트"로 위조해
  // 서버가 애초에 광고를 실어 보내지 않게 만든다.
  // 광고 소재 도메인을 허용해도 광고 자체가 만들어지지 않으므로 감지도 없다.
  const SPOOF_PARAMS = ["eAFgAQ", "8AUB"];
  let spoofIndex = 0;

  // 숏츠·TV·임베드는 params 위조 대상이 아니므로 제외한다.
  function isSpoofSkipped() {
    const href = location.href;
    return href.indexOf("/shorts/") !== -1 ||
      href.indexOf("youtube.com/tv") !== -1 ||
      href.indexOf("youtube.com/embed/") !== -1;
  }

  // 재생 불가 응답(LOGIN_REQUIRED / CONTENT_CHECK_REQUIRED)을 받으면
  // 다음 params 값으로 한 단계 전진한다.
  function advanceSpoof() {
    if (spoofIndex < SPOOF_PARAMS.length - 1) spoofIndex++;
  }

  // 위조 대상은 "플레이어 요청" 뿐이다.
  // 플레이어 요청만 playbackContext(또는 playerRequest)를 가진다.
  // browse / guide / home 등 앱 셸 요청에도 context.client 와 adSignalsInfo 가 들어
  // 있으므로, 그것만 보고 params 를 바꾸면 안 된다.
  // (실제 사고: /youtubei/v1/guide 의 params 를 플레이어 값 "eAFgAQ" 로 덮어써
  //  400 INVALID_ARGUMENT 가 났고, 왼쪽 사이드 메뉴가 통째로 사라졌다)
  function isPlayerRequest(obj) {
    return !!(obj && typeof obj === "object" && obj.context && obj.context.client &&
      (obj.playbackContext || obj.playerRequest));
  }

  function patchPlayerRequest(obj) {
    try {
      if (!isPlayerRequest(obj)) return obj;
      if (isSpoofSkipped()) return obj;
      if (obj.context.client.clientScreen === "CHANNEL") return obj;

      const params = SPOOF_PARAMS[spoofIndex];
      obj.params = params;
      if (obj.playerRequest && typeof obj.playerRequest === "object") obj.playerRequest.params = params;

      const pc = obj.playbackContext;
      if (pc && typeof pc === "object") {
        pc.params = params;
        delete pc.adPlaybackContext;
        if (pc.contentPlaybackContext) {
          // 정상 시청 중인 것처럼 보이게 하는 필수 값
          pc.contentPlaybackContext.lactMilliseconds = String(Date.now());
        }
      }
      // 앱 설치 정보는 광고 차단 탐지에 쓰이므로 제거한다.
      if (obj.context.client.configInfo) delete obj.context.client.configInfo.appInstallData;
    } catch (e) { /* 실패 시 원래 요청을 그대로 보낸다 */ }
    return obj;
  }

  function patchBodyText(text) {
    if (typeof text !== "string") return text;
    // 플레이어 요청에만 있는 키로 먼저 걸러낸다.
    // adSignalsInfo 는 일반 요청에도 널리 들어가므로 판별 기준으로 쓰면 안 된다.
    if (text.indexOf('"playbackContext"') === -1 && text.indexOf('"playerRequest"') === -1) return text;
    try {
      const obj = JSON.parse(text);
      if (!isPlayerRequest(obj)) return text;
      return JSON.stringify(patchPlayerRequest(obj));
    } catch (e) { return text; }
  }

  // 7-1) JSON.stringify — fetch body 직렬화 경로
  JSON.stringify = new Proxy(JSON.stringify, {
    apply(target, thisArg, args) {
      try {
        const v = args[0];
        // adSignalsInfo 는 일반 요청에도 있으므로 조건에서 제외한다.
        if (enabled && isPlayerRequest(v)) {
          args[0] = patchPlayerRequest(v);
        }
      } catch (e) { /* 무시 */ }
      return Reflect.apply(target, thisArg, args);
    }
  });

  // 7-2) Request 생성자 — fetch(new Request(...)) 경로
  if (typeof Request !== "undefined" && Request.prototype) {
    window.Request = new Proxy(Request, {
      construct(target, args, newTarget) {
        try {
          const url = args[0];
          const init = args[1];
          const u = typeof url === "string" ? url : (url && url.url) || "";
          if (enabled && u.indexOf("youtubei") !== -1 && init && typeof init.body === "string") {
            init.body = patchBodyText(init.body);
          }
        } catch (e) { /* 무시 */ }
        return Reflect.construct(target, args, newTarget);
      }
    });
  }

  // 7-3) XMLHttpRequest.send — 유튜브는 XHR 로도 player 요청을 보낸다
  if (typeof XMLHttpRequest !== "undefined" && XMLHttpRequest.prototype &&
      XMLHttpRequest.prototype.send) {
    XMLHttpRequest.prototype.send = new Proxy(XMLHttpRequest.prototype.send, {
      apply(target, thisArg, args) {
        try {
          if (enabled && typeof args[0] === "string") args[0] = patchBodyText(args[0]);
        } catch (e) { /* 무시 */ }
        return Reflect.apply(target, thisArg, args);
      }
    });
  }

  // 7-4) TextEncoder.encode — 위 세 경로를 우회하는 직렬화
  if (typeof TextEncoder !== "undefined" && TextEncoder.prototype && TextEncoder.prototype.encode) {
    TextEncoder.prototype.encode = new Proxy(TextEncoder.prototype.encode, {
      apply(target, thisArg, args) {
        try {
          if (enabled && typeof args[0] === "string") args[0] = patchBodyText(args[0]);
        } catch (e) { /* 무시 */ }
        return Reflect.apply(target, thisArg, args);
      }
    });
  }
  } // end startHooking

  boot();
})();
