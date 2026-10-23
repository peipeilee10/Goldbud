// 純計算函式：不碰 DOM、不碰儲存，方便測試。規則見 docs/SPEC.md 第 5、6、9 節。

/** 收入總計 */
export function incomeTotal(plan) {
  return plan.incomes.reduce((sum, i) => sum + (i.amount ?? 0), 0);
}

/**
 * 一列支出的 % 和金額。
 * 主值直接回傳，另一欄由收入總計算出；收入為 0 時，金額主值的 % 是 null（畫面顯示「—」）。
 */
export function expenseView(expense, total) {
  if (expense.mode === "amount") {
    const amount = expense.value ?? 0;
    return { amount, percent: total > 0 ? (amount / total) * 100 : null };
  }
  const percent = expense.value ?? 0;
  return { percent, amount: (total * percent) / 100 };
}

/** 摘要：已分配、剩餘與狀態（empty / under / done / over） */
export function summarize(plan) {
  const total = incomeTotal(plan);
  let allocated = 0;
  for (const e of plan.expenses) allocated += expenseView(e, total).amount;

  const allocatedPercent = total > 0 ? (allocated / total) * 100 : 0;
  const remaining = total - allocated;

  let status;
  if (total <= 0) status = "empty";
  else {
    // 用畫面上顯示的精度判斷，避免顯示 100% 卻不算完成
    const shown = round1(allocatedPercent);
    status = shown === 100 ? "done" : shown > 100 ? "over" : "under";
  }

  return {
    total,
    allocated,
    allocatedPercent,
    remaining,
    remainingPercent: 100 - allocatedPercent,
    status,
  };
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

const moneyFmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

/** 50000 → "50,000"（四捨五入到整數） */
export function formatNumber(n) {
  const v = Math.round(n);
  return moneyFmt.format(Object.is(v, -0) ? 0 : v);
}

/** 50000 → "NT$ 50,000"；負數 → "−NT$ 4,000" */
export function formatMoney(n) {
  const v = Math.round(n);
  return v < 0 ? `−NT$ ${formatNumber(-v)}` : `NT$ ${formatNumber(v)}`;
}

/** 27.25 → "27.3"，30 → "30"，null → "—" */
export function formatPercent(n) {
  if (n == null) return "—";
  const v = round1(n);
  return String(Object.is(v, -0) ? 0 : v);
}

/**
 * 使用者輸入 → 數字。空白回傳 null；去掉千分位；不接受負數或非數字。
 * max 有給的話就限制上限（% 欄位用 100）。
 */
export function parseInput(text, max = Infinity) {
  const cleaned = String(text).replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.min(n, max);
}

/** 輸入中即時清理：只留數字和第一個小數點 */
export function sanitizeTyping(text) {
  let seenDot = false;
  let out = "";
  for (const ch of String(text)) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return out;
}
