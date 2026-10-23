import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  SCHEMA_VERSION,
  defaultData,
  load,
  save,
  clonePlan,
  uniqueName,
} from "../src/store.js";

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    keys: () => [...m.keys()],
  };
}

test("預設資料符合 SPEC 第 8 節", () => {
  const d = defaultData();
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.equal(d.plans.length, 1);
  const p = d.plans[0];
  assert.equal(p.name, "我的方案");
  assert.equal(d.activePlanId, p.id);
  assert.deepEqual(p.incomes.map((i) => [i.name, i.amount]), [["薪水", null]]);
  assert.deepEqual(
    p.expenses.map((e) => [e.emoji, e.name, e.mode, e.value]),
    [
      ["🍙", "吃飯", "percent", 30],
      ["🏠", "房租", "percent", 30],
      ["🐷", "儲蓄", "percent", 20],
      ["🎮", "娛樂", "percent", 10],
    ],
  );
});

test("存檔後讀回相同資料", () => {
  const s = memoryStorage();
  const d = defaultData();
  d.plans[0].incomes[0].amount = 50000;
  assert.equal(save(s, d), true);
  assert.deepEqual(load(s), d);
});

test("改名前的資料（舊 key）會被讀進來", () => {
  const d = defaultData();
  d.plans[0].name = "舊方案";
  const s = memoryStorage({ "budget-capybara": JSON.stringify(d) });
  assert.equal(load(s).plans[0].name, "舊方案");
});

test("沒有資料時回傳預設範例", () => {
  assert.equal(load(memoryStorage()).plans[0].name, "我的方案");
});

test("資料壞掉：回傳預設範例，並備份原始資料", () => {
  const s = memoryStorage({ [STORAGE_KEY]: "{not json" });
  const d = load(s);
  assert.equal(d.plans[0].name, "我的方案");
  assert.ok(s.keys().some((k) => k.startsWith(`${STORAGE_KEY}-backup-`)));
});

test("activePlanId 找不到時改用第一個方案", () => {
  const d = defaultData();
  d.activePlanId = "missing";
  const s = memoryStorage({ [STORAGE_KEY]: JSON.stringify(d) });
  assert.equal(load(s).activePlanId, d.plans[0].id);
});

test("storage 無法使用時不會出錯", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(load(broken).plans.length, 1);
  assert.equal(save(broken, defaultData()), false);
});

test("複製方案：內容相同、id 全部不同", () => {
  const p = defaultData().plans[0];
  const c = clonePlan(p, "加薪後");
  assert.equal(c.name, "加薪後");
  assert.notEqual(c.id, p.id);
  assert.deepEqual(c.expenses.map((e) => e.name), p.expenses.map((e) => e.name));
  c.expenses.forEach((e, i) => assert.notEqual(e.id, p.expenses[i].id));
});

test("方案名稱不重複", () => {
  const plans = [{ name: "新方案" }, { name: "新方案 2" }];
  assert.equal(uniqueName("新方案", plans), "新方案 3");
  assert.equal(uniqueName("加薪後", plans), "加薪後");
});
