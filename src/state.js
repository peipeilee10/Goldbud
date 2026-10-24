// App 的資料：讀取、儲存，以及資料變動時通知畫面更新。

import { load, save } from "./store.js";

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

let data = load(storage);
save(storage, data);

const listeners = new Set();

export const getData = () => data;

/** 修改完 data 之後呼叫：儲存並通知（source 是發出修改的頁面，它自己不用重畫） */
export function commit(source = null) {
  save(storage, data);
  for (const fn of listeners) fn(source);
}

/** 整份換掉（匯入備份、清除資料） */
export function replaceData(next) {
  data = next;
  commit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function activePlan() {
  return data.plans.find((p) => p.id === data.activePlanId);
}

export const findCategory = (id) => data.categories.find((c) => c.id === id);
export const findIncomeCategory = (id) => data.incomeCategories.find((c) => c.id === id);
export const findAnyCategory = (id) => findCategory(id) ?? findIncomeCategory(id);

// ---------- 這台裝置的介面偏好（不屬於資料、不備份） ----------

const PREF_KEY = "goldbud-ui";

export function getPref(key, fallback = null) {
  try {
    return JSON.parse(storage?.getItem(PREF_KEY) ?? "{}")[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    const all = JSON.parse(storage?.getItem(PREF_KEY) ?? "{}");
    all[key] = value;
    storage?.setItem(PREF_KEY, JSON.stringify(all));
  } catch {
    /* 無法儲存就算了 */
  }
}
