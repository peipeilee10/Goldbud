// 資料建立、讀寫與版本轉換。資料結構見 docs/SPEC.md B11（schemaVersion 2）。

export const STORAGE_KEY = "goldbud";
// App 改名前用過的 key：新 key 沒有資料時，從這裡搬過來
const LEGACY_KEYS = ["budget-capybara"];
export const SCHEMA_VERSION = 3;
export const CATEGORY_COLORS = 7; // --cat-1 ～ --cat-7

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const now = () => new Date().toISOString();

// ---------- 分類 ----------

/** 大分類的類型：固定支出、變動支出、儲蓄（SPEC B3.1） */
export const KINDS = [
  { kind: "fixed", label: "固定支出", short: "固定", icon: "🏠" },
  { kind: "variable", label: "變動支出", short: "變動", icon: "🛒" },
  { kind: "saving", label: "儲蓄／投資", short: "儲蓄", icon: "🐷" },
];
export const kindInfo = (kind) => KINDS.find((k) => k.kind === kind) ?? KINDS[1];

/** 固定或變動支出（儲蓄類不算支出） */
export const isSpending = (cat) => cat?.kind === "fixed" || cat?.kind === "variable";

/** 下一個還沒被支出類大分類用過的顏色；7 個都用完回傳 null（圓餅圖併入「其他」） */
export function nextColor(categories) {
  // 不是儲蓄類的都算（轉換舊資料時還會有 v2 的 "expense"）
  const used = new Set(categories.filter((c) => c.kind !== "saving").map((c) => c.color));
  for (let i = 1; i <= CATEGORY_COLORS; i++) if (!used.has(i)) return i;
  return null;
}

export function newCategory(categories, { name, emoji = "💸", kind = "variable", subcategories = [] }) {
  return {
    id: uid(),
    name,
    emoji,
    kind,
    color: kind === "saving" ? null : nextColor(categories),
    subcategories: subcategories.map((n) => ({ id: uid(), name: n })),
  };
}

export function newIncomeCategory(name, emoji = "💰") {
  return { id: uid(), name, emoji };
}

/** 名稱看起來是存錢用的，就當成儲蓄類；其他預設是變動支出 */
export function guessKind(name) {
  return /儲蓄|存|投資/.test(name) ? "saving" : "variable";
}

// ---------- 方案 ----------

export function newIncome(categoryId, amount = null) {
  return { id: uid(), categoryId, amount };
}

export function newExpense(categoryId, percent = null) {
  return { id: uid(), categoryId, mode: "percent", value: percent };
}

/** 預設範例（SPEC 第 8 節） */
export function defaultData() {
  const categories = [];
  const add = (opts) => {
    const c = newCategory(categories, opts);
    categories.push(c);
    return c;
  };
  const food = add({ name: "飲食", emoji: "🍙", subcategories: ["吃飯", "飲料"] });
  const home = add({ name: "居住", emoji: "🏠", kind: "fixed", subcategories: ["房租", "水電"] });
  const move = add({ name: "交通", emoji: "🚌", subcategories: ["捷運", "加油"] });
  const fun = add({ name: "娛樂", emoji: "🎮" });
  const saving = add({ name: "儲蓄", emoji: "🐷", kind: "saving" });
  const incomeCategories = [newIncomeCategory("薪水", "💰"), newIncomeCategory("兼職", "💼"), newIncomeCategory("股息", "📈")];

  const plan = {
    id: uid(),
    name: "我的方案",
    createdAt: now(),
    updatedAt: now(),
    incomes: [newIncome(incomeCategories[0].id)],
    expenses: [newExpense(food.id, 25), newExpense(home.id, 30), newExpense(move.id, 5), newExpense(fun.id, 10), newExpense(saving.id, 20)],
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    activePlanId: plan.id,
    plans: [plan],
    categories,
    incomeCategories,
    entries: [],
    recurring: [],
    months: {},
    lastBackupAt: null,
  };
}

/** 新方案：沿用預設方案的比例，但使用目前已有的分類 */
export function defaultPlan(data, name) {
  const fresh = defaultData();
  const byName = (list, n) => list.find((c) => c.name === n);
  const plan = {
    id: uid(),
    name,
    createdAt: now(),
    updatedAt: now(),
    incomes: [],
    expenses: [],
  };
  const salary = byName(data.incomeCategories, "薪水") ?? data.incomeCategories[0];
  if (salary) plan.incomes.push(newIncome(salary.id));
  for (const e of fresh.plans[0].expenses) {
    const tpl = fresh.categories.find((c) => c.id === e.categoryId);
    const cat = byName(data.categories, tpl.name);
    if (cat) plan.expenses.push(newExpense(cat.id, e.value));
  }
  return plan;
}

/** 複製方案：所有 id 重新產生，分類照用 */
export function clonePlan(plan, name) {
  return {
    ...structuredClone(plan),
    id: uid(),
    name,
    createdAt: now(),
    updatedAt: now(),
    incomes: plan.incomes.map((i) => ({ ...i, id: uid() })),
    expenses: plan.expenses.map((e) => ({ ...e, id: uid() })),
  };
}

