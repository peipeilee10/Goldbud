// 記一筆／編輯紀錄的面板（SPEC B4，wireframe B、C1）

import * as calculator from "../calculator.js";
import { newEntry, uid } from "../store.js";
import { recentCombos, deleteEntry } from "../ledger.js";
import { todayStr, addDays, dayLabel } from "../dates.js";
import { h, openSheet, confirmSheet, toast, keypad, bindCalcKeyboard, formatAmount, promptSheet } from "../ui.js";
import { getData, commit, findCategory, findIncomeCategory } from "../state.js";
import { pickCategory } from "../pickers.js";

// 記一筆的鍵盤：= 不需要（儲存時自動算），改放 ⌫
const ENTRY_KEYS = [
  ["7"], ["8"], ["9"], ["÷", "op"],
  ["4"], ["5"], ["6"], ["×", "op"],
  ["1"], ["2"], ["3"], ["−", "op"],
  ["0"], ["."], ["⌫", "fn"], ["+", "op"],
];

/**
 * entry：要編輯的紀錄（沒有就是新增）
 * preset：新增時的預設值，例如 { date }（「再記一筆」沿用日期）
 */
export function openEntrySheet({ entry = null, preset = {} } = {}) {
  const data = getData();
  const editing = !!entry;
  const s = {
    type: entry?.type ?? preset.type ?? "expense",
    calc: calculator.start(entry?.amount ?? null),
    categoryId: entry?.categoryId ?? null,
    subcategoryId: entry?.subcategoryId ?? null,
    date: entry?.date ?? preset.date ?? todayStr(),
    note: entry?.note ?? "",
    keypadOpen: !editing,
  };
  // 新增時：打開就直接按數字（起始值是空的，不是「可取代的起始值」）
  if (!editing) s.calc = { expr: "", fresh: false };
  const initial = JSON.stringify({ ...s, keypadOpen: null });

  const body = h("div", { class: "entry-form" });
  const close = openSheet(null, body, {
    className: "add-sheet",
    onBeforeClose: () => {
      if (JSON.stringify({ ...s, keypadOpen: null }) === initial) return true;
      confirmSheet({ title: editing ? "放棄這次修改？" : "要放棄這筆嗎？", confirmLabel: "放棄", cancelLabel: "繼續編輯", onConfirm: () => close(true) });
      return false;
    },
  });
  const sheet = body.closest(".sheet");

  const value = () => calculator.evaluate(s.calc.expr);
  const canSave = () => {
    const v = value();
    return !v.error && v.value > 0 && !!s.categoryId;
  };

  const press = (key) => {
    s.calc = calculator.press(s.calc, key);
    renderAmount();
    renderSave();
  };

  // ---------- 各區塊 ----------

  const seg = h("div", { class: "seg" });
  const amountBox = h("button", { class: "amount-display", type: "button", "aria-label": "金額" });
  const recentBox = h("div");
  const catsBox = h("div");
  const subsBox = h("div");
  const dateBtn = h("button", { class: "field", type: "button" });
  const note = h("input", { class: "", placeholder: "✏️ 備註", value: s.note, maxlength: "40", "aria-label": "備註", enterkeyhint: "done" });
  note.addEventListener("input", () => (s.note = note.value));
  note.addEventListener("keydown", (e) => e.key === "Enter" && note.blur());
  const keys = keypad(ENTRY_KEYS, press, "keypad");
  const saveBtn = h("button", { class: "btn primary calc-submit", onclick: () => save() }, "儲存");
  const del = editing ? h("button", { class: "btn danger", onclick: () => remove() }, "🗑 刪除") : null;

  function renderSeg() {
    seg.className = `seg ${s.type}`;
    seg.replaceChildren(
      ...[
        ["expense", "支出"],
        ["income", "收入"],
      ].map(([t, label]) =>
        h(
          "button",
          {
            class: s.type === t ? "on" : null,
            "aria-pressed": String(s.type === t),
            onclick: () => {
              if (s.type === t) return;
              // 切換支出／收入：金額保留，分類清空（兩邊的分類不同）
              s.type = t;
              s.categoryId = null;
              s.subcategoryId = null;
              renderAll();
            },
          },
          label,
        ),
      ),
    );
  }

  function renderAmount() {
    const v = value();
    const shown = v.error ? v.error : v.value == null ? "0" : formatAmount(v.value);
    const expr = calculator.formatExpr(s.calc.expr);
    amountBox.className = `amount-display ${s.type}${v.error ? " error" : ""}`;
    amountBox.replaceChildren(
      h("small", {}, /[+−×÷]/.test(s.calc.expr) ? expr : " "),
      h("b", {}, h("span", {}, "NT$"), shown),
    );
  }

  function categoryList() {
    return s.type === "income" ? data.incomeCategories : data.categories.filter((c) => c.kind === "expense");
  }

  function renderRecent() {
    if (s.type === "income") return recentBox.replaceChildren();
    const combos = recentCombos(data.entries, "expense").filter((c) => findCategory(c.categoryId));
    if (!combos.length) return recentBox.replaceChildren();
    recentBox.replaceChildren(
      h("div", { class: "mini-label" }, "最近常用"),
      h(
        "div",
        { class: "chips" },
        combos.map((c) => {
          const cat = findCategory(c.categoryId);
          const sub = cat.subcategories.find((x) => x.id === c.subcategoryId);
          const on = s.categoryId === c.categoryId && (s.subcategoryId ?? null) === (c.subcategoryId ?? null);
          return h(
            "button",
            {
              class: on ? "chip on" : "chip",
              onclick: () => {
                s.categoryId = c.categoryId;
                s.subcategoryId = sub ? sub.id : null;
                renderCats();
              },
            },
            `${cat.emoji} ${sub?.name ?? cat.name}`,
          );
        }),
      ),
    );
  }

  function renderCats() {
    const list = categoryList();
    catsBox.replaceChildren(
      h("div", { class: "mini-label" }, s.type === "income" ? "收入分類" : "分類"),
      h(
        "div",
        { class: "cats" },
        list.map((c) =>
          h(
            "button",
            {
              class: s.categoryId === c.id ? "cat on" : "cat",
              "aria-pressed": String(s.categoryId === c.id),
              onclick: () => {
                if (s.categoryId !== c.id) s.subcategoryId = null;
                s.categoryId = c.id;
                renderCats();
              },
            },
            h("i", {}, c.emoji),
            c.name,
          ),
        ),
        h("button", { class: "cat add-new", onclick: addCategory, "aria-label": "新增分類" }, h("i", {}, "＋"), "新增"),
      ),
    );
    renderSubs();
    renderRecent();
    renderSave();
  }

  function addCategory() {
    pickCategory({
      type: s.type,
      onlyKind: s.type === "expense" ? "expense" : null,
      onPick: (c) => {
        s.categoryId = c.id;
        s.subcategoryId = null;
        renderCats();
      },
    });
  }

  function renderSubs() {
    const cat = s.type === "expense" ? findCategory(s.categoryId) : null;
    if (!cat) return subsBox.replaceChildren();
    subsBox.replaceChildren(
      h(
        "div",
        { class: "subs" },
        cat.subcategories.map((sub) =>
          h(
            "button",
            {
              class: s.subcategoryId === sub.id ? "chip on" : "chip",
              "aria-pressed": String(s.subcategoryId === sub.id),
              // 再點一次取消，只記大分類
              onclick: () => {
                s.subcategoryId = s.subcategoryId === sub.id ? null : sub.id;
                renderSubs();
                renderRecent();
              },
            },
            sub.name,
          ),
        ),
        h(
          "button",
          {
            class: "chip add-new",
            "aria-label": "新增小分類",
            onclick: () =>
              promptSheet({
                title: `新增「${cat.name}」的小分類`,
                placeholder: "例如：零食",
                onSubmit: (name) => {
                  const sub = cat.subcategories.find((x) => x.name === name) ?? { id: uid(), name };
                  if (!cat.subcategories.includes(sub)) cat.subcategories.push(sub);
                  commit();
                  s.subcategoryId = sub.id;
                  renderSubs();
                },
              }),
          },
          "＋",
        ),
      ),
    );
  }

  function renderDate() {
    const t = todayStr();
    const label = s.date === t ? "今天" : s.date === addDays(t, -1) ? "昨天" : s.date === addDays(t, -2) ? "前天" : dayLabel(s.date);
    dateBtn.replaceChildren(`📅 ${label}`);
  }

  function renderKeypad() {
    keys.hidden = !s.keypadOpen;
  }

  function renderSave() {
    saveBtn.disabled = !canSave();
  }

  function renderAll() {
    renderSeg();
    renderAmount();
    renderCats();
    renderDate();
    renderKeypad();
  }

  // ---------- 動作 ----------

  amountBox.addEventListener("click", () => {
    s.keypadOpen = true;
    renderKeypad();
  });

  dateBtn.addEventListener("click", () => openDatePicker(s.date, (d) => ((s.date = d), renderDate())));

  function save() {
    const v = value();
    if (!canSave()) return;
    const amount = calculator.roundResult(v.value);
    let saved;
    if (editing) {
      Object.assign(entry, { type: s.type, amount, categoryId: s.categoryId, subcategoryId: s.subcategoryId, date: s.date, note: s.note.trim(), updatedAt: new Date().toISOString() });
      saved = entry;
    } else {
      saved = newEntry({ type: s.type, date: s.date, amount, categoryId: s.categoryId, subcategoryId: s.subcategoryId, note: s.note.trim() });
      data.entries.push(saved);
    }
    commit();
    close(true);
    document.dispatchEvent(new CustomEvent("entrysaved", { detail: saved }));
    const sign = saved.type === "income" ? "+" : "−";
    if (editing) toast(`✅ 已更新 ${sign}${formatAmount(amount)}`);
    else
      toast(`✅ 已記錄 ${sign}${formatAmount(amount)}`, [
        { label: "再記一筆", onClick: () => openEntrySheet({ preset: { date: saved.date, type: saved.type } }) },
        { label: "復原", onClick: () => (deleteEntry(getData(), saved.id), commit()) },
      ]);
  }

  function remove() {
    const removed = deleteEntry(data, entry.id);
    commit();
    close(true);
    toast("🗑 已刪除", [
      {
        label: "復原",
        onClick: () => {
          const d = getData();
          d.entries.push(removed);
          // 固定收支產生的紀錄被復原時，把「略過這個月」也還原
          const r = d.recurring.find((x) => x.id === removed.recurringId);
          if (r) r.skipped = r.skipped.filter((k) => k !== removed.date.slice(0, 7));
          commit();
        },
      },
    ]);
  }

  bindCalcKeyboard(sheet, (k) => {
    if (k === "=") return save();
    if (k === "C") return press("⌫");
    press(k);
  });

  body.append(
    h("div", { class: "add-top" }, seg, editing ? h("b", { class: "sheet-name" }, "編輯紀錄") : null, h("button", { class: "close", "aria-label": "關閉", onclick: () => close() }, "✕")),
    amountBox,
    recentBox,
    catsBox,
    subsBox,
    h("div", { class: "meta" }, dateBtn, h("label", { class: "field" }, note)),
    keys,
    h("div", { class: "entry-actions" }, del, saveBtn),
  );
  renderAll();
  // 新增時焦點放在面板上（不要叫出手機鍵盤），可以直接用電腦鍵盤打數字
  if (!editing) sheet.setAttribute("tabindex", "-1"), sheet.focus({ preventScroll: true });
}

