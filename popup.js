/**
 * @Extension Fuck.SMS
 * @Filetype Database
 * @description Better SMS
 * @version 1.4 beta
 * @author LTF
 * @copyright Copyright (c) 2026 LTF IT Team. All rights reserved.
 * @credits Special thanks to Google Gemini 3.6 Flash Extended for suggestions and GPT 5.5 for optimizing the professional message templates.
 *
 * FIXED:
 *  - Sync badge now reflects reality: 🔴 never synced / 🟢 synced / 🟠 stale.
 *  - "立即同步" button injects content.js into EVERY frame of the active SMS
 *    tab, runs the scraper, merges the results and saves them.
 *  - Popup re-renders live when content.js writes new data (storage.onChanged).
 *  - parseHWDate accepts d/m/yyyy, dd-mm-yyyy and yyyy-mm-dd.
 *  - Default date filter set to "NEXT_SCHOOL_DAY".
 */

const SMS_ORIGIN = "https://sms.twghlkss.edu.hk/";
const STALE_MS = 24 * 60 * 60 * 1000;

let rawHomeworkList = [];
let completedHomeworkMap = {};
let savedState = { dateFilter: 'NEXT_SCHOOL_DAY', student: 'CUSTOM', mathGroup: 'ALL', x1: 'ALL', x2: 'ALL', x3: 'ALL' };

// Database
const STUDENTS_DATABASE = [];

const MATH_MAP = {
  Gp1: { teacher: 'CPC', gp: 'GP1' }, Gp2: { teacher: 'SYT', gp: 'GP2' }, Gp3: { teacher: 'AWY', gp: 'GP3' },
  Gp4: { teacher: 'NOK', gp: 'GP4' }, Gp5: { teacher: 'TKP', gp: 'GP5' }, Gp6: { teacher: 'HWS', gp: 'GP6' }
};
const ALL_MATH_TEACHERS = Object.values(MATH_MAP).map(m => m.teacher);

const X1_MAP = {
  PHY:  { teacher: 'LWY', names: ['PHYSICS', '物理'] },
  CHEM: { teacher: 'LCO', names: ['CHEMISTRY', '化學'] },
  HIST: { teacher: 'TKY', names: ['HISTORY', '歷史', 'HIST'] },
  CHIS: { teacher: 'HKC', names: ['CHINESE HISTORY', '中史'] },
  JAP:  { teacher: 'ATH', names: ['JAPANESE', '日語', '日文'] },
  ECON: { teacher: 'TYN', names: ['ECONOMICS', '經濟'] }
};
const ALL_X1_TEACHERS = Object.values(X1_MAP).map(x => x.teacher);

const X2_MAP = {
  BAFS: { teacher: 'TPY', names: ['BAFS', '企會財'] },
  BIO:  { teacher: 'YSL', names: ['BIOLOGY', '生物'] },
  CHEM: { teacher: 'PTW', names: ['CHEMISTRY', '化學'] },
  CHIS: { teacher: 'WCL', names: ['CHINESE HISTORY', '中史'] },
  TH:   { teacher: 'CLY', names: ['TOURISM', '旅游', '旅遊', 'THS'] },
  VA:   { teacher: 'LNF', names: ['VISUAL ARTS', '視藝', '視覺藝術', 'VAD'] }
};
const ALL_X2_TEACHERS = Object.values(X2_MAP).map(x => x.teacher);

const X3_MAP = {
  BIO:  { teacher: 'NWK', names: ['BIOLOGY', '生物'] },
  ECON: { teacher: 'LYK', names: ['ECONOMICS', '經濟'] },
  GEOG: { teacher: 'LHH', names: ['GEOGRAPHY', '地理'] },
  HIST: { teacher: 'ATH', names: ['HISTORY', '歷史'] },
  ICT:  { teacher: 'YMT', names: ['ICT', '資訊科技', '電腦'] },
  PHY:  { teacher: 'FHM', names: ['PHYSICS', '物理'] }
};
const ALL_X3_TEACHERS = Object.values(X3_MAP).map(x => x.teacher);

// ---------- Sync status UI ----------
let syncStatusEl, lastUpdatedEl, syncMsgEl, syncBtn;

function renderSyncStatus(data) {
  const { lastUpdated, syncedAt, syncError, homeworkList } = data;
  lastUpdatedEl.textContent = `最後更新：${lastUpdated || '--'}`;

  if (syncError) {
    syncStatusEl.className = 'sync-badge error';
    syncStatusEl.textContent = '🔴 同步失敗';
    return;
  }
  if (!syncedAt) {
    syncStatusEl.className = 'sync-badge error';
    syncStatusEl.textContent = '🔴 未同步';
    return;
  }
  if (Date.now() - syncedAt > STALE_MS) {
    syncStatusEl.className = 'sync-badge stale';
    syncStatusEl.textContent = '🟠 資料可能過期';
    return;
  }
  syncStatusEl.className = 'sync-badge synced';
  syncStatusEl.textContent = `🟢 已同步 (${(homeworkList || []).length} 項)`;
}

