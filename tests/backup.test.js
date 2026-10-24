import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultData, newEntry } from "../src/store.js";
import { exportBackup, parseBackup, daysSinceBackup } from "../src/backup.js";

test("匯出再匯入，資料相同", () => {
  const d = defaultData();
  d.entries.push(newEntry({ date: "2026-10-01", amount: 120, categoryId: d.categories[0].id }));
  const { filename, text } = exportBackup(d, "2.0.0", new Date(2026, 9, 24));
  assert.equal(filename, "goldbud-backup-2026-10-24.json");
  const { data, info } = parseBackup(text);
  assert.deepEqual(data, d);
  assert.deepEqual([info.entries, info.plans, info.from, info.to], [1, 1, "2026-10-01", "2026-10-01"]);
});

test("匯入 v1 的資料也會轉換", () => {
  const v1 = { schemaVersion: 1, activePlanId: "p", plans: [{ id: "p", name: "a", incomes: [], expenses: [{ id: "1", emoji: "🍙", name: "吃飯", mode: "percent", value: 10 }] }] };
  assert.equal(parseBackup(JSON.stringify(v1)).data.categories[0].name, "吃飯");
});

test("不是備份檔時給清楚的錯誤", () => {
  assert.throws(() => parseBackup("hello"), /不是小金芽的備份檔/);
  assert.throws(() => parseBackup(JSON.stringify({ foo: 1 })), /不是小金芽的備份檔/);
  const future = { ...defaultData(), schemaVersion: 99 };
  assert.throws(() => parseBackup(JSON.stringify(future)), /比較新的版本/);
});

test("距離上次備份的天數", () => {
  const d = defaultData();
  assert.equal(daysSinceBackup(d), null);
  d.lastBackupAt = new Date(2026, 9, 1).toISOString();
  assert.equal(daysSinceBackup(d, new Date(2026, 9, 24)), 23);
});
