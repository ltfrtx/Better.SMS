/**
 * @Extension Fuck.SMS
 * @description Better SMS
 * @version 1.3
 * @author LTF
 *
 * FIXED:
 *  - Runs in every frame (see manifest "all_frames": true) so the homework
 *    table inside an <iframe> is actually scraped.
 *  - Never overwrites good data with an empty list scraped from a page that
 *    is not the homework page (menu / login / half-loaded page).
 *  - Detects the table columns from the header row instead of assuming a
 *    fixed column order; accepts d/m/yyyy, yyyy-mm-dd and "05/03/2026 (四)".
 *  - Exposes window.__fuckSms.scrape() so the popup can force a sync via
 *    chrome.scripting.executeScript and get the result back.
 *  - Guards against double-injection.
 */

(function () {
  if (window.__fuckSms) return; // already injected in this frame

  const DATE_DMY = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/;
  const DATE_YMD = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/;

  const HEADER_KEYS = {
    date: ["日期", "繳交日期", "date", "due"],
    subject: ["科目", "subject"],
    content: ["功課", "內容", "homework", "content", "description", "題目", "標題"],
    teacher: ["老師", "教師", "teacher"],
    time: ["時間", "time", "節"],
  };

  function normDate(text) {
    if (!text) return null;
    let m = text.match(DATE_YMD);
    if (m) return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`;
    m = text.match(DATE_DMY);
    if (m) return `${parseInt(m[1], 10)}/${parseInt(m[2], 10)}/${m[3]}`;
    return null;
  }

  function cellText(cell) {
    return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Try to figure out which column is which from a header row.
  function detectColumns(table) {
    const rows = table.querySelectorAll("tr");
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("th, td"));
      if (cells.length < 3) continue;
      const texts = cells.map((c) => cellText(c).toLowerCase());
      const map = {};
      for (const key of Object.keys(HEADER_KEYS)) {
        const idx = texts.findIndex((t) => HEADER_KEYS[key].some((k) => t.includes(k.toLowerCase())));
        if (idx >= 0) map[key] = idx;
      }
      if (map.subject !== undefined && (map.content !== undefined || map.date !== undefined)) {
        return { map, headerRow: row };
      }
    }
    return null;
  }

  function scrapeTable(table, list) {
    const detected = detectColumns(table);
    const map = detected
      ? detected.map
      : { date: 0, subject: 1, content: 2, teacher: 3, time: 4 };
    const headerRow = detected ? detected.headerRow : null;

    table.querySelectorAll("tr").forEach((row) => {
      if (row === headerRow) return;
      if (row.querySelector("table")) return; // nested layout table, skip
      const cols = Array.from(row.querySelectorAll(":scope > td, :scope > th"));
      if (cols.length < 3) return;

      const get = (key) => (map[key] !== undefined && cols[map[key]] ? cellText(cols[map[key]]) : "");

      const rawDate = get("date") || cellText(cols[0]);
      const date = normDate(rawDate) || normDate(cellText(row));
      const subject = get("subject");
      const content = get("content");
      if (!date || !subject || subject === "科目" || subject.toLowerCase() === "subject") return;
      if (!content && !get("teacher")) return;

      const item = {
        date,
        subject,
        content: content || "(無內容)",
        teacher: get("teacher") || "無",
        time: get("time") || "全日",
      };
      const dup = list.some(
        (r) => r.date === item.date && r.subject === item.subject && r.content === item.content
      );
      if (!dup) list.push(item);
    });
  }

  function scrape() {
    const bodyText = document.body ? document.body.innerText || "" : "";

    const detentionInfo = { needDetention: false, text: "毋須留堂", countText: "0" };
    if (bodyText.includes("需要留堂") || (bodyText.includes("留堂") && !bodyText.includes("毋須留堂"))) {
      detentionInfo.needDetention = true;
      detentionInfo.text = "你有即將進行的留堂班，請留意！";
    }

    const homeworkList = [];
    const tables = Array.from(document.querySelectorAll("table"));
    let looksLikeHomeworkPage = false;
    tables.forEach((table) => {
      if (detectColumns(table)) looksLikeHomeworkPage = true;
      scrapeTable(table, homeworkList);
    });
    if (/功課|homework/i.test(document.title || "")) looksLikeHomeworkPage = true;

    return {
      homeworkList,
      detentionInfo,
      looksLikeHomeworkPage,
      url: location.href,
      isTop: window.top === window,
    };
  }

  function nowLabel() {
    const n = new Date();
    return `${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, "0")}:${String(
      n.getMinutes()
    ).padStart(2, "0")}`;
  }

  function persist(result) {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.set(
      {
        homeworkList: result.homeworkList,
        detentionInfo: result.detentionInfo,
        lastUpdated: nowLabel(),
        syncedAt: Date.now(),
        syncSource: result.url,
        syncError: "",
        isSynced: true,
      },
      () => console.log("[Fuck.SMS] Synced", result.homeworkList.length, "items from", result.url)
    );
  }

  let lastSignature = null;
  function autoScrape() {
    const result = scrape();
    // Only persist if we actually found homework, or we're sure this is the
    // homework page (so an empty list is genuinely "no homework").
    if (result.homeworkList.length === 0 && !result.looksLikeHomeworkPage) return;
    const sig = JSON.stringify(result.homeworkList);
    if (sig === lastSignature) return; // nothing changed, don't spam storage
    lastSignature = sig;
    persist(result);
  }

  window.__fuckSms = { scrape, persist, autoScrape, version: "1.68.0" };

  if (document.readyState === "complete") autoScrape();
  else window.addEventListener("load", autoScrape);
  autoScrape();

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(autoScrape, 600);
  });
  const startObserver = () => document.body && observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) startObserver();
  else document.addEventListener("DOMContentLoaded", startObserver);

  // Allow the popup to ask for a scrape via messaging as well.
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "FUCK_SMS_SCRAPE") {
        sendResponse(scrape());
      }
    });
  }
})();

// 67
// 67 67
// 67 67 67 67
// 67 67 67 67 67 67

//                             ╱|、
//                        (˚ˎ 。7  
//                         |、˜〵          
//                        じしˍ,)ノ