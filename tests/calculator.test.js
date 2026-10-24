import { test } from "node:test";
import assert from "node:assert/strict";
import { start, press, evaluate, formatExpr, keyFromKeyboard } from "../src/calculator.js";

/** 從起始值開始依序按鍵 */
function run(keys, initial = null) {
  let s = start(initial);
  for (const k of keys) s = press(s, k);
  return s;
}

test("先乘除後加減", () => {
  assert.deepEqual(evaluate("1200+350×2"), { value: 1900 });
  assert.deepEqual(evaluate("100−20÷4"), { value: 95 });
  assert.deepEqual(evaluate("2×3+4×5"), { value: 26 });
});

test("小數結果保留 2 位", () => {
  assert.deepEqual(evaluate("0.1+0.2"), { value: 0.3 });
  assert.deepEqual(evaluate("10÷3"), { value: 3.33 });
});

test("結尾多出的符號或小數點忽略", () => {
  assert.deepEqual(evaluate("500+"), { value: 500 });
  assert.deepEqual(evaluate("12."), { value: 12 });
});

test("空算式的值是 null", () => {
  assert.deepEqual(evaluate(""), { value: null });
});

test("錯誤：除以 0、負數", () => {
  assert.deepEqual(evaluate("5÷0"), { error: "無法除以 0" });
  assert.deepEqual(evaluate("100−200"), { error: "金額不能是負數" });
});

test("打開時帶入目前數字；直接按數字會取代", () => {
  assert.equal(run(["8"], 45000).expr, "8");
});

test("打開時帶入目前數字；按符號會接著算", () => {
  const s = run(["+", "5", "0", "0"], 45000);
  assert.equal(s.expr, "45000+500");
  assert.deepEqual(evaluate(s.expr), { value: 45500 });
});

test("= 之後結果變成新起點", () => {
  let s = run(["1", "2", "0", "0", "+", "3", "0", "0", "="]);
  assert.deepEqual(s, { expr: "1500", fresh: true });
  assert.equal(press(s, "×").expr, "1500×");
  assert.equal(press(s, "9").expr, "9");
});

test("錯誤時按 = 不改變算式", () => {
  const s = run(["5", "÷", "0"]);
  assert.equal(press(s, "=").expr, "5÷0");
});

test("連按符號會替換前一個", () => {
  assert.equal(run(["5", "+", "×"]).expr, "5×");
});

test("空白時按符號沒有作用", () => {
  assert.equal(run(["+"]).expr, "");
});

test("小數點：一個數字只能有一個；開頭補 0", () => {
  assert.equal(run([".", "5", ".", "2"]).expr, "0.52");
  assert.equal(run(["3", "+", "."]).expr, "3+0.");
});

test("不會有前導 0", () => {
  assert.equal(run(["0", "0", "7"]).expr, "7");
  assert.equal(run(["00"]).expr, "0");
  assert.equal(run(["5", "00"]).expr, "500");
});

test("⌫ 刪一格；C 全部清除", () => {
  assert.equal(run(["1", "2", "3", "⌫"]).expr, "12");
  assert.equal(run(["1", "+", "2", "C"]).expr, "");
  assert.equal(run(["⌫"], 45000).expr, "");
});

test("算式長度有上限", () => {
  const s = run(Array(60).fill("9"));
  assert.equal(s.expr.length, 40);
});

test("顯示格式：千分位與空白", () => {
  assert.equal(formatExpr("1200+350×2"), "1,200 + 350 × 2");
  assert.equal(formatExpr("1234.5÷"), "1,234.5 ÷");
  assert.equal(formatExpr("0."), "0.");
});

test("電腦鍵盤對應", () => {
  assert.equal(keyFromKeyboard("*"), "×");
  assert.equal(keyFromKeyboard("-"), "−");
  assert.equal(keyFromKeyboard("Enter"), "=");
  assert.equal(keyFromKeyboard("a"), null);
});
