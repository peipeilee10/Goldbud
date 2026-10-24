// 統計頁（SPEC B7、B8，wireframe D）

import { compareMonth, suggestions, donutSlices, subcategorySlices, setMonthPlan, ensureMonth } from "../ledger.js";
import { todayStr, monthKey } from "../dates.js";
import { h, openSheet, confirmSheet, formatAmount } from "../ui.js";
import { getData, commit } from "../state.js";
import { monthNavFor } from "./ledger.js";
import { showCategory } from "./ledger.js";

let el;
let month = monthKey(todayStr());
let view = "compare"; // compare | donut
let donutType = "expense";
let drill = null; // 甜甜圈點開的大分類 id
const open = new Set(); // 展開小分類的大分類 id

export function mount(root) {
  el = root;
}

const money = (n) => formatAmount(Math.round(n));

export function render() {
  const data = getData();
  const today = todayStr();
  const isCurrent = month === monthKey(today);
  const cmp = compareMonth(data, month, today);
  const hasEntries = cmp.totals.income + cmp.totals.expense > 0;

  el.replaceChildren(
    h(
      "main",
      { class: "content" },
      h("header", { class: "page-title" }, h("h1", {}, "統計")),
      monthNavFor(month, (k) => ((month = k), (drill = null), render())),
      planPicker(cmp, isCurrent),
      verdict(cmp, isCurrent, hasEntries),
      h(
        "div",
        { class: "seg" },
        h("button", { class: view === "compare" ? "on" : null, onclick: () => ((view = "compare"), render()) }, "預算比對"),
        h("button", { class: view === "donut" ? "on" : null, onclick: () => ((view = "donut"), render()) }, "圓餅圖"),
      ),
      view === "compare" ? compareView(cmp) : donutView(),
    ),
  );
}

// ---------- 預算方案 ----------

function planPicker(cmp, isCurrent) {
  const data = getData();
  const m = data.months[month];
  const locked = !!m?.locked;
  const name = cmp.plan.name + (locked && !data.plans.some((p) => p.id === cmp.plan.id) ? "（已刪除）" : "");
  return h(
    "button",
    { class: "plan-pick", onclick: () => choosePlan(locked) },
    h("span", {}, `🎯 預算：${name} ▾`),
    h("small", {}, locked ? "已鎖定 🔒" : isCurrent ? "進行中" : month > monthKey(todayStr()) ? "未開始" : ""),
  );
}

function choosePlan(locked) {
  const data = getData();
  const current = data.months[month]?.planId ?? data.activePlanId;
  const close = openSheet(`${Number(month.slice(5))} 月使用哪個預算方案？`, [
    locked ? h("p", {}, "這個月已經結束並鎖定。更換方案會用方案「目前」的內容重新比對。") : null,
    h(
      "div",
      { class: "menu" },
      data.plans.map((p) =>
        h(
          "button",
          {
            class: p.id === current ? "btn primary" : "btn",
            onclick: () => {
              close();
              const apply = () => {
                setMonthPlan(data, month, p.id);
                commit();
                render();
              };
              if (locked && p.id !== current) confirmSheet({ title: "重新套用方案？", message: `${Number(month.slice(5))} 月會改用「${p.name}」目前的內容比對。`, confirmLabel: "套用", danger: false, onConfirm: apply });
              else apply();
            },
          },
          p.id === current ? `✓ ${p.name}` : p.name,
        ),
      ),
    ),
  ]);
}

// ---------- 水豚總結 ----------

function verdict(cmp, isCurrent, hasEntries) {
  let img = "calm";
  let text;
  const over = cmp.rows.filter((r) => r.status === "over");
  const fast = cmp.rows.filter((r) => r.status === "fast");
  const names = (list) => list.slice(0, 2).map((r) => r.category.name).join("、") + (list.length > 2 ? ` 等 ${list.length} 個分類` : "");
  if (!hasEntries) {
    img = "sleep";
    text = month > monthKey(todayStr()) ? "這個月還沒開始" : "這個月還沒有紀錄";
  } else if (over.length) {
    img = "panic";
    text = `${names(over)}超出預算了`;
  } else if (fast.length && isCurrent) {
    img = "sweat";
    text = `${names(fast)}花得有點快，其他都還好`;
  } else if (isCurrent) {
    text = "目前都在預算內，繼續保持";
  } else {
    img = "done";
    text = "全部在預算內，太棒了！";
  }
  return h("div", { class: "verdict" }, h("img", { src: `design/mascot/capybara-${img}.svg`, alt: "" }), h("span", { class: "bubble" }, text));
}