/** 選日期：今天／昨天／前天，或用系統的日期選擇器 */
export function openDatePicker(current, onPick) {
  const t = todayStr();
  const input = h("input", { type: "date", value: current, max: addDays(t, 365), "aria-label": "其他日期" });
  const close = openSheet("選日期", [
    h(
      "div",
      { class: "chips wrap" },
      [
        ["今天", t],
        ["昨天", addDays(t, -1)],
        ["前天", addDays(t, -2)],
      ].map(([label, d]) => h("button", { class: d === current ? "chip on" : "chip", onclick: () => (close(), onPick(d)) }, label)),
    ),
    h("div", { class: "mini-label" }, "其他日期"),
    h("label", { class: "field" }, input),
    h("div", { class: "sheet-actions" }, h("button", { class: "btn", onclick: () => close() }, "取消"), h("button", { class: "btn primary", onclick: () => input.value && (close(), onPick(input.value)) }, "確定")),
  ]);
}

/** 分類顯示用的名稱與 emoji */
export function entryLabel(e) {
  if (e.type === "income") {
    const c = findIncomeCategory(e.categoryId);
    return { emoji: c?.emoji ?? "💰", title: c?.name ?? "收入", sub: "" };
  }
  const c = findCategory(e.categoryId);
  const sub = c?.subcategories.find((s) => s.id === e.subcategoryId);
  return { emoji: c?.emoji ?? "❔", title: sub?.name ?? c?.name ?? "已刪除的分類", sub: sub ? c.name : "" };
}
