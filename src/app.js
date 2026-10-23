// 畫面與互動。計算在 calc.js，資料讀寫在 store.js。

import {
  incomeTotal,
  expenseView,
  summarize,
  formatNumber,
  formatMoney,
  formatPercent,
  parseInput,
  sanitizeTyping,
} from "./calc.js";
import {
  load,
  save,
  defaultData,
  defaultPlan,
  clonePlan,
  uniqueName,
  newIncome,
  newExpense,
} from "./store.js";
import { APP_VERSION } from "./version.js";

const EMOJIS = ["🍙", "🏠", "🐷", "🎮", "🚌", "💊", "📚", "🎁", "👕", "📱", "✈️", "🐱", "☕", "💡", "🛡️", "📈", "❤️", "💸"];

const MASCOT = {
  empty: "design/mascot/capybara-sleep.svg",
  under: "design/mascot/capybara-calm.svg",
  done: "design/mascot/capybara-done.svg",
  over: "design/mascot/capybara-sweat.svg",
};

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

let data = load(storage);
save(storage, data);
let lastStatus = null;

const $ = (id) => document.getElementById(id);

/** 小工具：建立元素 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}

function plan() {
  return data.plans.find((p) => p.id === data.activePlanId);
}

function persist() {
  plan().updatedAt = new Date().toISOString();
  save(storage, data);
}

// ---------- 方案標籤 ----------

function renderPlans() {
  const nav = $("plans");
  nav.replaceChildren(
    ...data.plans.map((p) => {
      const on = p.id === data.activePlanId;
      return h(
        "button",
        {
          class: on ? "plan on" : "plan",
          "aria-current": on ? "true" : null,
          onclick: () => (on ? openPlanMenu() : switchPlan(p.id)),
        },
        p.name,
        on ? h("small", { "aria-hidden": "true" }, " ▾") : null,
      );
    }),
    h("button", { class: "plan plan-add", "aria-label": "新增方案", onclick: addPlan }, "＋"),
  );
  nav.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function switchPlan(id) {
  data.activePlanId = id;
  save(storage, data);
  lastStatus = null;
  renderAll();
}

function addPlan() {
  const p = defaultPlan(uniqueName("新方案", data.plans));
  data.plans.push(p);
  switchPlan(p.id);
}

// ---------- 收入 ----------

function renderIncomes(focusId) {
  const list = $("income-list");
  list.replaceChildren(...plan().incomes.map((item) => incomeRow(item, item.id === focusId)));
  if (!plan().incomes.length) list.append(h("p", { class: "empty-hint" }, "還沒有收入項目"));
  if (focusId) list.querySelector(`[data-id="${focusId}"] input`)?.focus();
}

function incomeRow(item, isNew) {
  const name = h("input", {
    value: item.name,
    placeholder: "項目名稱",
    "aria-label": "收入項目名稱",
    enterkeyhint: "next",
    oninput: (e) => {
      item.name = e.target.value;
      persist();
    },
  });
  const amount = moneyInput({
    label: "收入金額",
    get: () => item.amount,
    set: (v) => {
      item.amount = v;
      persist();
      update();
    },
  });
  return h(
    "div",
    { class: isNew ? "item row pop" : "item row", "data-id": item.id },
    h("label", { class: "field grow" }, name),
    h("label", { class: "field amount income-amount" }, h("span", { class: "unit" }, "NT$"), amount),
    h("button", { class: "del", "aria-label": "刪除這個收入", onclick: () => removeIncome(item.id) }, "✕"),
  );
}

function removeIncome(id) {
  plan().incomes = plan().incomes.filter((i) => i.id !== id);
  persist();
  renderIncomes();
  update();
}

/** 點進數字欄位時全選，直接輸入就能取代舊數字（iOS 需要等 focus 完成） */
function selectAll(input) {
  setTimeout(() => {
    if (document.activeElement === input) input.setSelectionRange(0, input.value.length);
  });
}

/** 金額輸入框：輸入時只接受數字，離開時加上千分位 */
function moneyInput({ label, get, set }) {
  const input = h("input", {
    inputmode: "decimal",
    placeholder: "0",
    "aria-label": label,
    autocomplete: "off",
  });
  const show = () => (input.value = get() == null ? "" : formatNumber(get()));
  show();
  input.addEventListener("focus", () => {
    if (get() != null) input.value = String(get());
    selectAll(input);
  });
  input.addEventListener("blur", show);
  input.addEventListener("input", () => {
    const clean = sanitizeTyping(input.value);
    if (clean !== input.value) input.value = clean;
    set(parseInput(clean));
  });
  return input;
}

// ---------- 支出 ----------

