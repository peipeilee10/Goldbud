// 更多頁：分類管理、固定收支、備份與還原、清除資料（SPEC B3、B9、B10，wireframe E）

import { defaultData, newCategory, newIncomeCategory, newRecurring, uid, CATEGORY_COLORS, KINDS, kindInfo, isSpending } from "../store.js";
import { categoryUsage, deleteCategory, deleteSubcategory, runRecurring } from "../ledger.js";
import { exportBackup, parseBackup, describe, daysSinceBackup } from "../backup.js";
import { todayStr, monthKey, monthTitle, shiftMonth, dayInMonth } from "../dates.js";
import { makeSortable } from "../drag.js";
import { h, openSheet, confirmSheet, toast, pickEmoji, promptSheet, moneyButton, showMoney, openCalculator, formatAmount } from "../ui.js";
import { getData, commit, replaceData, findCategory, findIncomeCategory } from "../state.js";
import { pickCategory } from "../pickers.js";
import { APP_VERSION } from "../version.js";

let el;
let parts = [];
let catTab = "expense"; // expense | income
let recurringDraft = null; // 從預算頁 🔁 帶過來的預設值

export function mount(root) {
  el = root;
}

export function render(routeParts = []) {
  parts = routeParts;
  const [sub, id] = parts;
  const page =
    sub === "categories" && id ? categoryEdit(id)
    : sub === "categories" ? categoriesPage()
    : sub === "recurring" && id ? recurringEdit(id)
    : sub === "recurring" ? recurringPage()
    : sub === "backup" ? backupPage()
    : menuPage();
  el.replaceChildren(h("main", { class: "content" }, page));
  if (sub === "categories" && !id) bindCategorySort();
}

const go = (hash) => (location.hash = hash);

function backbar(title, back) {
  return h("header", { class: "backbar" }, h("a", { class: "btn", href: back }, "‹ 返回"), h("h1", {}, title));
}

// ---------- 選單（E1） ----------

function menuPage() {
  const data = getData();
  const days = daysSinceBackup(data);
  const active = data.recurring.filter((r) => r.active).length;
  return [
    h("header", { class: "page-title" }, h("h1", {}, "更多")),
    h("div", { class: "group-label" }, "記帳設定"),
    h(
      "div",
      { class: "menu-list" },
      menuRow("🗂", "分類管理", `${data.categories.length} 個大分類 · ${data.incomeCategories.length} 個收入分類`, "#/more/categories"),
      menuRow("🔁", "固定收支", active ? `${active} 筆啟用中` : "還沒有設定", "#/more/recurring"),
    ),
    h("div", { class: "group-label" }, "資料"),
    h(
      "div",
      { class: "menu-list" },
      menuRow("💾", "備份與還原", days == null ? "還沒有備份過" : days === 0 ? "今天備份過" : `上次備份：${days} 天前`, "#/more/backup"),
      h("button", { class: "menu-row danger", onclick: clearAll }, h("span", { class: "ic" }, "🧹"), h("span", {}, "清除全部資料"), h("span", { class: "go" }, "›")),
    ),
    h("div", { class: "group-label" }, "關於"),
    h(
      "div",
      { class: "menu-list" },
      h("div", { class: "menu-row" }, h("img", { src: "design/mascot/capybara-calm.svg", alt: "", style: "width:40px;height:40px" }), h("span", {}, "小金芽", h("small", {}, `版本 ${APP_VERSION} · 資料只存在這台裝置`))),
    ),
  ];
}

function menuRow(icon, title, note, href) {
  return h("a", { class: "menu-row", href }, h("span", { class: "ic" }, icon), h("span", {}, title, h("small", {}, note)), h("span", { class: "go" }, "›"));
}

function clearAll() {
  confirmSheet({
    title: "清除全部資料？",
    message: "所有方案、分類、記帳紀錄和固定收支都會刪除，回到預設範例。這個動作無法復原，建議先備份。",
    confirmLabel: "清除",
    onConfirm: () => {
      replaceData(defaultData());
      toast("已清除，回到預設範例");
      go("#/ledger");
    },
  });
}

