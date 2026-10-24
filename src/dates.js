// 日期工具：全部用「當地時間」的 "YYYY-MM-DD" 字串，避免時區造成日期跑掉。

const pad = (n) => String(n).padStart(2, "0");

/** Date → "2026-10-24" */
export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now = new Date()) {
  return toDateStr(now);
}

/** "2026-10-24" → Date（當地時間 00:00） */
export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** "2026-10-24" → "2026-10" */
export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

/** "2026-10" → "2026-11"（n 可為負） */
export function shiftMonth(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** 某月的第 day 號；該月沒有這天就用月底（31 號在 2 月 → 28/29 號） */
export function dayInMonth(key, day) {
  return `${key}-${pad(Math.min(day, daysInMonth(key)))}`;
}

/** "2026-10" → "2026 年 10 月" */
export function monthTitle(key) {
  const [y, m] = key.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** "2026-10-24" → "10/24（五）" */
export function dayLabel(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
}

/** 從 startKey 到 endKey（含）的所有月份 */
export function monthsBetween(startKey, endKey) {
  const out = [];
  for (let k = startKey; k <= endKey; k = shiftMonth(k, 1)) out.push(k);
  return out;
}
