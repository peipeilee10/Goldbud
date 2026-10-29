// 共用的畫面元件：建立元素、底部面板、確認視窗、提示條、計算機。

import * as calculator from "./calculator.js";
import { formatNumber } from "./calc.js";

export const $ = (id) => document.getElementById(id);

/** 建立元素：h("button", { class: "btn", onclick }, "文字", 子元素…) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const amountFmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
/** 顯示用金額：整數加千分位，小數最多 2 位 */
export const formatAmount = (n) => amountFmt.format(n);

// ---------- 底部面板 ----------

/**
 * 打開底部面板，回傳 close()。
 * onBeforeClose 回傳 false 時取消關閉（例如「要放棄這筆嗎？」）。
 */
export function openSheet(title, body, { className = "", onBeforeClose } = {}) {
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (force = false) => {
    if (closed) return;
    if (!force && onBeforeClose && onBeforeClose() === false) return;
    closed = true;
    sheet.dispatchEvent(new Event("sheetclose"));
    stopFit();
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    document.body.classList.toggle("sheet-open", !!document.querySelector(".backdrop"));
    prevFocus?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => e.key === "Escape" && document.querySelector(".backdrop:last-of-type") === backdrop && close();
  const sheet = h(
    "div",
    { class: `sheet ${className}`, role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "grab" }),
    title ? h("h3", {}, title) : null,
    body,
  );
  const backdrop = h("div", { class: "backdrop", onclick: (e) => e.target === backdrop && close() }, sheet);
  const stopFit = fitToVisibleArea(backdrop);
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  document.body.classList.add("sheet-open");
  (sheet.querySelector("[autofocus]") ?? sheet.querySelector("input, button:not(:disabled)") ?? sheet).focus?.({ preventScroll: true });
  return close;
}

/**
 * iPhone 彈出鍵盤時不會把網頁縮短，只會縮小「看得到的範圍」（visualViewport），
 * 貼在畫面底部的面板就被鍵盤蓋住。讓面板的底色層跟著看得到的範圍走，面板就會在鍵盤上方。
 */
function fitToVisibleArea(el) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const fit = () => {
    el.style.top = `${vv.offsetTop}px`;
    el.style.height = `${vv.height}px`;
    el.style.bottom = "auto";
  };
  fit();
  vv.addEventListener("resize", fit);
  vv.addEventListener("scroll", fit);
  return () => {
    vv.removeEventListener("resize", fit);
    vv.removeEventListener("scroll", fit);
  };
}

export function confirmSheet({ title, message, confirmLabel, cancelLabel = "取消", danger = true, onConfirm, onCancel }) {
  const close = openSheet(
    title,
    [
      message ? h("p", {}, message) : null,
      h(
        "div",
        { class: "sheet-actions" },
        h("button", { class: "btn", onclick: () => (close(), onCancel?.()) }, cancelLabel),
        h("button", { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => (close(), onConfirm()) }, confirmLabel),
      ),
    ],
  );
  return close;
}

// ---------- 提示條 ----------

let toastTimer = null;
/** 畫面下方的深色提示條；actions：[{ label, onClick }] */
export function toast(message, actions = [], ms = 4000) {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = h(
    "div",
    { class: "toast", role: "status" },
    h("span", {}, message),
    actions.map((a) =>
      h("button", { onclick: () => (el.remove(), a.onClick()) }, a.label),
    ),
  );
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// ---------- 計算機 ----------

export const CALC_KEYS = [
  ["C", "fn"], ["⌫", "fn"], ["÷", "op"], ["×", "op"],
  ["7"], ["8"], ["9"], ["−", "op"],
  ["4"], ["5"], ["6"], ["+", "op"],
  ["1"], ["2"], ["3"], ["=", "eq"],
  ["00"], ["0"], ["."],
];

const KEY_LABEL = { "⌫": "刪除一格", C: "全部清除" };

/** 計算機按鍵區；onPress(key) */
export function keypad(keys, onPress, className = "calc-keys") {
  return h(
    "div",
    { class: className },
    keys.map(([k, kind]) =>
      h("button", { class: `calc-key ${kind ?? "num"}`, type: "button", "aria-label": KEY_LABEL[k] ?? k, onclick: () => onPress(k) }, k),
    ),
  );
}

/** 把電腦鍵盤接到計算機（只在 el 裡有焦點時作用） */
export function bindCalcKeyboard(el, onPress) {
  el.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    const key = calculator.keyFromKeyboard(e.key);
    if (!key || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    onPress(key);
  });
}

