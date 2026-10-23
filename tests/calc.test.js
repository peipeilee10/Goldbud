import { test } from "node:test";
import assert from "node:assert/strict";
import {
  incomeTotal,
  expenseView,
  summarize,
  formatMoney,
  formatPercent,
  parseInput,
  sanitizeTyping,
} from "../src/calc.js";

const plan = (incomes, expenses) => ({ incomes, expenses });
const inc = (amount) => ({ amount });
const pct = (value) => ({ mode: "percent", value });
const amt = (value) => ({ mode: "amount", value });

test("收入總計：空白算 0", () => {
  assert.equal(incomeTotal(plan([inc(45000), inc(5000), inc(null)], [])), 50000);
  assert.equal(incomeTotal(plan([], [])), 0);
});

test("% 主值：金額 = 收入 × %", () => {
  assert.deepEqual(expenseView(pct(30), 50000), { percent: 30, amount: 15000 });
  assert.deepEqual(expenseView(pct(null), 50000), { percent: 0, amount: 0 });
});

test("金額主值：% = 金額 ÷ 收入", () => {
  assert.deepEqual(expenseView(amt(13000), 50000), { amount: 13000, percent: 26 });
});

test("金額主值、收入為 0：% 是 null", () => {
  assert.deepEqual(expenseView(amt(13000), 0), { amount: 13000, percent: null });
});

test("收入改變：% 主值金額跟著變，金額主值金額不變", () => {
  const rent = amt(13000);
  const food = pct(30);
  assert.equal(expenseView(food, 60000).amount, 18000);
  assert.equal(expenseView(rent, 60000).amount, 13000);
  assert.equal(formatPercent(expenseView(rent, 60000).percent), "21.7");
});

test("摘要：未分配完", () => {
  const s = summarize(plan([inc(50000)], [pct(30), amt(13000), pct(20), pct(10)]));
  assert.equal(s.allocated, 43000);
  assert.equal(s.allocatedPercent, 86);
  assert.equal(s.remaining, 7000);
  assert.equal(s.status, "under");
});

test("摘要：剛好 100% 是 done", () => {
  const s = summarize(plan([inc(50000)], [pct(50), amt(25000)]));
  assert.equal(s.status, "done");
});

test("摘要：顯示為 100.0% 時也算 done", () => {
  // 33333 / 100000 = 33.333%，三列合計 99.999% → 顯示 100
  const s = summarize(plan([inc(100000)], [amt(33333), amt(33333), amt(33333)]));
  assert.equal(s.status, "done");
});

test("摘要：超過 100% 是 over，剩餘為負", () => {
  const s = summarize(plan([inc(50000)], [pct(60), pct(48)]));
  assert.equal(s.status, "over");
  assert.equal(s.remaining, -4000);
});

test("摘要：沒有收入是 empty", () => {
  assert.equal(summarize(plan([inc(null)], [pct(30)])).status, "empty");
});

test("金額格式", () => {
  assert.equal(formatMoney(47800), "NT$ 47,800");
  assert.equal(formatMoney(1234.5), "NT$ 1,235");
  assert.equal(formatMoney(-4000), "−NT$ 4,000");
  assert.equal(formatMoney(-0.2), "NT$ 0");
});

test("% 格式：一位小數、整數不帶 .0", () => {
  assert.equal(formatPercent(30), "30");
  assert.equal(formatPercent(27.25), "27.3");
  assert.equal(formatPercent(null), "—");
});

test("輸入解析", () => {
  assert.equal(parseInput("45,000"), 45000);
  assert.equal(parseInput(""), null);
  assert.equal(parseInput("abc"), null);
  assert.equal(parseInput("-5"), null);
  assert.equal(parseInput("12.5"), 12.5);
  assert.equal(parseInput("150", 100), 100);
});

test("輸入中清理：只留數字和一個小數點", () => {
  assert.equal(sanitizeTyping("1a2.3.4"), "12.34");
  assert.equal(sanitizeTyping("-50"), "50");
});
