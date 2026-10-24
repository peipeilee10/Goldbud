// 記帳首頁（SPEC B5，wireframe A）

import { entriesInMonth, groupByDay, compareMonth, runRecurring, skipMonth } from "../ledger.js";
import { newEntry } from "../store.js";
import { todayStr, monthKey, shiftMonth, monthTitle, dayLabel, addDays } from "../dates.js";
import { daysSinceBackup } from "../backup.js";
import * as calculator from "../calculator.js";
import { h, openSheet, toast, formatAmount, moneyButton, showMoney, openCalculator } from "../ui.js";
import { getData, commit, findCategory, getPref, setPref } from "../state.js";
import { openEntrySheet, entryLabel } from "./entry.js";

let el;
let month = monthKey(todayStr());
let filter = { categoryId: null, text: "" };
let searchOpen = false;
let flashId = null;

export function mount(root) {
  el = root;
  document.addEventListener("entrysaved", (e) => {
    flashId = e.detail.id;
    month = monthKey(e.detail.date);
  });
}

/** 從統計頁跳過來：只看某個分類 */
export function showCategory(key, categoryId) {
  month = key;
  filter = { categoryId, text: "" };
  searchOpen = true;
}

export function render() {
  const data = getData();
  const today = todayStr();
  const current = monthKey(today);
  const all = entriesInMonth(data.entries, month);
  const entries = all.filter(matches);
  const cmp = compareMonth(data, month, today);
  const { pending } = runRecurring(structuredClone(data), today);

  el.replaceChildren(
    h(
      "main",
      { class: "content" },
      h(
        "header",
        { class: "page-title" },
        h("h1", {}, "記帳"),
        h("button", { class: searchOpen ? "btn on" : "btn", "aria-label": "搜尋與篩選", "aria-pressed": String(searchOpen), onclick: () => ((searchOpen = !searchOpen), searchOpen || (filter = { categoryId: null, text: "" }), render()) }, "🔍"),
      ),
      monthNav(),
      searchOpen ? searchBar() : null,
      all.length ? overview(cmp, month === current) : null,
      month === current && pending.length ? h("button", { class: "banner", onclick: openPending }, `⏰ ${pending.length} 筆固定收支待確認`, h("span", { class: "go" }, "›")) : null,
      backupBanner(),
      entries.length ? groupByDay(entries).map(dayCard) : emptyState(all.length > 0),
    ),
  );
  if (flashId) {
    el.querySelector(`[data-entry="${flashId}"]`)?.scrollIntoView({ block: "center" });
    flashId = null;
  }
}

function matches(e) {
  if (filter.categoryId && e.categoryId !== filter.categoryId) return false;
  if (filter.text && !e.note.includes(filter.text)) {
    const l = entryLabel(e);
    if (!`${l.title}${l.sub}`.includes(filter.text)) return false;
  }
  return true;
}

export function monthNavFor(key, onChange) {
  return h(
    "div",
    { class: "month-nav" },
    h("button", { class: "btn arrow", "aria-label": "上個月", onclick: () => onChange(shiftMonth(key, -1)) }, "‹"),
    h("b", {}, monthTitle(key)),
    h("button", { class: "btn arrow", "aria-label": "下個月", onclick: () => onChange(shiftMonth(key, 1)) }, "›"),
  );
}

function monthNav() {
  return monthNavFor(month, (k) => ((month = k), render()));
}

function searchBar() {
  const data = getData();
  const input = h("input", { placeholder: "搜尋備註或分類", value: filter.text, "aria-label": "搜尋", enterkeyhint: "search" });
  input.addEventListener("input", () => {
    filter.text = input.value.trim();
    const pos = input.selectionStart;
    render();
    const again = el.querySelector(".search input");
    again?.focus();
    again?.setSelectionRange(pos, pos);
  });
  return h(
    "div",
    { class: "search" },
    h("label", { class: "field" }, "🔍", input),
    h(
      "div",
      { class: "chips" },
      h("button", { class: filter.categoryId ? "chip" : "chip on", onclick: () => ((filter.categoryId = null), render()) }, "全部"),
      [...data.categories.filter((c) => c.kind === "expense"), ...data.incomeCategories].map((c) =>
        h("button", { class: filter.categoryId === c.id ? "chip on" : "chip", onclick: () => ((filter.categoryId = c.id), render()) }, `${c.emoji} ${c.name}`),
      ),
    ),
  );
}

const MASCOT = { ok: "calm", fast: "sweat", over: "panic", done: "done" };

/** 本月總覽卡（wireframe A1、A2） */
export function overview(cmp, isCurrent) {
  const { totals, overall, ratio } = cmp;
  const st = overall.budget <= 0 ? "ok" : !isCurrent && overall.status === "ok" ? "done" : overall.status;
  const pct = overall.pct ?? 0;
  const scale = Math.max(100, pct);
  const words = {
    ok: isCurrent ? "花錢速度剛好" : "在預算內",
    fast: "花得有點快喔",
    over: `超出預算 ${formatAmount(Math.round(totals.expense - overall.budget))}`,
    done: `${Number(cmp.key.slice(5))} 月全部在預算內！`,
  }[st];
  const badge = { fast: ["fast", "⚡ 花太快"], over: ["over", "⚠ 超支"], done: ["ok", "✓ 達標"] }[st];
  return h(
    "section",
    { class: `overview status-${st}` },
    h(
      "div",
      { class: "overview-top" },
      h("img", { src: `design/mascot/capybara-${MASCOT[st]}.svg`, alt: "" }),
      h(
        "div",
        { class: "ov-stats" },
        h("div", { class: "in" }, "收入", h("b", {}, formatAmount(totals.income))),
        h("div", {}, "支出", h("b", {}, formatAmount(totals.expense))),
        h("div", {}, "結餘", h("b", {}, formatAmount(totals.balance))),
      ),
    ),
    overall.budget > 0
      ? [
          h(
            "div",
            { class: "budget-meter" },
            h(
              "div",
              { class: "meter", role: "img", "aria-label": `支出預算已用 ${Math.round(pct)}%` },
              h("i", { class: st === "fast" ? "fast" : null, style: `width:${(Math.min(100, pct) / scale) * 100}%` }),
              pct > 100 ? h("i", { class: "over", style: `width:${((pct - 100) / scale) * 100}%;border-left:2px solid var(--outline)` }) : null,
            ),
            ratio != null ? h("span", { class: "today-line", style: `left:${(ratio * 100) / (scale / 100)}%`, "aria-hidden": "true" }) : null,
          ),
          h("div", { class: "meter-note" }, h("span", {}, words, badge ? h("span", { class: `badge ${badge[0]}` }, badge[1]) : null), h("span", {}, `預算 ${formatAmount(Math.round(overall.budget))} · 已用 ${Math.round(pct)}%`)),
        ]
      : h("div", { class: "meter-note" }, h("span", {}, "這個月的預算方案沒有支出項目")),
  );
}