/** 產生不重複的名稱：「新方案」、「新方案 2」… */
export function uniqueName(base, items) {
  const names = new Set(items.map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// ---------- 記帳紀錄 ----------

export function newEntry({ type = "expense", date, amount, categoryId, subcategoryId = null, note = "", source = "manual", recurringId = null }) {
  return {
    id: uid(),
    type,
    date,
    amount,
    categoryId,
    subcategoryId,
    note,
    source,
    recurringId,
    invoiceNo: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

export function newRecurring({ type = "expense", name, amount = null, categoryId, subcategoryId = null, day = 1, mode = "auto", startMonth }) {
  return { id: uid(), type, name, amount, categoryId, subcategoryId, day, mode, startMonth, active: true, skipped: [] };
}

// ---------- 版本轉換 ----------

/**
 * 舊版資料 → 目前版本。日後改資料結構時：
 * 1. SCHEMA_VERSION + 1
 * 2. 在 MIGRATIONS 加上「舊版號 → 轉換函式」
 */
const MIGRATIONS = {
  // v1 → v2：方案的項目名稱變成共用分類（SPEC B11.1）
  1: (d) => {
    const categories = [];
    const incomeCategories = [];
    const catByName = new Map();
    const incByName = new Map();

    const plans = d.plans.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      incomes: p.incomes.map((i) => {
        const name = (i.name ?? "").trim() || "收入";
        if (!incByName.has(name)) {
          const c = newIncomeCategory(name);
          incomeCategories.push(c);
          incByName.set(name, c);
        }
        return { id: i.id, categoryId: incByName.get(name).id, amount: i.amount ?? null };
      }),
      expenses: p.expenses.map((e) => {
        const name = (e.name ?? "").trim() || "未命名";
        if (!catByName.has(name)) {
          // 先用 v2 的類型（支出／儲蓄），轉到 v3 時再分固定／變動
          const c = newCategory(categories, { name, emoji: e.emoji || "💸", kind: guessKind(name) === "saving" ? "saving" : "expense" });
          categories.push(c);
          catByName.set(name, c);
        }
        return { id: e.id, categoryId: catByName.get(name).id, mode: e.mode, value: e.value ?? null };
      }),
    }));

    // 同一個方案裡出現兩個同名項目時，只留第一個（共用分類後不能重複）
    for (const p of plans) {
      const seen = new Set();
      p.expenses = p.expenses.filter((e) => !seen.has(e.categoryId) && seen.add(e.categoryId));
      const seenInc = new Set();
      p.incomes = p.incomes.filter((i) => !seenInc.has(i.categoryId) && seenInc.add(i.categoryId));
    }

    return {
      schemaVersion: 2,
      activePlanId: d.activePlanId,
      plans,
      categories,
      incomeCategories,
      entries: [],
      recurring: [],
      months: {},
      lastBackupAt: null,
    };
  },
};

// v2 → v3：支出類分成固定／變動（SPEC B11.1）。
// 方案裡用固定金額填的、或有固定收支的 → 固定支出；其他 → 變動支出
MIGRATIONS[2] = (d) => {
  const fixedIds = new Set();
  for (const p of d.plans) for (const e of p.expenses) if (e.mode === "amount") fixedIds.add(e.categoryId);
  for (const r of d.recurring) if (r.type === "expense") fixedIds.add(r.categoryId);
  return {
    ...d,
    schemaVersion: 3,
    categories: d.categories.map((c) => (c.kind === "expense" ? { ...c, kind: fixedIds.has(c.id) ? "fixed" : "variable" } : c)),
  };
};

export function migrate(data) {
  let d = data;
  while (d.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[d.schemaVersion];
    if (!step) throw new Error(`沒有 schemaVersion ${d.schemaVersion} 的轉換`);
    d = step(d);
  }
  return d;
}

export function isValid(d) {
  const base =
    d &&
    typeof d === "object" &&
    Number.isInteger(d.schemaVersion) &&
    Array.isArray(d.plans) &&
    d.plans.length > 0 &&
    d.plans.every((p) => p && typeof p.id === "string" && Array.isArray(p.incomes) && Array.isArray(p.expenses));
  if (!base || d.schemaVersion < 2) return !!base;
  return (
    Array.isArray(d.categories) &&
    Array.isArray(d.incomeCategories) &&
    Array.isArray(d.entries) &&
    Array.isArray(d.recurring) &&
    d.months !== null &&
    typeof d.months === "object"
  );
}

/** 解析並轉換成目前版本；不合法時丟出錯誤（讀取和匯入備份共用） */
export function parseData(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isValid(parsed)) throw new Error("資料格式不正確");
  if (parsed.schemaVersion > SCHEMA_VERSION) throw new Error("這份資料來自比較新的版本，請先更新 App");
  const data = migrate(parsed);
  if (!data.plans.some((p) => p.id === data.activePlanId)) data.activePlanId = data.plans[0].id;
  return data;
}

/**
 * 讀取資料。沒有資料、資料壞掉，或比目前 App 還新的版本，都回傳預設範例；
 * 壞掉的原始資料會另存一份備份，不直接丟掉。舊版資料轉換前也會先備份一份。
 */
export function load(storage) {
  let raw = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
    for (const key of LEGACY_KEYS) raw ??= storage?.getItem(key) ?? null;
  } catch {
    return defaultData();
  }
  if (raw == null) return defaultData();

  try {
    const version = JSON.parse(raw)?.schemaVersion;
    if (Number.isInteger(version) && version < SCHEMA_VERSION) backupRaw(storage, raw, `v${version}`);
    return parseData(raw);
  } catch {
    backupRaw(storage, raw, Date.now());
    return defaultData();
  }
}

function backupRaw(storage, raw, suffix) {
  try {
    storage.setItem(`${STORAGE_KEY}-backup-${suffix}`, raw);
  } catch {
    /* 空間不足時放棄備份 */
  }
}

export function save(storage, data) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
