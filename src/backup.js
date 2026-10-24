// 備份匯出／匯入（SPEC B10）

import { parseData } from "./store.js";
import { todayStr } from "./dates.js";

/** 匯出：回傳檔名和內容（JSON 文字） */
export function exportBackup(data, appVersion, now = new Date()) {
  const text = JSON.stringify({ app: "goldbud", appVersion, exportedAt: now.toISOString(), data }, null, 2);
  return { filename: `goldbud-backup-${todayStr(now)}.json`, text };
}

/** 匯入：解析備份檔，回傳 { data, info }；格式不對時丟出錯誤 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("這不是小金芽的備份檔");
  }
  const raw = parsed?.app === "goldbud" ? parsed.data : parsed;
  let data;
  try {
    data = parseData(raw);
  } catch (err) {
    throw new Error(err.message === "資料格式不正確" ? "這不是小金芽的備份檔" : err.message);
  }
  return { data, info: describe(data, parsed?.exportedAt ?? null) };
}

/** 給使用者確認用的摘要 */
export function describe(data, exportedAt = null) {
  const dates = data.entries.map((e) => e.date).sort();
  return {
    exportedAt,
    plans: data.plans.length,
    categories: data.categories.length,
    entries: data.entries.length,
    recurring: data.recurring.length,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}

/** 距離上次備份幾天；從沒備份過回傳 null */
export function daysSinceBackup(data, now = new Date()) {
  if (!data.lastBackupAt) return null;
  return Math.floor((now - new Date(data.lastBackupAt)) / 86400000);
}
