// 預算頁（SPEC 第 3～6 節；v2 起項目改成選共用分類，見 B3.2）

import { incomeTotal, expenseView, summarize, formatNumber, formatMoney, formatPercent, parseInput, sanitizeTyping } from "../calc.js";
import { defaultPlan, clonePlan, uniqueName, newIncome, newExpense } from "../store.js";
import { ensureMonth } from "../ledger.js";
import { todayStr, monthKey } from "../dates.js";
import * as calculator from "../calculator.js";
import { makeSortable } from "../drag.js";
import { $, h, openSheet, confirmSheet, openCalculator, moneyButton, showMoney, selectAll, confetti, pickEmoji, promptSheet } from "../ui.js";
import { getData, commit, activePlan as plan, findCategory, findIncomeCategory } from "../state.js";
import { pickCategory } from "../pickers.js";
import { openRecurringFromBudget } from "./more.js";

const SELF = "budget";

const MASCOT = {
  empty: "design/mascot/capybara-sleep.svg",
  under: "design/mascot/capybara-calm.svg",
  done: "design/mascot/capybara-done.svg",
  over: "design/mascot/capybara-sweat.svg",
};

let lastStatus = null;

function persist() {
  plan().updatedAt = new Date().toISOString();
  commit(SELF);
}

// ---------- 方案標籤 ----------

function renderPlans() {
  const data = getData();
  const nav = $("plans");
  nav.replaceChildren(
    ...data.plans.map((p) => {
      const on = p.id === data.activePlanId;
      return h(
        "button",
        { class: on ? "plan on" : "plan", "aria-current": on ? "true" : null, onclick: () => (on ? openPlanMenu() : switchPlan(p.id)) },
        p.name,
        on ? h("small", { "aria-hidden": "true" }, " ▾") : null,
      );
    }),
    h("button", { class: "plan plan-add", "aria-label": "新增方案", onclick: addPlan }, "＋"),
  );
  nav.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  renderMonthPlan();
}

/** 「這個方案是不是本月的預算」 */
function renderMonthPlan() {
  const data = getData();
  const key = monthKey(todayStr());
  const month = Number(key.slice(5));
  const isThis = (data.months[key]?.planId ?? data.activePlanId) === data.activePlanId;
  $("month-plan").replaceChildren(
    isThis
      ? h("div", { class: "banner soft" }, `📅 ${month} 月的預算使用這個方案`)
      : h(
          "button",
          {
            class: "banner",
            onclick: () => {
              ensureMonth(data, key).planId = data.activePlanId;
              commit(SELF);
              renderMonthPlan();
            },
          },
          `📅 設為 ${month} 月的預算`,
          h("span", { class: "go" }, "›"),
        ),
  );
}

function switchPlan(id) {
  const data = getData();
  data.activePlanId = id;
  // 本月還沒有指定方案時，跟著目前開啟的方案
  commit(SELF);
  lastStatus = null;
  render();
}

function addPlan() {
  const data = getData();
  const p = defaultPlan(data, uniqueName("新方案", data.plans));
  data.plans.push(p);
  switchPlan(p.id);
}

function openPlanMenu() {
  const data = getData();
  const p = plan();
  const onlyOne = data.plans.length <= 1;
  const close = openSheet(p.name, [
    h(
      "div",
      { class: "menu" },
      h("button", { class: "btn", onclick: () => (close(), rename()) }, "✏️ 重新命名"),
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            close();
            const c = clonePlan(p, uniqueName(`${p.name} 複本`, data.plans));
            data.plans.splice(data.plans.indexOf(p) + 1, 0, c);
            switchPlan(c.id);
          },
        },
        "📄 複製這個方案",
      ),
      h(
        "button",
        {
          class: "btn danger",
          disabled: onlyOne,
          onclick: () => {
            close();
            confirmSheet({ title: `刪除「${p.name}」？`, message: "刪除後無法復原。已經鎖定的過去月份不受影響。", confirmLabel: "刪除", onConfirm: () => deletePlan(p.id) });
          },
        },
        "🗑 刪除方案",
      ),
    ),
    onlyOne ? h("div", { class: "sheet-note" }, "至少要保留一個方案") : null,
  ]);
}

function rename() {
  const p = plan();
  promptSheet({
    title: "重新命名",
    value: p.name,
    onSubmit: (name) => {
      p.name = name;
      persist();
      renderPlans();
    },
  });
}

function deletePlan(id) {
  const data = getData();
  const i = data.plans.findIndex((p) => p.id === id);
  data.plans.splice(i, 1);
  // 指向這個方案、還沒鎖定的月份，改用剩下的方案
  for (const m of Object.values(data.months)) if (!m.locked && m.planId === id) m.planId = data.plans[Math.max(0, i - 1)].id;
  switchPlan(data.plans[Math.max(0, i - 1)].id);
}

// ---------- 收入 ----------

function renderIncomes(popId) {
  const list = $("income-list");
  list.replaceChildren(...plan().incomes.map((item) => incomeRow(item, item.id === popId)));
  if (!plan().incomes.length) list.append(h("p", { class: "empty-hint" }, "還沒有收入項目"));
}

