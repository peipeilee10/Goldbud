// Service worker：把 App 檔案存在手機上，沒有網路也能從桌面打開。
// 每次發布新版都要更新 VERSION（tests/version.test.js 會檢查和 src/version.js 一致），
// 手機才會下載新檔案。

const VERSION = "1.2.0";
const CACHE = `goldbud-${VERSION}`;
// 舊名稱時期的快取也一起清掉
const OLD_PREFIXES = ["goldbud-", "budget-capybara-"];

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "src/app.css",
  "src/app.js",
  "src/calc.js",
  "src/store.js",
  "src/version.js",
  "design/tokens.css",
  "design/mascot/capybara-sleep.svg",
  "design/mascot/capybara-calm.svg",
  "design/mascot/capybara-done.svg",
  "design/mascot/capybara-sweat.svg",
  "design/icons/icon-192.png",
  "design/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// 新版啟用時刪掉舊版快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && OLD_PREFIXES.some((p) => k.startsWith(p))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 自己網站的檔案：先用快取，沒有才連網路；其他網站（字型）直接連網路
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? fetch(req)),
  );
});
