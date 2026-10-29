/* global chrome, BetterSMSDateUtils, BetterSMSSubjectFilter, BetterSMSSmsClient */
(function runBetterSMSPopup() {
    'use strict';

    const DATE = BetterSMSDateUtils;
    const SUBJECT = BetterSMSSubjectFilter;
    const CLIENT = BetterSMSSmsClient;
    const VERSION = '1.7.0_beta_alpha';
    const SCHEMA_VERSION = 2;
    const DEFAULT_STATE = {
        dateFilter: 'ALL', customDate: '', fromDate: '',
        student: 'CUSTOM', mathGroup: 'ALL', x1: 'ALL', x2: 'ALL', x3: 'ALL',
        modules: 'ALL', viewMode: 'tabs', activeTab: 'homework'
    };
    // Retained from the original extension; every student can also use Custom.
    const STUDENTS_DATABASE = [];

    let state = { ...DEFAULT_STATE };
    let homework = [];
    let reminders = [];
    let completed = {};
    let cacheUsable = false;
    let lastUpdated = '';
    let sourceStartDate = '';
    let isSynced = null;
    let lastSyncError = '';
    let diagnostics = null;
    let developerMode = false;
    let isFetching = false;
    let uiMessage = '';
    let requestNumber = 0;
    let requestController = null;
    let requestFromDate = '';
    let stateSaveQueue = Promise.resolve();
    let completedSaveQueue = Promise.resolve();
    let commitQueue = Promise.resolve();
    let analysisTimer = null;
    const $ = id => document.getElementById(id);

    function normalizeState(input) {
        const value = { ...DEFAULT_STATE, ...(input || {}) };
        if (!['ALL', 'TODAY', 'NEXT_SCHOOL_DAY', 'NEXT_7_DAYS', 'NEXT_WEEK', 'CUSTOM'].includes(value.dateFilter)) value.dateFilter = 'ALL';
        if (!DATE.fromDateKey(value.customDate)) value.customDate = '';
        if (value.dateFilter === 'CUSTOM' && !value.customDate) value.dateFilter = 'ALL';
        if (!DATE.fromDateKey(value.fromDate)) value.fromDate = '';
        if (!Object.prototype.hasOwnProperty.call(SUBJECT.MATH, value.mathGroup)) value.mathGroup = 'ALL';
        for (const block of ['x1', 'x2', 'x3']) {
            if (!Object.prototype.hasOwnProperty.call(SUBJECT.ELECTIVES[block], value[block])) value[block] = 'ALL';
        }
        if (!['ALL', 'NONE', 'M1', 'M2', 'BOTH'].includes(value.modules)) value.modules = 'ALL';
        if (!['tabs', 'stacked'].includes(value.viewMode)) value.viewMode = 'tabs';
        if (!['homework', 'reminders'].includes(value.activeTab)) value.activeTab = 'homework';
        if (value.student !== 'CUSTOM' && !STUDENTS_DATABASE[Number(value.student)]) value.student = 'CUSTOM';
        return value;
    }

    function storageGet(keys) {
        return new Promise((resolve, reject) => chrome.storage.local.get(keys, result => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message)); else resolve(result || {});
        }));
    }
    function storageSet(values) {
        return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message)); else resolve();
        }));
    }
    function saveState() {
        const copy = { ...state };
        stateSaveQueue = stateSaveQueue.catch(() => {}).then(() => storageSet({ savedState: copy })).catch(error => {
            uiMessage = `設定未能儲存：${error.message}`;
            renderStatus();
        });
    }
    function saveCompleted() {
        const copy = { ...completed };
        completedSaveQueue = completedSaveQueue.catch(() => {}).then(() => storageSet({ completedHomeworkMap: copy })).catch(error => {
            uiMessage = `完成狀態未能儲存：${error.message}`;
            renderStatus();
        });
    }

    function todayKey() { return DATE.toDateKey(new Date()); }

    function expandForCurrentFilter() {
        const range = DATE.getFilterRange(state.dateFilter, new Date(), state.customDate);
        const earliestNeeded = range && range.start ? DATE.toDateKey(range.start) : '';
        const preferred = state.fromDate || todayKey();
        if (earliestNeeded && earliestNeeded < preferred) {
            state.fromDate = earliestNeeded;
            saveState();
        }
    }
    function requestedFromDate() {
        const preferred = DATE.fromDateKey(state.fromDate) ? state.fromDate : todayKey();
        const range = DATE.getFilterRange(state.dateFilter, new Date(), state.customDate);
        const required = range && range.start ? DATE.toDateKey(range.start) : '';
        return required && required < preferred ? required : preferred;
    }
    function maybeFetchEarlier() {
        expandForCurrentFilter();
        $('fetch-from-date').value = state.fromDate || todayKey();
        const required = requestedFromDate();
        // A request already in flight might otherwise replace an older cache
        // with a later range that cannot satisfy the newly selected date.
        if (!cacheUsable || !sourceStartDate || required < sourceStartDate ||
            (isFetching && requestFromDate && required < requestFromDate)) {
            void syncRecords();
        }
    }

    function escapeHtml(text) {
        return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function uniqueId(item, kind) {
        const oldId = `${item.date || ''}_${item.subject || ''}_${item.content || ''}_${item.teacher || ''}`;
        // Preserve completion ticks from old versions for homework only.
        return kind === 'homework' ? oldId : `reminder:${oldId}`;
    }

    function visibleRecords(records) {
        return records.reduce((all, item) => {
            if (!DATE.matchesDateFilter(item, state.dateFilter, new Date(), state.customDate)) return all;
            const decision = SUBJECT.evaluate(item, state);
            if (decision.visible) all.push({ item, warning: decision.warning });
            return all;
        }, []);
    }

    function renderList(id, records, kind) {
        const container = $(id);
        container.replaceChildren();
        if (!records.length) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = cacheUsable
                ? `沒有符合條件的${kind === 'homework' ? '功課' : '提醒'}。`
                : '尚未成功載入資料，請登入 SMS 並重新整理。';
            container.appendChild(empty);
            return;
        }
        records.forEach(({ item, warning }) => {
            const id = uniqueId(item, kind);
            const done = Boolean(completed[id]);
            const card = document.createElement('div');
            card.className = `hw-card${done ? ' completed' : ''}`;
            card.innerHTML = `
                <div class="hw-header">
                    <label class="hw-check-title">
                        <input type="checkbox" class="hw-checkbox" ${done ? 'checked' : ''}>
                        <span class="subject">${escapeHtml(item.subject)}</span>
                    </label>
                    <span class="date-badge">📅 ${escapeHtml(item.date)}</span>
                </div>
                <div class="content">${escapeHtml(item.content)}</div>
                ${warning ? `<div class="verify-note">⚠ ${escapeHtml(warning)}</div>` : ''}
                <div class="footer"><span>⏱️ ${escapeHtml(item.time || '未指定時間')}</span><span>老師：${escapeHtml(item.teacher || '無')}</span></div>`;
            const checkbox = card.querySelector('.hw-checkbox');
            checkbox.setAttribute('aria-label', `標記${kind === 'homework' ? '功課' : '提醒'}完成：${item.subject || ''} ${item.date || ''}`);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) completed[id] = true; else delete completed[id];
                card.classList.toggle('completed', checkbox.checked);
                saveCompleted();
                renderAnalysis();
            });
            container.appendChild(card);
        });
    }

    function renderRecords() {
        const hw = visibleRecords(homework);
        const rem = visibleRecords(reminders);
        renderList('hw-list', hw, 'homework');
        renderList('reminder-list', rem, 'reminders');
        $('tab-homework-count').textContent = String(hw.length);
        $('tab-reminders-count').textContent = String(rem.length);
        $('homework-section-count').textContent = `${hw.length} 項`;
        $('reminders-section-count').textContent = `${rem.length} 項`;
        $('total-count').textContent = `${state.viewMode === 'stacked' ? hw.length + rem.length : state.activeTab === 'homework' ? hw.length : rem.length} 項`;
        renderLayout();
        renderAnalysis();
    }

    function renderAnalysis() {
        const panel = $('settings-panel');
        const tools = $('analysis-tools');
        if (!panel || panel.hidden || !tools || !tools.open || !globalThis.BetterSMSAnalysisUI) return;
        // Exactly the same date and subject selection as the homework list;
        // reminders and completed homework never enter this calculation.
        const pending = visibleRecords(homework)
            .filter(({ item }) => !completed[uniqueId(item, 'homework')])
            .map(({ item, warning }) => ({ ...item, analysisWarning: warning }));
        const syncMessage = isFetching ? '正在同步，暫時使用上次成功資料。' :
            lastSyncError ? '同步未成功，以下使用上次成功資料。' : '';
        globalThis.BetterSMSAnalysisUI.render($('analysis-content'), pending, {
            dataAvailable: cacheUsable,
            filterLabel: $('date-filter-summary').textContent,
            syncMessage,
            now: new Date()
        });
    }

    function updateAnalysisTimer() {
        if (analysisTimer) clearInterval(analysisTimer);
        analysisTimer = null;
        if ($('analysis-tools').open && !$('settings-panel').hidden) {
            renderAnalysis();
            analysisTimer = setInterval(renderAnalysis, 60000);
        }
    }

    function renderLayout() {
        const tabs = state.viewMode === 'tabs';
        $('list-tabs').hidden = !tabs;
        for (const name of ['homework', 'reminders']) {
            const selected = name === state.activeTab;
            const tab = $(`tab-${name}`);
            const section = $(`${name}-section`);
            const heading = $(`${name}-heading`);
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            section.hidden = tabs && !selected;
            heading.hidden = tabs;
            section.setAttribute('role', tabs ? 'tabpanel' : 'region');
            section.setAttribute('aria-labelledby', tabs ? `tab-${name}` : `${name}-heading`);
        }
        document.querySelectorAll('input[name="view-mode"]').forEach(radio => { radio.checked = radio.value === state.viewMode; });
    }

    function renderControls() {
        const student = state.student !== 'CUSTOM' ? STUDENTS_DATABASE[Number(state.student)] : null;
        $('profile-student').value = String(state.student);
        $('current-student-tag').textContent = student ? student.name.split(' ')[0] : '自訂模式';
        $('profile-math').value = state.mathGroup;
        $('profile-x1').value = state.x1;
        $('profile-x2').value = state.x2;
        $('profile-x3').value = state.x3;
        $('profile-modules').value = state.modules;
        document.querySelectorAll('.date-btn').forEach(button => {
            const active = button.dataset.dateFilter === state.dateFilter;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const dateLabels = {
            ALL: '全部已載入', TODAY: '今天', NEXT_SCHOOL_DAY: '下個上學天',
            NEXT_7_DAYS: '未來 7 天', NEXT_WEEK: '下星期'
        };
        $('date-filter-summary').textContent = state.dateFilter === 'CUSTOM'
            ? `指定：${state.customDate}` : dateLabels[state.dateFilter] || dateLabels.ALL;
        $('custom-date').value = state.customDate;
        $('fetch-from-date').value = state.fromDate || todayKey();
        renderLayout();
    }

    function renderStatus() {
        const badge = $('sync-status');
        $('last-updated').textContent = `最後更新：${lastUpdated || '尚未同步'}`;
        $('source-date').textContent = cacheUsable && sourceStartDate ? `載入範圍：${sourceStartDate} 起` : '尚未載入資料';
        $('refresh').disabled = isFetching;
        if (isFetching) {
            badge.className = 'sync-badge syncing'; badge.textContent = '🟠 同步中…';
        } else if (lastSyncError) {
            badge.className = 'sync-badge error'; badge.textContent = '⚠️ 抓取異常';
        } else if (isSynced && cacheUsable) {
            badge.className = 'sync-badge synced'; badge.textContent = '🟢 已同步';
        } else {
            badge.className = 'sync-badge pending'; badge.textContent = '🟠 等待 SMS 頁面';
        }
        const message = uiMessage || (!isFetching && lastSyncError ? `${lastSyncError}${cacheUsable ? ' 下方顯示上次成功資料。' : ''}` : '');
        $('sync-message').textContent = message;
        $('sync-message').hidden = !message;
    }

    function renderDeveloper() {
        $('dev-mode-toggle').checked = developerMode;
        $('dev-mode-state').textContent = developerMode ? '已啟用' : '關閉';
        $('dev-panel').hidden = !developerMode;
        $('dev-diagnostics').textContent = diagnostics ? JSON.stringify(diagnostics, null, 2) : '尚未收到同步診斷資料。';
    }

    function applyStored(values, initial = false) {
        if (values.savedState) state = normalizeState(values.savedState);
        if (values.completedHomeworkMap && typeof values.completedHomeworkMap === 'object') completed = values.completedHomeworkMap;
        if (Object.prototype.hasOwnProperty.call(values, 'recordsSchemaVersion')) cacheUsable = values.recordsSchemaVersion === SCHEMA_VERSION;
        if (cacheUsable) {
            if (Array.isArray(values.homeworkList)) homework = values.homeworkList;
            if (Array.isArray(values.reminderList)) reminders = values.reminderList;
            if (Object.prototype.hasOwnProperty.call(values, 'sourceStartDate')) sourceStartDate = values.sourceStartDate || '';
            if (Object.prototype.hasOwnProperty.call(values, 'lastUpdated')) lastUpdated = values.lastUpdated || '';
            if (Object.prototype.hasOwnProperty.call(values, 'isSynced')) isSynced = values.isSynced;
            if (Object.prototype.hasOwnProperty.call(values, 'lastSyncError')) lastSyncError = values.lastSyncError || '';
            if (Object.prototype.hasOwnProperty.call(values, 'syncDiagnostics')) diagnostics = values.syncDiagnostics || null;
        } else if (initial && Array.isArray(values.homeworkList) && values.homeworkList.length) {
            // Old versions merged the two sections, so those rows cannot safely
            // be presented as homework after the upgrade. Completion ticks stay.
            lastSyncError = '舊版資料無法分辨功課和提醒，請登入 SMS 並重新整理。';
        }
        if (Object.prototype.hasOwnProperty.call(values, 'developerMode')) developerMode = Boolean(values.developerMode);
        if (initial || values.savedState) renderControls();
        renderRecords(); renderStatus(); renderDeveloper();
    }

    function formatTime(date) {
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function querySmsTabs() {
        return new Promise(resolve => chrome.tabs.query({ url: 'https://sms.twghlkss.edu.hk/student/*' }, tabs => {
            if (chrome.runtime.lastError) resolve([]); else resolve(tabs || []);
        }));
    }
    function askTab(tabId, fromDate) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) { settled = true; reject(new Error('SMS 分頁沒有回應。')); }
            }, 17000);
            chrome.tabs.sendMessage(tabId, { type: 'BETTER_SMS_FETCH_RECORDS', fromDate }, response => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                const error = chrome.runtime.lastError;
                if (error || !response) reject(new Error('找不到 SMS 分頁的抓取程式。'));
                else if (!response.ok) {
                    const failure = new Error(response.error || 'SMS 分頁未能抓取資料。');
                    failure.diagnostics = response.diagnostics || null;
                    reject(failure);
                } else resolve(response.data);
            });
        });
    }
    async function fetchViaTab(fromDate) {
        const tabs = await querySmsTabs();
        tabs.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
        let lastError = null;
        for (const tab of tabs) {
            if (tab.id == null) continue;
            try { return await askTab(tab.id, fromDate); } catch (error) { lastError = error; }
        }
        throw lastError || new Error('沒有已開啟的 SMS 學生分頁。');
    }

    function commitLatest(number, values) {
        const pending = commitQueue.catch(() => {}).then(async () => {
            if (number !== requestNumber) return false;
            await storageSet(values);
            if (number !== requestNumber) return false;
            applyStored(values);
            return true;
        });
        commitQueue = pending.catch(() => {});
        return pending;
    }

    async function syncRecords() {
        const number = ++requestNumber;
        if (requestController) requestController.abort();
        requestController = new AbortController();
        const controller = requestController;
        const from = requestedFromDate();
        requestFromDate = from;
        isFetching = true; uiMessage = ''; renderStatus();
        let directError = null;
        let source = 'extension';
        try {
            let data;
            try {
                data = await CLIENT.fetchRecords(from, { signal: controller.signal });
            } catch (error) {
                if (controller.signal.aborted || number !== requestNumber) return;
                directError = error;
                source = 'sms-tab';
                try { data = await fetchViaTab(from); }
                catch (fallbackError) {
                    if (directError && directError.diagnostics) throw directError;
                    if (fallbackError && fallbackError.diagnostics) throw fallbackError;
                    const detail = directError && directError.message && !/failed to fetch|load failed|networkerror/i.test(directError.message)
                        ? `${directError.message} ` : '';
                    throw new Error(`${detail}請先登入 SMS，開啟並重新載入學生頁面，再按「重新整理」。`);
                }
            }
            if (number !== requestNumber || controller.signal.aborted) return;
            if (!data || !Array.isArray(data.homeworkList) || !Array.isArray(data.reminderList) ||
                !DATE.fromDateKey(data.sourceStartDate) || data.sourceStartDate > from) {
                throw new Error('SMS 回傳的資料或日期範圍不完整，保留上次成功資料。');
            }
            const now = new Date();
            const syncDiagnostics = {
                version: VERSION, status: 'synced', attemptedAt: now.toISOString(), source,
                ...(data.diagnostics || {})
            };
            await commitLatest(number, {
                recordsSchemaVersion: SCHEMA_VERSION,
                homeworkList: data.homeworkList,
                reminderList: data.reminderList,
                sourceStartDate: data.sourceStartDate,
                lastUpdated: formatTime(now), lastUpdatedISO: now.toISOString(),
                isSynced: true, lastSyncError: '', syncDiagnostics
            });
        } catch (error) {
            if (number !== requestNumber || controller.signal.aborted) return;
            const message = String((error && error.message) || 'SMS 抓取失敗。');
            const syncDiagnostics = {
                version: VERSION, status: 'error', attemptedAt: new Date().toISOString(),
                error: message, ...((error && error.diagnostics) || {})
            };
            try {
                // Do not erase cached lists, source date, or the last successful time.
                await commitLatest(number, { isSynced: false, lastSyncError: message, syncDiagnostics });
            } catch (_storageError) {
                lastSyncError = `無法儲存同步狀態：${message}`;
            }
            // A first failed sync has no v2 cache; show its error locally too.
            if (!cacheUsable) { isSynced = false; lastSyncError = message; diagnostics = syncDiagnostics; }
        } finally {
            if (number === requestNumber) { isFetching = false; requestFromDate = ''; renderStatus(); renderDeveloper(); renderRecords(); }
        }
    }

    function chooseTab(name, focus = false) {
        state.activeTab = name; saveState(); renderRecords();
        if (focus) $(`tab-${name}`).focus();
    }
    function bindEvents() {
        $('profile-student').addEventListener('change', event => {
            state.student = event.target.value;
            const student = STUDENTS_DATABASE[Number(state.student)];
            if (state.student !== 'CUSTOM' && student) {
                Object.assign(state, { mathGroup: student.math, x1: student.x1, x2: student.x2, x3: student.x3 });
                $('profile-accordion').removeAttribute('open');
            }
            saveState(); renderControls(); renderRecords();
        });
        const profileFields = { 'profile-math': 'mathGroup', 'profile-x1': 'x1', 'profile-x2': 'x2', 'profile-x3': 'x3', 'profile-modules': 'modules' };
        Object.entries(profileFields).forEach(([id, key]) => $(id).addEventListener('change', event => {
            state[key] = event.target.value; state.student = 'CUSTOM';
            saveState(); renderControls(); renderRecords();
        }));
        document.querySelectorAll('.date-btn').forEach(button => button.addEventListener('click', () => {
            state.dateFilter = button.dataset.dateFilter; uiMessage = '';
            saveState(); renderControls(); renderRecords(); renderStatus(); maybeFetchEarlier();
        }));
        $('apply-custom-date').addEventListener('click', () => {
            const selected = $('custom-date').value;
            if (!DATE.fromDateKey(selected)) { uiMessage = '請先選擇有效的指定日期。'; renderStatus(); return; }
            state.customDate = selected; state.dateFilter = 'CUSTOM'; uiMessage = '';
            saveState(); renderControls(); renderRecords(); renderStatus(); maybeFetchEarlier();
        });
        $('refresh').addEventListener('click', () => { void syncRecords(); });
        $('dev-refresh').addEventListener('click', () => { $('dev-message').textContent = '正在重新抓取…'; void syncRecords(); });
        $('dev-mode-toggle').addEventListener('change', event => {
            developerMode = event.target.checked; renderDeveloper();
            void storageSet({ developerMode }).catch(error => { $('dev-message').textContent = `儲存失敗：${error.message}`; });
        });
        $('dev-copy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(JSON.stringify(diagnostics || { status: 'unknown' }, null, 2));
                $('dev-message').textContent = '診斷資料已複製（不含功課或提醒內容）。';
            } catch (_error) { $('dev-message').textContent = '複製失敗，請手動選取診斷資料。'; }
        });
        for (const name of ['homework', 'reminders']) {
            $(`tab-${name}`).addEventListener('click', () => chooseTab(name));
            $(`tab-${name}`).addEventListener('keydown', event => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const target = event.key === 'Home' ? 'homework' : event.key === 'End' ? 'reminders' : name === 'homework' ? 'reminders' : 'homework';
                    chooseTab(target, true);
                }
            });
        }
        document.querySelectorAll('input[name="view-mode"]').forEach(radio => radio.addEventListener('change', () => {
            if (!radio.checked) return;
            state.viewMode = radio.value; saveState(); renderRecords();
        }));
        const showSettings = open => {
            $('settings-panel').hidden = !open;
            $('settings-button').setAttribute('aria-expanded', String(open));
            updateAnalysisTimer();
            if (open) $('settings-close').focus(); else $('settings-button').focus();
        };
        $('analysis-tools').addEventListener('toggle', updateAnalysisTimer);
        $('settings-button').addEventListener('click', () => showSettings($('settings-panel').hidden));
        $('settings-close').addEventListener('click', () => showSettings(false));
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('settings-panel').hidden) showSettings(false); });
        document.addEventListener('click', event => {
            if (!$('settings-panel').hidden && !$('settings-panel').contains(event.target) && !$('settings-button').contains(event.target)) {
                $('settings-panel').hidden = true; $('settings-button').setAttribute('aria-expanded', 'false'); updateAnalysisTimer();
            }
        });
        $('apply-from-date').addEventListener('click', () => {
            const date = $('fetch-from-date').value;
            if (!DATE.fromDateKey(date)) { uiMessage = '請先選擇有效的載入起始日期。'; renderStatus(); return; }
            state.fromDate = date; expandForCurrentFilter(); saveState(); uiMessage = '';
            renderControls(); void syncRecords();
        });
        // Keep the original five-tap Easter egg.
        let taps = 0, tapTimer = null, egg = false;
        const tapTitle = () => {
            taps += 1; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 1800);
            if (taps >= 5) { taps = 0; egg = !egg; $('brand-title').textContent = egg ? 'Fuck.SMS' : 'Better.SMS'; }
        };
        $('brand-title').addEventListener('click', tapTitle);
        $('brand-title').addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tapTitle(); }
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        STUDENTS_DATABASE.forEach((student, index) => {
            const option = document.createElement('option'); option.value = String(index); option.textContent = student.name;
            $('profile-student').appendChild(option);
        });
        bindEvents();
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            const values = {};
            // Preferences and checkboxes are written by this popup itself.
            // Reapplying its older queued writes could revert a newer user choice.
            for (const key of ['homeworkList', 'reminderList', 'recordsSchemaVersion', 'sourceStartDate', 'lastUpdated', 'isSynced', 'lastSyncError', 'syncDiagnostics', 'developerMode']) {
                if (changes[key]) values[key] = changes[key].newValue;
            }
            if (Object.keys(values).length) applyStored(values);
        });
        try {
            const values = await storageGet(['savedState', 'homeworkList', 'reminderList', 'recordsSchemaVersion', 'completedHomeworkMap', 'sourceStartDate', 'lastUpdated', 'isSynced', 'lastSyncError', 'syncDiagnostics', 'developerMode']);
            applyStored(values, true);
            expandForCurrentFilter();
            void syncRecords();
        } catch (error) {
            lastSyncError = `無法讀取擴充功能儲存資料：${error.message}`;
            renderStatus(); renderRecords();
        }
    });
})();
