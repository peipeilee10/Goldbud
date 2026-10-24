// 選分類的面板（預算、記帳、固定收支共用）

import { h, openSheet, promptSheet } from "./ui.js";
import { getData, commit } from "./state.js";
import { newCategory, newIncomeCategory, guessKind } from "./store.js";

/**
 * type："expense"（大分類，包含儲蓄類）或 "income"（收入分類）
 * exclude：不能選的分類 id（例如方案裡已經有的）
 * onlyKind："expense" 時只列支出類（記帳用，儲蓄類不能記成支出）
 */
export function pickCategory({ type, title, exclude = new Set(), onlyKind = null, onPick }) {
  const data = getData();
  const list = (type === "income" ? data.incomeCategories : data.categories).filter((c) => !onlyKind || c.kind === onlyKind);
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
                  cat = newCategory(d.categories, { name, kind: onlyKind ?? guessKind(name) });
                  d.categories.push(cat);
                }
                commit();
                onPick(cat);
              },
            });
          },
        },
        type === "income" ? "＋ 新增收入分類" : "＋ 新增分類",
      ),
    ],
  );
}