// ---------- 分類管理（E2、E3） ----------

function categoriesPage() {
  const data = getData();
  const income = catTab === "income";
  const list = income ? data.incomeCategories : data.categories;
  return [
    backbar("分類管理", "#/more"),
    h(
      "div",
      { class: "seg" },
      h("button", { class: income ? null : "on", onclick: () => ((catTab = "expense"), render(parts)) }, "支出與儲蓄"),
      h("button", { class: income ? "on" : null, onclick: () => ((catTab = "income"), render(parts)) }, "收入"),
    ),
    h(
      "div",
      { class: "menu-list", id: "cat-list" },
      list.map((c) =>
        h(
          "div",
          { class: "menu-row", "data-id": c.id },
          h("button", { class: "handle", "aria-label": "拖曳排序（也可以用上下鍵）" }, "⠿"),
          h(
            "a",
            { class: "row-link", href: `#/more/categories/${c.id}` },
            h("span", { class: "ic" }, c.emoji),
            h("span", {}, c.name, income ? null : h("small", {}, c.kind === "saving" ? "不計入支出" : c.subcategories.map((s) => s.name).join("、") || "沒有小分類")),
            !income && isSpending(c) ? h("span", { class: "dot", style: `background:${c.color ? `var(--cat-${c.color})` : "var(--cat-other)"}` }) : null,
            income ? null : h("span", { class: `kind ${c.kind}` }, kindInfo(c.kind).short),
            h("span", { class: "go" }, "›"),
          ),
        ),
      ),
    ),
    h(
      "button",
      {
        class: "add",
        style: `color:var(--${income ? "income" : "expense"}-ink)`,
        onclick: () =>
          promptSheet({
            title: income ? "新增收入分類" : "新增大分類",
            placeholder: income ? "例如：獎金" : "例如：寵物",
            onSubmit: (name) => {
              const d = getData();
              const c = income ? newIncomeCategory(name) : newCategory(d.categories, { name, kind: "variable" });
              (income ? d.incomeCategories : d.categories).push(c);
              commit();
              go(`#/more/categories/${c.id}`);
            },
          }),
      },
      income ? "＋ 新增收入分類" : "＋ 新增大分類",
    ),
  ];
}

function bindCategorySort() {
  const list = el.querySelector("#cat-list");
  makeSortable(list, ".handle", (ids) => {
    const d = getData();
    const key = catTab === "income" ? "incomeCategories" : "categories";
    d[key] = ids.map((id) => d[key].find((c) => c.id === id));
    commit("more");
  });
}