function renderExpenses(focusId) {
  const list = $("expense-list");
  list.replaceChildren(...plan().expenses.map((item) => expenseRow(item, item.id === focusId)));
  if (!plan().expenses.length) list.append(h("p", { class: "empty-hint" }, "還沒有支出項目"));
  if (focusId) list.querySelector(`[data-id="${focusId}"] input`)?.focus();
}

function expenseRow(item, isNew) {
  const emoji = h("button", { class: "emoji", "aria-label": "更換圖示", onclick: () => openEmojiPicker(item, emoji) }, item.emoji);
  const name = h("input", {
    value: item.name,
    placeholder: "項目名稱",
    "aria-label": "支出項目名稱",
    oninput: (e) => {
      item.name = e.target.value;
      persist();
    },
  });

  const pct = h("input", { inputmode: "decimal", placeholder: "0", "aria-label": "百分比", autocomplete: "off", "data-role": "pct" });
  const amt = h("input", { inputmode: "decimal", placeholder: "0", "aria-label": "金額", autocomplete: "off", "data-role": "amt" });

  const edit = (input, mode, max) => () => {
    let clean = sanitizeTyping(input.value);
    const v = parseInput(clean, max);
    if (v != null && v === max && Number(clean) > max) clean = String(max);
    if (clean !== input.value) input.value = clean;
    item.mode = mode;
    item.value = v;
    persist();
    update();
  };
  pct.addEventListener("input", edit(pct, "percent", 100));
  amt.addEventListener("input", edit(amt, "amount", Infinity));

  // 進入輸入框時顯示沒有千分位的數字，方便修改
  amt.addEventListener("focus", () => {
    const v = expenseView(item, incomeTotal(plan())).amount;
    amt.value = item.mode === "amount" && item.value == null ? "" : String(Math.round(v));
    selectAll(amt);
  });
  pct.addEventListener("focus", () => {
    if (pct.value === "—") pct.value = "";
    selectAll(pct);
  });
  [pct, amt].forEach((i) => i.addEventListener("blur", () => fillExpense(row, item, true)));

  const row = h(
    "div",
    { class: isNew ? "item exp pop" : "item exp", "data-id": item.id },
    h(
      "div",
      { class: "row" },
      emoji,
      h("label", { class: "field grow" }, name),
      h("button", { class: "del", "aria-label": "刪除這個支出", onclick: () => removeExpense(item.id) }, "✕"),
    ),
    h(
      "div",
      { class: "row" },
      h("label", { class: "field amount w-pct", "data-box": "pct" }, h("span", { class: "pin", "aria-hidden": "true" }, "📌"), pct, h("span", { class: "unit" }, "%")),
      h("span", { class: "swap", "aria-hidden": "true" }, "⇄"),
      h("label", { class: "field amount grow", "data-box": "amt" }, h("span", { class: "pin", "aria-hidden": "true" }, "📌"), h("span", { class: "unit" }, "NT$"), amt),
    ),
  );
  fillExpense(row, item, true);
  return row;
}

/** 更新一列支出的 % / 金額與主值標示；正在輸入的欄位不覆蓋 */
function fillExpense(row, item, force = false) {
  const total = incomeTotal(plan());
  const view = expenseView(item, total);
  const pct = row.querySelector('[data-role="pct"]');
  const amt = row.querySelector('[data-role="amt"]');
  const isPct = item.mode === "percent";

  if (force || document.activeElement !== pct) {
    pct.value = isPct ? (item.value == null ? "" : formatPercent(item.value)) : formatPercent(view.percent);
  }
  if (force || document.activeElement !== amt) {
    amt.value = !isPct && item.value == null ? "" : formatNumber(view.amount);
  }
  row.querySelector('[data-box="pct"]').classList.toggle("primary", isPct);
  row.querySelector('[data-box="pct"]').classList.toggle("computed", !isPct);
  row.querySelector('[data-box="amt"]').classList.toggle("primary", !isPct);
  row.querySelector('[data-box="amt"]').classList.toggle("computed", isPct);
}

function removeExpense(id) {
  plan().expenses = plan().expenses.filter((e) => e.id !== id);
  persist();
  renderExpenses();
  update();
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

  // 摘要列
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

  // 彩帶只在「變成」100% 的那一刻放；開啟頁面或切換方案時不放
  if (s.status === "done" && lastStatus !== null && lastStatus !== "done") confetti();
  // 剛變成超支時，進度條抖一下
  if (over && lastStatus !== null && lastStatus !== "over") {
    const meter = summary.querySelector(".meter");
    meter.style.animation = "none";
    void meter.offsetWidth;
    meter.style.animation = "";
  }
  lastStatus = s.status;
}

