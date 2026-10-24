import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, shiftMonth, daysInMonth, dayInMonth, monthTitle, dayLabel, monthsBetween, todayStr } from "../src/dates.js";

test("日期加減，跨月跨年", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("月份加減", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("每月天數與月底", () => {
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(dayInMonth("2026-02", 31), "2026-02-28");
  assert.equal(dayInMonth("2026-10", 5), "2026-10-05");
});

test("顯示文字", () => {
  assert.equal(monthTitle("2026-10"), "2026 年 10 月");
  assert.equal(dayLabel("2026-10-24"), "10/24（六）");
  assert.equal(todayStr(new Date(2026, 9, 5)), "2026-10-05");
});

test("月份範圍", () => {
  assert.deepEqual(monthsBetween("2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(monthsBetween("2026-11", "2026-10"), []);
});
