// 資料建立、讀寫與版本轉換。資料結構見 docs/SPEC.md 10.1。

export const STORAGE_KEY = "goldbud";
// App 改名前用過的 key：新 key 沒有資料時，從這裡搬過來
const LEGACY_KEYS = ["budget-capybara"];
export const SCHEMA_VERSION = 1;

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** 預設範例方案（SPEC 第 8 節） */
export function defaultPlan(name = "我的方案") {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    incomes: [newIncome("薪水")],
    expenses: [
      newExpense("🍙", "吃飯", 30),
      newExpense("🏠", "房租", 30),
      newExpense("🐷", "儲蓄", 20),
      newExpense("🎮", "娛樂", 10),
    ],
  };
}

export function defaultData() {
  const plan = defaultPlan();
  return { schemaVersion: SCHEMA_VERSION, activePlanId: plan.id, plans: [plan] };
}

export function newIncome(name = "") {
  return { id: uid(), name, amount: null };
}

export function newExpense(emoji = "💸", name = "", percent = null) {
  return { id: uid(), emoji, name, mode: "percent", value: percent };
}

/** 複製方案：所有 id 重新產生 */
export function clonePlan(plan, name) {
  const now = new Date().toISOString();
  return {
    ...structuredClone(plan),
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    incomes: plan.incomes.map((i) => ({ ...i, id: uid() })),
    expenses: plan.expenses.map((e) => ({ ...e, id: uid() })),
  };
}

/** 產生不重複的方案名稱：「新方案」、「新方案 2」… */
export function uniqueName(base, plans) {
  const names = new Set(plans.map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * 舊版資料 → 目前版本。日後改資料結構時：
 * 1. SCHEMA_VERSION + 1
 * 2. 在 MIGRATIONS 加上「舊版號 → 轉換函式」
 */
const MIGRATIONS = {
  // 1: (data) => ({ ...data, schemaVersion: 2, ... }),
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

function isValid(d) {
  return (
    d &&
    typeof d === "object" &&
    Number.isInteger(d.schemaVersion) &&
    Array.isArray(d.plans) &&
    d.plans.length > 0 &&
    d.plans.every((p) => p && typeof p.id === "string" && Array.isArray(p.incomes) && Array.isArray(p.expenses))
  );
}

/**
 * 讀取資料。沒有資料、資料壞掉，或比目前 App 還新的版本，都回傳預設範例；
 * 壞掉的原始資料會另存一份備份，不直接丟掉。
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
    const parsed = JSON.parse(raw);
    if (!isValid(parsed) || parsed.schemaVersion > SCHEMA_VERSION) throw new Error("invalid");
    const data = migrate(parsed);
    if (!data.plans.some((p) => p.id === data.activePlanId)) data.activePlanId = data.plans[0].id;
    return data;
  } catch {
    try {
      storage.setItem(`${STORAGE_KEY}-backup-${Date.now()}`, raw);
    } catch {
      /* 空間不足時放棄備份 */
    }
    return defaultData();
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
