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
  defaultPlan,
  newCategory,
  nextColor,
  migrate,
} from "../src/store.js";

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    keys: () => [...m.keys()],
  };
}

const catName = (d, id) => d.categories.find((c) => c.id === id)?.name;

test("預設資料符合 SPEC 第 8 節", () => {
  const d = defaultData();
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.equal(d.plans.length, 1);
  const p = d.plans[0];
  assert.equal(p.name, "我的方案");
  assert.equal(d.activePlanId, p.id);
  assert.deepEqual(p.incomes.map((i) => [d.incomeCategories.find((c) => c.id === i.categoryId).name, i.amount]), [["薪水", null]]);
  assert.deepEqual(
    p.expenses.map((e) => [catName(d, e.categoryId), e.mode, e.value]),
    [
      ["飲食", "percent", 25],
      ["居住", "percent", 30],
      ["交通", "percent", 5],
      ["娛樂", "percent", 10],
      ["儲蓄", "percent", 20],
    ],
  );
  assert.deepEqual(d.categories.find((c) => c.name === "飲食").subcategories.map((s) => s.name), ["吃飯", "飲料"]);
  assert.equal(d.categories.find((c) => c.name === "儲蓄").kind, "saving");
  assert.deepEqual([d.entries, d.recurring, d.months, d.lastBackupAt], [[], [], {}, null]);
});

test("分類顏色：依序分配 1～7，用完是 null；儲蓄類沒有顏色", () => {
  const d = defaultData();
  assert.deepEqual(d.categories.map((c) => c.color), [1, 2, 3, 4, null]);
  const cats = [];
  for (let i = 0; i < 8; i++) cats.push(newCategory(cats, { name: `c${i}` }));
  assert.deepEqual(cats.map((c) => c.color), [1, 2, 3, 4, 5, 6, 7, null]);
  // 中間刪掉一個，下一個補上空出的顏色
  assert.equal(nextColor(cats.filter((c) => c.color !== 3)), 3);
});

test("新方案沿用預設比例和現有分類", () => {
  const d = defaultData();
  const p = defaultPlan(d, "新方案");
  assert.deepEqual(p.expenses.map((e) => catName(d, e.categoryId)), ["飲食", "居住", "交通", "娛樂", "儲蓄"]);
  assert.ok(p.expenses.every((e) => d.categories.some((c) => c.id === e.categoryId)));
});

test("v1 → v3：同名項目合併成同一個分類，固定金額的算固定支出", () => {
  const v1 = {
    schemaVersion: 1,
    activePlanId: "p1",
    plans: [
      {
        id: "p1", name: "我的方案", createdAt: "x", updatedAt: "x",
        incomes: [{ id: "i1", name: "薪水", amount: 45000 }, { id: "i2", name: "兼職", amount: 5000 }],
        expenses: [
          { id: "e1", emoji: "🍙", name: "吃飯", mode: "percent", value: 30 },
          { id: "e2", emoji: "🏠", name: "房租", mode: "amount", value: 13000 },
          { id: "e3", emoji: "🐷", name: "儲蓄", mode: "percent", value: 20 },
        ],
      },
      {
        id: "p2", name: "加薪後", createdAt: "x", updatedAt: "x",
        incomes: [{ id: "i3", name: "薪水", amount: 52000 }],
        expenses: [
          { id: "e4", emoji: "🍙", name: "吃飯", mode: "percent", value: 25 },
          { id: "e5", emoji: "📈", name: "投資", mode: "percent", value: 10 },
          { id: "e6", emoji: "💸", name: "", mode: "percent", value: 5 },
        ],
      },
    ],
  };
  const d = migrate(v1);
  assert.equal(d.schemaVersion, 3);
  assert.deepEqual(d.categories.map((c) => [c.name, c.emoji, c.kind, c.color]), [
    ["吃飯", "🍙", "variable", 1],
    ["房租", "🏠", "fixed", 2],
    ["儲蓄", "🐷", "saving", null],
    ["投資", "📈", "saving", null],
    ["未命名", "💸", "variable", 3],
  ]);
  assert.deepEqual(d.incomeCategories.map((c) => c.name), ["薪水", "兼職"]);
  // 兩個方案的「吃飯」指向同一個分類，數值保留
  assert.equal(d.plans[0].expenses[0].categoryId, d.plans[1].expenses[0].categoryId);
  assert.deepEqual(d.plans[0].expenses[1], { id: "e2", categoryId: d.categories[1].id, mode: "amount", value: 13000 });
  assert.equal(d.plans[1].incomes[0].amount, 52000);
  assert.deepEqual([d.entries, d.recurring, d.months], [[], [], {}]);
});

test("v1 → v3：同一方案裡重複的名稱只留第一個", () => {
  const v1 = {
    schemaVersion: 1, activePlanId: "p",
    plans: [{ id: "p", name: "a", incomes: [], expenses: [
      { id: "1", emoji: "🍙", name: "吃飯", mode: "percent", value: 10 },
      { id: "2", emoji: "🍙", name: "吃飯 ", mode: "percent", value: 20 },
    ] }],
  };
  assert.deepEqual(migrate(v1).plans[0].expenses.map((e) => e.id), ["1"]);
});

test("v2 → v3：有固定收支或用固定金額的分類變成固定支出", () => {
  const v2 = defaultData();
  v2.schemaVersion = 2;
  const [food, home, move, fun] = v2.categories;
  for (const c of [food, home, move, fun]) c.kind = "expense";
  v2.recurring.push({ id: "r", type: "expense", name: "遊戲", amount: 300, categoryId: fun.id, day: 1, mode: "auto", startMonth: "2026-10", active: true, skipped: [] });
  v2.plans[0].expenses.find((e) => e.categoryId === move.id).mode = "amount";
  const d = migrate(v2);
  assert.equal(d.schemaVersion, 3);
  assert.deepEqual(d.categories.map((c) => c.kind), ["variable", "variable", "fixed", "fixed", "saving"]);
  // 顏色不變
  assert.deepEqual(d.categories.map((c) => c.color), [1, 2, 3, 4, null]);
});

test("預設分類的類型：居住是固定支出", () => {
  const d = defaultData();
  assert.deepEqual(d.categories.map((c) => [c.name, c.kind]), [["飲食", "variable"], ["居住", "fixed"], ["交通", "variable"], ["娛樂", "variable"], ["儲蓄", "saving"]]);
});

test("讀取 v1 資料時先備份原始資料再轉換", () => {
  const v1 = { schemaVersion: 1, activePlanId: "p", plans: [{ id: "p", name: "a", incomes: [], expenses: [{ id: "1", emoji: "🍙", name: "吃飯", mode: "percent", value: 10 }] }] };
  const s = memoryStorage({ [STORAGE_KEY]: JSON.stringify(v1) });
  const d = load(s);
  assert.equal(d.schemaVersion, 3);
  assert.equal(d.categories[0].name, "吃飯");
  assert.equal(s.getItem(`${STORAGE_KEY}-backup-v1`), JSON.stringify(v1));
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
  assert.deepEqual(c.expenses.map((e) => e.categoryId), p.expenses.map((e) => e.categoryId));
  c.expenses.forEach((e, i) => assert.notEqual(e.id, p.expenses[i].id));
});

test("方案名稱不重複", () => {
  const plans = [{ name: "新方案" }, { name: "新方案 2" }];
  assert.equal(uniqueName("新方案", plans), "新方案 3");
  assert.equal(uniqueName("加薪後", plans), "加薪後");
});
