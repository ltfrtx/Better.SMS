/* Locale-independent table parser shared by the content script and unit tests. */
(function attachBetterSMSHomeworkParser(root) {
    'use strict';

    const dateUtils = root.BetterSMSDateUtils ||
        (typeof require === 'function' ? require('./date-utils.js') : null);

    function cleanText(value) {
        return String(value == null ? '' : value)
            .replace(/\r/g, '')
            .replace(/[\u00a0\u202f]/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function oneLine(value) {
        return cleanText(value).replace(/\s+/g, ' ').trim();
    }

    function headerRole(value) {
        const text = oneLine(value).normalize('NFKC').toLowerCase();
        if (!text) return [];

        const roles = [];
        if (/\b(date|due date|submission date|deadline|issued date|date set)\b|日期|到期日|到期日期|繳交日|缴交日|繳交日期|缴交日期|提交日|提交日期|截止日|截止日期|遞交日期|递交日期/.test(text)) {
            roles.push('date');
        }
        if (/\b(due time|submission time|time|deadline time)\b|時間|时间|時限|时限|截止時間|截止时间|繳交時間|缴交时间|提交時間|提交时间/.test(text)) {
            roles.push('time');
        }
        if (/\b(subject|subject name|course(?: name)?|learning area)\b|科目|學科|学科|課程|课程/.test(text)) {
            roles.push('subject');
        }
        if (/\b(teacher|assigned by|staff member|instructor)\b|老師|老师|教師|教师|任課教師|任课教师/.test(text)) {
            roles.push('teacher');
        }
        if (/\b(homework|assignment|details?|description|task|content|exercise|work)\b|功課|功课|作業|作业|習作|习作|內容|内容|詳情|详情/.test(text)) {
            roles.push('content');
        }
        return roles;
    }

    function findHeaderMap(rows) {
        let best = null;
        rows.forEach((row, rowIndex) => {
            const indexes = {};
            const headers = [];
            let headerCellCount = 0;

            row.cells.forEach((cell, index) => {
                if (cell.isHeader) headerCellCount += 1;
                const roles = headerRole(cell.text);
                if (roles.length) headers.push({ index, roles });
                roles.forEach(role => {
                    if (indexes[role] == null) indexes[role] = index;
                });
            });

            const hasDateAndField = indexes.date != null &&
                (indexes.subject != null || indexes.content != null);
            const confident = hasDateAndField && (headerCellCount > 0 || headers.length >= 2);
            if (!confident) return;

            const score = new Set(headers.flatMap(header => header.roles)).size;
            if (!best || score > best.score || (score === best.score && headerCellCount > best.headerCellCount)) {
                best = { rowIndex, indexes, score, headerCellCount };
            }
        });
        return best;
    }

    function parsedDateAt(values, index, referenceDate) {
        if (index == null || index < 0 || index >= values.length || !dateUtils) return null;
        return dateUtils.parseHomeworkDate(values[index], referenceDate);
    }

    function chooseDateIndex(values, headerMap, referenceDate) {
        const mappedDate = headerMap && headerMap.indexes.date;
        if (mappedDate != null && parsedDateAt(values, mappedDate, referenceDate)) return mappedDate;
        return values.findIndex((value, index) => Boolean(parsedDateAt(values, index, referenceDate)));
    }

    function chooseSubjectIndex(values, dateIndex, headerMap) {
        const explicit = headerMap && headerMap.indexes.subject;
        if (explicit != null && explicit !== dateIndex && oneLine(values[explicit])) return explicit;

        // Retain the original eClass layout (date, subject, content, ...).
        if (dateIndex === 0 && values.length > 1 && oneLine(values[1])) return 1;
        if (dateIndex > 0 && oneLine(values[dateIndex - 1])) return dateIndex - 1;

        return values.findIndex((value, index) => index !== dateIndex && Boolean(oneLine(value)));
    }

    function chooseContentIndex(values, dateIndex, subjectIndex, headerMap) {
        const explicit = headerMap && headerMap.indexes.content;
        if (explicit != null && explicit !== dateIndex && explicit !== subjectIndex) return explicit;

        // Preserve the legacy eClass column order if no translated header exists.
        if (dateIndex === 0 && subjectIndex === 1 && values.length > 2) return 2;

        for (let index = 0; index < values.length; index += 1) {
            if (index !== dateIndex && index !== subjectIndex && oneLine(values[index])) return index;
        }
        return -1;
    }

    function pickOptionalValue(values, headerMap, role, fallbackIndex, excluded) {
        const explicitIndex = headerMap && headerMap.indexes[role];
        if (explicitIndex != null && !excluded.has(explicitIndex)) {
            const value = oneLine(values[explicitIndex]);
            if (value) return value;
        }
        if (fallbackIndex != null && fallbackIndex < values.length && !excluded.has(fallbackIndex)) {
            return oneLine(values[fallbackIndex]);
        }
        return '';
    }

    function storageKeyForListKind(listKind) {
        if (listKind === 'homework') return 'homeworkList';
        if (listKind === 'reminder') return 'reminderList';
        return '';
    }

    function detectListKind(context = {}) {
        const headings = Array.isArray(context.headings) ? context.headings : [];
        const tableMetadata = Array.isArray(context.tableMetadata) ? context.tableMetadata : [];

        function kindIn(value) {
            const text = oneLine(value).toLowerCase();
            const isReminder = /(?:^|[^a-z0-9])reminders?(?:$|[^a-z0-9])|提醒|提示/.test(text);
            const isHomework = /(?:^|[^a-z0-9])homework(?:$|[^a-z0-9])|(?:^|[^a-z0-9])assignments?(?:$|[^a-z0-9])|功課|功课|作業|作业/.test(text);
            if (isReminder === isHomework) return '';
            return isReminder ? 'reminder' : 'homework';
        }

        // Page-specific headings and table containers outrank URLs: SMS can
        // render multiple list tables under a shared student route, and a URL
        // containing "homework" must not override a visible Reminder page.
        const primaryHeadingKind = kindIn(context.primaryHeading || '');
        if (primaryHeadingKind) return primaryHeadingKind;

        const tableKinds = new Set(tableMetadata.map(kindIn).filter(Boolean));
        if (tableKinds.size === 1) return [...tableKinds][0];

        const headingKinds = new Set(headings.map(kindIn).filter(Boolean));
        if (headingKinds.size === 1) return [...headingKinds][0];

        for (const value of [context.pageTitle, context.pathname]) {
            const kind = kindIn(value || '');
            if (kind) return kind;
        }
        return 'unknown';
    }

    function selectTablesForListKind(tables, listKind) {
        const tableModels = Array.isArray(tables) ? tables : [];
        const tableKinds = tableModels.map(table => detectListKind({
            tableMetadata: [table && table.metadata || '']
        }));
        const matchingTables = tableModels.filter((_table, index) => tableKinds[index] === listKind);
        if (matchingTables.length > 0) return matchingTables;

        // If the DOM contains typed tables but none belongs to the active list,
        // only inspect untyped tables. This avoids accidentally parsing the
        // homework table as reminders, or committing a blank wrong-list result.
        if (tableKinds.some(kind => kind !== 'unknown')) {
            return tableModels.filter((_table, index) => tableKinds[index] === 'unknown');
        }
        return tableModels;
    }

    function parseHomeworkTables(tables, referenceDate) {
        const homeworkList = [];
        const seen = new Set();
        const tableDiagnostics = [];
        let recognizedTableCount = 0;
        let rowsSeen = 0;
        let matchedRows = 0;
        let unmatchedRows = 0;

        (tables || []).forEach((table, tableIndex) => {
            const rows = (table && Array.isArray(table.rows) ? table.rows : []).map(row => ({
                cells: (row && Array.isArray(row.cells) ? row.cells : []).map(cell => {
                    if (typeof cell === 'string' || typeof cell === 'number') {
                        return { text: cleanText(cell), isHeader: false };
                    }
                    return {
                        text: cleanText(cell && cell.text),
                        isHeader: Boolean(cell && cell.isHeader)
                    };
                })
            }));
            const headerMap = findHeaderMap(rows);
            let tableMatchedRows = 0;
            let tableUnmatchedRows = 0;
            let tableDataRows = 0;
            let sawDate = false;

            rows.forEach((row, rowIndex) => {
                rowsSeen += 1;
                const isSelectedHeader = headerMap && rowIndex === headerMap.rowIndex;
                const isHeaderOnlyRow = row.cells.length > 0 && row.cells.every(cell => cell.isHeader);
                if (isSelectedHeader || isHeaderOnlyRow) return;

                const values = row.cells.map(cell => cell.text);
                if (!values.length || !values.some(value => Boolean(oneLine(value)))) return;
                if (headerMap) tableDataRows += 1;

                const dateIndex = chooseDateIndex(values, headerMap, referenceDate);
                if (dateIndex < 0) {
                    if (headerMap) {
                        tableUnmatchedRows += 1;
                        unmatchedRows += 1;
                    }
                    return;
                }
                sawDate = true;

                // For unlabelled tables, require the three columns expected by
                // the original eClass table to avoid treating calendars as homework.
                if (!headerMap && values.length < 3) return;

                const parsedDate = parsedDateAt(values, dateIndex, referenceDate);
                const subjectIndex = chooseSubjectIndex(values, dateIndex, headerMap);
                const subject = subjectIndex >= 0 ? oneLine(values[subjectIndex]) : '';
                if (!parsedDate || !subject) {
                    if (headerMap) {
                        tableUnmatchedRows += 1;
                        unmatchedRows += 1;
                    }
                    return;
                }

                const contentIndex = chooseContentIndex(values, dateIndex, subjectIndex, headerMap);
                const content = contentIndex >= 0 ? cleanText(values[contentIndex]) : '';
                const excludedIndexes = new Set([dateIndex, subjectIndex, contentIndex]);
                const legacyColumns = dateIndex === 0 && subjectIndex === 1;
                const teacher = pickOptionalValue(
                    values,
                    headerMap,
                    'teacher',
                    legacyColumns ? 3 : null,
                    excludedIndexes
                ) || '無';
                const time = pickOptionalValue(
                    values,
                    headerMap,
                    'time',
                    legacyColumns ? 4 : null,
                    excludedIndexes
                ) || '全日';
                const date = oneLine(values[dateIndex]);
                const record = {
                    date,
                    dateISO: dateUtils ? dateUtils.toDateKey(parsedDate) : '',
                    subject,
                    content,
                    teacher,
                    time
                };
                const key = JSON.stringify([record.dateISO, record.date, subject, content, teacher, time]);
                if (seen.has(key)) return;
                seen.add(key);
                homeworkList.push(record);
                tableMatchedRows += 1;
                matchedRows += 1;
            });

            const recognized = Boolean(headerMap || tableMatchedRows > 0);
            if (recognized) recognizedTableCount += 1;
            if (recognized || sawDate) {
                const headerIndexes = headerMap ? [...new Set(Object.values(headerMap.indexes))] : [];
                const headerLabels = headerMap
                    ? headerIndexes.map(index => ({ column: index, label: oneLine(rows[headerMap.rowIndex].cells[index].text) }))
                    : [];
                tableDiagnostics.push({
                    tableIndex,
                    container: oneLine(table && table.metadata).slice(0, 160),
                    headerRowIndex: headerMap ? headerMap.rowIndex : null,
                    columns: headerMap ? { ...headerMap.indexes } : null,
                    headerLabels,
                    rowsSeen: rows.length,
                    dataRows: tableDataRows,
                    matchedRows: tableMatchedRows,
                    unmatchedRows: tableUnmatchedRows,
                    recognized
                });
            }
        });

        return {
            homeworkList,
            recognizedTableCount,
            rowsSeen,
            matchedRows,
            unmatchedRows,
            tableDiagnostics
        };
    }

    const api = { parseHomeworkTables, cleanText, headerRole, detectListKind, storageKeyForListKind, selectTablesForListKind };
    root.BetterSMSHomeworkParser = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
