<div align="center">

# Better.SMS

**讓功課更清晰，讓每一天更有條理。**

一款為東華三院李嘉誠中學學生而設的 Chrome／Chromium 擴充功能，  
將 SMS 上的功課和提醒整理成更方便查看的介面。

[![最新版本](https://img.shields.io/github/v/release/ltfrtx/Better.SMS?label=Release&color=0284c7)](https://github.com/ltfrtx/Better.SMS/releases/latest)
![Chrome / Chromium](https://img.shields.io/badge/Chrome%20%2F%20Chromium-Extension-475569)
![時間分析](https://img.shields.io/badge/時間分析-Beta-f59e0b)

[下載最新版本](https://github.com/ltfrtx/Better.SMS/releases/latest) · [查看所有版本](https://github.com/ltfrtx/Better.SMS/releases) · [前往 SMS 功課頁](https://sms.twghlkss.edu.hk/student/records.php?feature=homework)

</div>

---

## ✨ 功能介紹

| 功能 | 說明 |
| --- | --- |
| 📚 **功課與提醒** | 分開整理功課和提醒，支援頁籤及上下分區檢視。 |
| 🎯 **個人選科** | 設定 Math Group、X1、X2 和 X3，篩選與自己相關的項目。 |
| 🗓️ **日期篩選** | 按今天、明天、下個上學天、未來 7 天、下星期或指定日期查看。 |
| ✅ **完成追蹤** | 勾選已完成的功課和提醒，方便掌握進度。 |
| ⏱️ **時間分析 β** | 以圓環圖查看各科已知預計時間，並估算待完成功課的時間。 |
| 🎨 **淺色與深色模式** | 按個人喜好切換介面主題。 |

> **時間分析為測試版。** 估算只計算已知的功課時間，並假設由現在開始連續完成，不包括休息或其他活動，結果只供參考。

## 📥 安裝方法

1. 到 [最新 Release](https://github.com/ltfrtx/Better.SMS/releases/latest)，在 **Assets** 下載 **Source code (zip)**，並解壓縮。
2. 在 Chrome 或 Chromium 開啟 `chrome://extensions`。
3. 啟用右上角的 **開發人員模式**。
4. 點擊 **載入未封裝項目**，選擇解壓後包含 `manifest.json` 的資料夾。
5. 登入 [SMS 功課頁](https://sms.twghlkss.edu.hk/student/records.php?feature=homework)並重新載入頁面，然後點擊工具列上的 Better.SMS 圖示。
6. 在 **選科設定** 中選擇自己的 Math Group、X1、X2 和 X3，即可開始使用。

### 更新已有版本

若希望沿用原有的選科設定和完成狀態，請先備份原本的擴充功能資料夾，再用新版檔案更新**同一個資料夾**，並在 `chrome://extensions` 按「重新載入」。更新後亦請重新載入 SMS 頁面。

若在另一個資料夾載入新版，Chrome 可能會把它視為另一個擴充功能，設定和完成狀態不會自動共用。

## 🆕 v1.9.1 更新重點

- **選科名稱：** 以完整英文名稱顯示科目，並保留中文名稱及老師代號。
- **數學組別：** 顯示名稱改為 G1～G6，已有的選科設定和篩選方式不受影響。
- **介面：** 選科摘要和下拉選單同步顯示完整名稱；調整排版以容納較長的名稱。

### v1.9.0 更新重點

- **更簡單的選科設定：** 直接選擇組別和科目，不再需要選擇學生姓名。
- **固定標題列：** 向下捲動時，標題仍然可見。
- **可摺疊的時間分析日期篩選：** 與主頁篩選保持同步。
- **外觀選擇：** 新增淺色及深色主題，並保存你的選擇。

完整更新內容及舊版本，請參閱 [Releases](https://github.com/ltfrtx/Better.SMS/releases)。

## 💡 使用時要知道

- **資料同步：** 開啟擴充功能時會嘗試讀取 SMS；亦可按「重新整理」。若同步失敗，請確認已登入並重新載入 SMS 頁面。關閉彈出視窗後不會持續在背景同步。
- **日期範圍：** 「下個上學天」只跳過週末，未計算公眾假期或學校假期；「未來 7 天」包括今天。
- **選科結果：** 無法確認或互相矛盾的資料會盡量保留並提示核對。老師或課程安排改變時，請以 SMS 為準。
- **開發者模式：** 可在擴充功能的「⚙ 設定」中啟用，查看同步診斷及手動重新抓取。它與 Chrome 的「開發人員模式」是不同設定。

## 🔒 資料與私隱

Better.SMS 使用瀏覽器已登入的 SMS 工作階段，**不要求輸入或保存 SMS 密碼**。擷取的功課、提醒、完成狀態及設定會儲存在此瀏覽器的 `chrome.storage.local`；時間分析亦在本機進行，不使用第三方圖表服務。

請勿與他人共用已登入的瀏覽器帳戶。

## 🛠️ 開發與測試

擴充功能本身不需要安裝 npm 套件。若要執行測試，請在包含 `package.json` 的版本原始碼資料夾中安裝 Node.js 和 npm，然後執行：

```sh
npm ci
npm test
npm run check
```

## 📄 授權

專案主分支的授權資料請參閱 [LICENSE](https://github.com/ltfrtx/Better.SMS/blob/main/LICENSE)；使用特定發行版本時，亦請參閱該版本附帶的授權檔案。

---

<div align="center">

為更好的 SMS 體驗而製作 💙

</div>
