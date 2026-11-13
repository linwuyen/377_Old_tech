# ASR5000 控制工程筆記

給熟悉韌體的工程師，從 ASR5000 / TMS320F28377S 原始碼理解控制演算法。

**網站： https://linwuyen.github.io/377_Old_tech/**

## 教材

1. 系統架構與訊號路徑
2. 中斷時序與更新率
3. 回授與補償迴路
4. 離散 PI 與飽和處理
5. 數位濾波與量測
6. DDS 與輸出模式
7. 保護邏輯與狀態機
8. 驗證與調校工作流

另含 PI 互動實驗、全文搜尋、瀏覽器閱讀進度、原碼索引、章節目錄與閱讀練習。

## 來源與限制

- 原始儲存庫：[linwuyen/ASR5K_Old](https://github.com/linwuyen/ASR5K_Old)
- 分析範圍：`ASR5K_28377/TRACE_ASR5000_F28377S`
- 固定 commit：`5262007b56d420c74ac892692ea4d3969a3e3992`
- 分析日期：2026-11-14，Asia/Taipei
- 本教材為靜態原碼分析，未使用 CCS 編譯或實機驗證。更新率推導採指定設定與路徑假設，不能代替實測。
- 互動實驗重現 `runPI` 的遞迴順序；合成誤差、雙精度運算，未建立電源功率級模型。
- 原始碼節錄及各第三方元件的權利仍屬原權利人；本儲存庫未另行授予原韌體的授權。

## 本機預覽與驗證

需要 Node.js 22 或更新版本，沒有 npm 相依套件。

```sh
npm run dev
# http://127.0.0.1:4173
npm test
npm run check
# 同時驗證引文檔案與行號（先取得來源版本）
node scripts/check.mjs /absolute/path/to/TRACE_ASR5000_F28377S
```

## 更新與部署

此站為純靜態網站。GitHub Pages 使用 `main` 分支的根目錄，`.nojekyll` 停用 Jekyll 處理。推送到 `main` 後，GitHub 自動更新網站。

- `lessons/system.js`：架構、時序、保護與驗證。
- `lessons/control.js`：控制迴路、PI、濾波與波形。
- `lab.js`：純函式數值模型與實驗 UI；`lab.test.js`：數值行為驗證。
- `app.js`：頁面路由、全文搜尋、進度與導覽。
- `styles.css`、`index.html`：響應式介面。

章節採 hash 路由，直接分享 `/#/discrete-control` 等連結時不需要伺服器重寫。新增教材時請保留來源版本與行號，並分清原碼事實、理論推導、待驗證事項。

網站沒有後端；閱讀進度只保存在 localStorage。Google Fonts 字型載入失敗時使用系統字型。