function categoryEdit(id) {
  const data = getData();
  const income = !!findIncomeCategory(id);
  const c = income ? findIncomeCategory(id) : findCategory(id);
  if (!c) return [backbar("分類", "#/more/categories"), h("p", { class: "empty-hint" }, "找不到這個分類")];
  const save = () => (commit(), render(parts));

  const nameInput = h("input", { value: c.name, maxlength: "12", "aria-label": "分類名稱" });
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim();
    if (v) c.name = v;
    save();
  });

  return [
    backbar(c.name, "#/more/categories"),
    h(
      "div",
      { class: "row edit-head" },
      h("button", { class: "emoji big", "aria-label": "更換圖示", onclick: () => pickEmoji(c.emoji, (e) => ((c.emoji = e), save())) }, c.emoji),
      h("label", { class: "field grow" }, nameInput),
    ),
    h("p", { class: "cap" }, "名稱和圖示會在所有方案、紀錄一起更新"),
    income
      ? null
      : [
          h("div", { class: "mini-label" }, "類型"),
          h(
            "div",
            { class: "seg" },
            KINDS.map(({ kind, short }) => h("button", { class: c.kind === kind ? "on" : null, "aria-pressed": String(c.kind === kind), onclick: () => setKind(c, kind) }, short)),
          ),
          c.kind === "fixed" ? h("p", { class: "cap" }, "每月金額差不多的支出（房租、管理費、訂閱）。統計時不判斷「花太快」。") : null,
          c.kind === "variable" ? h("p", { class: "cap" }, "每月會變動的支出（吃飯、交通、娛樂）。統計時會提醒花錢速度。") : null,
          c.kind === "saving" ? h("p", { class: "cap" }, "儲蓄類不算支出：預算比對時用「收入 − 支出」來比，記帳時也不能選。") : null,
          isSpending(c)
            ? [
                h("div", { class: "mini-label" }, "圓餅圖顏色"),
                h(
                  "div",
                  { class: "colors" },
                  Array.from({ length: CATEGORY_COLORS }, (_, i) => i + 1).map((n) => {
                    const owner = data.categories.find((x) => x !== c && isSpending(x) && x.color === n);
                    return h(
                      "button",
                      {
                        class: c.color === n ? "swatch on" : "swatch",
                        style: `background:var(--cat-${n})`,
                        "aria-label": `顏色 ${n}${owner ? `（目前是 ${owner.name}，會互換）` : ""}`,
                        // 顏色已被別的分類用 → 兩個互換，維持每個顏色只屬於一個分類
                        onclick: () => {
                          if (owner) owner.color = c.color;
                          c.color = n;
                          save();
                        },
                      },
                      owner ? h("small", {}, owner.emoji) : null,
                    );
                  }),
                ),
              ]
            : null,
          h("div", { class: "mini-label" }, "小分類"),
          h(
            "div",
            { class: "menu-list" },
            c.subcategories.map((s) =>
              h(
                "div",
                { class: "menu-row" },
                h("button", { class: "row-link", onclick: () => promptSheet({ title: "重新命名小分類", value: s.name, onSubmit: (v) => ((s.name = v), save()) }) }, h("span", {}, s.name)),
                h(
                  "button",
                  {
                    class: "del",
                    "aria-label": `刪除小分類 ${s.name}`,
                    onclick: () =>
                      confirmSheet({ title: `刪除「${s.name}」？`, message: "這個小分類的紀錄會改成只有大分類「" + c.name + "」。", confirmLabel: "刪除", onConfirm: () => (deleteSubcategory(getData(), c.id, s.id), save()) }),
                  },
                  "✕",
                ),
              ),
            ),
            h("button", { class: "menu-row muted", onclick: () => promptSheet({ title: `新增「${c.name}」的小分類`, placeholder: "例如：零食", onSubmit: (v) => (c.subcategories.push({ id: uid(), name: v }), save()) }) }, "＋ 新增小分類"),
          ),
        ],
    h("button", { class: "btn danger wide", onclick: () => removeCategory(c, income) }, "🗑 刪除這個分類"),
  ];
}

function setKind(c, kind) {
  const data = getData();
  c.kind = kind;
  if (kind === "saving") c.color = null;
  else c.color ??= (() => {
    const used = new Set(data.categories.filter((x) => x !== c && isSpending(x)).map((x) => x.color));
    for (let i = 1; i <= CATEGORY_COLORS; i++) if (!used.has(i)) return i;
    return null;
  })();
  commit();
  render(parts);
}

function removeCategory(c, income) {
  const data = getData();
  const list = income ? data.incomeCategories : data.categories;
  if (list.length <= 1) return toast("至少要保留一個分類");
  const usage = categoryUsage(data, c.id);
  const used = usage.entries + usage.plans + usage.recurring > 0;
  if (!used) {
    return confirmSheet({
      title: `刪除「${c.name}」？`,
      confirmLabel: "刪除",
      onConfirm: () => {
        deleteCategory(getData(), c.id, null);
        commit();
        go("#/more/categories");
      },
    });
  }
  // 有人在用：先選要搬到哪個分類（SPEC B3.3）
  const others = list.filter((x) => x.id !== c.id);
  const close = openSheet(`刪除「${c.name}」`, [
    h("p", {}, `有 ${usage.entries} 筆紀錄、${usage.plans} 個方案、${usage.recurring} 筆固定收支在使用。要把它們搬到哪個分類？`),
    h(
      "div",
      { class: "cats picker" },
      others.map((o) =>
        h(
          "button",
          {
            class: "cat",
            onclick: () => {
              close();
              deleteCategory(getData(), c.id, o.id);
              commit();
              toast(`已刪除，資料搬到「${o.name}」`);
              go("#/more/categories");
            },
          },
          h("i", {}, o.emoji),
          o.name,
        ),
      ),
    ),
  ]);
}

