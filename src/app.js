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

// 分頁列的實際高度（含 iPhone 下方安全區）存到 --tabbar-h，摘要列和提示條才會剛好貼在它上方
const tabbar = document.querySelector(".tabbar");
const syncTabbar = () => document.documentElement.style.setProperty("--tabbar-h", `${tabbar.offsetHeight}px`);
new ResizeObserver(syncTabbar).observe(tabbar);
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
