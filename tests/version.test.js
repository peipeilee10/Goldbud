import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../src/version.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("版本號一致：package.json、src/version.js、sw.js", () => {
  const pkg = JSON.parse(read("package.json")).version;
  const sw = read("sw.js").match(/const VERSION = "([^"]+)"/)?.[1];
  assert.equal(pkg, APP_VERSION);
  assert.equal(sw, APP_VERSION);
});

test("CHANGELOG 有目前版本的紀錄", () => {
  assert.match(read("CHANGELOG.md"), new RegExp(`## \\[v${APP_VERSION.replace(/\./g, "\\.")}\\]`));
});

test("sw.js 快取清單裡的檔案都存在", () => {
  const list = read("sw.js").match(/const FILES = \[([\s\S]*?)\];/)[1];
  const files = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "./");
  for (const f of files) assert.doesNotThrow(() => read(f), `找不到 ${f}`);
});