// ---------- 固定收支（E4、E5） ----------

function recurringPage() {
  const data = getData();
  const group = (type, label) => {
    const list = data.recurring.filter((r) => r.type === type);
    if (!list.length) return null;
    return [
      h("div", { class: "group-label" }, label),
      h(
        "div",
        { class: "menu-list" },
        list.map((r) => {
          const cat = type === "income" ? findIncomeCategory(r.categoryId) : findCategory(r.categoryId);
          const toggle = h("button", {
            class: r.active ? "toggle" : "toggle off",
            role: "switch",
            "aria-checked": String(r.active),
            "aria-label": `${r.name}${r.active ? "啟用中" : "已暫停"}`,
            onclick: () => {
              r.active = !r.active;
              commit();
              render(parts);
            },
          });
          return h(
            "div",
            { class: "menu-row" },
            h(
              "a",
              { class: "row-link", href: `#/more/recurring/${r.id}` },
              h("span", { class: "ic" }, cat?.emoji ?? "🔁"),
              h("span", {}, r.name, h("small", {}, `每月 ${r.day} 號 · ${r.mode === "auto" ? "自動記入" : "提醒確認"}${r.active ? "" : " · 已暫停"}`)),
              h("span", { class: "go num" }, r.mode === "auto" ? `${type === "income" ? "+" : ""}${formatAmount(r.amount ?? 0)}` : "金額不固定"),
            ),
            toggle,
          );
        }),
      ),
    ];
  };
  return [
    backbar("固定收支", "#/more"),
    data.recurring.length ? [group("income", "收入"), group("expense", "支出")] : h("p", { class: "empty-hint" }, "還沒有固定收支。房租、薪水、訂閱這類每月固定的，設定後就會自動記帳。"),
    h("a", { class: "add", href: "#/more/recurring/new", style: "color:var(--expense-ink)" }, "＋ 新增固定收支"),
  ];
}

/** 預算頁的 🔁：帶著分類和金額開新的固定收支 */
export function openRecurringFromBudget({ categoryId, amount, name }) {
  recurringDraft = { categoryId, amount: Math.round(amount), name };
  go("#/more/recurring/new");
}

