/**
 * @Extension Fuck.SMS
 * @description Better SMS
 * @version 1.2
 * @author LTF
 */

function scrapeEClassData() {
    // 1. 留堂狀態檢查
    let detentionInfo = {
        needDetention: false,
        text: "毋須留堂",
        countText: "0"
    };

    const bodyText = document.body.innerText || "";
    if (bodyText.includes("需要留堂") || (bodyText.includes("留堂") && !bodyText.includes("毋須留堂"))) {
        detentionInfo.needDetention = true;
        detentionInfo.text = "你有即將進行的留堂班，請留意！";
    }

    // 2. 功課列表抓取 (相容更多表格欄位)
    let homeworkList = [];
    const tables = document.querySelectorAll("table");

    tables.forEach(table => {
        const rows = table.querySelectorAll("tr");
        rows.forEach(row => {
            const cols = row.querySelectorAll("td, th");
            if (cols.length >= 3) {
                const col0 = cols[0].innerText.trim(); // 日期
                const col1 = cols[1].innerText.trim(); // 科目
                const col2 = cols[2].innerText.trim(); // 內容
                // 若 eClass 表格有第 4、5 欄（例如：老師、繳交時間）
                const col3 = cols.length > 3 ? cols[3].innerText.trim() : "";
                const col4 = cols.length > 4 ? cols[4].innerText.trim() : "";

                const isDate = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(col0);
                
                if (isDate && col1 !== "科目") {
                    const exists = homeworkList.some(r => r.date === col0 && r.subject === col1 && r.content === col2);
                    if (!exists) {
                        homeworkList.push({
                            date: col0,
                            subject: col1,
                            content: col2,
                            teacher: col3 || "無",
                            time: col4 || "全日"
                        });
                    }
                }
            }
        });
    });

    // 3. 記錄「抓取當時」的時間戳記
    const now = new Date();
    const month = String(now.getMonth() + 1);
    const date = String(now.getDate());
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const lastUpdatedStr = `${month}/${date} ${hours}:${minutes}`;

    // 4. 寫入 Storage (統一使用 homeworkList、lastUpdated 與 isSynced 狀態)
    chrome.storage.local.set({ 
        detentionInfo, 
        homeworkList, 
        lastUpdated: lastUpdatedStr,
        isSynced: true 
    }, () => {
        console.log("[Fuck.SMS] Sync Complete at", lastUpdatedStr, { detentionInfo, homeworkList });
    });
}

// 頁面載入後執行
window.addEventListener('load', scrapeEClassData);
scrapeEClassData();

// 防抖動態載入監聽
let debounceTimer = null;
const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scrapeEClassData, 600);
});

if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
}