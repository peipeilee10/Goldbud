// 記帳的計算（SPEC B5～B9）：不碰 DOM、不碰儲存，方便測試。

import { incomeTotal, expenseView } from "./calc.js";
import { monthKey, daysInMonth, dayInMonth, monthsBetween, todayStr } from "./dates.js";
import { newEntry, CATEGORY_COLORS, isSpending } from "./store.js";

const FAST_MARGIN = 15; // 使用率比月份進度多 15 個百分點以上 → 花太快
const UNDERUSED = 70; // 使用率 < 70% → 預算可能給太多

// ---------- 紀錄 ----------

export function entriesInMonth(entries, key) {
  return entries.filter((e) => monthKey(e.date) === key);
}

export function monthTotals(entries) {
  let income = 0;
  let expense = 0;
  for (const e of entries) e.type === "income" ? (income += e.amount) : (expense += e.amount);
  return { income, expense, balance: income - expense };
}

/** 依日期分組，新的在前；同一天內後記的在前 */
export function groupByDay(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      ...monthTotals(items),
    }));
}

/** 最近常用的「分類＋小分類」組合（同類型），最多 n 個 */
export function recentCombos(entries, type, n = 5) {
  const seen = new Set();
  const out = [];
  const sorted = entries.filter((e) => e.type === type).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const e of sorted) {
    const key = `${e.categoryId}|${e.subcategoryId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ categoryId: e.categoryId, subcategoryId: e.subcategoryId ?? null });
    if (out.length >= n) break;
  }
  return out;
}

// ---------- 每月預算 ----------

/** 這個月使用的方案：已鎖定用快照，否則用指定的方案，沒有指定就用目前開啟的方案 */
export function budgetPlan(data, key) {
  const m = data.months[key];
  if (m?.locked && m.snapshot) return m.snapshot;
  return data.plans.find((p) => p.id === m?.planId) ?? data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0];
}

/** 確保月份有紀錄；新的月份預設用目前開啟的方案 */
export function ensureMonth(data, key) {
  data.months[key] ??= { planId: data.activePlanId, locked: false, snapshot: null };
  return data.months[key];
}

/**
 * 月份結束後鎖定：把當時的方案存成快照（SPEC B6.1）。
 * 有紀錄但還沒有月份資料的過去月份，也一起補上並鎖定。回傳這次鎖定的月份。
 */
export function lockPastMonths(data, today = todayStr()) {
  const current = monthKey(today);
  for (const e of data.entries) if (monthKey(e.date) < current) ensureMonth(data, monthKey(e.date));
  const locked = [];
  for (const [key, m] of Object.entries(data.months)) {
    if (key >= current || m.locked) continue;
    m.snapshot = structuredClone(budgetPlan(data, key));
    m.planId = m.snapshot.id;
    m.locked = true;
    locked.push(key);
  }
  return locked;
}

/** 更換某月的預算方案；已鎖定的月份會重新存一份快照 */
export function setMonthPlan(data, key, planId) {
  const m = ensureMonth(data, key);
  m.planId = planId;
  if (m.locked) m.snapshot = structuredClone(data.plans.find((p) => p.id === planId));
}

/** 方案的預算金額：用方案自己的預算收入計算（SPEC B6.2） */
export function planBudget(plan, categories) {
  const income = incomeTotal(plan);
  const byCategory = new Map();
  const byKind = { fixed: 0, variable: 0, saving: 0 };
  for (const item of plan.expenses) {
    const amount = expenseView(item, income).amount;
    byCategory.set(item.categoryId, (byCategory.get(item.categoryId) ?? 0) + amount);
    const kind = categories.find((c) => c.id === item.categoryId)?.kind ?? "variable";
    byKind[kind] = (byKind[kind] ?? 0) + amount;
  }
  return { income, byCategory, byKind, expenseTotal: byKind.fixed + byKind.variable, savingTotal: byKind.saving };
}

// ---------- 月統計 ----------

/** 這個月已經過了多少（0～1）；不是本月回傳 null */
export function timeRatio(key, today = todayStr()) {
  if (monthKey(today) !== key) return null;
  return Number(today.slice(8, 10)) / daysInMonth(key);
}

/**
 * 狀態：over 超支／fast 花太快／ok 正常。
 * fixed 是這個月已記入的固定收支金額：月初一次付清的房租不該讓速度看起來太快，
 * 所以判斷速度時先把它從實際和預算裡扣掉。
 */
export function status(actual, budget, ratio, fixed = 0) {
  if (budget <= 0) return actual > 0 ? "over" : "ok";
  if (actual > budget + 0.5) return "over";
  // 剛好用完（例如月初一次付清的房租）不算花太快
  if (actual >= budget - 0.5) return "ok";
  const flexBudget = budget - fixed;
  if (ratio == null || flexBudget <= 0) return "ok";
  const pct = ((actual - fixed) / flexBudget) * 100;
  return pct - ratio * 100 >= FAST_MARGIN ? "fast" : "ok";
}

/**
 * 某月的預算比對（SPEC B7）。
 * rows：方案裡的支出類分類；outside：方案沒有、但有支出的分類。
 */
export function compareMonth(data, key, today = todayStr()) {
  const plan = budgetPlan(data, key);
  const budget = planBudget(plan, data.categories);
  const entries = entriesInMonth(data.entries, key);
  const totals = monthTotals(entries);
  const ratio = timeRatio(key, today);

  const spentByCat = new Map();
  const spentBySub = new Map();
  const fixedByCat = new Map();
  for (const e of entries) {
    if (e.type !== "expense") continue;
    spentByCat.set(e.categoryId, (spentByCat.get(e.categoryId) ?? 0) + e.amount);
    if (e.source === "recurring") {
      fixedByCat.set(e.categoryId, (fixedByCat.get(e.categoryId) ?? 0) + e.amount);
    }
    const sk = `${e.categoryId}|${e.subcategoryId ?? ""}`;
    spentBySub.set(sk, (spentBySub.get(sk) ?? 0) + e.amount);
  }

  const subsOf = (cat) => {
    const list = cat.subcategories
      .map((s) => ({ id: s.id, name: s.name, amount: spentBySub.get(`${cat.id}|${s.id}`) ?? 0 }))
      .filter((s) => s.amount > 0);
    const plain = spentBySub.get(`${cat.id}|`) ?? 0;
    if (plain > 0 && list.length) list.push({ id: null, name: "未分小分類", amount: plain });
    return list.sort((a, b) => b.amount - a.amount);
  };

  // 固定支出不判斷「花太快」：本來就是一次付清（SPEC B7.1）
  const rows = [];
  const inPlan = new Set();
  for (const item of plan.expenses) {
    const cat = data.categories.find((c) => c.id === item.categoryId);
    if (!cat || !isSpending(cat) || inPlan.has(cat.id)) continue;
    inPlan.add(cat.id);
    const b = budget.byCategory.get(cat.id) ?? 0;
    const actual = spentByCat.get(cat.id) ?? 0;
    const st = cat.kind === "fixed" ? status(actual, b, null) : status(actual, b, ratio, fixedByCat.get(cat.id) ?? 0);
    rows.push({ category: cat, kind: cat.kind, budget: b, actual, pct: b > 0 ? (actual / b) * 100 : null, status: st, subs: subsOf(cat) });
  }
  const group = (kind) => {
    const list = rows.filter((r) => r.kind === kind);
    return { budget: list.reduce((s, r) => s + r.budget, 0), actual: list.reduce((s, r) => s + r.actual, 0) };
  };
  const groups = { fixed: group("fixed"), variable: group("variable") };

  // 儲蓄類分類的支出（例如記了一筆「儲蓄」）也視為預算外的支出另外列出
  const outside = [];
  for (const [catId, actual] of spentByCat) {
    if (inPlan.has(catId)) continue;
    const cat = data.categories.find((c) => c.id === catId) ?? { id: catId, name: "已刪除的分類", emoji: "❔", kind: "expense", subcategories: [] };
    outside.push({ category: cat, budget: 0, actual, pct: null, status: "outside", subs: subsOf(cat) });
  }
  outside.sort((a, b) => b.actual - a.actual);

  const hasIncome = entries.some((e) => e.type === "income");
  const actualIncome = hasIncome ? totals.income : budget.income;
  // 整月：超支看全部支出；花太快只看變動支出（扣掉記在變動分類裡的固定收支）
  let overall = status(totals.expense, budget.expenseTotal, null);
  if (overall === "ok" && ratio != null) {
    const variableFixed = rows.filter((r) => r.kind === "variable").reduce((s, r) => s + (fixedByCat.get(r.category.id) ?? 0), 0);
    if (status(groups.variable.actual, groups.variable.budget, ratio, variableFixed) === "fast") overall = "fast";
  }

  return {
    key,
    plan,
    ratio,
    rows,
    groups,
    outside,
    overall: { budget: budget.expenseTotal, actual: totals.expense, pct: budget.expenseTotal > 0 ? (totals.expense / budget.expenseTotal) * 100 : null, status: overall },
    income: { budget: budget.income, actual: totals.income, hasIncome },
    saving: { target: budget.savingTotal, actual: actualIncome - totals.expense, estimated: !hasIncome },
    totals,
  };
}

/** 調整建議（SPEC B7.4）：只產生文字，不修改方案 */
export function suggestions(cmp) {
  const tips = [];
  const current = cmp.ratio != null;
  for (const r of cmp.rows) {
    if (r.status === "over") tips.push({ kind: "over", category: r.category, amount: r.actual - r.budget });
    else if (r.status === "fast" && cmp.ratio > 0) {
      const projected = r.actual / cmp.ratio - r.budget;
      if (projected > 0) tips.push({ kind: "projected", category: r.category, amount: projected });
    }
  }
  for (const r of cmp.outside) tips.push({ kind: "outside", category: r.category, amount: r.actual });

  // 月底（或過去月份）才判斷「用得少」，月初大家都用得少
  if (!current || cmp.ratio >= 0.8) {
    // 固定支出用得少（例如這個月沒繳）不算預算給太多
    const under = cmp.rows.filter((r) => r.kind === "variable" && r.budget > 0 && r.pct < UNDERUSED);
    for (const r of under) tips.push({ kind: "underused", category: r.category, pct: r.pct, spare: r.budget - r.actual });
    const needy = cmp.rows.filter((r) => r.status === "over").sort((a, b) => b.actual - b.budget - (a.actual - a.budget))[0];
    const donor = under.sort((a, b) => b.budget - b.actual - (a.budget - a.actual))[0];
    if (needy && donor) {
      const amount = Math.min(needy.actual - needy.budget, donor.budget - donor.actual);
      tips.push({ kind: "move", from: donor.category, to: needy.category, amount: Math.ceil(amount / 100) * 100 });
    }
  }
  return tips;
}

/** 甜甜圈資料：依分類加總；顏色跟著分類（沒有顏色的併入「其他」） */
export function donutSlices(data, key, type = "expense") {
  const entries = entriesInMonth(data.entries, key).filter((e) => e.type === type);
  const sums = new Map();
  for (const e of entries) sums.set(e.categoryId, (sums.get(e.categoryId) ?? 0) + e.amount);

  const slices = [];
  let other = 0;
  const list = type === "expense" ? data.categories : data.incomeCategories;
  for (const [id, amount] of sums) {
    const idx = list.findIndex((c) => c.id === id);
    const cat = list[idx];
    const color = type === "expense" ? cat?.color : idx >= 0 && idx < CATEGORY_COLORS ? idx + 1 : null;
    if (!cat || color == null) other += amount;
    else slices.push({ id, name: cat.name, emoji: cat.emoji, color, amount });
  }
  // 順序跟著分類清單，顏色才會穩定相鄰（已驗證的排列）
  slices.sort((a, b) => list.findIndex((c) => c.id === a.id) - list.findIndex((c) => c.id === b.id));
  if (other > 0) slices.push({ id: null, name: "其他", emoji: "⋯", color: null, amount: other });
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return { total, slices: slices.map((s) => ({ ...s, share: total ? s.amount / total : 0 })) };
}

/** 某個大分類底下各小分類的金額 */
export function subcategorySlices(data, key, categoryId) {
  const cat = data.categories.find((c) => c.id === categoryId);
  const entries = entriesInMonth(data.entries, key).filter((e) => e.type === "expense" && e.categoryId === categoryId);
  const sums = new Map();
  for (const e of entries) sums.set(e.subcategoryId ?? "", (sums.get(e.subcategoryId ?? "") ?? 0) + e.amount);
  const slices = [...sums].map(([sid, amount]) => ({
    id: sid || null,
    name: sid ? cat?.subcategories.find((s) => s.id === sid)?.name ?? "已刪除的小分類" : "未分小分類",
    amount,
  }));
  slices.sort((a, b) => b.amount - a.amount);
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return { total, slices: slices.map((s) => ({ ...s, share: total ? s.amount / total : 0 })) };
}

// ---------- 固定收支 ----------

/**
 * 打開 App 時檢查固定收支（SPEC B9.2）：
 * - 自動記入：產生紀錄（直接加進 data.entries），回傳在 added
 * - 提醒確認：回傳在 pending（不儲存，每次都重新算）
 */
export function runRecurring(data, today = todayStr()) {
  const added = [];
  const pending = [];
  const current = monthKey(today);
  for (const r of data.recurring) {
    if (!r.active || !r.startMonth || r.startMonth > current) continue;
    for (const key of monthsBetween(r.startMonth, current)) {
      const date = dayInMonth(key, r.day);
      if (date > today || r.skipped.includes(key)) continue;
      if (data.entries.some((e) => e.recurringId === r.id && monthKey(e.date) === key)) continue;
      if (r.mode === "auto" && r.amount > 0) {
        const e = newEntry({ type: r.type, date, amount: r.amount, categoryId: r.categoryId, subcategoryId: r.subcategoryId, note: "", source: "recurring", recurringId: r.id });
        data.entries.push(e);
        added.push(e);
      } else {
        pending.push({ recurring: r, key, date, lastAmount: lastAmount(data, r.id) });
      }
    }
  }
  return { added, pending };
}

function lastAmount(data, recurringId) {
  const prev = data.entries.filter((e) => e.recurringId === recurringId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return prev?.amount ?? null;
}

/** 刪除固定收支產生的紀錄時，記住那個月份，之後不再產生 */
export function deleteEntry(data, id) {
  const e = data.entries.find((x) => x.id === id);
  if (!e) return null;
  data.entries = data.entries.filter((x) => x.id !== id);
  if (e.recurringId) skipMonth(data, e.recurringId, monthKey(e.date));
  return e;
}

export function skipMonth(data, recurringId, key) {
  const r = data.recurring.find((x) => x.id === recurringId);
  if (r && !r.skipped.includes(key)) r.skipped.push(key);
}

// ---------- 分類 ----------

/** 這個分類有沒有被紀錄、方案或固定收支用到 */
export function categoryUsage(data, categoryId) {
  return {
    entries: data.entries.filter((e) => e.categoryId === categoryId).length,
    plans: data.plans.filter((p) => p.expenses.some((e) => e.categoryId === categoryId) || p.incomes.some((i) => i.categoryId === categoryId)).length,
    recurring: data.recurring.filter((r) => r.categoryId === categoryId).length,
  };
}

/** 刪除大分類（或收入分類），用到它的地方搬到 targetId（SPEC B3.3） */
export function deleteCategory(data, categoryId, targetId) {
  const isIncome = data.incomeCategories.some((c) => c.id === categoryId);
  for (const e of data.entries) {
    if (e.categoryId === categoryId) {
      e.categoryId = targetId;
      e.subcategoryId = null;
    }
  }
  for (const r of data.recurring) {
    if (r.categoryId === categoryId) {
      r.categoryId = targetId;
      r.subcategoryId = null;
    }
  }
  for (const p of data.plans) {
    const key = isIncome ? "incomes" : "expenses";
    const hasTarget = p[key].some((x) => x.categoryId === targetId);
    // 方案裡已經有目標分類 → 直接移除舊的那列；沒有 → 改成目標分類
    p[key] = hasTarget ? p[key].filter((x) => x.categoryId !== categoryId) : p[key].map((x) => (x.categoryId === categoryId ? { ...x, categoryId: targetId } : x));
  }
  if (isIncome) data.incomeCategories = data.incomeCategories.filter((c) => c.id !== categoryId);
  else data.categories = data.categories.filter((c) => c.id !== categoryId);
}

/** 刪除小分類：底下的紀錄改成只有大分類 */
export function deleteSubcategory(data, categoryId, subId) {
  const cat = data.categories.find((c) => c.id === categoryId);
  if (cat) cat.subcategories = cat.subcategories.filter((s) => s.id !== subId);
  for (const e of data.entries) if (e.subcategoryId === subId) e.subcategoryId = null;
  for (const r of data.recurring) if (r.subcategoryId === subId) r.subcategoryId = null;
}
