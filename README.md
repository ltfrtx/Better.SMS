# Better.SMS

Chrome／Chromium 擴充功能，從 SMS 學生頁面整理功課，並支援日期及科目篩選。

**版本：** 1.9.*0* Release<br>
**支援頁面：** 

`https://sms.twghlkss.edu.hk/student/*](https://sms.twghlkss.edu.hk/student/records.php?feature=homework)`

## 安裝（載入未封裝擴充功能）

1. 在 Chrome 開啟 `chrome://extensions`，開啟右上角的「開發人員模式」。
2. 選擇「載入未封裝項目」，選取本專案資料夾。
3. 重新載入 SMS 學生頁面，再點擊工具列上的 Better.SMS 圖示。

彈出視窗內的「開發者模式」是抓取診斷工具；它與 Chrome `chrome://extensions` 的「開發人員模式」是不同設定。

## 開發者模式 

在 Better.SMS 彈出視窗展開「🛠 開發者模式」並勾選啟用，即可查看最近一次抓取的語言、表格／列數、辨識欄位與錯誤訊息；也可要求目前 SMS 分頁重新抓取，或複製診斷資料。若手動抓取時顯示找不到程式，請重新載入 SMS 頁面再試。

## 測試

```sh
npm test
npm run check
```

