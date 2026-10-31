/* Pure time analysis for the Beta chart; no network or external libraries. */
(function attachBetterSMSAnalysis(root) {
    'use strict';

    // Prevent malformed/overflowing values from producing nonsensical dates.
    const dates = root.BetterSMSDateUtils || (typeof require === 'function' ? require('./date-utils.js') : null);
    const MAX_MINUTES = 100 * 366 * 24 * 60;
    function validMinutes(value) { return Number.isFinite(value) && value >= 0 && value <= MAX_MINUTES; }

    function parseMinutes(value) {
        if (typeof value === 'number') return validMinutes(value) ? value : null;
        const text = String(value == null ? '' : value).normalize('NFKC').trim().toLowerCase();
        if (!text) return null;
        if (/^\d+(?:\.\d+)?$/.test(text)) {
            const number = Number(text);
            return validMinutes(number) ? number : null;
        }
        // Only accept an entire duration, not a time of day such as 08:00 or
        // arbitrary prose. Support the units used by SMS and common translations.
        const match = text.match(/^(?:(\d+(?:\.\d+)?)\s*(?:小時|小时|時|时|hours?|hrs?|hr|h)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:分鐘|分钟|minutes?|mins?|min|m|分)\s*)?$/i);
        if (!match || (!match[1] && !match[2])) return null;
        const total = Number(match[1] || 0) * 60 + Number(match[2] || 0);
        return validMinutes(total) ? total : null;
    }

    function formatDuration(minutes) {
        if (!Number.isFinite(minutes) || minutes < 0) return '時間未明';
        const value = Math.round(minutes * 100) / 100;
        const hours = Math.floor(value / 60);
        const remaining = Math.round((value - hours * 60) * 100) / 100;
        if (!hours) return `${remaining} 分鐘`;
        return remaining ? `${hours} 小時 ${remaining} 分鐘` : `${hours} 小時`;
    }

    function summarize(records, referenceDate = new Date()) {
        const start = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
            ? new Date(referenceDate.getTime()) : new Date();
        const source = Array.isArray(records) ? records : [];
        const rows = source.map(record => {
            const task = record && typeof record === 'object' ? record : {};
            const subject = String(task.subject || '未標示科目').replace(/\s+/g, ' ').trim() || '未標示科目';
            return { task, subject, minutes: parseMinutes(task.time) };
        });
        const groupsByKey = new Map();
        let totalMinutes = 0, unknownCount = 0, zeroCount = 0, knownCount = 0;
        rows.forEach(row => {
            const key = row.subject.normalize('NFKC').toUpperCase();
            if (!groupsByKey.has(key)) {
                groupsByKey.set(key, { subject: row.subject, minutes: 0, knownCount: 0, unknownCount: 0 });
            }
            const group = groupsByKey.get(key);
            if (row.minutes === null) {
                unknownCount += 1; group.unknownCount += 1;
            } else {
                knownCount += 1; group.knownCount += 1;
                if (row.minutes === 0) zeroCount += 1;
                totalMinutes += row.minutes; group.minutes += row.minutes;
            }
        });
        totalMinutes = Math.round(totalMinutes * 100) / 100;
        const groups = [...groupsByKey.values()].map(group => ({
            ...group,
            minutes: Math.round(group.minutes * 100) / 100,
            percentage: totalMinutes > 0 ? group.minutes / totalMinutes * 100 : 0
        })).sort((a, b) => b.minutes - a.minutes || a.subject.localeCompare(b.subject));
        const endMillis = start.getTime() + totalMinutes * 60000;
        const finish = rows.length && knownCount && Number.isFinite(endMillis) && Math.abs(endMillis) <= 8.64e15
            ? new Date(endMillis) : null;
        return { rows, groups, totalMinutes, knownCount, unknownCount, zeroCount, start, finish };
    }

    // Group task rows by the SMS date. The totals remain separate from the
    // overall subject donut so students can compare tomorrow and other dates.
    function groupByDate(rows, referenceDate = new Date()) {
        const byKey = new Map();
        (Array.isArray(rows) ? rows : []).forEach(row => {
            const task = row && row.task ? row.task : {};
            const date = dates && (dates.fromDateKey(task.dateISO) || dates.parseHomeworkDate(task.date, referenceDate));
            const key = date ? dates.toDateKey(date) : 'unknown';
            if (!byKey.has(key)) byKey.set(key, { key, date, rows: [], minutes: 0, knownCount: 0, unknownCount: 0 });
            const day = byKey.get(key);
            day.rows.push(row);
            if (row.minutes === null) day.unknownCount += 1;
            else { day.knownCount += 1; day.minutes += row.minutes; }
        });
        return [...byKey.values()].map(day => ({ ...day, minutes: Math.round(day.minutes * 100) / 100 }))
            .sort((a, b) => a.key === 'unknown' ? 1 : b.key === 'unknown' ? -1 : a.key.localeCompare(b.key));
    }

    const api = { parseMinutes, formatDuration, summarize, groupByDate };
    root.BetterSMSAnalysis = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
