// youtube-main.js 후킹 로직 단위 테스트
// 실행: node tools/test-main-hook.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "youtube-main.js"), "utf8");

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

// 브라우저 환경 흉내
const messageListeners = [];
const timeoutCalls = [];
function MockResponse() {}
MockResponse.prototype.json = function () {
  // 실제 Response.json()처럼 객체를 반환 (JSON.parse 후킹 영향을 피하려고 직접 생성)
  return Promise.resolve({ adSlots: [1], videoDetails: { title: "t" } });
};

// Node / HTMLIFrameElement 흉내 (appendChild 후킹 검사용)
class FakeNode {
  constructor() { this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
}
class FakeIframe extends FakeNode {
  constructor(src) { super(); this.src = src; this.contentWindow = {}; }
}

// Request / TextEncoder / XMLHttpRequest 흉내 (요청 스푸핑 검사용)
class FakeRequest {
  constructor(url, init) { this.url = url; this.init = init || {}; }
}
class FakeTextEncoder {
  encode(str) { return str; }
}
class FakeXHR {
  send(body) { this.body = body; }
}

const TEST_TOKEN = "test-token-12345";
const documentObj = {
  documentElement: {
    getAttribute(name) {
      if (name === "data-yab-state-token") return TEST_TOKEN;
      if (name === "data-yab-enabled") return "1"; // ON 상태로 테스트
      return null;
    }
  }
};
const windowObj = {
  addEventListener(type, fn) {
    if (type === "message") messageListeners.push(fn);
  },
  Response: MockResponse,
  // setTimeout 후킹 검사용: 실제 예약 대신 호출 인자만 기록한다
  setTimeout(fn, delay) { timeoutCalls.push(delay); return 0; },
  fetch() {},
  Request: function Request() {}
};
windowObj.window = windowObj;

const sandbox = {
  window: windowObj,
  document: documentObj,
  Response: MockResponse,
  Promise,
  JSON,
  Object,
  Function,
  Array,
  Node: FakeNode,
  HTMLIFrameElement: FakeIframe,
  Request: FakeRequest,
  TextEncoder: FakeTextEncoder,
  XMLHttpRequest: FakeXHR,
  location: { href: "https://www.youtube.com/watch?v=abc", hostname: "www.youtube.com" },
  setTimeout,
  console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

function setEnabled(value, token) {
  messageListeners.forEach((fn) =>
    fn({ source: windowObj, data: { source: "yab-extension", token: token === undefined ? TEST_TOKEN : token, type: "enabled", value } })
  );
}

function hookableCallback(collect) {
  // 소스에 ".next(" 가 포함되어 후킹 대상이 되도록 함
  return function (value) {
    void ".next(";
    collect(value);
    return value;
  };
}

(async () => {
  // 1) 문자열 응답의 광고 키 치환
  let received = null;
  await new Promise((resolve) => {
    Promise.resolve('{"adSlots":[1],"playerAds":[2],"videoDetails":{"title":"t"}}').then(
      hookableCallback((v) => { received = v; })
    );
    setTimeout(resolve, 10);
  });
  check("문자열 응답 adSlots/playerAds 제거", received,
    '{"no_ads":[1],"no_ads":[2],"videoDetails":{"title":"t"}}');

  // 2) JSON.parse 객체 정리
  const parsed = JSON.parse('{"adSlots":[1],"playerAds":[2],"videoDetails":{"title":"t"}}');
  check("JSON.parse 광고 키 제거", parsed, { videoDetails: { title: "t" } });

  // 3) Response.json 정리
  const responseJson = await new MockResponse().json();
  check("Response.json 광고 키 제거", responseJson, { videoDetails: { title: "t" } });

  // 4) ytInitialPlayerResponse setter 정리
  windowObj.ytInitialPlayerResponse = { adSlots: [1], playerAds: [2], videoDetails: { title: "t" } };
  check("ytInitialPlayerResponse 광고 키 제거", windowObj.ytInitialPlayerResponse, {
    videoDetails: { title: "t" }
  });

  const raw = '{"adSlots":[1],"videoDetails":{"title":"t"}}';

  // 5) 토큰이 다른 위조 메시지는 무시되어야 함 (ON 상태 유지)
  setEnabled(true);
  setEnabled(false, "forged-token");
  check("위조 토큰 메시지 무시", JSON.parse(raw), { videoDetails: { title: "t" } });

  // 6) 토글 OFF면 원본 유지
  setEnabled(false);
  const kept = JSON.parse(raw);
  check("OFF 상태에서는 광고 키 유지", kept, { adSlots: [1], videoDetails: { title: "t" } });

  // 6) 다시 ON
  setEnabled(true);
  const cleaned = JSON.parse(raw);
  check("ON 상태에서는 광고 키 제거", cleaned, { videoDetails: { title: "t" } });

  // 7) adBreakHeartbeatParams 까지 제거 (신규 광고 키)
  const withHeartbeat = JSON.parse(
    '{"adBreakHeartbeatParams":"hb","playerAds":[1],"videoDetails":{"title":"t"}}'
  );
  check("adBreakHeartbeatParams 제거", withHeartbeat, { videoDetails: { title: "t" } });

  // 8) Shorts/재생목록의 중첩 adClientParams.isAd 플래그 무력화
  const shorts = JSON.parse(
    '{"reelWatchSequenceResponse":{"entries":[{"command":{"reelWatchEndpoint":{"adClientParams":{"isAd":true}}}}]},' +
      '"entries":[{"command":{"reelWatchEndpoint":{"adClientParams":{"isAd":true}}}}],"videoDetails":{"title":"t"}}'
  );
  check(
    "Shorts isAd 플래그 무력화",
    shorts,
    {
      reelWatchSequenceResponse: {
        entries: [{ command: { reelWatchEndpoint: { adClientParams: { isAd: false } } } }]
      },
      entries: [{ command: { reelWatchEndpoint: { adClientParams: { isAd: false } } } }],
      videoDetails: { title: "t" }
    }
  );

  // 9) Promise.then 콜백이 재귀 없이 한 번만 실행되는지 (무한 재귀 회귀 테스트)
  let callCount = 0;
  await new Promise((resolve) => {
    Promise.resolve('{"adSlots":[1],"videoDetails":{"title":"t"}}').then(
      hookableCallback(() => {
        callCount++;
      })
    );
    setTimeout(resolve, 10);
  });
  check("후킹 콜백 단일 실행 (무한 재귀 방지)", callCount, 1);

  // 10) 감지 보고 콜백(onAbnormalityDetected)이 호출되지 않게 무력화되는지
  let detectCalled = 0;
  await new Promise((resolve) => {
    Promise.resolve("{}").then(function onAbnormalityDetected() { detectCalled++; });
    setTimeout(resolve, 10);
  });
  check("onAbnormalityDetected 콜백 무력화", detectCalled, 0);

  // 11) "[native code]" 검사 타이머만 단축되고 나머지는 그대로인지
  timeoutCalls.length = 0;
  windowObj.setTimeout(function () { void "[native code]"; }, 17000);
  check("native code 검사 타이머 17ms로 단축", timeoutCalls[0], 17);

  timeoutCalls.length = 0;
  windowObj.setTimeout(function () {}, 17000);
  check("일반 17초 타이머는 유지", timeoutCalls[0], 17000);

  timeoutCalls.length = 0;
  windowObj.setTimeout(function () { void "[native code]"; }, 5000);
  check("다른 지연의 native code 타이머는 유지", timeoutCalls[0], 5000);

  // 12) about:blank iframe 에만 fetch/Request 가 복사되는지
  const parent = new FakeNode();
  const blankFrame = new FakeIframe("about:blank");
  parent.appendChild(blankFrame);
  check("about:blank iframe 에 fetch 복사", typeof blankFrame.contentWindow.fetch, "function");
  check("about:blank iframe 에 Request 복사", typeof blankFrame.contentWindow.Request, "function");

  const srcFrame = new FakeIframe("https://example.com/");
  parent.appendChild(srcFrame);
  check("src 있는 iframe 은 건드리지 않음", Object.keys(srcFrame.contentWindow).length, 0);

  const plain = new FakeNode();
  parent.appendChild(plain);
  check("일반 노드는 그대로 반환", parent.children[2], plain);

  // 13) /youtubei/v1/player 요청 body 를 "광고 없는 클라이언트"로 위조하는지
  const playerBody = '{"context":{"client":{"clientName":"WEB"}},' +
    '"playbackContext":{"contentPlaybackContext":{"r":1}}}';
  const req = new windowObj.Request("/youtubei/v1/player", { body: playerBody });
  check("player 요청 params 위조", /"params":"eAFgAQ"/.test(req.init.body), true);
  check("playbackContext.params 위조", /"params":"eAFgAQ"/.test(req.init.body), true);
  check("lactMilliseconds 주입", /"lactMilliseconds":"\d+"/.test(req.init.body), true);

  // 14) youtubei 가 아닌 요청은 건드리지 않는지
  const otherBody = '{"context":{"client":{}},"playbackContext":{}}';
  const other = new windowObj.Request("/api/other", { body: otherBody });
  check("youtubei 아닌 요청은 그대로", other.init.body, otherBody);

  // 14-1) 가이드(browse) 요청은 params 를 절대 건드리지 않아야 한다 — 회귀 방지
  //   adSignalsInfo 는 일반 요청에도 널리 들어 있다. 예전에는 이 키만 보고
  //   params 를 플레이어 값(eAFgAQ)으로 덮어써 /youtubei/v1/guide 가
  //   400 INVALID_ARGUMENT 가 되고 왼쪽 사이드 메뉴가 통째로 사라졌다.
  const guideBody = '{"context":{"client":{"clientName":"WEB"}},"browseId":"FEguide",' +
    '"params":"GUIDE_PARAMS","adSignalsInfo":{"params":[{"key":"a","value":"b"}]}}';
  const guideReq = new windowObj.Request("/youtubei/v1/guide", { body: guideBody });
  check("guide 요청 params 유지", guideReq.init.body, guideBody);
  const guideEncoded = new FakeTextEncoder().encode(guideBody);
  check("guide 요청 TextEncoder 경로 params 유지", guideEncoded, guideBody);
  const guideXhr = new FakeXHR();
  guideXhr.send(guideBody);
  check("guide 요청 XHR 경로 params 유지", guideXhr.body, guideBody);
  const guideStringified = JSON.stringify({
    context: { client: { clientName: "WEB" } },
    browseId: "FEguide",
    params: "GUIDE_PARAMS",
    adSignalsInfo: { params: [] }
  });
  check("guide 요청 JSON.stringify 경로 params 유지",
    JSON.parse(guideStringified).params, "GUIDE_PARAMS");

  // 15) TextEncoder 경로도 같은 패치를 하는지
  const encoded = new FakeTextEncoder().encode(playerBody);
  check("TextEncoder 경로 params 위조", /"params":"eAFgAQ"/.test(encoded), true);

  // 16) XMLHttpRequest.send 경로도 같은 패치를 하는지
  const xhr = new FakeXHR();
  xhr.send(playerBody);
  check("XHR 경로 params 위조", /"params":"eAFgAQ"/.test(xhr.body), true);

  // 17) 숏츠는 params 위조 대상이 아닌지
  sandbox.location.href = "https://www.youtube.com/shorts/abc";
  const shortsReq = new windowObj.Request("/youtubei/v1/player", { body: otherBody });
  check("숏츠는 params 위조 안 함", shortsReq.init.body, otherBody);
  sandbox.location.href = "https://www.youtube.com/watch?v=abc";

  // 18) 자동 음소거(muteOnStart) 해제 — 일반 시청 페이지
  sandbox.location.href = "https://www.youtube.com/watch?v=abc";
  const unmuted = JSON.parse('{"playerConfig":{"audioConfig":{"muteOnStart":true}},' +
    '"videoDetails":{"title":"t"}}');
  check("watch 페이지 muteOnStart 해제", "muteOnStart" in unmuted.playerConfig.audioConfig, false);

  // 19) 미니플레이어 자동 재생 음소거는 유지
  const miniplayer = JSON.parse('{"playabilityStatus":{"miniplayer":true},' +
    '"playerConfig":{"audioConfig":{"muteOnStart":true}},"videoDetails":{"title":"t"}}');
  check("미니플레이어 muteOnStart 유지", miniplayer.playerConfig.audioConfig.muteOnStart, true);

  // 20) muteOnStart 가 false 면 그대로 유지
  const notMuted = JSON.parse('{"playerConfig":{"audioConfig":{"muteOnStart":false}},' +
    '"videoDetails":{"title":"t"}}');
  check("muteOnStart false 유지", notMuted.playerConfig.audioConfig.muteOnStart, false);

  if (failures > 0) {
    console.error("실패: " + failures + "건");
    process.exit(1);
  }
  console.log("모든 후킹 테스트 통과");
})();