function categoryButton(cat, onClick) {
  return h(
    "button",
    { class: "field grow cat-pick", type: "button", onclick: onClick, "aria-label": `${cat?.name ?? "未選分類"}，更換分類` },
    h("span", { class: "cat-name" }, cat?.name ?? "未選分類"),
    h("span", { class: "caret", "aria-hidden": "true" }, "▾"),
  );
}

function incomeRow(item, isNew) {
  const cat = findIncomeCategory(item.categoryId);
  const amount = moneyButton("income-amount", () =>
    openCalculator({
      title: `${cat?.name ?? "收入"}的金額`,
      value: item.amount,
      field: amount,
      onSubmit: (v) => {
        item.amount = v;
        showMoney(amount, v);
        persist();
        update();
      },
    }),
  );
  showMoney(amount, item.amount);
  const swap = () =>
    pickCategory({
      type: "income",
      exclude: new Set(plan().incomes.filter((i) => i !== item).map((i) => i.categoryId)),
      onPick: (c) => {
        item.categoryId = c.id;
        persist();
        renderIncomes();
      },
    });
  return h(
    "div",
    { class: isNew ? "item row pop" : "item row", "data-id": item.id },
    dragHandle(),
    categoryButton(cat, swap),
    amount,
    h("button", { class: "del", "aria-label": "刪除這個收入", onclick: () => removeItem("incomes", item.id) }, "✕"),
  );
}

function dragHandle() {
  return h("button", { class: "handle", type: "button", "aria-label": "拖曳排序（也可以用上下鍵）" }, "⠿");
}

function removeItem(list, id) {
  plan()[list] = plan()[list].filter((i) => i.id !== id);
  persist();
  list === "incomes" ? renderIncomes() : renderExpenses();
  update();
}

// ---------- 支出 ----------

function renderExpenses(popId) {
  const list = $("expense-list");
  list.replaceChildren(...plan().expenses.map((item) => expenseRow(item, item.id === popId)));
  if (!plan().expenses.length) list.append(h("p", { class: "empty-hint" }, "還沒有支出項目"));
}

function expenseRow(item, isNew) {
  const cat = findCategory(item.categoryId);
  const emoji = h(
    "button",
    {
      class: "emoji",
      "aria-label": "更換圖示（所有方案一起改）",
      onclick: () =>
        pickEmoji(cat?.emoji, (e) => {
          if (!cat) return;
          cat.emoji = e;
          commit();
          renderExpenses();
        }),
    },
    cat?.emoji ?? "❔",
  );
  const swap = () =>
    pickCategory({
      type: "expense",
      exclude: new Set(plan().expenses.filter((x) => x !== item).map((x) => x.categoryId)),
      onPick: (c) => {
        item.categoryId = c.id;
        persist();
        renderExpenses();
      },
    });

  const pct = h("input", { inputmode: "decimal", placeholder: "0", "aria-label": "百分比", autocomplete: "off", "data-role": "pct" });
  const amt = moneyButton("grow", () =>
    openCalculator({
      title: `${cat?.name ?? "支出"}的金額`,
      value: item.mode === "amount" && item.value == null ? null : calculator.roundResult(expenseView(item, incomeTotal(plan())).amount),
      field: amt,
      onSubmit: (v) => {
        item.mode = "amount";
        item.value = v;
        persist();
        update();
        row.querySelector(".recur")?.toggleAttribute("hidden", false);
      },
    }),
  );
  amt.dataset.box = "amt";

  pct.addEventListener("input", () => {
    let clean = sanitizeTyping(pct.value);
    const v = parseInput(clean, 100);
    if (v != null && v === 100 && Number(clean) > 100) clean = "100";
    if (clean !== pct.value) pct.value = clean;
    item.mode = "percent";
    item.value = v;
    persist();
    update();
  });
  pct.addEventListener("focus", () => {
    if (pct.value === "—") pct.value = "";
    selectAll(pct);
  });
  pct.addEventListener("blur", () => fillExpense(row, item, true));

  // 固定金額的項目可以一鍵加入固定收支（SPEC B9.1）
  const recur = h(
    "button",
    {
      class: "del recur",
      "aria-label": "加入固定收支",
      hidden: item.mode !== "amount" || cat?.kind !== "expense",
      onclick: () => openRecurringFromBudget({ categoryId: item.categoryId, amount: expenseView(item, incomeTotal(plan())).amount, name: cat?.name ?? "" }),
    },
    "🔁",
  );

  const row = h(
    "div",
    { class: isNew ? "item exp pop" : "item exp", "data-id": item.id },
    h("div", { class: "row" }, dragHandle(), emoji, categoryButton(cat, swap), recur, h("button", { class: "del", "aria-label": "刪除這個支出", onclick: () => removeItem("expenses", item.id) }, "✕")),
    h(
      "div",
      { class: "row" },
      h("label", { class: "field amount w-pct", "data-box": "pct" }, pct, h("span", { class: "unit" }, "%")),
      h("span", { class: "swap", "aria-hidden": "true" }, "⇄"),
      amt,
    ),
  );
  if (cat?.kind === "saving") row.classList.add("saving");
  fillExpense(row, item, true);
  return row;
}

