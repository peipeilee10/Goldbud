import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData, newEntry, newRecurring, newCategory } from "../src/store.js";
import {
  groupByDay,
  monthTotals,
  recentCombos,
  budgetPlan,
  ensureMonth,
  lockPastMonths,
  setMonthPlan,
  planBudget,
  timeRatio,
  status,
  compareMonth,
  suggestions,
  donutSlices,
  subcategorySlices,
  runRecurring,
  deleteEntry,
  deleteCategory,
  deleteSubcategory,
  categoryUsage,
} from "../src/ledger.js";

/** 預設資料＋收入 50,000；回傳方便取用的分類 */
function setup() {
  const d = defaultData();
  d.plans[0].incomes[0].amount = 50000;
  const cat = (name) => d.categories.find((c) => c.name === name);
  const inc = (name) => d.incomeCategories.find((c) => c.name === name);
  return { d, food: cat("飲食"), home: cat("居住"), move: cat("交通"), fun: cat("娛樂"), saving: cat("儲蓄"), salary: inc("薪水") };
}

let tick = 0;
function add(d, opts) {
  const e = newEntry(opts);
  e.createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  d.entries.push(e);
  return e;
}

test("依日期分組：新的日期在前，當天小計正確", () => {
  const { d, food, salary } = setup();
  add(d, { date: "2026-10-05", amount: 50000, categoryId: salary.id, type: "income" });
  add(d, { date: "2026-10-24", amount: 120, categoryId: food.id });
  add(d, { date: "2026-10-24", amount: 65, categoryId: food.id });
  const g = groupByDay(d.entries);
  assert.deepEqual(g.map((x) => x.date), ["2026-10-24", "2026-10-05"]);
  assert.deepEqual([g[0].expense, g[0].items[0].amount], [185, 65]);
  assert.deepEqual(monthTotals(d.entries), { income: 50000, expense: 185, balance: 49815 });
});

test("最近常用：依最後使用時間，不重複", () => {
  const { d, food, move } = setup();
  const [eat, drink] = food.subcategories;
  add(d, { date: "2026-10-01", amount: 1, categoryId: food.id, subcategoryId: eat.id });
  add(d, { date: "2026-10-01", amount: 1, categoryId: move.id });
  add(d, { date: "2026-10-01", amount: 1, categoryId: food.id, subcategoryId: drink.id });
  add(d, { date: "2026-10-01", amount: 1, categoryId: food.id, subcategoryId: eat.id });
  assert.deepEqual(recentCombos(d.entries, "expense").map((c) => c.subcategoryId ?? c.categoryId), [eat.id, drink.id, move.id]);
});

test("預算金額用方案收入計算；儲蓄類分開", () => {
  const { d, food, saving } = setup();
  const b = planBudget(d.plans[0], d.categories);
  assert.equal(b.income, 50000);
  assert.equal(b.byCategory.get(food.id), 12500);
  assert.equal(b.byCategory.get(saving.id), 10000);
  assert.equal(b.expenseTotal, 35000); // 25+30+5+10 = 70%
  assert.equal(b.savingTotal, 10000);
});

test("月份進度與狀態判斷", () => {
  assert.equal(timeRatio("2026-10", "2026-10-15"), 15 / 31);
  assert.equal(timeRatio("2026-09", "2026-10-15"), null);
  assert.equal(status(500, 1000, 0.5), "ok");
  assert.equal(status(650, 1000, 0.5), "fast"); // 65% − 50% = 15
  assert.equal(status(1100, 1000, 0.5), "over");
  assert.equal(status(900, 1000, null), "ok"); // 過去月份不判斷花太快
  assert.equal(status(10, 0, 0.5), "over");
  assert.equal(status(1000, 1000, 0.1), "ok"); // 月初就剛好付清（房租）
});

test("判斷花錢速度時扣掉固定收支", () => {
  // 預算 15,000，月初自動記入房租 13,000，再花 500：日常部分 500/2,000 = 25%，第 5 天（16%）→ 正常
  assert.equal(status(13500, 15000, 5 / 31, 13000), "ok");
  assert.equal(status(13500, 15000, 5 / 31), "fast"); // 不扣的話會被判成花太快
  const { d, home } = setup();
  add(d, { date: "2026-10-05", amount: 13000, categoryId: home.id, source: "recurring", recurringId: "r" });
  const cmp = compareMonth(d, "2026-10", "2026-10-05");
  assert.equal(cmp.overall.status, "ok");
  assert.equal(cmp.rows.find((r) => r.category.id === home.id).status, "ok");
});

