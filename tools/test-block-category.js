// shared/block-category.js 단위 테스트
// 실행: node tools/test-block-category.js
const BC = require("../shared/block-category.js");

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? "PASS" : "FAIL") + ": " + name);
  if (!ok) {
    console.log("  기대값: " + JSON.stringify(expected));
    console.log("  실제값: " + JSON.stringify(actual));
    failures++;
  }
}

// === 네트워크 분류 ===
const tcafe = BC.classifyNetwork({
  url: "https://tcafe21.com/plugin/perf/js/fp-metrics.min.js",
  rulesetId: "easylist_1",
});
check("tcafe21 지문 수집은 필터 이름과 무관하게 개인정보 추적", tcafe.category, "privacy");
check("tcafe21 출처는 필터명 유지", tcafe.source, "easylist");

check("pixel_tracker.php 도 개인정보 추적", BC.classifyNetwork({
  url: "https://tcafe21.com/plugin/perf/api/pixel_tracker.php?t=abc",
}).category, "privacy");

check("doubleclick 은 광고", BC.classifyNetwork({
  url: "https://example.com/pagead/js/adsbygoogle.js",
  rulesetId: "easylist_1",
}).category, "ads");

check("불투명 URL은 규칙셋으로 분류 (easyprivacy)", BC.classifyNetwork({
  url: "https://unknown-host.xyz/abc123",
  rulesetId: "easyprivacy_2",
}).category, "privacy");

check("urlhaus 규칙셋은 악성코드", BC.classifyNetwork({
  url: "https://unknown-host.xyz/abc123",
  rulesetId: "urlhaus_3",
}).category, "malware");

check("anti-cv 규칙셋은 차단 우회", BC.classifyNetwork({
  url: "https://unknown-host.xyz/abc123",
  rulesetId: "anti-cv-en_1",
}).category, "anti");

check("내 규칙은 직접 차단", BC.classifyNetwork({
  url: "https://unknown-host.xyz/abc123",
  rulesetId: "_dynamic",
}).category, "custom");

check("단서 없는 기록은 미분류", BC.classifyNetwork({
  url: "https://unknown-host.xyz/abc123",
}).category, "unknown");

check("규칙셋에서 소스명 추출", BC.sourceOf("easyprivacy_2"), "easyprivacy");
check("동적 규칙 소스명", BC.sourceOf("_dynamic"), "내 규칙");
check("한글 라벨", BC.categoryOf("privacy").label, "개인정보 추적");

// === DOM 제거 종류 ===
const el = (id, cls) => ({ id, className: cls, getAttribute: () => cls });
check("anti-adblock 메시지", BC.elementKind(el("", "anti-adblock-message")), "antiAdblock");
check("가짜 다운로드 버튼", BC.elementKind(el("fake-download-button", "")), "fakeButton");
check("리다이렉트 유도", BC.elementKind(el("", "redirect-test")), "redirect");
check("미드롤 딤", BC.elementKind(el("", "pzp-pc__midroll-dim")), "video");
check("전면 광고", BC.elementKind(el("im_interstitial_b", "")), "overlay");
check("팝업 체인", BC.elementKind(el("", "popup-chain")), "popup");
check("광고 슬롯", BC.elementKind(el("ad-slot", "")), "banner");
check("정보 없는 요소는 배너 기본값", BC.elementKind(el("cts_test", "")), "banner");
check("DOM 한글 라벨", BC.domKindOf("fakeButton").label, "가짜 다운로드 버튼");

const normalized = BC.normalizeKinds({ banner: 2, bad: 0, popup: 1, minus: -3 });
check("유효한 종류만 집계", JSON.stringify(normalized), JSON.stringify({ banner: 2, popup: 1 }));
check("빈 종류", JSON.stringify(BC.normalizeKinds(null)), "{}");

if (failures > 0) {
  console.error("실패: " + failures + "건");
  process.exit(1);
}
console.log("모든 차단 분류 테스트 통과");
