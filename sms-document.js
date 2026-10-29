/* Read the two titled tables in the SMS homework page without executing it. */
(function attachBetterSMSSmsDocument(root) {
    'use strict';

    const parser = root.BetterSMSHomeworkParser ||
        (typeof require === 'function' ? require('./homework-parser.js') : null);
    const dates = root.BetterSMSDateUtils ||
        (typeof require === 'function' ? require('./date-utils.js') : null);

    function sectionKind(text) {
        const title = String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
        if (/^(?:功課|功课|作業|作业)(?:\s*(?:列表|紀錄|记录|資料|资料))?$/.test(title) ||
            /^(?:homework|homeworks|assignments?)(?:\s+(?:list|records?))?$/.test(title)) return 'homework';
        if (/^(?:提醒|提示)(?:事項|事项|列表|紀錄|记录)?$/.test(title) ||
            /^(?:reminders?|reminder\s+list)$/.test(title)) return 'reminders';
        return null;
    }

    function cellText(cell) {
        function walk(node) {
            if (node.nodeType === 3) return node.nodeValue || '';
            if (node.nodeType !== 1) return '';
            if (node.tagName.toLowerCase() === 'br') return '\n';
            const text = Array.from(node.childNodes || []).map(walk).join('');
            return /^(?:p|div|li)$/i.test(node.tagName) ? `${text}\n` : text;
        }
        return walk(cell);
    }

    function tableModel(table, kind) {
        return {
            kind,
            rows: Array.from(table.rows || []).map(row => ({
                cells: Array.from(row.cells || []).map(cell => ({
                    text: cellText(cell),
                    isHeader: cell.tagName.toLowerCase() === 'th'
                }))
            }))
        };
    }

    function sectionHasExplicitEmpty(heading) {
        let sibling = heading.nextElementSibling;
        while (sibling && sibling.tagName.toLowerCase() !== 'h2') {
            const text = (sibling.textContent || '').trim();
            // A single message such as '沒有提醒' may replace the table.
            // Never declare a section empty based on a fragment of a real row.
            if (text && !sibling.querySelector('table') && text.length < 120 && parser.isEmptyPlaceholder([text])) return true;
            sibling = sibling.nextElementSibling;
        }
        return false;
    }

    function makeError(message, diagnostics) {
        const error = new Error(message);
        error.diagnostics = diagnostics;
        return error;
    }

    function parseDocument(doc, requestedFrom = '', referenceDate = new Date()) {
        if (!doc || !parser || !dates) throw new Error('無法讀取 SMS 資料。');
        const container = doc.querySelector('.student-record-content');
        if (!container) throw new Error('未找到 SMS 學生功課頁面；請先登入 SMS。');

        const sections = {
            homework: { seen: false, explicitEmpty: false, tableCount: 0 },
            reminders: { seen: false, explicitEmpty: false, tableCount: 0 }
        };
        const primaryTables = new Set(container.querySelectorAll('.student-homework-record-table table'));
        const models = [];
        let currentKind = null;
        container.querySelectorAll('h2,table').forEach(element => {
            if (element.tagName.toLowerCase() === 'h2') {
                currentKind = sectionKind(element.textContent);
                if (currentKind) {
                    sections[currentKind].seen = true;
                    sections[currentKind].explicitEmpty ||= sectionHasExplicitEmpty(element);
                }
            } else if (currentKind && (!primaryTables.size || primaryTables.has(element))) {
                sections[currentKind].tableCount += 1;
                models.push(tableModel(element, currentKind));
            }
        });

        const parsed = parser.parseRecordTables(models, referenceDate);
        const diagnostics = {
            pageLanguage: String((doc.documentElement && doc.documentElement.lang) || 'unknown').slice(0, 40),
            tableCount: models.length,
            sections: {
                homework: {
                    seen: sections.homework.seen,
                    tables: sections.homework.tableCount,
                    recognizedTables: parsed.homework.recognizedTableCount,
                    matchedRows: parsed.homework.matchedRows,
                    unmatchedRows: parsed.homework.unmatchedRows,
                    explicitEmpty: sections.homework.explicitEmpty
                },
                reminders: {
                    seen: sections.reminders.seen,
                    tables: sections.reminders.tableCount,
                    recognizedTables: parsed.reminders.recognizedTableCount,
                    matchedRows: parsed.reminders.matchedRows,
                    unmatchedRows: parsed.reminders.unmatchedRows,
                    explicitEmpty: sections.reminders.explicitEmpty
                }
            }
        };

        for (const kind of ['homework', 'reminders']) {
            const info = sections[kind];
            const data = parsed[kind];
            const name = kind === 'homework' ? '功課' : '提醒';
            if (!info.seen || (!data.recognizedTableCount && !info.explicitEmpty)) {
                throw makeError(`未能完整辨識 SMS 的「${name}」區塊，保留上次成功資料。`, diagnostics);
            }
            if (data.unmatchedRows) {
                throw makeError(`「${name}」有 ${data.unmatchedRows} 列未能辨識，為免漏資料，保留上次成功資料。`, diagnostics);
            }
        }

        const dateInput = doc.querySelector('.student-homework-record-filter input[name="date"]') ||
            container.querySelector('input[name="date"]');
        const sourceDate = dateInput ? String(dateInput.value || dateInput.getAttribute('value') || '') : '';
        if (!dates.fromDateKey(sourceDate)) {
            throw makeError('未能確認 SMS 回傳的起始日期，為免漏資料，保留上次成功資料。', diagnostics);
        }
        if (requestedFrom && (!dates.fromDateKey(requestedFrom) || sourceDate > requestedFrom)) {
            throw makeError(`SMS 實際由 ${sourceDate} 起載入，晚於要求的日期；請在 SMS 檢查日期設定。`, diagnostics);
        }
        return {
            homeworkList: parsed.homework.homeworkList,
            reminderList: parsed.reminders.homeworkList,
            sourceStartDate: sourceDate,
            diagnostics
        };
    }

    const api = { sectionKind, parseDocument, tableModel };
    root.BetterSMSSmsDocument = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
