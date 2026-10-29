/**
 * @Extension Fuck.SMS
 * @Filetype Database
 * @description Better SMS
 * @version 1.2
 * @author LTF
 * @copyright Copyright (c) 2026 LTF IT Team. All rights reserved.
 * @credits Special thanks to Google Gemini 3.6 Flash Extended for suggestions and GPT 5.5 for optimizing the professional message templates.
 */


let rawHomeworkList = [];
let completedHomeworkMap = {};
let savedState = {
    dateFilter: 'ALL',
    student: 'CUSTOM',
    mathGroup: 'ALL',
    x1: 'ALL',
    x2: 'ALL',
    x3: 'ALL'
};

// Database
const STUDENTS_DATABASE = [];

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

    // M1. 動態Load學生選單
    STUDENTS_DATABASE.forEach((stu, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = stu.name;
        studentSelect.appendChild(opt);
    });

    // 2. Read 儲存資料與同步狀態
    chrome.storage.local.get(['savedState', 'homeworkList', 'completedHomeworkMap', 'lastUpdated', 'isSynced'], (result) => {
        if (result.savedState) {
            savedState = { ...savedState, ...result.savedState };
        }
        rawHomeworkList = result.homeworkList || [];
        completedHomeworkMap = result.completedHomeworkMap || {};

        // Update time
        if (result.lastUpdated) {
            lastUpdatedEl.textContent = `最後更新：${result.lastUpdated}`;
        } else {
            // Fallback
            const now = new Date();
            const timeStr = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            lastUpdatedEl.textContent = `最後更新：${timeStr}`;
        }

        const isSynced = result.isSynced !== false; // Default SYNC
        if (isSynced) {
            syncStatusEl.className = 'sync-badge synced';
            syncStatusEl.innerHTML = '🟢 已同步';
        } else {
            syncStatusEl.className = 'sync-badge syncing';
            syncStatusEl.innerHTML = '🟠 同步中...';
        }

        restoreDateFilterUI(savedState.dateFilter);
        studentSelect.value = savedState.student ?? 'CUSTOM';
        mathSelect.value = savedState.mathGroup || 'ALL';
        x1Select.value = savedState.x1 || 'ALL';
        x2Select.value = savedState.x2 || 'ALL';
        x3Select.value = savedState.x3 || 'ALL';

        updateHeaderStudentName();
        applyAllFilters();
    });

    // 更新 Header 顯示的學生姓名
    function updateHeaderStudentName() {
        const val = studentSelect.value;
        if (val !== 'CUSTOM' && STUDENTS_DATABASE[val]) {
            currentStudentTag.textContent = STUDENTS_DATABASE[val].name.split(' ')[0]; // 顯示中文簡稱
        } else {
            currentStudentTag.textContent = '自訂模式';
        }
    }

    // 3. 切換學生名稱事件
    studentSelect.addEventListener('change', () => {
        const selectedVal = studentSelect.value;
        savedState.student = selectedVal;

        if (selectedVal !== 'CUSTOM') {
            const stuInfo = STUDENTS_DATABASE[selectedVal];
            if (stuInfo) {
                mathSelect.value = stuInfo.math;
                x1Select.value = stuInfo.x1;
                x2Select.value = stuInfo.x2;
                x3Select.value = stuInfo.x3;

                savedState.mathGroup = stuInfo.math;
                savedState.x1 = stuInfo.x1;
                savedState.x2 = stuInfo.x2;
                savedState.x3 = stuInfo.x3;
            }
        }

        updateHeaderStudentName();
        saveCurrentState();
        applyAllFilters();

        // New update
        if (profileAccordion) {
            profileAccordion.removeAttribute('open');
        }
    });

    // 4. 手動調整選科事件
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

    // 5. 日期按鈕切換
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

function parseHWDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.split(' ')[0].trim();
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return null;
}

function applyAllFilters() {
    let filtered = [...rawHomeworkList];

    // --- 日期過濾 ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (savedState.dateFilter === 'TODAY') {
        filtered = filtered.filter(item => {
            const d = parseHWDate(item.date);
            return d && d.getTime() === today.getTime();
        });
    } else if (savedState.dateFilter === 'NEXT_SCHOOL_DAY') {
        const nextSchoolDay = getNextSchoolDay(today);
        filtered = filtered.filter(item => {
            const d = parseHWDate(item.date);
            return d && d.getTime() === nextSchoolDay.getTime();
        });
    } else if (savedState.dateFilter === 'NEXT_7_DAYS') {
        const next7Days = new Date(today);
        next7Days.setDate(next7Days.getDate() + 7);
        filtered = filtered.filter(item => {
            const d = parseHWDate(item.date);
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
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}