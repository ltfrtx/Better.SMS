/**
 * @Extension Better.SMS
 * @Filetype Popup
 * @description Better SMS
 * @version 1.3.0
 * @author LTF
 * @copyright Copyright (c) 2026 LTF IT Team. All rights reserved.
 */


let rawHomeworkList = [];
let completedHomeworkMap = {};
let lastUpdated = '';
const DATE_UTILS = globalThis.BetterSMSDateUtils;
let savedState = {
    dateFilter: 'ALL',
    student: 'CUSTOM',
    mathGroup: 'ALL',
    x1: 'ALL',
    x2: 'ALL',
    x3: 'ALL'
};

// Database
const STUDENTS_DATABASE = [
    { name: "曹可涵 CAO HO HAM", math: "Gp3", x1: "CHEM", x2: "BIO", x3: "GEOG" },
    { name: "陳樂桐 CHAN LOK TUNG", math: "Gp6", x1: "HIST", x2: "CHIS", x3: "PHY" },
    { name: "陳穎錡 CHAN WING KEI", math: "Gp3", x1: "ECON", x2: "BIO", x3: "GEOG" },
    { name: "陳旭峰 CHAN YUK FUNG", math: "Gp5", x1: "CHEM", x2: "BIO", x3: "PHY" },
    { name: "陳奕君 CHEN YIJUN", math: "Gp4", x1: "HIST", x2: "CHIS", x3: "ECON" },
    { name: "程經緯 CHENG QIN GANG", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "朱俊龍 CHU ANTHONY CHUN LUNG", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "ICT" },
    { name: "鍾霈葳 CHUNG PUI WAI", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "杜甄朗 DU ZHEN LANG KINGSLEY", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "ICT" },
    { name: "樊洛而 FAN LOK YEE", math: "Gp2", x1: "CHIS", x2: "BAFS", x3: "ECON" },
    { name: "黃昊天 HUANG HAOTIAN", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "黃思悅 HUANG SZE YUET", math: "Gp1", x1: "CHEM", x2: "BIO", x3: "GEOG" },
    { name: "黃智謙 HUANG ZHIQIAN", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "林浚方 LAM TSUN FONG", math: "Gp5", x1: "PHY", x2: "TH", x3: "ICT" },
    { name: "劉清彥 LAU CHING YIN", math: "Gp1", x1: "CHEM", x2: "BIO", x3: "ICT" },
    { name: "李靜琳 LEE CHING LAM", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "李思翰 LI AARON", math: "Gp2", x1: "CHEM", x2: "BIO", x3: "PHY" },
    { name: "李雨倩 LI YUQIAN", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "林允慈 LIN WAN CHI", math: "Gp6", x1: "ECON", x2: "TH", x3: "GEOG" },
    { name: "廖綺藍 LIU YEE LAM", math: "Gp1", x1: "CHEM", x2: "BIO", x3: "GEOG" },
    { name: "盧晉宇 LO CHUN YU", math: "Gp4", x1: "CHEM", x2: "BIO", x3: "PHY" },
    { name: "駱俊杰 LOK CHUN KIT", math: "Gp5", x1: "PHY", x2: "CHEM", x3: "GEOG" },
    { name: "呂振振 LU CHUN CHUN", math: "Gp1", x1: "HIST", x2: "BAFS", x3: "ECON" },
    { name: "丌潤曄 QI RUNYE", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "ICT" },
    { name: "石卓言 SHI CHEUK YIN", math: "Gp4", x1: "ECON", x2: "BAFS", x3: "GEOG" },
    { name: "石可唯 SHI HEDY", math: "Gp2", x1: "CHEM", x2: "BIO", x3: "GEOG" },
    { name: "石海澄 SHI TIFFANY", math: "Gp3", x1: "CHIS", x2: "TH", x3: "GEOG" },
    { name: "王春雪 WANG CHUN SUET", math: "Gp6", x1: "CHIS", x2: "TH", x3: "GEOG" },
    { name: "王容珍 WANG RONGZHEN", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "楊承恩 YEUNG SHING YAN", math: "Gp2", x1: "HIST", x2: "CHIS", x3: "GEOG" },
    { name: "尹櫟為 YIN LIK WAI", math: "Gp1", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "張馨文 ZHANG XINWEN", math: "Gp1", x1: "CHEM", x2: "VA", x3: "BIO" },
    { name: "趙浚誠 ZHAO CHUN SHING", math: "Gp2", x1: "PHY", x2: "CHEM", x3: "BIO" },
    { name: "祝沛天 ZHU PUI TIN", math: "Gp6", x1: "CHEM", x2: "BIO", x3: "PHY" }
];

