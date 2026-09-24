# Fuck.SMS (Better SMS)

> **版本**：v1.68.0[cite: 35, 36, 37, 38]  
> **作者**：LTF (LTF IT Team)[cite: 36, 37]  
> **適用平台**：Google Chrome / Chromium 系列瀏覽器[cite: 38]  
> **目標對象**：東華三院李嘉誠中學 (LKSS) 學生[cite: 36, 38]

---

## 📌 專案簡介

**Fuck.SMS** 是一款專為重構 eClass/SMS 功課列表介面而設計的 Chrome 擴充功能[cite: 38]。傳統 SMS 表格介面繁雜、包含大量非本人的選修科與組別資訊。本套件可自動過濾無關科目、跨越 `<iframe>` 框架擷取完整功課資料[cite: 37, 38]，並提供乾淨直觀的待辦卡片介面與留堂預警。

---

## ✨ 核心功能

* 🎯 **智能選修科與組別過濾**：
  * **內建學生名單**：選擇姓名即可自動帶入對應的 Math 組別 (Gp1–Gp6)、X1、X2、X3 選修科[cite: 35, 36]。
  * **自訂模式**：支援手動調整個別科目組合[cite: 35, 36]。
* 🔄 **跨框架一鍵同步 (Iframe Scraper)**：
  * 支援全框架 (`all_frames: true`) 自動搜尋與擷取內嵌功課表格[cite: 37, 38]。
  * 點擊「🔄 立即同步」可強制更新當前頁面所有 Frame 之資料並自動合併去除重複項[cite: 35, 36]。
* 📅 **多功能日期篩選**：
  * 提供「全部日期」、「今天功課」、「下個上學天」、「未來 7 天」一鍵快速過濾[cite: 35, 36]。
* ☑️ **功課待辦進度管理**：
  * 互動式 Checkbox 勾選，自動標記已完成功課並儲存於本地儲存區 (`chrome.storage.local`)[cite: 35, 36]。
* 🚨 **留堂狀態即時監控**：
  * 自動解析系統留堂班訊息並於頂部彈出警示提醒[cite: 36, 37]。
* ⚡ **即時動態渲染 (Live Update)**：
  * 監聽 Storage 變更 (`chrome.storage.onChanged`)，網頁更新時 Popup 面板無須重開即時刷新[cite: 36]。

---

## 🛠️ 安裝教學

1. 下載本專案原始碼並解壓縮。
2. 開啟 Chrome 瀏覽器，前往 `chrome://extensions/`。
3. 開啟右上角 **「開發者模式 (Developer mode)」**。
4. 點擊 **「載入未打包擴充功能 (Load unpacked)」**，並選擇本套件資料夾。
5. 開啟 [TWGHs LKSS SMS 頁面](https://sms.twghlkss.edu.hk/) 即可開始使用[cite: 36, 38]。

---

## 🏷️ 支援選修科與數學組別

| 類別 | 支援項目與對應教師編號[cite: 36] |
| :--- | :--- |
| **Math** | Gp1 (CPC), Gp2 (SYT), Gp3 (AWY), Gp4 (NOK), Gp5 (TKP), Gp6 (HWS)[cite: 35, 36] |
| **X1** | PHY (LWY), CHEM (LCO), HIST (TKY), CHIS (HKC), JAP (ATH), ECON (TYN)[cite: 35, 36] |
| **X2** | BAFS (TPY), BIO (YSL), CHEM (PTW), CHIS (WCL), TH (CLY), VA (LNF)[cite: 35, 36] |
| **X3** | BIO (NWK), ECON (LYK), GEOG (LHH), HIST (ATH), ICT (YMT), PHY (FHM)[cite: 35, 36] |

---

## 🙏 致謝 (Credits)

* **開發者**：LTF (LTF IT Team)[cite: 36, 37]
* **AI 協助**：Google Gemini 3.6 Flash Extended（邏輯與建議）、GPT 6 Astra（訊息範本最佳化）[cite: 36]

---
