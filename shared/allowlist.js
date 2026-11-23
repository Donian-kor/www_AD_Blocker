// shared/allowlist.js - "광고 허용 사이트"(화이트리스트) 주소 정규화·매칭
//
// 사용자는 "광고가 보이는 사이트"의 주소를 붙여넣기만 하면 된다.
//   https://news.example.com/article/1?x=2  ->  news.example.com
// 주소 -> 도메인 변환 규칙을 한 곳에 모아 옵션 페이지·백그라운드·콘텐츠 스크립트가
// 모두 같은 결과를 내도록 한다.
//
// UMD 형태: Node(CommonJS)와 브라우저(self.YabAllowlist) 모두 지원한다.
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.YabAllowlist = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // chrome.storage.local 에 저장하는 키
  const STORAGE_KEY = "allowedSites";
  // 규칙 1개 = 사이트 1개. Chrome 동적 규칙 한도(30,000) 안에서 안전한 상한.
  const MAX_SITES = 1000;

  // 사용자가 붙여넣은 주소에서 "사이트 도메인"만 뽑아낸다.
  // 해석할 수 없으면 빈 문자열을 돌려준다 (저장 거부).
  function normalizeSite(input) {
    if (typeof input !== "string") return "";
    // 여러 줄을 붙여넣어도 첫 줄만 사용한다.
    const firstLine = input.trim().split(/\r?\n/)[0].trim();
    if (!firstLine) return "";

    // 프로토콜이 없으면 붙여서 URL 로 해석한다 (한글 도메인은 punycode 로 변환됨).
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(firstLine)
      ? firstLine
      : "https://" + firstLine;

    let host = "";
    try {
      host = new URL(withScheme).hostname;
    } catch (e) {
      return "";
    }
    host = String(host || "").toLowerCase().replace(/\.$/, "");
    // www. 는 떼어낸다. (www.example.com -> example.com, 서브도메인까지 함께 허용)
    if (host.indexOf("www.") === 0) host = host.slice(4);

    // 점이 없는 이름(localhost 등), IP 주소, IPv6 는 사이트 도메인으로 보지 않는다.
    if (host.indexOf(".") < 0) return "";
    if (/^[0-9.]+$/.test(host) || host.indexOf(":") >= 0) return "";
    // 허용 문자 검사 (punycode 는 xn-- 형태로 들어온다)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
      return "";
    }
    return host;
  }

  // 저장 전 목록 정리: 정규화 -> 중복 제거 -> 정렬 -> 상한 적용
  function normalizeList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    for (const item of list) {
      const site = normalizeSite(item);
      if (!site) continue;
      seen.add(site);
      if (seen.size >= MAX_SITES) break;
    }
    return Array.from(seen).sort();
  }

  // hostname 이 목록의 사이트이거나 그 하위 도메인이면 true.
  // 예) 목록에 example.com 이 있으면 a.b.example.com 도 허용.
  function isAllowed(hostname, list) {
    if (!Array.isArray(list)) return false;
    const host = normalizeSite(hostname);
    if (!host) return false;
    for (const item of list) {
      const site = normalizeSite(item);
      if (!site) continue;
      if (host === site || host.slice(-(site.length + 1)) === "." + site) return true;
    }
    return false;
  }

  // 현재 프레임이 속한 "최상위 페이지"의 호스트를 구한다.
  // iframe 안에서 실행될 수 있으므로 부모 페이지 기준으로 판단해야 한다.
  function topHostname() {
    try {
      const origins = location.ancestorOrigins;
      if (origins && origins.length) {
        try {
          var top = new URL(origins[0]).hostname;
          if (top) return top;
        } catch (e) {
          /* 다음 대안으로 넘어간다 */
        }
      }
    } catch (e) {
      /* ancestorOrigins 를 지원하지 않는 환경 */
    }
    try {
      return location.hostname;
    } catch (e) {
      return "";
    }
  }

  // 콘텐츠 스크립트용 진입점.
  // 현재 페이지가 허용 사이트가 아니면 run() 을, 허용 사이트면 onAllowed() 를 부른다.
  // storage 를 읽지 못하면 안전하게 run() 을 실행한다(차단이 기본값).
  function runUnlessAllowed(run, onAllowed) {
    const fallback = function () {
      if (typeof run === "function") run();
    };
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      fallback();
      return;
    }
    try {
      chrome.storage.local.get([STORAGE_KEY], function (res) {
        const sites = (res && res[STORAGE_KEY]) || [];
        if (isAllowed(topHostname(), sites)) {
          if (typeof onAllowed === "function") onAllowed();
          return;
        }
        fallback();
      });
    } catch (e) {
      fallback();
    }
  }

  return {
    STORAGE_KEY,
    MAX_SITES,
    normalizeSite,
    normalizeList,
    isAllowed,
    topHostname,
    runUnlessAllowed,
  };
});
