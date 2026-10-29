// 啟動與分頁切換。每一頁的內容在 src/pages/，資料在 state.js。

import { lockPastMonths, runRecurring, ensureMonth } from "./ledger.js";
import { todayStr, monthKey } from "./dates.js";
import { $, toast, formatAmount } from "./ui.js";
import { getData, commit, subscribe } from "./state.js";
import * as budget from "./pages/budget.js";
import * as ledger from "./pages/ledger.js";
import * as stats from "./pages/stats.js";
import * as more from "./pages/more.js";
import { openEntrySheet } from "./pages/entry.js";

const PAGES = { ledger, stats, budget, more };
let current = null;
let currentParts = [];

/** "#/more/categories/abc" → ["more", "categories", "abc"] */
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return PAGES[parts[0]] ? parts : ["ledger"];
}

function show() {
  const [name, ...rest] = parseRoute();
  const changed = name !== current;
  current = name;
  currentParts = rest;
  for (const sec of document.querySelectorAll(".page")) sec.hidden = sec.dataset.page !== name;
  $("summary").hidden = name !== "budget";
  syncTabbar(); // 摘要列出現／消失會改變底部高度，立刻更新，不等 ResizeObserver
  for (const tab of document.querySelectorAll(".tab")) {
    const on = tab.dataset.tab === name;
    tab.classList.toggle("on", on);
    on ? tab.setAttribute("aria-current", "page") : tab.removeAttribute("aria-current");
  }
  if (name === "stats") stats.prepare();
  PAGES[name].render(rest);
  if (changed || name === "more") window.scrollTo(0, 0);
}

// 資料變動時重畫目前的頁面（發出修改的頁面自己會更新，不整頁重畫，避免輸入中被打斷）
subscribe((source) => {
  if (!current || source === current || source === "startup") return;
  PAGES[current].render(currentParts);
});

/** 打開 App 時：鎖定過去的月份、產生固定收支（SPEC B6.1、B9.2） */
function startup() {
  const data = getData();
  const today = todayStr();
  ensureMonth(data, monthKey(today));
  lockPastMonths(data, today);
  const { added } = runRecurring(data, today);
  commit("startup");
  if (added.length === 1) {
    const e = added[0];
    const r = data.recurring.find((x) => x.id === e.recurringId);
    toast(`✅ 已自動記入：${r?.name ?? "固定收支"} ${formatAmount(e.amount)}`);
  } else if (added.length > 1) {
    toast(`✅ 已自動記入 ${added.length} 筆固定收支`);
  }
}

/**
 * 擋住 iPhone「快速點兩下就放大」（D-060）。
 * CSS 的 touch-action 在加到主畫面的 App 裡不一定有效，所以再用程式擋一次：
 * 350ms 內的第二下點擊，取消瀏覽器的預設動作（放大），再自己補一次點擊，按鍵照樣按得到。
 * 輸入框不處理（點兩下選字要保留）；手指有移動（捲動、拖曳）也不處理。
 */
function preventDoubleTapZoom() {
  let lastEnd = 0;
  let start = null;
  document.addEventListener("touchstart", (e) => (start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null), { passive: true });
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      const quick = now - lastEnd < 350;
      lastEnd = now;
      const t = e.changedTouches[0];
      const moved = !start || !t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10;
      if (!quick || moved || !e.cancelable || e.target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      const target = e.target.closest("button, a, label, [role=switch], [tabindex]");
      target?.click();
    },
    { passive: false },
  );
}
preventDoubleTapZoom();

// 底部固定區（摘要列＋分頁列，含 iPhone 下方安全區）的實際高度存到 --tabbar-h，
// 頁面內容和提示條才會留出剛好的空間
const dock = $("dock");
const syncTabbar = () => document.documentElement.style.setProperty("--tabbar-h", `${dock.offsetHeight}px`);
new ResizeObserver(syncTabbar).observe(dock);
syncTabbar();

budget.mount();
ledger.mount($("page-ledger"));
stats.mount($("page-stats"));
more.mount($("page-more"));
$("tab-add").addEventListener("click", () => openEntrySheet());
// 記好一筆後回到記帳頁，並捲到那一筆
document.addEventListener("entrysaved", () => {
  if (current !== "ledger") location.hash = "#/ledger";
  else ledger.render();
});
window.addEventListener("hashchange", show);

startup();
show();

// 離線也能開啟（sw.js）。本機開發時預設不啟用，避免一直看到舊檔；網址加 ?sw 可以測試
const isDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !new URLSearchParams(location.search).has("sw");
if ("serviceWorker" in navigator && !isDev) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
