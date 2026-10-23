# 財務分配 Web App

手機上就能用的財務分配工具：填入收入，再用 % 或金額分配到各個支出項目。吉祥物是一隻水豚。

## 目前進度

- [x] 規格書 v1.0
- [x] Wireframe v1（待確認）
- [ ] 視覺設計
- [ ] 開發 v1.0.0

## 資料夾結構

```
README.md          專案說明（本檔）
CHANGELOG.md       每個版本改了什麼
docs/
  SPEC.md          規格書（目前版本）
  DECISIONS.md     決策紀錄：選了什麼、為什麼
wireframes/        各版本 wireframe（用瀏覽器打開 .html）
.claude/launch.json 本機預覽伺服器設定
```

## 迭代流程

每次要加功能或修改時：

1. **改規格**：更新 `docs/SPEC.md`，並把規格版本號往上加。
2. **記決策**：在 `docs/DECISIONS.md` 新增一筆，寫下原因。
3. **記變更**：在 `CHANGELOG.md` 的「未發布」區塊寫下改了什麼。
4. **提交**：用 git commit 存成一個版本；發布時打 tag（例如 `spec-v1.1`、`v1.1.0`）。

所有歷史都在 git 裡，可以用 `git log` 查看，或回到任何一個舊版本。