const MATH_MAP = {
    Gp1: { teacher: 'CPC', gp: 'GP1' },
    Gp2: { teacher: 'SYT', gp: 'GP2' },
    Gp3: { teacher: 'AWY', gp: 'GP3' },
    Gp4: { teacher: 'NOK', gp: 'GP4' },
    Gp5: { teacher: 'TKP', gp: 'GP5' },
    Gp6: { teacher: 'HWS', gp: 'GP6' }
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
    TH:   { teacher: 'CLY', names: ['TOURISM', '旅航', '旅遊', 'THS'] },
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

document.addEventListener('DOMContentLoaded', () => {
    const profileAccordion = document.getElementById('profile-accordion');
    const currentStudentTag = document.getElementById('current-student-tag');
    const studentSelect = document.getElementById('profile-student');
    const mathSelect = document.getElementById('profile-math');
    const x1Select = document.getElementById('profile-x1');
    const x2Select = document.getElementById('profile-x2');
    const x3Select = document.getElementById('profile-x3');
    const syncStatusEl = document.getElementById('sync-status');
    const lastUpdatedEl = document.getElementById('last-updated');
    const devModeToggle = document.getElementById('dev-mode-toggle');
    const devModeState = document.getElementById('dev-mode-state');
    const devPanel = document.getElementById('dev-panel');
    const devDiagnostics = document.getElementById('dev-diagnostics');
    const devMessage = document.getElementById('dev-message');
    const brandTitle = document.getElementById('brand-title');

    let syncDiagnostics = null;
    let lastSyncError = '';
    let isSynced = null;
    let developerMode = false;

    STUDENTS_DATABASE.forEach((stu, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = stu.name;
        studentSelect.appendChild(option);
    });

    function updateHeaderStudentName() {
        const value = studentSelect.value;
        if (value !== 'CUSTOM' && STUDENTS_DATABASE[value]) {
            currentStudentTag.textContent = STUDENTS_DATABASE[value].name.split(' ')[0];
        } else {
            currentStudentTag.textContent = '自訂模式';
        }
    }

    function renderSyncStatus() {
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = `最後更新：${lastUpdated || '尚未同步'}`;
        }

        if (isSynced === true) {
            syncStatusEl.className = 'sync-badge synced';
            syncStatusEl.textContent = '🟢 已同步';
            syncStatusEl.removeAttribute('title');
        } else if (lastSyncError) {
            syncStatusEl.className = 'sync-badge error';
            syncStatusEl.textContent = '⚠️ 抓取異常';
            syncStatusEl.title = lastSyncError;
        } else if (isSynced === false) {
            syncStatusEl.className = 'sync-badge syncing';
            syncStatusEl.textContent = '🟠 等待同步';
            syncStatusEl.removeAttribute('title');
        } else {
            syncStatusEl.className = 'sync-badge pending';
            syncStatusEl.textContent = '🟠 等待 SMS 頁面';
            syncStatusEl.removeAttribute('title');
        }
    }

    function renderDeveloperTools() {
        devModeToggle.checked = developerMode;
        devModeState.textContent = developerMode ? '已啟用' : '關閉';
        devPanel.hidden = !developerMode;
        devDiagnostics.textContent = syncDiagnostics
            ? JSON.stringify(syncDiagnostics, null, 2)
            : '尚未收到同步診斷資料。請開啟 SMS 學生頁面，或按「重新抓取」。';
        if (lastSyncError && developerMode) {
            devMessage.textContent = lastSyncError;
        }
    }

    function applySavedState() {
        const validDateFilters = ['ALL', 'TODAY', 'NEXT_SCHOOL_DAY', 'NEXT_7_DAYS'];
        if (!validDateFilters.includes(savedState.dateFilter)) savedState.dateFilter = 'ALL';
        const validStudent = savedState.student === 'CUSTOM' ||
            (Number.isInteger(Number(savedState.student)) && STUDENTS_DATABASE[Number(savedState.student)]);
        if (!validStudent) savedState.student = 'CUSTOM';

        restoreDateFilterUI(savedState.dateFilter);
        studentSelect.value = String(savedState.student ?? 'CUSTOM');
        mathSelect.value = savedState.mathGroup || 'ALL';
        x1Select.value = savedState.x1 || 'ALL';
        x2Select.value = savedState.x2 || 'ALL';
        x3Select.value = savedState.x3 || 'ALL';
        updateHeaderStudentName();
    }

    function applyStorageResult(result) {
        if (result.savedState) savedState = { ...savedState, ...result.savedState };
        if (Array.isArray(result.homeworkList)) rawHomeworkList = result.homeworkList;
        if (result.completedHomeworkMap && typeof result.completedHomeworkMap === 'object') {
            completedHomeworkMap = result.completedHomeworkMap;
        }
        if (Object.prototype.hasOwnProperty.call(result, 'lastUpdated')) lastUpdated = result.lastUpdated || '';
        if (Object.prototype.hasOwnProperty.call(result, 'isSynced')) isSynced = result.isSynced;
        if (Object.prototype.hasOwnProperty.call(result, 'lastSyncError')) lastSyncError = result.lastSyncError || '';
        if (Object.prototype.hasOwnProperty.call(result, 'syncDiagnostics')) syncDiagnostics = result.syncDiagnostics || null;
        if (Object.prototype.hasOwnProperty.call(result, 'developerMode')) developerMode = Boolean(result.developerMode);

        applySavedState();
        renderSyncStatus();
        renderDeveloperTools();
        applyAllFilters();
    }

    chrome.storage.local.get([
        'savedState', 'homeworkList', 'completedHomeworkMap', 'lastUpdated',
        'isSynced', 'lastSyncError', 'syncDiagnostics', 'developerMode'
    ], result => {
        if (chrome.runtime.lastError) {
            syncStatusEl.className = 'sync-badge error';
            syncStatusEl.textContent = '⚠️ 無法讀取儲存資料';
            return;
        }
        applyStorageResult(result);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const updated = {};
        Object.keys(changes).forEach(key => {
            if (key === 'savedState' || key === 'homeworkList' || key === 'completedHomeworkMap' ||
                key === 'lastUpdated' || key === 'isSynced' || key === 'lastSyncError' ||
                key === 'syncDiagnostics' || key === 'developerMode') {
                updated[key] = changes[key].newValue;
            }
        });
        if (!Object.keys(updated).length) return;
        applyStorageResult(updated);
    });

    studentSelect.addEventListener('change', () => {
        const selectedValue = studentSelect.value;
        savedState.student = selectedValue;

        if (selectedValue !== 'CUSTOM') {
            const student = STUDENTS_DATABASE[selectedValue];
            if (student) {
                mathSelect.value = student.math;
                x1Select.value = student.x1;
                x2Select.value = student.x2;
                x3Select.value = student.x3;
                savedState.mathGroup = student.math;
                savedState.x1 = student.x1;
                savedState.x2 = student.x2;
                savedState.x3 = student.x3;
            }
        }

        updateHeaderStudentName();
        saveCurrentState();
        applyAllFilters();
        if (profileAccordion) profileAccordion.removeAttribute('open');
    });

    [mathSelect, x1Select, x2Select, x3Select].forEach(select => {
        select.addEventListener('change', () => {
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

    document.querySelectorAll('.date-btn').forEach(button => {
        button.addEventListener('click', event => {
            const filterType = event.currentTarget.dataset.dateFilter;
            savedState.dateFilter = filterType;
            restoreDateFilterUI(filterType);
            saveCurrentState();
            applyAllFilters();
        });
    });

    devModeToggle.addEventListener('change', () => {
        developerMode = devModeToggle.checked;
        renderDeveloperTools();
        chrome.storage.local.set({ developerMode }, () => {
            if (chrome.runtime.lastError) {
                devMessage.textContent = `儲存設定失敗：${chrome.runtime.lastError.message}`;
            } else {
                devMessage.textContent = developerMode ? '開發者模式已啟用。' : '開發者模式已關閉。';
            }
        });
    });

    document.getElementById('dev-refresh').addEventListener('click', () => {
        devMessage.textContent = '正在要求 SMS 頁面重新抓取…';
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (chrome.runtime.lastError || !tabs || !tabs[0] || tabs[0].id == null) {
                devMessage.textContent = '無法取得目前分頁。請先開啟 SMS 學生頁面。';
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { type: 'BETTER_SMS_SCRAPE_NOW' }, response => {
                const error = chrome.runtime.lastError;
                if (error || !response || !response.ok) {
                    devMessage.textContent = '找不到抓取程式。請重新載入 SMS 頁面後再試。';
                } else {
                    devMessage.textContent = '已要求重新抓取；診斷結果會在頁面穩定後更新。';
                }
            });
        });
    });

    document.getElementById('dev-copy').addEventListener('click', async () => {
        const diagnosticText = JSON.stringify(syncDiagnostics || {
            status: isSynced === true ? 'synced' : 'unknown',
            error: lastSyncError,
            lastUpdated: lastUpdated || null
        }, null, 2);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(diagnosticText);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = diagnosticText;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                const copied = document.execCommand('copy');
                textarea.remove();
                if (!copied) throw new Error('clipboard unavailable');
            }
            devMessage.textContent = '診斷資料已複製（不含功課內容）。';
        } catch (_error) {
            devMessage.textContent = '複製失敗，請手動選取診斷資料。';
        }
    });

    // Hidden Easter egg: click the product name five times in quick succession.
    let titleTapCount = 0;
    let titleTapTimer = null;
    let easterEggEnabled = false;
    function countTitleTap() {
        titleTapCount += 1;
        clearTimeout(titleTapTimer);
        titleTapTimer = setTimeout(() => { titleTapCount = 0; }, 1800);
        if (titleTapCount < 5) return;
        titleTapCount = 0;
        easterEggEnabled = !easterEggEnabled;
        brandTitle.textContent = easterEggEnabled ? 'Fuck.SMS' : 'Better.SMS';
    }
    brandTitle.addEventListener('click', countTitleTap);
    brandTitle.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            countTitleTap();
        }
    });
});

