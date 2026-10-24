# 小金芽（Goldbud）

手機上就能用的財務分配工具，App 名稱是「小金芽」：填入收入，再用 % 或金額分配到各個支出項目。吉祥物是一隻水豚。

**網址：<https://peipeilee10.github.io/Goldbud/>**

加到手機主畫面：
- iPhone：用 Safari 打開網址 → 分享 → 加入主畫面
- Android：用 Chrome 打開網址 → ⋮ → 加到主畫面／安裝應用程式

## 目前進度

- [x] 規格書 v1.6
- [x] Wireframe v1
- [x] 水豚吉祥物 v1
- [x] 視覺設計 v1
- [x] App v1.0.0
- [x] App v1.1.0：可加到主畫面、離線使用
- [x] App v1.2.0：改名為小金芽
- [x] App v1.3.0：拖曳排序、金額計算機、移除 📌
- [ ] 規格書 v2.0：實際收支記帳（草稿討論中，`docs/SPEC-v2-draft.md`）
- [x] 放上網路（GitHub Pages）

## 在電腦上執行

需要 Python 3（macOS 內建）。在專案資料夾執行：

```
npm start
```

然後用瀏覽器打開 <http://localhost:8765>。

## 測試

需要 Node.js 18 以上：

```
npm test
```

## 資料夾結構

```
index.html         App 頁面
manifest.webmanifest  加到主畫面用的 App 設定
sw.js              離線快取（service worker）
src/
  app.js           畫面與互動
  app.css          App 樣式
  calc.js          計算（% ⇄ 金額、加總、格式）
  calculator.js    金額計算機的邏輯
  drag.js          拖曳排序
  store.js         資料建立、讀寫、版本轉換
  version.js       App 版本號
tests/             單元測試
README.md          專案說明（本檔）
CHANGELOG.md       每個版本改了什麼
docs/
  SPEC.md          規格書（目前版本）
  SPEC-v2-draft.md 規格書 v2.0 草稿（記帳功能，確認後併入 SPEC.md）
  DECISIONS.md     決策紀錄：選了什麼、為什麼
design/
  tokens.css       顏色、字型、圓角等設計 tokens（App 共用）
  visual/          各版本視覺稿
  references/      風格參考圖（不放進 git，只存在本機）
  mascot/          水豚 SVG、產生程式 build.py、預覽頁 preview.html
  icons/           桌面圖示；改了水豚後執行 sh design/icons/render.sh 重新產生 PNG
wireframes/        各版本 wireframe（用瀏覽器打開 .html）
.claude/launch.json 本機預覽伺服器設定
```

## 迭代流程

每次要加功能或修改時：

1. **改規格**：更新 `docs/SPEC.md`，並把規格版本號往上加。
2. **記決策**：在 `docs/DECISIONS.md` 新增一筆，寫下原因。
3. **寫程式＋測試**：修改 `src/`，在 `tests/` 補上測試，跑 `npm test`。
4. **記變更**：在 `CHANGELOG.md` 的「未發布」區塊寫下改了什麼。
5. **發布**：更新版本號（`package.json`、`src/version.js`、`sw.js` 的 `VERSION`、CHANGELOG），跑 `npm test` 確認一致，git commit 後打 tag（例如 `v1.2.0`）。
   - 有新增檔案的話，也要加進 `sw.js` 的 `FILES` 清單，離線時才打得開。
6. **上線**：`git push && git push --tags`。GitHub Pages 會自動用 `main` 分支更新網站，約 1 分鐘後生效；手機上的 App 會在下次打開時於背景下載新版，再下一次打開就是新版。

### 改資料結構時

使用者的資料存在他們的瀏覽器裡，改格式時要讓舊資料能自動轉換：

1. `src/store.js` 的 `SCHEMA_VERSION` 加 1。
2. 在 `MIGRATIONS` 加上舊版 → 新版的轉換函式。
3. 在 `tests/store.test.js` 加上轉換測試。

所有歷史都在 git 裡，可以用 `git log` 查看，或回到任何一個舊版本。