// ---------- 預算比對 ----------

const BADGE = { fast: ["fast", "⚡ 花太快"], over: ["over", "⚠ 超支"], outside: ["out", "預算外"] };

function compareView(cmp) {
  const rows = [...cmp.rows, ...cmp.outside];
  const tips = suggestions(cmp);
  return [
    rows.length ? h("div", { class: "prog-card" }, rows.map((r) => progRow(r, cmp.ratio))) : h("p", { class: "empty-hint" }, "這個月的預算方案沒有支出項目"),
    h(
      "div",
      { class: "info-card" },
      h("h3", {}, "💰 收入"),
      kv("預算", money(cmp.income.budget)),
      kv("實際", money(cmp.income.actual), cmp.income.actual >= cmp.income.budget ? "good" : null),
      !cmp.income.hasIncome ? h("p", { class: "cap" }, "這個月還沒記收入") : null,
    ),
    h(
      "div",
      { class: "info-card" },
      h("h3", {}, "🐷 儲蓄"),
      kv("目標", money(cmp.saving.target)),
      kv(cmp.ratio != null ? "目前結餘（收入 − 支出）" : "實際存下（收入 − 支出）", money(cmp.saving.actual), cmp.saving.actual >= cmp.saving.target ? "good" : "bad"),
      cmp.saving.estimated ? h("p", { class: "cap" }, "還沒有收入紀錄，以預算收入估算") : null,
      cmp.ratio != null ? h("p", { class: "cap" }, "月底才會知道實際存下多少") : null,
    ),
    tips.length ? h("div", { class: "info-card tips" }, h("h3", {}, "💡 調整建議"), h("ul", { class: "tip-list" }, tips.map((t) => h("li", {}, tipText(t))))) : null,
  ];
}

function kv(label, value, cls = null) {
  return h("div", { class: "kv" }, h("span", {}, label), h("b", { class: cls }, value));
}

function tipText(t) {
  const n = (c) => `${c.emoji} ${c.name}`;
  switch (t.kind) {
    case "over":
      return `${n(t.category)}超出 ${money(t.amount)}`;
    case "projected":
      return `照目前速度，${n(t.category)}月底會超出約 ${money(t.amount)}`;
    case "outside":
      return `${n(t.category)}不在這個月的預算裡，花了 ${money(t.amount)}；可以考慮加進方案`;
    case "underused":
      return `${n(t.category)}只用了 ${Math.round(t.pct)}%，預算可能給太多`;
    case "move":
      return `下個月可以考慮把 ${n(t.from)}的 ${money(t.amount)} 移給 ${n(t.to)}`;
  }
}

function progRow(r, ratio) {
  const expanded = open.has(r.category.id);
  const canExpand = r.subs.length > 0;
  const pct = r.pct ?? 0;
  const scale = Math.max(100, pct);
  const badge = BADGE[r.status];
  const remain = r.budget - r.actual;
  return h(
    "div",
    { class: "prog" },
    h(
      "button",
      {
        class: "prog-top",
        "aria-expanded": canExpand ? String(expanded) : null,
        onclick: () => {
          if (!canExpand) return;
          expanded ? open.delete(r.category.id) : open.add(r.category.id);
          render();
        },
      },
      h("b", {}, `${r.category.emoji} ${r.category.name}`),
      badge ? h("span", { class: `badge ${badge[0]}` }, badge[1]) : null,
      h("span", { class: "num" }, money(r.actual), r.status !== "outside" ? h("span", {}, ` / ${money(r.budget)}`) : null),
    ),
    r.status !== "outside"
      ? h(
          "div",
          { class: "budget-meter" },
          h(
            "div",
            { class: "meter", role: "img", "aria-label": `已用 ${Math.round(pct)}%` },
            h("i", { class: r.status === "fast" ? "fast" : null, style: `width:${(Math.min(100, pct) / scale) * 100}%` }),
            pct > 100 ? h("i", { class: "over", style: `width:${((pct - 100) / scale) * 100}%;border-left:2px solid var(--outline)` }) : null,
          ),
          ratio != null && pct <= 100 ? h("span", { class: "today-line", style: `left:${ratio * 100}%`, "aria-hidden": "true" }) : null,
        )
      : null,
    h(
      "div",
      { class: "prog-cap" },
      h("span", {}, r.status === "outside" ? `這個月的方案沒有「${r.category.name}」` : `${Math.round(pct)}%`),
      h(
        "span",
        { class: remain < -0.5 ? "bad" : null },
        r.status === "outside" ? "" : remain < -0.5 ? `超出 ${money(-remain)}` : Math.abs(remain) <= 0.5 ? "剛好用完" : `剩 ${money(remain)}`,
        canExpand ? (expanded ? " ▴" : " ▾") : "",
      ),
    ),
    expanded ? h("div", { class: "prog-subs" }, r.subs.map((s) => h("div", {}, h("span", {}, s.name), h("span", {}, money(s.amount))))) : null,
  );
}

