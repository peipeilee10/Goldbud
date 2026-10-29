// 選分類的面板（預算、記帳、固定收支共用）

import { h, openSheet, promptSheet } from "./ui.js";
import { getData, commit } from "./state.js";
import { newCategory, newIncomeCategory, guessKind, kindInfo } from "./store.js";

/**
 * type："expense"（大分類）或 "income"（收入分類）
 * exclude：不能選的分類 id（例如方案裡已經有的）
 * kinds：只列這些類型的大分類（例如記帳時只能選固定／變動支出，儲蓄類不能記成支出）
 * newKind：在這裡新增的大分類用什麼類型（沒給就依名稱猜）
 */
export function pickCategory({ type, title, exclude = new Set(), kinds = null, newKind = null, onPick }) {
  const data = getData();
  const list = (type === "income" ? data.incomeCategories : data.categories).filter((c) => !kinds || kinds.includes(c.kind));
  const close = openSheet(
    title ?? (type === "income" ? "選擇收入分類" : "選擇分類"),
    [
      h(
        "div",
        { class: "cats picker" },
        list.map((c) =>
          h(
            "button",
            { class: "cat", disabled: exclude.has(c.id), onclick: () => (close(), onPick(c)) },
            h("i", {}, c.emoji),
            c.name,
          ),
        ),
      ),
      exclude.size && list.some((c) => exclude.has(c.id)) ? h("div", { class: "sheet-note" }, "灰色的分類已經在這個方案裡") : null,
      h(
        "button",
        {
          class: "add",
          style: "color:var(--ink-soft)",
          onclick: () => {
            close();
            promptSheet({
              title: type === "income" ? "新增收入分類" : "新增分類",
              placeholder: type === "income" ? "例如：獎金" : "例如：寵物",
              onSubmit: (name) => {
                const d = getData();
                const existing = (type === "income" ? d.incomeCategories : d.categories).find((c) => c.name === name);
                if (existing) return onPick(existing);
                let cat;
                if (type === "income") {
                  cat = newIncomeCategory(name);
                  d.incomeCategories.push(cat);
                } else {
                  cat = newCategory(d.categories, { name, kind: newKind ?? guessKind(name) });
                  d.categories.push(cat);
                }
                commit();
                onPick(cat);
              },
            });
          },
        },
        type === "income" ? "＋ 新增收入分類" : newKind ? `＋ 新增${kindInfo(newKind).label}分類` : "＋ 新增分類",
      ),
    ],
  );
}
