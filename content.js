/* global chrome, BetterSMSDateUtils, BetterSMSHomeworkParser */
(function runBetterSMSContentScript() {
    'use strict';

    const VERSION = '1.3.1';
    const QUIET_PERIOD_MS = 500;
    const VERIFY_PERIOD_MS = 350;
    const EMPTY_VERIFY_PERIOD_MS = 1600;
    const EMPTY_CONFIRM_PERIOD_MS = 2500;

    let quietTimer = null;
    let verifyTimer = null;
    let emptyConfirmTimer = null;
    let scanGeneration = 0;
    let lastProcessedFingerprint = '';
    let lastFailureKey = '';
    let storageQueue = Promise.resolve();

    function cleanPageText(value) {
        return String(value || '')
            .replace(/[\u00a0\u202f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isVisible(element) {
        let current = element;
        while (current && current.nodeType === 1) {
            if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
            const style = window.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
                return false;
            }
            current = current.parentElement;
        }
        return true;
    }

    function readTables() {
        const tableElements = Array.from(document.querySelectorAll('table')).filter(isVisible);
        const tableModels = tableElements.map(table => ({
            rows: Array.from(table.rows).map(row => ({
                cells: Array.from(row.cells).map(cell => ({
                    text: cell.innerText != null ? cell.innerText : cell.textContent,
                    isHeader: cell.tagName.toLowerCase() === 'th'
                }))
            }))
        }));
        return { tableElements, tableModels };
    }

    function hasExplicitNoRecordsMessage(text, listKind) {
        const normalized = cleanPageText(text).toLowerCase();
        if (listKind === 'reminder') {
            return /沒有(?:相關|任何)?提醒|暫無(?:相關)?提醒|没有(?:相关|任何)?提醒|暂无(?:相关)?提醒|no\s+(?:reminders?|alerts?)\b/.test(normalized);
        }
        return /沒有(?:相關|任何)?功課|沒有(?:相關|任何)?功课|暫無(?:相關)?功課|暂无(?:相关)?功课|沒有(?:相關|任何)?作業|没有(?:相关|任何)?作业|暫無(?:相關)?作業|暂无(?:相关)?作业|目前沒有功課|目前没有功课|no\s+(?:homework|assignments?)\b/.test(normalized);
    }

    function readDetentionInfo(text) {
        const normalized = cleanPageText(text).toLowerCase();
        const saysNoDetention = /毋須留堂|無須留堂|无须留堂|不需要留堂|无需留堂|沒有留堂|没有留堂|\bno\s+detention\b|\bno\s+detention\s+class\b/.test(normalized);
        const needsDetention = !saysNoDetention && (
            /需要留堂|即將進行的留堂|即将进行的留堂|留堂班/.test(normalized) ||
            /\b(?:upcoming\s+)?detention\s+(?:class|session|required|scheduled)\b|\byou\s+(?:have|need)\s+detention\b/.test(normalized)
        );
        return {
            needDetention: needsDetention,
            text: needsDetention ? '你有即將進行的留堂班，請留意！' : '毋須留堂',
            countText: needsDetention ? '1' : '0'
        };
    }

    function captureSnapshot() {
        const body = document.body;
        const bodyText = body ? (body.innerText || body.textContent || '') : '';
        const { tableElements, tableModels } = readTables();
        const parsed = BetterSMSHomeworkParser.parseHomeworkTables(tableModels, new Date());
        const language = (document.documentElement && document.documentElement.lang) ||
            (navigator.language || '');
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"]'))
            .filter(isVisible)
            .map(element => cleanPageText(element.innerText || element.textContent))
            .filter(Boolean);
        const primaryHeadingElement = Array.from(document.querySelectorAll('h1, [role="heading"][aria-level="1"]'))
            .find(isVisible);
        const primaryHeading = primaryHeadingElement
            ? cleanPageText(primaryHeadingElement.innerText || primaryHeadingElement.textContent)
            : '';
        const tableMetadata = tableElements.map(table => [
            table.id,
            typeof table.className === 'string' ? table.className : '',
            table.getAttribute('aria-label') || '',
            table.getAttribute('summary') || ''
        ].filter(Boolean).join(' '));
        const listKind = BetterSMSHomeworkParser.detectListKind({
            pathname: `${location.pathname} ${location.search || ''}`,
            pageTitle: document.title,
            primaryHeading,
            headings,
            tableMetadata
        });
        const noRecordsMessage = hasExplicitNoRecordsMessage(bodyText, listKind);
        const detentionInfo = readDetentionInfo(bodyText);
        const fingerprint = JSON.stringify({
            language,
            listKind,
            noRecordsMessage,
            detentionInfo,
            tables: tableModels.map(table => table.rows.map(row => row.cells.map(cell => cleanPageText(cell.text))))
        });

        return {
            language,
            listKind,
            tableCount: tableElements.length,
            parsed,
            noRecordsMessage,
            detentionInfo,
            fingerprint
        };
    }

    function makeDiagnostics(snapshot, status, error) {
        return {
            version: VERSION,
            listKind: snapshot.listKind,
            status,
            error: error || '',
            attemptedAt: new Date().toISOString(),
            pageLanguage: String(snapshot.language || 'unknown').slice(0, 40),
            tableCount: snapshot.tableCount,
            recognizedTableCount: snapshot.parsed.recognizedTableCount,
            rowsSeen: snapshot.parsed.rowsSeen,
            matchedRows: snapshot.parsed.matchedRows,
            unmatchedRows: snapshot.parsed.unmatchedRows,
            parsedCount: snapshot.parsed.homeworkList.length,
            emptyMessageDetected: snapshot.noRecordsMessage,
            tables: snapshot.parsed.tableDiagnostics.slice(0, 10)
        };
    }

    function setLocalStorage(values) {
        const write = storageQueue.then(() => new Promise((resolve, reject) => {
            chrome.storage.local.set(values, () => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve();
            });
        }));
        storageQueue = write.catch(() => {});
        return write;
    }

    function debugLog(label, details) {
        chrome.storage.local.get({ developerMode: false }, result => {
            if (!chrome.runtime.lastError && result.developerMode) {
                console.info(`[Better.SMS] ${label}`, details);
            }
        });
    }

    async function recordFailure(snapshot, error) {
        const errorKey = `${error}|${snapshot.fingerprint}`;
        if (errorKey === lastFailureKey) return;
        lastFailureKey = errorKey;
        const diagnostics = makeDiagnostics(snapshot, 'error', error);
        try {
            // Keep both saved lists and their timestamps intact. A page-loading
            // state must never replace a successful list with an empty array.
            await setLocalStorage({
                isSynced: false,
                lastSyncError: error,
                syncDiagnostics: diagnostics
            });
            debugLog('scrape failed', diagnostics);
        } catch (storageError) {
            console.error('[Better.SMS] Could not store scrape diagnostics:', storageError);
        }
    }

    function formatUpdatedTime(date) {
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    async function commitSnapshot(snapshot) {
        const listKind = snapshot.listKind;
        const storageKey = BetterSMSHomeworkParser.storageKeyForListKind(listKind);
        const hasRecords = snapshot.parsed.homeworkList.length > 0;
        const hasRecognizedTable = snapshot.parsed.recognizedTableCount > 0;

        if (!storageKey) {
            await recordFailure(snapshot, '無法分辨目前是提醒頁還是功課頁；為避免混在一起，沒有更新資料。');
            return;
        }
        if (snapshot.parsed.unmatchedRows > 0 && !snapshot.noRecordsMessage) {
            const listName = listKind === 'reminder' ? '提醒' : '功課';
            await recordFailure(snapshot, `${listName}表格有 ${snapshot.parsed.unmatchedRows} 列未能辨識；為避免漏資料，保留上次成功結果。`);
            return;
        }
        if (!hasRecords && !hasRecognizedTable && !snapshot.noRecordsMessage) {
            const listName = listKind === 'reminder' ? '提醒' : '功課';
            await recordFailure(snapshot, `找不到可辨識的${listName}表格；請確認已登入 SMS 學生頁面。`);
            return;
        }

        // Keep reminders and homework in different storage keys. A list on the
        // Reminder page can no longer overwrite the Homework list (or vice versa).
        const now = new Date();
        const diagnostics = makeDiagnostics(snapshot, 'synced', '');
        const updated = {
            [storageKey]: snapshot.parsed.homeworkList,
            [`${listKind}ListVersion`]: 2,
            lastUpdated: formatUpdatedTime(now),
            lastUpdatedISO: now.toISOString(),
            lastSyncError: '',
            syncDiagnostics: diagnostics,
            isSynced: true
        };
        if (listKind === 'homework') updated.detentionInfo = snapshot.detentionInfo;

        try {
            await setLocalStorage(updated);
            lastFailureKey = '';
            debugLog('sync complete', diagnostics);
        } catch (error) {
            await recordFailure(snapshot, `寫入擴充功能儲存空間失敗：${error.message}`);
        }
    }

    async function markEmptyAsPending(snapshot) {
        const listName = snapshot.listKind === 'reminder' ? '提醒' : '功課';
        const diagnostics = makeDiagnostics(snapshot, 'verifying-empty', `正在再次確認空白${listName}表。`);
        try {
            await setLocalStorage({
                isSynced: false,
                lastSyncError: '',
                syncDiagnostics: diagnostics
            });
        } catch (error) {
            console.error('[Better.SMS] Could not store empty-table status:', error);
        }
    }

    function scheduleEmptyRecheck(fingerprint, delay) {
        clearTimeout(emptyConfirmTimer);
        emptyConfirmTimer = setTimeout(() => {
            if (pendingEmptyFingerprint !== fingerprint) return;
            lastProcessedFingerprint = '';
            scheduleScrape(0);
        }, delay);
    }

    let pendingEmptyFingerprint = '';
    let pendingEmptySince = 0;

    function processSnapshot(snapshot) {
        if (snapshot.fingerprint === lastProcessedFingerprint) return;
        lastProcessedFingerprint = snapshot.fingerprint;

        const isAmbiguousEmpty = snapshot.listKind !== 'unknown' &&
            snapshot.parsed.homeworkList.length === 0 &&
            snapshot.parsed.recognizedTableCount > 0 &&
            snapshot.parsed.unmatchedRows === 0 &&
            !snapshot.noRecordsMessage;

        if (isAmbiguousEmpty) {
            const now = Date.now();
            if (pendingEmptyFingerprint !== snapshot.fingerprint) {
                pendingEmptyFingerprint = snapshot.fingerprint;
                pendingEmptySince = now;
                void markEmptyAsPending(snapshot);
                scheduleEmptyRecheck(snapshot.fingerprint, EMPTY_CONFIRM_PERIOD_MS);
                return;
            }
            const elapsed = now - pendingEmptySince;
            if (elapsed < EMPTY_CONFIRM_PERIOD_MS) {
                scheduleEmptyRecheck(snapshot.fingerprint, EMPTY_CONFIRM_PERIOD_MS - elapsed);
                return;
            }
        } else {
            pendingEmptyFingerprint = '';
            pendingEmptySince = 0;
            clearTimeout(emptyConfirmTimer);
        }

        pendingEmptyFingerprint = '';
        pendingEmptySince = 0;
        clearTimeout(emptyConfirmTimer);
        void commitSnapshot(snapshot);
    }

    function scheduleScrape(delay = QUIET_PERIOD_MS) {
        scanGeneration += 1;
        const generation = scanGeneration;
        clearTimeout(quietTimer);
        clearTimeout(verifyTimer);

        quietTimer = setTimeout(() => {
            const firstSnapshot = captureSnapshot();
            const isPossiblyEmpty = firstSnapshot.parsed.homeworkList.length === 0 &&
                !firstSnapshot.noRecordsMessage;
            const verifyDelay = isPossiblyEmpty ? EMPTY_VERIFY_PERIOD_MS : VERIFY_PERIOD_MS;

            verifyTimer = setTimeout(() => {
                if (generation !== scanGeneration) return;
                const verifiedSnapshot = captureSnapshot();
                if (firstSnapshot.fingerprint !== verifiedSnapshot.fingerprint) {
                    scheduleScrape(250);
                    return;
                }
                processSnapshot(verifiedSnapshot);
            }, verifyDelay);
        }, delay);
    }

    function onRuntimeMessage(message, _sender, sendResponse) {
        if (!message || message.type !== 'BETTER_SMS_SCRAPE_NOW') return false;
        lastProcessedFingerprint = '';
        scheduleScrape(0);
        sendResponse({ ok: true, queued: true });
        return false;
    }

    if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
    }

    if (document.body) {
        const observer = new MutationObserver(() => scheduleScrape());
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['lang', 'hidden', 'aria-hidden', 'class', 'style']
        });
    }

    // document_idle is used by the manifest; the short delay also lets the
    // SMS application finish its initial table render before reading it.
    scheduleScrape(250);
})();