test("固定支出不判斷花太快；整月速度只看變動支出", () => {
  const { d, food, home } = setup();
  // 居住（固定）月初就付了 14,000（預算 15,000）→ 不算花太快
  add(d, { date: "2026-10-02", amount: 14000, categoryId: home.id });
  let cmp = compareMonth(d, "2026-10", "2026-10-03");
  assert.equal(cmp.rows.find((r) => r.category.id === home.id).status, "ok");
  assert.equal(cmp.overall.status, "ok");
  assert.deepEqual(cmp.groups.fixed, { budget: 15000, actual: 14000 });
  // 變動支出花太快 → 整月也是花太快
  add(d, { date: "2026-10-02", amount: 9000, categoryId: food.id });
  cmp = compareMonth(d, "2026-10", "2026-10-03");
  assert.equal(cmp.rows.find((r) => r.category.id === food.id).status, "fast");
  assert.equal(cmp.overall.status, "fast");
  assert.deepEqual(cmp.groups.variable, { budget: 20000, actual: 9000 });
});

test("預算比對：使用率、狀態、小分類、預算外", () => {
  const { d, food, home, move } = setup();
  const [eat, drink] = food.subcategories;
  const gift = newCategory(d.categories, { name: "禮物", emoji: "🎁" });
  d.categories.push(gift);
  add(d, { date: "2026-10-03", amount: 7500, categoryId: food.id, subcategoryId: eat.id });
  add(d, { date: "2026-10-04", amount: 1500, categoryId: food.id, subcategoryId: drink.id });
  add(d, { date: "2026-10-05", amount: 16000, categoryId: home.id });
  add(d, { date: "2026-10-06", amount: 850, categoryId: gift.id });
  const cmp = compareMonth(d, "2026-10", "2026-10-15");
  const row = (c) => cmp.rows.find((r) => r.category.id === c.id);
  assert.deepEqual([row(food).actual, row(food).budget, row(food).status], [9000, 12500, "fast"]); // 72% vs 48%
  assert.deepEqual(row(food).subs.map((s) => [s.name, s.amount]), [["吃飯", 7500], ["飲料", 1500]]);
  assert.equal(row(home).status, "over");
  assert.equal(row(move).status, "ok");
  assert.equal(cmp.rows.some((r) => r.category.kind === "saving"), false);
  assert.deepEqual(cmp.outside.map((r) => [r.category.name, r.actual]), [["禮物", 850]]);
  assert.equal(cmp.overall.actual, 25850);
});

test("儲蓄：實際收入 − 實際支出；沒有收入紀錄時用預算收入估算", () => {
  const { d, food, salary } = setup();
  add(d, { date: "2026-10-03", amount: 20000, categoryId: food.id });
  let cmp = compareMonth(d, "2026-10", "2026-10-15");
  assert.deepEqual(cmp.saving, { target: 10000, actual: 30000, estimated: true });
  add(d, { date: "2026-10-05", amount: 45000, categoryId: salary.id, type: "income" });
  cmp = compareMonth(d, "2026-10", "2026-10-15");
  assert.deepEqual(cmp.saving, { target: 10000, actual: 25000, estimated: false });
  assert.deepEqual([cmp.income.budget, cmp.income.actual], [50000, 45000]);
});

test("調整建議：本月只提醒超支和照速度會超出；過去月份才提醒用得少和移轉", () => {
  const { d, food, home, fun } = setup();
  add(d, { date: "2026-09-03", amount: 16000, categoryId: home.id }); // 預算 15,000 → 超支 1,000
  add(d, { date: "2026-09-04", amount: 1000, categoryId: fun.id }); // 預算 5,000 → 20%
  add(d, { date: "2026-09-04", amount: 12000, categoryId: food.id });
  const past = suggestions(compareMonth(d, "2026-09", "2026-10-15"));
  assert.ok(past.some((t) => t.kind === "over" && t.category.id === home.id && t.amount === 1000));
  assert.ok(past.some((t) => t.kind === "underused" && t.category.id === fun.id));
  assert.ok(past.some((t) => t.kind === "move" && t.from.id === fun.id && t.to.id === home.id && t.amount === 1000));

  add(d, { date: "2026-10-03", amount: 9000, categoryId: food.id }); // 72% vs 48% → 花太快
  const now = suggestions(compareMonth(d, "2026-10", "2026-10-15"));
  const proj = now.find((t) => t.kind === "projected");
  assert.equal(proj.category.id, food.id);
  assert.equal(Math.round(proj.amount), Math.round(9000 / (15 / 31) - 12500));
  assert.equal(now.some((t) => t.kind === "underused"), false);
});

test("月份鎖定：過去月份存成快照，之後改方案不影響", () => {
  const { d, food } = setup();
  add(d, { date: "2026-09-10", amount: 100, categoryId: food.id });
  ensureMonth(d, "2026-10");
  assert.deepEqual(lockPastMonths(d, "2026-10-15"), ["2026-09"]);
  assert.equal(d.months["2026-10"].locked, false);
  d.plans[0].incomes[0].amount = 99999;
  assert.equal(budgetPlan(d, "2026-09").incomes[0].amount, 50000);
  assert.equal(budgetPlan(d, "2026-10").incomes[0].amount, 99999);
  // 已鎖定的月份重新套用方案
  setMonthPlan(d, "2026-09", d.plans[0].id);
  assert.equal(budgetPlan(d, "2026-09").incomes[0].amount, 99999);
});