function saveCurrentState() {
    chrome.storage.local.set({ savedState });
}

function saveCompletedHomeworkMap() {
    chrome.storage.local.set({ completedHomeworkMap });
}

function getHWUniqueId(hw) {
    return `${hw.date || ''}_${hw.subject || ''}_${hw.content || ''}_${hw.teacher || ''}`;
}

function restoreDateFilterUI(filterType) {
    document.querySelectorAll('.date-btn').forEach(btn => {
        if (btn.dataset.dateFilter === filterType) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function getNextSchoolDay(fromDate = new Date()) {
    let target = new Date(fromDate);
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + 1);

    if (target.getDay() === 6) {
        target.setDate(target.getDate() + 2);
    } else if (target.getDay() === 0) {
        target.setDate(target.getDate() + 1);
    }
    return target;
}

function parseHWDate(itemOrDate) {
    if (!itemOrDate || !DATE_UTILS) return null;
    if (typeof itemOrDate === 'object') {
        const normalized = DATE_UTILS.fromDateKey(itemOrDate.dateISO);
        if (normalized) return normalized;
        return DATE_UTILS.parseHomeworkDate(itemOrDate.date);
    }
    return DATE_UTILS.parseHomeworkDate(itemOrDate);
}

function applyAllFilters() {
    let filtered = [...rawHomeworkList];

    // --- 日期過濾 ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (savedState.dateFilter === 'TODAY') {
        filtered = filtered.filter(item => {
            const d = parseHWDate(item);
            return d && d.getTime() === today.getTime();
        });
    } else if (savedState.dateFilter === 'NEXT_SCHOOL_DAY') {
        const nextSchoolDay = getNextSchoolDay(today);
        filtered = filtered.filter(item => {
            const d = parseHWDate(item);
            return d && d.getTime() === nextSchoolDay.getTime();
        });
    } else if (savedState.dateFilter === 'NEXT_7_DAYS') {
        const next7Days = new Date(today);
        next7Days.setDate(next7Days.getDate() + 7);
        filtered = filtered.filter(item => {
            const d = parseHWDate(item);
            return d && d >= today && d <= next7Days;
        });
    }

    // --- 選組過濾 ---
    filtered = filtered.filter(item => {
        const subject = (item.subject || '').toUpperCase();
        const teacher = (item.teacher || '').toUpperCase();
        const content = (item.content || '').toUpperCase();

        // 數學
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

        // X1
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

        // X2
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

        // X3
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
        listContainer.innerHTML = '<div class="empty">沒有相關功課！</div>';
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
            </div>
        `;

        const checkbox = card.querySelector('.hw-checkbox');
        checkbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked) {
                completedHomeworkMap[hwId] = true;
                card.classList.add('completed');
            } else {
                delete completedHomeworkMap[hwId];
                card.classList.remove('completed');
            }
            saveCompletedHomeworkMap();
        });

        listContainer.appendChild(card);
    });
}

function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