// ---------- 甜甜圈（D2、D3） ----------

function donutView() {
  const data = getData();
  const sliceColor = (s) => (s.color ? `var(--cat-${s.color})` : "var(--cat-other)");
  let total, slices, center, crumb = null;
  if (drill) {
    const cat = data.categories.find((c) => c.id === drill);
    ({ total, slices } = subcategorySlices(data, month, drill));
    // 小分類沒有固定顏色：用同一個分類色的深淺（依金額排序，最多 5 階）
    const base = cat?.color ? `var(--cat-${cat.color})` : "var(--cat-other)";
    slices = slices.map((s, i) => ({ ...s, css: `color-mix(in srgb, ${base} ${100 - i * 18}%, var(--surface))` }));
    center = [`${cat?.emoji ?? ""} ${cat?.name ?? ""}`, total];
    crumb = h("button", { class: "crumb", onclick: () => ((drill = null), render()) }, "‹ 全部支出");
  } else {
    ({ total, slices } = donutSlices(data, month, donutType));
    slices = slices.map((s) => ({ ...s, css: sliceColor(s) }));
    center = [donutType === "expense" ? "本月支出" : "本月收入", total];
  }

  return [
    drill
      ? crumb
      : h(
          "div",
          { class: `seg small ${donutType}` },
          h("button", { class: donutType === "expense" ? "on" : null, onclick: () => ((donutType = "expense"), render()) }, "支出"),
          h("button", { class: donutType === "income" ? "on" : null, onclick: () => ((donutType = "income"), render()) }, "收入"),
        ),
    total > 0
      ? [
          h("div", { class: "donut-box" }, donutSvg(slices, center[0]), h("div", { class: "donut-center" }, center[0], h("b", {}, money(center[1])))),
          h(
            "div",
            { class: "legend" },
            slices.map((s) =>
              h(
                "button",
                {
                  onclick: () => {
                    if (drill || donutType !== "expense" || !s.id) return;
                    drill = s.id;
                    render();
                  },
                },
                h("i", { style: `background:${s.css}` }),
                s.emoji ? `${s.emoji} ${s.name}` : s.name,
                h("span", { class: "v" }, money(s.amount)),
                h("span", { class: "p" }, `${Math.round(s.share * 100)}%`),
              ),
            ),
          ),
          drill
            ? h("a", { class: "btn wide", href: "#/ledger", onclick: () => showCategory(month, drill) }, "看這個分類的所有紀錄 ›")
            : donutType === "expense"
              ? h("p", { class: "cap center" }, "點一個分類可以看小分類")
              : null,
        ]
      : h("p", { class: "empty-hint" }, donutType === "expense" ? "這個月還沒有支出紀錄" : "這個月還沒有收入紀錄"),
  ];
}

/** SVG 甜甜圈：區塊之間留卡片色的縫隙，內外圈咖啡色外框 */
function donutSvg(slices, label) {
  const ns = "http://www.w3.org/2000/svg";
  const r = 82;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2.5 : 0;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 220 220");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${label}：${slices.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join("、")}`);
  const circle = (attrs) => {
    const el = document.createElementNS(ns, "circle");
    for (const [k, v] of Object.entries({ cx: 110, cy: 110, r, fill: "none", ...attrs })) el.setAttribute(k, v);
    svg.append(el);
    return el;
  };
  circle({ stroke: "var(--surface)", "stroke-width": 36 });
  let offset = 0;
  for (const s of slices) {
    const len = s.share * c;
    const seg = circle({ "stroke-width": 34, "stroke-dasharray": `${Math.max(0, len - gap)} ${c}`, "stroke-dashoffset": -offset, transform: "rotate(-90 110 110)" });
    seg.style.stroke = s.css;
    offset += len;
  }
  circle({ r: r + 18, stroke: "var(--outline)", "stroke-width": 2.5 });
  circle({ r: r - 18, stroke: "var(--outline)", "stroke-width": 2.5 });
  return svg;
}

/** 進入統計頁時，本月還沒有預算方案就用目前開啟的方案 */
export function prepare() {
  const data = getData();
  const key = monthKey(todayStr());
  if (!data.months[key]) {
    ensureMonth(data, key);
    commit("stats");
  }
}