/** 金額計算機（SPEC 5.5）。onSubmit(value) 的 value 是數字或 null（清空） */
export function openCalculator({ title, value, field, onSubmit }) {
  let state = calculator.start(value);
  const exprEl = h("div", { class: "calc-expr" });
  const resultEl = h("div", { class: "calc-result num", "aria-live": "polite" });
  const submit = h("button", { class: "btn primary calc-submit", onclick: () => finish() }, "輸入");

  const render = () => {
    exprEl.textContent = calculator.formatExpr(state.expr) || " ";
    const r = calculator.evaluate(state.expr);
    resultEl.classList.toggle("error", !!r.error);
    resultEl.textContent = r.error ?? `= ${r.value == null ? "0" : formatAmount(r.value)}`;
    submit.disabled = !!r.error;
  };
  const press = (key) => {
    state = calculator.press(state, key);
    render();
  };
  const finish = () => {
    const r = calculator.evaluate(state.expr);
    if (r.error) return;
    close();
    onSubmit(r.value);
  };

  const keys = keypad(CALC_KEYS, press);
  const close = openSheet(title, [h("div", { class: "calc-display" }, exprEl, resultEl), keys, submit], { className: "calc" });
  const sheet = keys.closest(".sheet");
  field?.classList.add("editing");
  sheet.addEventListener("sheetclose", () => field?.classList.remove("editing"));
  bindCalcKeyboard(sheet, press);
  sheet.addEventListener("keydown", (e) => e.key === "Enter" && e.target === submit && e.preventDefault());
  render();
}

/** 金額欄位（按鈕）：點下去開計算機 */
export function moneyButton(extraClass, onOpen) {
  return h(
    "button",
    { class: `field amount money ${extraClass}`, type: "button", onclick: onOpen },
    h("span", { class: "unit" }, "NT$"),
    h("span", { class: "money-value" }),
  );
}

export function showMoney(button, value, label = "金額") {
  const text = button.querySelector(".money-value");
  text.textContent = value == null ? "0" : formatNumber(value);
  text.classList.toggle("placeholder", value == null);
  button.setAttribute("aria-label", `${label} ${value == null ? "未填" : `NT$ ${formatNumber(value)}`}，開啟計算機`);
}

/** 點進數字欄位時全選，直接輸入就能取代舊數字（iOS 需要等 focus 完成） */
export function selectAll(input) {
  setTimeout(() => {
    if (document.activeElement === input) input.setSelectionRange(0, input.value.length);
  });
}

// ---------- 彩帶 ----------

export function confetti() {
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

export const EMOJIS = ["🍙", "🏠", "🐷", "🎮", "🚌", "💊", "📚", "🎁", "👕", "📱", "✈️", "🐱", "☕", "💡", "🛡️", "📈", "❤️", "💸", "💰", "💼", "🧴", "🎬", "🍼", "🏋️"];

/** emoji 選擇器 */
export function pickEmoji(current, onPick) {
  const close = openSheet(
    "選一個圖示",
    h(
      "div",
      { class: "emojis" },
      EMOJIS.map((e) => h("button", { class: e === current ? "on" : null, "aria-label": e, onclick: () => (close(), onPick(e)) }, e)),
    ),
  );
}

/** 單行文字輸入面板（重新命名、新增小分類等） */
export function promptSheet({ title, value = "", placeholder = "", maxlength = 20, confirmLabel = "完成", onSubmit }) {
  const input = h("input", { value, placeholder, "aria-label": title, maxlength: String(maxlength), enterkeyhint: "done" });
  const done = () => {
    const v = input.value.trim();
    if (!v) return input.focus();
    close();
    onSubmit(v);
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && done());
  const close = openSheet(title, [
    h("label", { class: "field" }, input),
    h("div", { class: "sheet-actions" }, h("button", { class: "btn", onclick: () => close() }, "取消"), h("button", { class: "btn primary", onclick: done }, confirmLabel)),
  ]);
  input.select();
}
