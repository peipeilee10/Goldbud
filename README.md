# 小金芽（Goldbud）

手機上就能用的財務分配工具，App 名稱是「小金芽」：填入收入，再用 % 或金額分配到各個支出項目。吉祥物是一隻水豚。

**網址：<https://peipeilee10.github.io/Goldbud/>**

加到手機主畫面：
- iPhone：用 Safari 打開網址 → 分享 → 加入主畫面
- Android：用 Chrome 打開網址 → ⋮ → 加到主畫面／安裝應用程式

## 目前進度

- [x] v1：預算分配（方案、% ⇄ 金額、計算機、拖曳排序、加到主畫面、離線）
- [x] v2.0.0：實際收支記帳（記一筆、每月明細、統計與預算比對、圓餅圖、固定收支、分類管理、備份）
- [x] v2.1.0：區分固定支出、變動支出、儲蓄
- [ ] 下一步：載具消費明細匯入（規格書 B12 第 2 階段）

## 在電腦上執行

需要 Python 3（macOS 內建）。在專案資料夾執行：

```
npm start
```

然後用瀏覽器打開 <http://localhost:8765>。這個開發用伺服器不會讓瀏覽器暫存檔案，改完重新整理就能看到。

> 本機（localhost）預設不啟用離線功能，避免一直看到舊檔；要測離線時，網址加 `?sw`（例如 <http://localhost:8765/?sw>）。

## 測試

需要 Node.js 18 以上：

```
npm test
```

## 資料夾結構

```
index.html            App 頁面（各分頁的外框、底部分頁列）
manifest.webmanifest  加到主畫面用的 App 設定
sw.js                 離線快取（service worker）
src/
  app.js              啟動、分頁切換（網址 #/ledger、#/stats、#/budget、#/more/...）
  app.css             App 樣式
  state.js            目前的資料、儲存、通知畫面更新
  ui.js               共用元件：底部面板、提示條、計算機、emoji 選擇器
  pickers.js          選分類面板
  pages/
    ledger.js         記帳首頁
    entry.js          記一筆／編輯紀錄
    stats.js          統計
    budget.js         預算
    more.js           更多：分類管理、固定收支、備份與還原
  store.js            資料結構、預設資料、版本轉換、讀寫
  ledger.js           記帳的計算：月統計、預算比對、固定收支、分類刪除
  calc.js             預算的計算（% ⇄ 金額、加總、格式）
  calculator.js       計算機的邏輯
  backup.js           備份匯出／匯入
  dates.js            日期工具
  drag.js             拖曳排序
  version.js          App 版本號
tests/                單元測試（npm test）
scripts/dev_server.py 本機開發伺服器（npm start）
docs/
  SPEC.md             規格書（第一部分預算、第二部分記帳 B1～B15）
  DECISIONS.md        決策紀錄：選了什麼、為什麼
design/
  tokens.css          顏色、字型、圓角等設計 tokens（App 共用）
  visual/             各版本視覺稿（v1 預算、v2 記帳）
  references/         風格參考圖（不放進 git，只存在本機）
  mascot/             水豚 SVG、產生程式 build.py、預覽頁 preview.html
  icons/              桌面圖示；改了水豚後執行 sh design/icons/render.sh 重新產生 PNG
wireframes/           各版本 wireframe（用瀏覽器打開 .html）
```

## 迭代流程

每次要加功能或修改時：

1. **改規格**：更新 `docs/SPEC.md`，並把規格版本號往上加。
2. **記決策**：在 `docs/DECISIONS.md` 新增一筆，寫下原因。
3. **寫程式＋測試**：修改 `src/`，在 `tests/` 補上測試，跑 `npm test`。
4. **記變更**：在 `CHANGELOG.md` 的「未發布」區塊寫下改了什麼。
5. **先累積在 `next` 分支**：修改和新功能都先 commit 在 `next`（大改版可以再開 `feature/...`），測試過但**不上線**。main 一推就會上線，所以等決定「上版」時才合併。
6. **上版（統一發布）**：決定上版時，把 `next` 累積的修改一起發布：更新版本號（`package.json`、`src/version.js`、`sw.js` 的 `VERSION`、CHANGELOG），跑 `npm test` 確認一致，git commit 後打 tag（例如 `v1.2.0`）。
   - 有新增檔案的話，也要加進 `sw.js` 的 `FILES` 清單，離線時才打得開。
7. **上線**：`git push && git push --tags`。GitHub Pages 會自動用 `main` 分支更新網站，約 1 分鐘後生效；手機上的 App 會在下次打開時於背景下載新版，再下一次打開就是新版。

### 改資料結構時

使用者的資料存在他們的瀏覽器裡，改格式時要讓舊資料能自動轉換：

1. `src/store.js` 的 `SCHEMA_VERSION` 加 1。
2. 在 `MIGRATIONS` 加上舊版 → 新版的轉換函式。
3. 在 `tests/store.test.js` 加上轉換測試。

所有歷史都在 git 裡，可以用 `git log` 查看，或回到任何一個舊版本。