function dayCard(day) {
  const sums = [day.income ? `+${formatAmount(day.income)}` : null, day.expense ? `−${formatAmount(day.expense)}` : null].filter(Boolean).join(" · ");
  return h(
    "section",
    { class: "day" },
    h("div", { class: "day-head" }, h("span", {}, dayLabel(day.date)), h("span", {}, sums)),
    h("div", { class: "day-list" }, day.items.map(entryRow)),
  );
}

function entryRow(e) {
  const l = entryLabel(e);
  const income = e.type === "income";
  return h(
    "button",
    { class: e.id === flashId ? "entry flash" : "entry", "data-entry": e.id, onclick: () => openEntrySheet({ entry: e }) },
    h("span", { class: "tile", style: `background:var(--${income ? "income" : "expense"}-soft)` }, l.emoji),
    h(
      "span",
      { class: "txt" },
      h("b", {}, l.title, e.source === "recurring" ? h("span", { class: "tag" }, "🔁 固定") : null),
      h("small", {}, e.note || l.sub || " "),
    ),
    h("span", { class: income ? "amt in" : "amt" }, `${income ? "+" : "−"}${formatAmount(e.amount)}`),
  );
}

function emptyState(filtered) {
  return h(
    "div",
    { class: "empty" },
    h("img", { src: "design/mascot/capybara-sleep.svg", alt: "" }),
    h("b", {}, filtered ? "沒有符合的紀錄" : "這個月還沒有紀錄"),
    h("p", {}, filtered ? "換個關鍵字或分類試試" : "按下方的 ＋ 記下第一筆吧"),
  );
}

/** 每月第一次打開、超過 30 天沒備份時提醒（SPEC B10） */
function backupBanner() {
  const data = getData();
  const key = monthKey(todayStr());
  const days = daysSinceBackup(data);
  if (!data.entries.length || getPref("backupHint") === key) return null;
  // 從沒備份過：最早的紀錄滿 7 天才提醒；備份過：超過 30 天才提醒
  const oldest = data.entries.reduce((m, e) => (e.date < m ? e.date : m), "9999");
  if (days == null ? oldest > addDays(todayStr(), -7) : days < 30) return null;
  return h(
    "div",
    { class: "banner soft" },
    `💾 ${days == null ? "還沒有備份過" : `上次備份是 ${days} 天前`}`,
    h("a", { class: "go", href: "#/more/backup" }, "備份 ›"),
    h("button", { class: "banner-x", "aria-label": "這個月不再提醒", onclick: () => (setPref("backupHint", key), render()) }, "✕"),
  );
}

// ---------- 固定收支待確認（wireframe C2） ----------

function openPending() {
  const data = getData();
  const { pending } = runRecurring(structuredClone(data), todayStr());
  const body = h("div");
  const close = openSheet("待確認的固定收支", body);
  const draw = () => {
    const { pending: now } = runRecurring(structuredClone(getData()), todayStr());
    if (!now.length) return close();
    body.replaceChildren(...now.map(card));
  };
  const card = (p) => {
    const r = p.recurring;
    const cat = r.type === "income" ? getData().incomeCategories.find((c) => c.id === r.categoryId) : findCategory(r.categoryId);
    let amount = p.lastAmount;
    const btn = moneyButton("", () =>
      openCalculator({ title: `${r.name} ${Number(p.key.slice(5))} 月的金額`, value: amount, field: btn, onSubmit: (v) => ((amount = v), showMoney(btn, v), (ok.disabled = !(v > 0))) }),
    );
    showMoney(btn, amount);
    const ok = h(
      "button",
      {
        class: "btn primary",
        disabled: !(amount > 0),
        onclick: () => {
          const d = getData();
          d.entries.push(newEntry({ type: r.type, date: p.date, amount: calculator.roundResult(amount), categoryId: r.categoryId, subcategoryId: r.subcategoryId, source: "recurring", recurringId: r.id }));
          commit();
          toast(`✅ 已記入：${r.name} ${formatAmount(amount)}`);
          draw();
        },
      },
      "記入",
    );
    return h(
      "div",
      { class: "confirm-card" },
      h("div", { class: "head" }, h("span", { class: "emoji small" }, cat?.emoji ?? "🔁"), h("b", {}, r.name), h("small", {}, `${dayLabel(p.date)} · ${cat?.name ?? ""}`)),
      btn,
      h("div", { class: "sheet-actions" }, h("button", { class: "btn", onclick: () => (skipMonth(getData(), r.id, p.key), commit(), draw()) }, "這個月略過"), ok),
    );
  };
  if (pending.length) draw();
}
