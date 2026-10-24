// 金額計算機的邏輯（SPEC 5.5）：不碰 DOM，方便測試。
// 狀態是 { expr, fresh }：expr 是算式字串（例如 "1200+350×2"），
// fresh 為 true 時代表顯示的是起始值或上一次 = 的結果，直接按數字會取代它。

import { formatNumber } from "./calc.js";

export const OPS = ["+", "−", "×", "÷"];
const MAX_LENGTH = 40;

const isOp = (ch) => OPS.includes(ch);
const lastNumber = (expr) => expr.match(/[\d.]*$/)[0];

/** 開啟計算機時的狀態：帶入欄位目前的數字 */
export function start(value) {
  return { expr: value == null ? "" : String(roundResult(value)), fresh: value != null };
}

/** 按下一個鍵，回傳新狀態。key：0–9、"00"、"."、運算符號、"C"、"⌫"、"=" */
export function press(state, key) {
  let { expr, fresh } = state;

  if (key === "C") return { expr: "", fresh: false };
  if (key === "⌫") return { expr: fresh ? "" : expr.slice(0, -1), fresh: false };

  if (key === "=") {
    const r = evaluate(expr);
    if (r.error || r.value == null) return state;
    return { expr: String(r.value), fresh: true };
  }

  if (isOp(key)) {
    if (expr === "") return state;
    if (expr.endsWith(".")) expr = expr.slice(0, -1);
    if (isOp(expr.at(-1))) expr = expr.slice(0, -1);
    return limit({ expr: expr + key, fresh: false }, state);
  }

  // 數字、00、小數點
  if (fresh) expr = "";
  const num = lastNumber(expr);
  if (key === ".") {
    if (num.includes(".")) return { expr, fresh: false };
    return limit({ expr: expr + (num === "" ? "0." : "."), fresh: false }, state);
  }
  if (key === "00") {
    if (num === "" || num === "0") return limit({ expr: num === "" ? expr + "0" : expr, fresh: false }, state);
    return limit({ expr: expr + "00", fresh: false }, state);
  }
  if (/^\d$/.test(key)) {
    // 避免 007 這種前導 0
    if (num === "0") return limit({ expr: expr.slice(0, -1) + key, fresh: false }, state);
    return limit({ expr: expr + key, fresh: false }, state);
  }
  return state;
}

function limit(next, prev) {
  return next.expr.length > MAX_LENGTH ? prev : next;
}

/**
 * 計算算式（先乘除後加減）。
 * 回傳 { value }，空算式的 value 是 null；錯誤回傳 { error }。
 */
export function evaluate(expr) {
  let e = expr.replace(/[.]$/, "");
  while (e && isOp(e.at(-1))) e = e.slice(0, -1);
  if (e === "") return { value: null };

  const tokens = e.match(/\d+(?:\.\d*)?|\.\d+|[+−×÷]/g) ?? [];
  // 先乘除
  const terms = [Number(tokens[0])];
  const signs = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (op === "×") terms[terms.length - 1] *= n;
    else if (op === "÷") {
      if (n === 0) return { error: "無法除以 0" };
      terms[terms.length - 1] /= n;
    } else {
      signs.push(op);
      terms.push(n);
    }
  }
  // 再加減
  let value = terms[0];
  signs.forEach((op, i) => (value = op === "+" ? value + terms[i + 1] : value - terms[i + 1]));

  if (!Number.isFinite(value)) return { error: "數字太大了" };
  value = roundResult(value);
  if (value < 0) return { error: "金額不能是負數" };
  return { value };
}

/** 結果保留到小數點後 2 位，避免 0.1 + 0.2 = 0.30000000000000004 */
export function roundResult(n) {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

/** 顯示用：數字加千分位、符號前後留空白。"1200+350×2" → "1,200 + 350 × 2" */
export function formatExpr(expr) {
  return expr.replace(/\d+(\.\d*)?|[+−×÷]/g, (t) => {
    if (isOp(t)) return ` ${t} `;
    const [int, dec] = t.split(".");
    return formatNumber(Number(int)) + (dec !== undefined ? `.${dec}` : "");
  }).trim();
}

/** 電腦鍵盤 → 計算機按鍵 */
export function keyFromKeyboard(key) {
  if (/^\d$/.test(key) || key === ".") return key;
  return { "+": "+", "-": "−", "*": "×", "x": "×", "/": "÷", Enter: "=", "=": "=", Backspace: "⌫", Delete: "C" }[key] ?? null;
}
