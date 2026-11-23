// shared/allowlist.js 단위 테스트
// 실행: node tools/test-allowlist.js
const allow = require("../shared/allowlist.js");

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? "PASS" : "FAIL") + ": " + name);
  if (!ok) {
    console.log("  기대값: " + JSON.stringify(expected));
    console.log("  실제값: " + JSON.stringify(actual));
    failures++;
  }
}

// === 주소 -> 도메인 정규화 ===
check("도메인만 넣으면 그대로", allow.normalizeSite("example.com"), "example.com");
check("경로·쿼리·해시는 버린다",
  allow.normalizeSite("https://news.example.com/a/b?x=1#top"), "news.example.com");
check("프로토콜 없는 주소도 처리",
  allow.normalizeSite("news.example.com/article/1"), "news.example.com");
check("www. 는 떼어낸다", allow.normalizeSite("www.example.com"), "example.com");
check("대문자·포트·끝점 정리",
  allow.normalizeSite("HTTPS://WWW.Example.COM:8443/path"), "example.com");
check("앞뒤 공백 허용", allow.normalizeSite("   example.com   "), "example.com");
check("여러 줄은 첫 줄만",
  allow.normalizeSite("example.com\nother.com"), "example.com");
check("한글 도메인은 punycode",
  allow.normalizeSite("한글.kr").indexOf("xn--") === 0, true);
check("한글 도메인 접미사 유지",
  allow.normalizeSite("한글.kr").slice(-3), ".kr");

check("빈 문자열은 거부", allow.normalizeSite(""), "");
check("공백만은 거부", allow.normalizeSite("   "), "");
check("점 없는 이름은 거부", allow.normalizeSite("localhost"), "");
check("IP 주소는 거부", allow.normalizeSite("192.168.0.1"), "");
check("hosts 형식은 거부", allow.normalizeSite("0.0.0.0 ads.example.com"), "");
check("URL 이 아니면 거부", allow.normalizeSite("not a url"), "");
check("숫자·문자 아닌 문자열 거부", allow.normalizeSite("!!!"), "");
check("문자열이 아니면 거부", allow.normalizeSite(null), "");

// === 목록 정리 ===
check("중복 제거 + 정렬",
  allow.normalizeList(["b.com", "a.com", "b.com"]), ["a.com", "b.com"]);
check("www. 중복도 하나로",
  allow.normalizeList(["www.a.com", "a.com"]), ["a.com"]);
check("잘못된 값은 목록에서 제외",
  allow.normalizeList(["a.com", "", "localhost", null, "1.2.3.4"]), ["a.com"]);
check("배열이 아니면 빈 목록", allow.normalizeList("a.com"), []);

const many = [];
for (let i = 0; i < allow.MAX_SITES + 20; i++) many.push("site" + i + ".com");
check("최대 개수를 넘지 않는다", allow.normalizeList(many).length, allow.MAX_SITES);

// === 매칭 ===
const list = ["example.com", "news.co.kr"];
check("같은 도메인은 허용", allow.isAllowed("example.com", list), true);
check("서브도메인도 허용", allow.isAllowed("a.b.example.com", list), true);
check("www 도메인도 허용", allow.isAllowed("www.news.co.kr", list), true);
check("목록에 없으면 차단", allow.isAllowed("other.com", list), false);
check("이름이 비슷한 다른 도메인은 차단",
  allow.isAllowed("notexample.com", list), false);
check("접미사만 같은 도메인은 차단",
  allow.isAllowed("example.com.evil.net", list), false);
check("목록이 비면 차단", allow.isAllowed("example.com", []), false);
check("목록이 배열이 아니면 차단", allow.isAllowed("example.com", null), false);
check("빈 호스트는 차단", allow.isAllowed("", list), false);
check("목록에 www. 로 저장돼 있어도 매칭",
  allow.isAllowed("m.example.com", ["www.example.com"]), true);

// === 저장 키 / 상한 ===
check("저장 키", allow.STORAGE_KEY, "allowedSites");
check("상한은 규칙 한도 안쪽", allow.MAX_SITES <= 1000, true);

console.log("");
if (failures === 0) {
  console.log("모든 테스트 통과");
} else {
  console.log(failures + "개 테스트 실패");
  process.exitCode = 1;
}