function recurringEdit(id) {
  const data = getData();
  const isNew = id === "new";
  const existing = data.recurring.find((r) => r.id === id);
  if (!isNew && !existing) return [backbar("固定收支", "#/more/recurring"), h("p", { class: "empty-hint" }, "找不到這筆固定收支")];

  // 編輯中的草稿，按「儲存」才寫回
  const r = isNew
    ? newRecurring({ name: "", startMonth: monthKey(todayStr()), day: 5, ...(recurringDraft ?? {}) })
    : structuredClone(existing);
  recurringDraft = null;

  const body = h("div", { class: "form" });
  const draw = () => {
    const cat = r.type === "income" ? findIncomeCategory(r.categoryId) : findCategory(r.categoryId);
    const sub = cat?.subcategories?.find((s) => s.id === r.subcategoryId);
    const nameInput = h("input", { value: r.name, maxlength: "16", placeholder: "例如：房租", "aria-label": "名稱" });
    nameInput.addEventListener("input", () => {
      r.name = nameInput.value;
      saveBtn.disabled = !valid();
    });
    const amt = moneyButton("grow", () => openCalculator({ title: "每月金額", value: r.amount, field: amt, onSubmit: (v) => ((r.amount = v), draw()) }));
    showMoney(amt, r.amount);
    const day = h("select", { "aria-label": "每月幾號" }, Array.from({ length: 31 }, (_, i) => h("option", { value: String(i + 1), selected: r.day === i + 1 }, `每月 ${i + 1} 號`)));
    day.addEventListener("change", () => (r.day = Number(day.value)));
    const saveBtn = h("button", { class: "btn primary", disabled: !valid(), onclick: save }, "儲存");

    body.replaceChildren(
      ...[
      h(
        "div",
        { class: `seg ${r.type}` },
        h("button", { class: r.type === "expense" ? "on" : null, onclick: () => ((r.type = "expense"), (r.categoryId = null), (r.subcategoryId = null), draw()) }, "支出"),
        h("button", { class: r.type === "income" ? "on" : null, onclick: () => ((r.type = "income"), (r.categoryId = null), (r.subcategoryId = null), draw()) }, "收入"),
      ),
      h("div", { class: "mini-label" }, "名稱"),
      h("label", { class: "field" }, nameInput),
      h("div", { class: "mini-label" }, "分類"),
      h(
        "button",
        {
          class: "field cat-pick",
          onclick: () =>
            pickCategory({
              type: r.type,
              kinds: r.type === "expense" ? ["fixed", "variable"] : null,
              newKind: r.type === "expense" ? "fixed" : null,
              onPick: (c) => {
                r.categoryId = c.id;
                r.subcategoryId = null;
                if (!r.name.trim()) r.name = c.name;
                draw();
              },
            }),
        },
        h("span", { class: "cat-name" }, cat ? `${cat.emoji} ${cat.name}` : "選擇分類"),
        h("span", { class: "caret" }, "▾"),
      ),
      cat?.subcategories?.length
        ? h(
            "div",
            { class: "subs" },
            cat.subcategories.map((s) => h("button", { class: r.subcategoryId === s.id ? "chip on" : "chip", onclick: () => ((r.subcategoryId = r.subcategoryId === s.id ? null : s.id), draw()) }, s.name)),
          )
        : null,
      h("div", { class: "mini-label" }, "記帳方式"),
      h(
        "div",
        { class: "seg" },
        h("button", { class: r.mode === "auto" ? "on" : null, onclick: () => ((r.mode = "auto"), draw()) }, "自動記入"),
        h("button", { class: r.mode === "confirm" ? "on" : null, onclick: () => ((r.mode = "confirm"), draw()) }, "提醒我確認"),
      ),
      h("p", { class: "cap" }, r.mode === "auto" ? "金額每月都一樣（房租、訂閱、薪水）就選自動記入。" : "金額每月不同（電費、帳單）：到期時提醒你填本月金額。"),
      h("div", { class: "mini-label" }, r.mode === "auto" ? "每月金額" : "參考金額（可不填）"),
      amt,
      h("div", { class: "mini-label" }, "日期"),
      h("label", { class: "field" }, day),
      h("p", { class: "cap" }, `從 ${monthTitle(r.startMonth)} 開始。當月沒有這一天（例如 31 號）時，用月底那天。`),
      h("div", { class: "entry-actions" }, isNew ? null : h("button", { class: "btn danger", onclick: remove }, "🗑 刪除"), saveBtn),
      ].filter(Boolean),
    );
  };

  function valid() {
    return !!r.name.trim() && !!r.categoryId && (r.mode === "confirm" || r.amount > 0);
  }

  function save() {
    if (!valid()) return;
    r.name = r.name.trim();
    const today = todayStr();
    const key = monthKey(today);
    // 新增時這個月的日期已經過了：可能已經手動記過，問一下避免重複
    if (isNew && r.startMonth === key && dayInMonth(key, r.day) <= today) {
      return confirmSheet({
        title: `${Number(key.slice(5))} 月的「${r.name}」要現在記入嗎？`,
        message: "如果這個月已經自己記過了，選「從下個月開始」。",
        confirmLabel: "現在記入",
        cancelLabel: "從下個月開始",
        danger: false,
        onConfirm: commitSave,
        onCancel: () => ((r.startMonth = shiftMonth(key, 1)), commitSave()),
      });
    }
    commitSave();
  }

  function commitSave() {
    const d = getData();
    if (isNew) d.recurring.push(r);
    else Object.assign(existing, r);
    const { added } = runRecurring(d, todayStr());
    commit();
    toast(added.length ? `✅ 已儲存，並記入 ${added.length} 筆` : "✅ 已儲存");
    go("#/more/recurring");
  }

  function remove() {
    confirmSheet({
      title: `刪除「${existing.name}」？`,
      message: "之後不會再自動記帳；已經記入的紀錄會保留。",
      confirmLabel: "刪除",
      onConfirm: () => {
        const d = getData();
        d.recurring = d.recurring.filter((x) => x.id !== existing.id);
        for (const e of d.entries) if (e.recurringId === existing.id) e.recurringId = null;
        commit();
        go("#/more/recurring");
      },
    });
  }

  draw();
  return [backbar(isNew ? "新增固定收支" : existing.name, "#/more/recurring"), body];
}

