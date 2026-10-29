/* Shared, locale-tolerant date parsing for the page scraper and popup filters. */
(function attachBetterSMSDateUtils(root) {
    'use strict';

    const MONTHS = {
        jan: 1, january: 1,
        feb: 2, february: 2,
        mar: 3, march: 3,
        apr: 4, april: 4,
        may: 5,
        jun: 6, june: 6,
        jul: 7, july: 7,
        aug: 8, august: 8,
        sep: 9, sept: 9, september: 9,
        oct: 10, october: 10,
        nov: 11, november: 11,
        dec: 12, december: 12
    };

    function makeDate(year, month, day) {
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
            return null;
        }
        if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }

        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return null;
        }
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function referenceYear(referenceDate) {
        if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
            return referenceDate.getFullYear();
        }
        if (typeof referenceDate === 'number') {
            const date = new Date(referenceDate);
            if (!Number.isNaN(date.getTime())) return date.getFullYear();
        }
        return new Date().getFullYear();
    }

    function getMonthNumber(monthText) {
        if (!monthText) return null;
        const month = MONTHS[String(monthText).toLowerCase().replace(/\.$/, '')];
        return month || null;
    }

    function normalizeYear(yearText) {
        const text = String(yearText);
        const year = Number(text);
        if (text.length !== 2) return year;
        return year >= 70 ? 1900 + year : 2000 + year;
    }

    /**
     * Parse the date formats commonly returned by the SMS/eClass UI in both
     * Traditional Chinese and English. Ambiguous slash dates prefer day/month
     * (the usual Hong Kong convention), falling back to month/day when needed.
     */
    function parseHomeworkDate(value, referenceDate) {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) return null;
            return makeDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
        }

        const text = String(value == null ? '' : value)
            .normalize('NFKC')
            .replace(/[\u00a0\u202f]/g, ' ')
            .trim();
        if (!text) return null;

        const currentYear = referenceYear(referenceDate);
        let match;

        // Chinese full or yearless dates, e.g. 2026年10月14日 / 10月14日.
        match = text.match(/(?:^|[^\d])(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號|号)?/);
        if (match) {
            const date = makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
            if (date) return date;
        }
        match = text.match(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號|号)/);
        if (match) {
            const date = makeDate(currentYear, Number(match[1]), Number(match[2]));
            if (date) return date;
        }

        // Year first: 2026-10-14, 2026/10/14, or 2026.10.14.
        match = text.match(/(?:^|[^\d])(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?=$|[^\d])/);
        if (match) {
            const date = makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
            if (date) return date;
        }

        // Day/month/year is standard for Hong Kong. Fall back to month/day/year
        // to handle pages that explicitly use a US-style English date.
        match = text.match(/(?:^|[^\d])(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?=$|[^\d])/);
        if (match) {
            const first = Number(match[1]);
            const second = Number(match[2]);
            const year = normalizeYear(match[3]);
            return makeDate(year, second, first) || makeDate(year, first, second);
        }

        // D-MMM-YYYY, 14 Oct 2026, or October 14, 2026 (optional weekday text).
        match = text.match(/(?:^|[^\d])(\d{1,2})(?:st|nd|rd|th)?[\s./-]+([a-zA-Z]{3,9})\.?[,]?[\s./-]+(\d{2,4})(?=$|[^\d])/i);
        if (match) {
            const date = makeDate(normalizeYear(match[3]), getMonthNumber(match[2]), Number(match[1]));
            if (date) return date;
        }
        match = text.match(/\b([a-zA-Z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{2,4})\b/i);
        if (match) {
            const date = makeDate(normalizeYear(match[3]), getMonthNumber(match[1]), Number(match[2]));
            if (date) return date;
        }

        // Dates without a year are also seen in compact timetable cells.
        match = text.match(/(?:^|[^\d])(\d{1,2})\s*[./-]\s*(\d{1,2})(?=$|[^\d])/);
        if (match) {
            const first = Number(match[1]);
            const second = Number(match[2]);
            return makeDate(currentYear, second, first) || makeDate(currentYear, first, second);
        }
        match = text.match(/(?:^|[^\d])(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\.?\b/i);
        if (match) {
            const date = makeDate(currentYear, getMonthNumber(match[2]), Number(match[1]));
            if (date) return date;
        }
        match = text.match(/\b([a-zA-Z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
        if (match) {
            const date = makeDate(currentYear, getMonthNumber(match[1]), Number(match[2]));
            if (date) return date;
        }

        return null;
    }

    function toDateKey(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function fromDateKey(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    function startOfDay(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        return makeDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
    }

    // This is a weekday estimate, not the school's official holiday calendar.
    function getNextSchoolDay(fromDate = new Date()) {
        const result = startOfDay(fromDate);
        if (!result) return null;
        result.setDate(result.getDate() + 1);
        if (result.getDay() === 6) result.setDate(result.getDate() + 2);
        if (result.getDay() === 0) result.setDate(result.getDate() + 1);
        return result;
    }

    // Endpoints are inclusive, using local calendar dates. NEXT_WEEK means the
    // next Monday through Sunday, even when today is a Monday or Sunday.
    function getFilterRange(filter, referenceDate = new Date(), customDate = '') {
        const today = startOfDay(referenceDate);
        if (!today) return null;
        if (filter === 'ALL') return { start: null, end: null };
        let start = new Date(today), end;
        if (filter === 'NEXT_SCHOOL_DAY') {
            start = getNextSchoolDay(today);
        } else if (filter === 'NEXT_WEEK') {
            const day = today.getDay();
            start.setDate(start.getDate() + (day === 0 ? 1 : 8 - day));
        } else if (filter === 'CUSTOM') {
            start = fromDateKey(customDate);
            if (!start) return null;
        } else if (!['TODAY', 'NEXT_7_DAYS'].includes(filter)) {
            return null;
        }
        end = new Date(start);
        if (filter === 'NEXT_7_DAYS' || filter === 'NEXT_WEEK') end.setDate(end.getDate() + 6);
        return { start, end };
    }

    function matchesDateFilter(record, filter, referenceDate = new Date(), customDate = '') {
        const range = getFilterRange(filter, referenceDate, customDate);
        if (!range) return false;
        if (!range.start) return true;
        const date = record && (fromDateKey(record.dateISO) || parseHomeworkDate(record.date, referenceDate));
        return Boolean(date && date >= range.start && date <= range.end);
    }

    const api = { parseHomeworkDate, toDateKey, fromDateKey, getNextSchoolDay, getFilterRange, matchesDateFilter };
    root.BetterSMSDateUtils = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