function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#F5A040", "#7CCBA8", "#F4AA80", "#F2A7A3", "#FCD9A8", "#9FD3E6"];
  const box = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let i = 0; i < 40; i++) {
    const piece = h("i");
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${1.2 + Math.random() * 1.2}s`;
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 120}px`);
    piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    box.append(piece);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2800);
}

// ---------- 底部面板 ----------

function openSheet(title, ...body) {
  const prevFocus = document.activeElement;
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    prevFocus?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => e.key === "Escape" && close();
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title }, h("div", { class: "grab" }), h("h3", {}, title), ...body);
  const backdrop = h("div", { class: "backdrop", onclick: (e) => e.target === backdrop && close() }, sheet);
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  (sheet.querySelector("input, button:not(:disabled)") ?? sheet).focus?.();
  return close;
}

function confirmSheet({ title, message, confirmLabel, onConfirm }) {
  const close = openSheet(
    title,
    h("p", {}, message),
    h(
      "div",
      { class: "sheet-actions" },
      h("button", { class: "btn", onclick: () => close() }, "取消"),
      h("button", { class: "btn danger", onclick: () => (close(), onConfirm()) }, confirmLabel),
    ),
  );
}

function openPlanMenu() {
  const p = plan();
  const onlyOne = data.plans.length <= 1;
  const close = openSheet(
    p.name,
    h(
      "div",
      { class: "menu" },
      h("button", { class: "btn", onclick: () => (close(), openRename()) }, "✏️ 重新命名"),
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
            confirmSheet({
              title: `刪除「${p.name}」？`,
              message: "刪除後無法復原。",
              confirmLabel: "刪除",
              onConfirm: () => deletePlan(p.id),
            });
          },
        },
        "🗑 刪除方案",
      ),
    ),
    onlyOne ? h("div", { class: "sheet-note" }, "至少要保留一個方案") : null,
  );
}

function openRename() {
  const p = plan();
  const input = h("input", { value: p.name, "aria-label": "方案名稱", maxlength: "20", enterkeyhint: "done" });
  const done = () => {
    const name = input.value.trim();
    if (name) {
      p.name = name;
      persist();
      renderPlans();
    }
    close();
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && done());
  const close = openSheet(
    "重新命名",
    h("label", { class: "field" }, input),
    h("div", { class: "sheet-actions" }, h("button", { class: "btn", onclick: () => close() }, "取消"), h("button", { class: "btn primary", onclick: done }, "完成")),
  );
  input.select();
}

function deletePlan(id) {
  const i = data.plans.findIndex((p) => p.id === id);
  data.plans.splice(i, 1);
  switchPlan(data.plans[Math.max(0, i - 1)].id);
}

function openEmojiPicker(item, button) {
  const close = openSheet(
    "選一個圖示",
    h(
      "div",
      { class: "emojis" },
      EMOJIS.map((e) =>
        h(
          "button",
          {
            class: e === item.emoji ? "on" : null,
            "aria-label": e,
            onclick: () => {
              item.emoji = e;
              button.textContent = e;
              persist();
              close();
            },
          },
          e,
        ),
      ),
    ),
  );
}

function openAppMenu() {
  const close = openSheet(
    "更多選項",
    h(
      "div",
      { class: "menu" },
      h(
        "button",
        {
          class: "btn danger",
          onclick: () => {
            close();
            confirmSheet({
              title: "清除全部資料？",
              message: "所有方案都會刪除，回到預設範例。這個動作無法復原。",
              confirmLabel: "清除",
              onConfirm: () => {
                data = defaultData();
                save(storage, data);
                lastStatus = null;
                renderAll();
              },
            });
          },
        },
        "🧹 清除全部資料",
      ),
    ),
    h("div", { class: "sheet-note" }, `版本 ${APP_VERSION} · 資料只存在這台裝置的瀏覽器`),
  );
}

// ---------- 啟動 ----------

function renderAll() {
  renderPlans();
  renderIncomes();
  renderExpenses();
  update();
}

$("add-income").addEventListener("click", () => {
  const item = newIncome();
  plan().incomes.push(item);
  persist();
  renderIncomes(item.id);
  update();
});

$("add-expense").addEventListener("click", () => {
  const item = newExpense();
  plan().expenses.push(item);
  persist();
  renderExpenses(item.id);
  update();
});

$("app-menu").addEventListener("click", openAppMenu);

// 預先載入四種水豚，切換狀態時不閃爍
Object.values(MASCOT).forEach((src) => (new Image().src = src));

renderAll();

// 離線也能開啟（sw.js）
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