test("甜甜圈：顏色跟著分類，沒有顏色的併入其他；小分類分開算", () => {
  const { d, food, home } = setup();
  const extra = [];
  for (let i = 0; i < 4; i++) {
    const c = newCategory(d.categories, { name: `x${i}` });
    d.categories.push(c);
    extra.push(c);
  }
  // x0～x2 拿到顏色 5～7，x3 沒有顏色
  add(d, { date: "2026-10-01", amount: 300, categoryId: home.id });
  add(d, { date: "2026-10-01", amount: 100, categoryId: food.id, subcategoryId: food.subcategories[0].id });
  add(d, { date: "2026-10-01", amount: 50, categoryId: food.id });
  add(d, { date: "2026-10-01", amount: 40, categoryId: extra[3].id });
  const { total, slices } = donutSlices(d, "2026-10");
  assert.equal(total, 490);
  assert.deepEqual(slices.map((s) => [s.name, s.color, s.amount]), [["飲食", 1, 150], ["居住", 2, 300], ["其他", null, 40]]);
  const sub = subcategorySlices(d, "2026-10", food.id);
  assert.deepEqual(sub.slices.map((s) => [s.name, s.amount]), [["吃飯", 100], ["未分小分類", 50]]);
});

test("固定收支：自動記入、補上漏掉的月份、不重複產生", () => {
  const { d, home } = setup();
  const rent = newRecurring({ name: "房租", amount: 13000, categoryId: home.id, day: 5, startMonth: "2026-08" });
  d.recurring.push(rent);
  let r = runRecurring(d, "2026-10-04");
  assert.deepEqual(r.added.map((e) => e.date), ["2026-08-05", "2026-09-05"]); // 10/5 還沒到
  r = runRecurring(d, "2026-10-05");
  assert.deepEqual(r.added.map((e) => e.date), ["2026-10-05"]);
  assert.equal(runRecurring(d, "2026-10-20").added.length, 0);
  assert.ok(d.entries.every((e) => e.source === "recurring" && e.amount === 13000));
});

test("固定收支：刪掉產生的紀錄後，那個月不再產生", () => {
  const { d, home } = setup();
  const rent = newRecurring({ name: "房租", amount: 13000, categoryId: home.id, day: 5, startMonth: "2026-10" });
  d.recurring.push(rent);
  const [e] = runRecurring(d, "2026-10-06").added;
  deleteEntry(d, e.id);
  assert.deepEqual(rent.skipped, ["2026-10"]);
  assert.equal(runRecurring(d, "2026-10-07").added.length, 0);
});

test("固定收支：提醒確認的列在待確認，帶入上次金額；暫停的不處理", () => {
  const { d, home } = setup();
  const power = newRecurring({ name: "電費", categoryId: home.id, day: 15, mode: "confirm", startMonth: "2026-09" });
  const paused = newRecurring({ name: "訂閱", amount: 390, categoryId: home.id, day: 1, startMonth: "2026-09" });
  paused.active = false;
  d.recurring.push(power, paused);
  add(d, { date: "2026-09-15", amount: 820, categoryId: home.id, source: "recurring", recurringId: power.id });
  const r = runRecurring(d, "2026-10-20");
  assert.equal(r.added.length, 0);
  assert.deepEqual(r.pending.map((p) => [p.key, p.date, p.lastAmount]), [["2026-10", "2026-10-15", 820]]);
});

test("刪除大分類：紀錄、方案、固定收支搬到目標分類", () => {
  const { d, food, fun } = setup();
  add(d, { date: "2026-10-01", amount: 100, categoryId: fun.id });
  d.recurring.push(newRecurring({ name: "遊戲", amount: 300, categoryId: fun.id, startMonth: "2026-10" }));
  assert.deepEqual(categoryUsage(d, fun.id), { entries: 1, plans: 1, recurring: 1 });
  deleteCategory(d, fun.id, food.id);
  assert.equal(d.categories.some((c) => c.id === fun.id), false);
  assert.equal(d.entries[0].categoryId, food.id);
  assert.equal(d.recurring[0].categoryId, food.id);
  // 方案已經有「飲食」→ 娛樂那列直接移除
  assert.equal(d.plans[0].expenses.filter((e) => e.categoryId === food.id).length, 1);
  assert.equal(d.plans[0].expenses.some((e) => e.categoryId === fun.id), false);
});

test("刪除小分類：紀錄改成只有大分類", () => {
  const { d, food } = setup();
  const eat = food.subcategories[0];
  add(d, { date: "2026-10-01", amount: 100, categoryId: food.id, subcategoryId: eat.id });
  deleteSubcategory(d, food.id, eat.id);
  assert.equal(d.entries[0].subcategoryId, null);
  assert.equal(food.subcategories.some((s) => s.id === eat.id), false);
});