function setSyncMsg(text, ok = false) {
  syncMsgEl.textContent = text || '';
  syncMsgEl.className = 'sync-msg' + (ok ? ' ok' : '');
}

function nowLabel() {
  const n = new Date();
  return `${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

// ---------- Manual sync ----------
async function syncNow() {
  syncBtn.disabled = true;
  syncStatusEl.className = 'sync-badge syncing';
  syncStatusEl.textContent = '🟠 同步中...';
  setSyncMsg('');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('找不到目前分頁。');
    if (!tab.url || !tab.url.startsWith(SMS_ORIGIN)) {
      throw new Error('請先在目前分頁開啟 SMS 功課頁面 (sms.twghlkss.edu.hk)，再按「立即同步」。');
    }

    // 1) Make sure content.js exists in every frame (harmless if already there).
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });

    // 2) Run the scraper in every frame and collect results.
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => (window.__fuckSms ? window.__fuckSms.scrape() : null)
    });

    const results = injected.map(r => r && r.result).filter(Boolean);
    if (results.length === 0) throw new Error('無法在頁面中執行擷取程式。請重新整理 SMS 頁面後再試。');

    // 3) Merge: union of all frames' homework, de-duplicated.
    const merged = [];
    const seen = new Set();
    let detentionInfo = { needDetention: false, text: '毋須留堂', countText: '0' };
    let sourceUrl = tab.url;
    let bestCount = -1;
    for (const r of results) {
      for (const hw of r.homeworkList || []) {
        const key = `${hw.date}|${hw.subject}|${hw.content}`;
        if (!seen.has(key)) { seen.add(key); merged.push(hw); }
      }
      if (r.detentionInfo && r.detentionInfo.needDetention) detentionInfo = r.detentionInfo;
      if ((r.homeworkList || []).length > bestCount) { bestCount = r.homeworkList.length; sourceUrl = r.url; }
    }

    const anyHomeworkPage = results.some(r => r.looksLikeHomeworkPage);
    if (merged.length === 0 && !anyHomeworkPage) {
      throw new Error(`已檢查 ${results.length} 個框架，但找不到功課表格。\n請確認目前頁面是「功課 / Homework」列表頁。`);
    }

    await chrome.storage.local.set({
      homeworkList: merged,
      detentionInfo,
      lastUpdated: nowLabel(),
      syncedAt: Date.now(),
      syncSource: sourceUrl,
      syncError: '',
      isSynced: true
    });

    rawHomeworkList = merged;
    renderSyncStatus({ lastUpdated: nowLabel(), syncedAt: Date.now(), homeworkList: merged });
    setSyncMsg(`✅ 同步成功：擷取到 ${merged.length} 項功課 (${results.length} 個框架)。`, true);
    applyAllFilters();
  } catch (err) {
    const msg = (err && err.message) || String(err);
    await chrome.storage.local.set({ syncError: msg });
    syncStatusEl.className = 'sync-badge error';
    syncStatusEl.textContent = '🔴 同步失敗';
    setSyncMsg('❌ ' + msg);
  } finally {
    syncBtn.disabled = false;
  }
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  const profileAccordion = document.getElementById('profile-accordion');
  const currentStudentTag = document.getElementById('current-student-tag');
  const studentSelect = document.getElementById('profile-student');
  const mathSelect = document.getElementById('profile-math');
  const x1Select = document.getElementById('profile-x1');
  const x2Select = document.getElementById('profile-x2');
  const x3Select = document.getElementById('profile-x3');

  syncStatusEl = document.getElementById('sync-status');
  lastUpdatedEl = document.getElementById('last-updated');
  syncMsgEl = document.getElementById('sync-msg');
  syncBtn = document.getElementById('sync-btn');
  syncBtn.addEventListener('click', syncNow);

  STUDENTS_DATABASE.forEach((stu, index) => {
    const opt = document.createElement('option');
    opt.value = index;
    opt.textContent = stu.name;
    studentSelect.appendChild(opt);
  });

  chrome.storage.local.get(
    ['savedState', 'homeworkList', 'completedHomeworkMap', 'lastUpdated', 'syncedAt', 'syncError', 'syncSource'],
    (result) => {
      if (result.savedState) savedState = { ...savedState, ...result.savedState };

      // 自動將舊紀錄中已刪除的 'ALL'、'TODAY' 或空值重置為 'NEXT_SCHOOL_DAY'
      if (!savedState.dateFilter || savedState.dateFilter === 'ALL' || savedState.dateFilter === 'TODAY') {
        savedState.dateFilter = 'NEXT_SCHOOL_DAY';
      }

      rawHomeworkList = result.homeworkList || [];
      completedHomeworkMap = result.completedHomeworkMap || {};

      renderSyncStatus(result);
      if (result.syncError) setSyncMsg('❌ 上次同步失敗：' + result.syncError);
      else if (!result.syncedAt) setSyncMsg('尚未擷取過資料。請開啟 SMS 功課頁面，然後按「立即同步」。');

      restoreDateFilterUI(savedState.dateFilter);
      studentSelect.value = savedState.student ?? 'CUSTOM';
      mathSelect.value = savedState.mathGroup || 'ALL';
      x1Select.value = savedState.x1 || 'ALL';
      x2Select.value = savedState.x2 || 'ALL';
      x3Select.value = savedState.x3 || 'ALL';

      updateHeaderStudentName();
      applyAllFilters();
    }
  );

  // Live update when content.js writes new data while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.homeworkList) rawHomeworkList = changes.homeworkList.newValue || [];
    if (changes.homeworkList || changes.syncedAt || changes.lastUpdated || changes.syncError) {
      chrome.storage.local.get(['lastUpdated', 'syncedAt', 'syncError', 'homeworkList'], renderSyncStatus);
      applyAllFilters();
    }
  });

  function updateHeaderStudentName() {
    const val = studentSelect.value;
    if (val !== 'CUSTOM' && STUDENTS_DATABASE[val]) {
      currentStudentTag.textContent = STUDENTS_DATABASE[val].name.split(' ')[0];
    } else {
      currentStudentTag.textContent = '自訂模式';
    }
  }

  studentSelect.addEventListener('change', () => {
    const selectedVal = studentSelect.value;
    savedState.student = selectedVal;
    if (selectedVal !== 'CUSTOM') {
      const stuInfo = STUDENTS_DATABASE[selectedVal];
      if (stuInfo) {
        mathSelect.value = stuInfo.math; x1Select.value = stuInfo.x1; x2Select.value = stuInfo.x2; x3Select.value = stuInfo.x3;
        savedState.mathGroup = stuInfo.math; savedState.x1 = stuInfo.x1; savedState.x2 = stuInfo.x2; savedState.x3 = stuInfo.x3;
      }
    }
    updateHeaderStudentName();
    saveCurrentState();
    applyAllFilters();
    if (profileAccordion) profileAccordion.removeAttribute('open');
  });

  [mathSelect, x1Select, x2Select, x3Select].forEach(el => {
    el.addEventListener('change', () => {
      studentSelect.value = 'CUSTOM';
      savedState.student = 'CUSTOM';
      savedState.mathGroup = mathSelect.value;
      savedState.x1 = x1Select.value;
      savedState.x2 = x2Select.value;
      savedState.x3 = x3Select.value;
      updateHeaderStudentName();
      saveCurrentState();
      applyAllFilters();
    });
  });

  document.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filterType = e.target.dataset.dateFilter;
      savedState.dateFilter = filterType;
      restoreDateFilterUI(filterType);
      saveCurrentState();
      applyAllFilters();
    });
  });
});

function saveCurrentState() { chrome.storage.local.set({ savedState }); }
function saveCompletedHomeworkMap() { chrome.storage.local.set({ completedHomeworkMap }); }
function getHWUniqueId(hw) { return `${hw.date || ''}_${hw.subject || ''}_${hw.content || ''}_${hw.teacher || ''}`; }

function restoreDateFilterUI(filterType) {
  document.querySelectorAll('.date-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dateFilter === filterType);
  });
}

function getNextSchoolDay(fromDate = new Date()) {
  const target = new Date(fromDate);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 1);
  if (target.getDay() === 6) target.setDate(target.getDate() + 2);
  else if (target.getDay() === 0) target.setDate(target.getDate() + 1);
  return target;
}

// Accepts "5/3/2026", "05-03-2026", "2026-03-05", "05/03/2026 (四)"
function parseHWDate(dateStr) {
  if (!dateStr) return null;
  let m = dateStr.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = dateStr.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function applyAllFilters() {
  let filtered = [...rawHomeworkList];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (savedState.dateFilter === 'TODAY') {
    filtered = filtered.filter(item => { const d = parseHWDate(item.date); return d && d.getTime() === today.getTime(); });
  } else if (savedState.dateFilter === 'NEXT_SCHOOL_DAY') {
    const nextSchoolDay = getNextSchoolDay(today);
    filtered = filtered.filter(item => { const d = parseHWDate(item.date); return d && d.getTime() === nextSchoolDay.getTime(); });
  } else if (savedState.dateFilter === 'NEXT_7_DAYS') {
    const next7Days = new Date(today);
    next7Days.setDate(next7Days.getDate() + 7);
    filtered = filtered.filter(item => { const d = parseHWDate(item.date); return d && d >= today && d <= next7Days; });
  }

  filtered = filtered.filter(item => {
    const subject = (item.subject || '').toUpperCase();
    const teacher = (item.teacher || '').toUpperCase();
    const content = (item.content || '').toUpperCase();

    const isMath = subject.includes('MATH') || subject.includes('數');
    if (isMath) {
      if (savedState.mathGroup !== 'ALL') {
        const myMathInfo = MATH_MAP[savedState.mathGroup];
        if (!myMathInfo) return true;
        const targetTeacher = myMathInfo.teacher;
        const targetGp = myMathInfo.gp;
        const isOtherTeacher = ALL_MATH_TEACHERS.some(t => t !== targetTeacher && (teacher.includes(t) || content.includes(t)));
        const isOtherGroup = Object.values(MATH_MAP).some(m => m.gp !== targetGp && content.includes(m.gp));
        if (isOtherTeacher || isOtherGroup) return false;
        if (teacher !== '' && !teacher.includes(targetTeacher) && ALL_MATH_TEACHERS.includes(teacher)) return false;
      }
      return true;
    }

    const isX1 = content.startsWith('X1') || ALL_X1_TEACHERS.some(t => teacher.includes(t));
    if (isX1) {
      if (savedState.x1 !== 'ALL') {
        const myX1 = X1_MAP[savedState.x1];
        if (myX1) {
          const matchTeacher = teacher.includes(myX1.teacher) || content.includes(myX1.teacher);
          const matchName = myX1.names.some(n => subject.includes(n) || content.includes(n));
          if (!matchTeacher && !matchName) return false;
        }
      }
      return true;
    }

    const isX2 = content.startsWith('X2') || ALL_X2_TEACHERS.some(t => teacher.includes(t));
    if (isX2) {
      if (savedState.x2 !== 'ALL') {
        const myX2 = X2_MAP[savedState.x2];
        if (myX2) {
          const matchTeacher = teacher.includes(myX2.teacher) || content.includes(myX2.teacher);
          const matchName = myX2.names.some(n => subject.includes(n) || content.includes(n));
          if (!matchTeacher && !matchName) return false;
        }
      }
      return true;
    }

    const isX3 = content.startsWith('X3') || ALL_X3_TEACHERS.some(t => teacher.includes(t));
    if (isX3) {
      if (savedState.x3 !== 'ALL') {
        const myX3 = X3_MAP[savedState.x3];
        if (myX3) {
          const matchTeacher = teacher.includes(myX3.teacher) || content.includes(myX3.teacher);
          const matchName = myX3.names.some(n => subject.includes(n) || content.includes(n));
          if (!matchTeacher && !matchName) return false;
        }
      }
      return true;
    }
    return true;
  });

  renderHomeworkList(filtered);
}

function renderHomeworkList(list) {
  const listContainer = document.getElementById('hw-list');
  const countBadge = document.getElementById('hw-count');
  countBadge.textContent = `${list.length} 項`;

  if (list.length === 0) {
    if (rawHomeworkList.length === 0) {
      listContainer.innerHTML = '<div class="empty">尚無功課資料。<br>請開啟 <a id="open-sms">SMS 功課頁面</a>，然後按上方「🔄 立即同步」。</div>';
      const link = document.getElementById('open-sms');
      if (link) link.addEventListener('click', () => chrome.tabs.create({ url: SMS_ORIGIN }));
    } else {
      listContainer.innerHTML = '<div class="empty">沒有相關功課！</div>';
    }
    return;
  }

  listContainer.innerHTML = '';
  list.forEach(hw => {
    const hwId = getHWUniqueId(hw);
    const isDone = !!completedHomeworkMap[hwId];
    const card = document.createElement('div');
    card.className = `hw-card ${isDone ? 'completed' : ''}`;
    card.dataset.hwId = hwId;
    card.innerHTML = `
      <div class="hw-header">
        <label class="hw-check-title">
          <input type="checkbox" class="hw-checkbox" ${isDone ? 'checked' : ''}>
          <span class="subject">${escapeHtml(hw.subject)}</span>
        </label>
        <span class="date-badge">📅 ${escapeHtml(hw.date)}</span>
      </div>
      <div class="content">${escapeHtml(hw.content)}</div>
      <div class="footer">
        <span>⏱️ ${escapeHtml(hw.time || '未指定時間')}</span>
        <span>老師：${escapeHtml(hw.teacher || '無')}</span>
      </div>`;
    card.querySelector('.hw-checkbox').addEventListener('change', (e) => {
      if (e.target.checked) { completedHomeworkMap[hwId] = true; card.classList.add('completed'); }
      else { delete completedHomeworkMap[hwId]; card.classList.remove('completed'); }
      saveCompletedHomeworkMap();
    });
    listContainer.appendChild(card);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}