/** 更新一列支出的 % / 金額與主值標示；正在輸入的欄位不覆蓋 */
function fillExpense(row, item, force = false) {
  const total = incomeTotal(plan());
  const view = expenseView(item, total);
  const pct = row.querySelector('[data-role="pct"]');
  const amt = row.querySelector('[data-box="amt"]');
  const isPct = item.mode === "percent";
  if (force || document.activeElement !== pct) {
    pct.value = isPct ? (item.value == null ? "" : formatPercent(item.value)) : formatPercent(view.percent);
  }
  showMoney(amt, !isPct && item.value == null ? null : view.amount);
  row.querySelector('[data-box="pct"]').classList.toggle("primary", isPct);
  row.querySelector('[data-box="pct"]').classList.toggle("computed", !isPct);
  amt.classList.toggle("primary", !isPct);
  amt.classList.toggle("computed", isPct);
  const recur = row.querySelector(".recur");
  if (recur) recur.hidden = isPct || findCategory(item.categoryId)?.kind !== "expense";
}

// ---------- 摘要與即時更新 ----------

function update() {
  const p = plan();
  const s = summarize(p);

  $("income-count").textContent = `${p.incomes.length} 項`;
  $("income-total").textContent = formatMoney(s.total);

  for (const item of p.expenses) {
    const row = document.querySelector(`#expense-list [data-id="${item.id}"]`);
    if (row) fillExpense(row, item);
  }

  const over = s.status === "over";
  $("expense-head").textContent = `已分配 ${formatPercent(s.allocatedPercent)}%`;
  $("expense-head").classList.toggle("over", over);
  $("allocated").textContent = `${formatPercent(s.allocatedPercent)}% · ${formatMoney(s.allocated)}`;
  $("unallocated-label").textContent = over ? "超出" : "未分配";
  $("unallocated").textContent = over
    ? `${formatPercent(-s.remainingPercent)}% · ${formatMoney(-s.remaining)}`
    : `${formatPercent(s.remainingPercent)}% · ${formatMoney(s.remaining)}`;
  $("unallocated").parentElement.classList.toggle("over", over);

  const summary = $("summary");
  summary.dataset.status = s.status;
  $("mascot").src = MASCOT[s.status];
  $("bubble").textContent = {
    empty: "先填入收入吧",
    under: `還有 ${formatMoney(s.remaining)} 可以分配`,
    done: "分配完成！🎉",
    over: `超出 ${formatPercent(-s.remainingPercent)}%（${formatMoney(-s.remaining)}）`,
  }[s.status];

  const scale = Math.max(100, s.allocatedPercent);
  $("meter-fill").style.width = `${(Math.min(100, s.allocatedPercent) / scale) * 100}%`;
  $("meter-over").style.width = `${(Math.max(0, s.allocatedPercent - 100) / scale) * 100}%`;

  $("stat-total").textContent = formatNumber(s.total);
  $("stat-allocated").textContent = formatNumber(s.allocated);
  $("stat-remaining").textContent = s.remaining < -0.5 ? `−${formatNumber(-s.remaining)}` : formatNumber(s.remaining);

  if (s.status === "done" && lastStatus !== null && lastStatus !== "done") confetti();
  if (over && lastStatus !== null && lastStatus !== "over") {
    const meter = summary.querySelector(".meter");
    meter.style.animation = "none";
    void meter.offsetWidth;
    meter.style.animation = "";
  }
  lastStatus = s.status;
}

// ---------- 對外 ----------

export function render() {
  lastStatus = null;
  renderPlans();
  renderIncomes();
  renderExpenses();
  update();
}

let mounted = false;
export function mount() {
  if (mounted) return;
  mounted = true;

  $("add-income").addEventListener("click", () =>
    pickCategory({
      type: "income",
      exclude: new Set(plan().incomes.map((i) => i.categoryId)),
      onPick: (c) => {
        const item = newIncome(c.id);
        plan().incomes.push(item);
        persist();
        renderIncomes(item.id);
        update();
      },
    }),
  );
  $("add-expense").addEventListener("click", () =>
    pickCategory({
      type: "expense",
      exclude: new Set(plan().expenses.map((e) => e.categoryId)),
      onPick: (c) => {
        const item = newExpense(c.id);
        plan().expenses.push(item);
        persist();
        renderExpenses(item.id);
        update();
      },
    }),
  );

  const reorder = (list, ids) => ids.map((id) => list.find((x) => x.id === id));
  makeSortable($("income-list"), ".handle", (ids) => {
    plan().incomes = reorder(plan().incomes, ids);
    persist();
  });
  makeSortable($("expense-list"), ".handle", (ids) => {
    plan().expenses = reorder(plan().expenses, ids);
    persist();
  });
}
