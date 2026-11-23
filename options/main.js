// options/main.js - 설정 페이지 진입점
import "../shared/block-category.js"; // 전역 BlockCategory (차단 기록 분류용)
import { initStats } from "./stats.js";
import { initFiltersTab } from "./filters-tab.js";
import { initBlockedTab } from "./blocked-tab.js";
import { initAllowlistTab } from "./allowlist-tab.js";
import { initBlockedLogTab } from "./blocked-log-tab.js";
import { initLicensesTab } from "./licenses-tab.js";

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const content = document.getElementById("tab-" + btn.dataset.tab);
      if (content) content.classList.add("active");
    });
  });
}

// 사이드바 메뉴 3개를 '광고 차단 필터' 라벨 아래 필터 목록의 행과 정렬
function alignSidebarMenu() {
  const sidebar = document.querySelector(".sidebar");
  const menu = document.querySelector(".sidebar-menu");
  const firstCard = document.querySelector("#filterList .filter-card");
  if (!sidebar || !menu || !firstCard) return;

  const sb = sidebar.getBoundingClientRect();
  const cb = firstCard.getBoundingClientRect();
  if (cb.height === 0) return; // 탭이 숨겨져 있으면 계산 불가

  // 메뉴 첫 행 상단 = 필터 첫 카드 상단 (라벨 하단 라인)
  menu.style.setProperty("--sidebar-menu-top", (cb.top - sb.top + sidebar.scrollTop) + "px");
  // 메뉴 각 행 높이 = 필터 카드 한 행 높이 (행 간격 8px은 CSS gap과 동일)
  menu.style.setProperty("--sidebar-row-height", cb.height + "px");
}

// URL 해시(#log 등)에 해당하는 탭을 연다 (팝업에서 차단 기록으로 바로 이동할 때 사용)
function activateTabFromHash() {
  const name = location.hash.replace(/^#/, "");
  if (!name) return;
  const btn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
  if (btn) btn.click();
}

initTabs();
activateTabFromHash();
window.addEventListener("hashchange", activateTabFromHash);
initStats();
initFiltersTab();
initBlockedTab();
initAllowlistTab();
initBlockedLogTab();
initLicensesTab();

// 필터 카드가 렌더링된 뒤 정렬 (렌더 완료 보장)
requestAnimationFrame(() => {
  alignSidebarMenu();
  // 폰트 로드/창 크기 변경 시에도 행 정렬 유지
  window.addEventListener("resize", alignSidebarMenu);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignSidebarMenu);
});