// ---------- 備份與還原（E6） ----------

function backupPage() {
  const data = getData();
  const days = daysSinceBackup(data);
  const info = describe(data);
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.addEventListener("change", () => file.files[0] && importFile(file.files[0]));
  return [
    backbar("備份與還原", "#/more"),
    h(
      "div",
      { class: "info-card" },
      h("h3", {}, "💾 匯出備份"),
      h("p", { class: "cap" }, `把 ${info.plans} 個方案、${info.categories} 個分類、${info.entries} 筆紀錄、${info.recurring} 筆固定收支存成一個檔案。`),
      h("p", { class: "cap" }, days == null ? "還沒有備份過" : `上次備份：${days === 0 ? "今天" : `${days} 天前`}`),
      h("button", { class: "btn primary wide", onclick: doExport }, "匯出備份檔"),
    ),
    h(
      "div",
      { class: "info-card" },
      h("h3", {}, "📂 從備份還原"),
      h("p", { class: "cap" }, "選擇備份檔，會取代目前的全部資料。"),
      h("button", { class: "btn wide", onclick: () => file.click() }, "選擇檔案…"),
      file,
    ),
    h("p", { class: "cap" }, "建議把備份檔存到 iCloud 雲碟或 Google 雲端硬碟，換手機時才拿得到。"),
  ];
}

async function doExport() {
  const data = getData();
  const { filename, text } = exportBackup(data, APP_VERSION);
  const blob = new Blob([text], { type: "application/json" });
  const fileObj = new File([blob], filename, { type: "application/json" });
  const done = () => {
    data.lastBackupAt = new Date().toISOString();
    commit();
    render(parts);
  };
  // 手機上用分享選單（可以存到「檔案」或雲端硬碟）；不支援時直接下載
  if (navigator.canShare?.({ files: [fileObj] })) {
    try {
      await navigator.share({ files: [fileObj], title: "小金芽備份" });
      return done();
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  done();
  toast(`✅ 已下載 ${filename}`);
}

async function importFile(f) {
  let result;
  try {
    result = parseBackup(await f.text());
  } catch (err) {
    return toast(`❌ ${err.message}`);
  }
  const { data, info } = result;
  const when = info.exportedAt ? new Date(info.exportedAt).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" }) : "不明";
  const range = info.from ? `${info.from} ～ ${info.to}` : "沒有紀錄";
  confirmSheet({
    title: "用這個備份取代目前的資料？",
    message: `備份時間：${when}\n${info.plans} 個方案、${info.entries} 筆紀錄（${range}）、${info.recurring} 筆固定收支。\n目前的資料會被取代，無法復原。`,
    confirmLabel: "還原",
    onConfirm: () => {
      data.lastBackupAt ??= new Date().toISOString();
      replaceData(data);
      toast("✅ 已還原");
      go("#/ledger");
    },
  });
}
