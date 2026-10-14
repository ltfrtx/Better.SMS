const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHomeworkTables, detectListKind, storageKeyForListKind, selectTablesForListKind } = require('../homework-parser.js');

const referenceDate = new Date(2026, 9, 1);

test('maps Traditional Chinese headers and extracts the original eClass fields', () => {
    const result = parseHomeworkTables([{
        rows: [
            { cells: [
                { text: '日期', isHeader: true },
                { text: '科目', isHeader: true },
                { text: '功課內容', isHeader: true },
                { text: '老師', isHeader: true },
                { text: '繳交時間', isHeader: true }
            ] },
            { cells: ['14/10/2026', '英文', '閱讀第十頁', 'CHAN', '明天'] }
        ]
    }], referenceDate);

    assert.equal(result.recognizedTableCount, 1);
    assert.equal(result.matchedRows, 1);
    assert.equal(result.unmatchedRows, 0);
    assert.deepEqual(result.homeworkList[0], {
        date: '14/10/2026',
        dateISO: '2026-10-14',
        subject: '英文',
        content: '閱讀第十頁',
        teacher: 'CHAN',
        time: '明天'
    });
});

test('maps Simplified Chinese headings after a language switch', () => {
    const result = parseHomeworkTables([{
        rows: [
            { cells: [
                { text: '课程', isHeader: true },
                { text: '作业内容', isHeader: true },
                { text: '缴交日期', isHeader: true }
            ] },
            { cells: ['数学', '完成练习 4', '2026年10月14日'] }
        ]
    }], referenceDate);

    assert.equal(result.matchedRows, 1);
    assert.equal(result.homeworkList[0].dateISO, '2026-10-14');
    assert.equal(result.homeworkList[0].subject, '数学');
    assert.equal(result.homeworkList[0].content, '完成练习 4');
});

test('uses localized English headers instead of fixed column positions', () => {
    const result = parseHomeworkTables([{
        rows: [
            { cells: [
                { text: 'Subject', isHeader: true },
                { text: 'Homework Details', isHeader: true },
                { text: 'Teacher', isHeader: true },
                { text: 'Due Date', isHeader: true },
                { text: 'Due Time', isHeader: true }
            ] },
            { cells: ['English', 'Read pages 10–12', 'CHAN', 'Wednesday, October 14, 2026', '08:00'] }
        ]
    }], referenceDate);

    assert.equal(result.matchedRows, 1);
    assert.deepEqual(result.homeworkList[0], {
        date: 'Wednesday, October 14, 2026',
        dateISO: '2026-10-14',
        subject: 'English',
        content: 'Read pages 10–12',
        teacher: 'CHAN',
        time: '08:00'
    });
    assert.deepEqual(result.tableDiagnostics[0].columns, {
        subject: 0,
        content: 1,
        teacher: 2,
        date: 3,
        time: 4
    });
});

test('supports unlabeled legacy tables with English month names', () => {
    const result = parseHomeworkTables([{
        rows: [
            { cells: ['14 October 2026', 'History', 'Read chapter 2', 'LEE'] }
        ]
    }], referenceDate);

    assert.equal(result.homeworkList.length, 1);
    assert.equal(result.homeworkList[0].dateISO, '2026-10-14');
    assert.equal(result.homeworkList[0].subject, 'History');
    assert.equal(result.homeworkList[0].content, 'Read chapter 2');
    assert.equal(result.homeworkList[0].teacher, 'LEE');
});

test('recognizes an empty translated homework table without inventing rows', () => {
    const result = parseHomeworkTables([{
        rows: [{ cells: [
            { text: 'Due Date', isHeader: true },
            { text: 'Subject', isHeader: true },
            { text: 'Assignment', isHeader: true }
        ] }]
    }], referenceDate);

    assert.equal(result.recognizedTableCount, 1);
    assert.equal(result.matchedRows, 0);
    assert.equal(result.unmatchedRows, 0);
    assert.deepEqual(result.homeworkList, []);
});

test('flags unrecognized rows in a recognized table instead of treating them as empty', () => {
    const result = parseHomeworkTables([{
        rows: [
            { cells: [
                { text: 'Date', isHeader: true },
                { text: 'Subject', isHeader: true },
                { text: 'Assignment', isHeader: true }
            ] },
            { cells: ['Next Wednesday', 'English', 'Read chapter 2'] }
        ]
    }], referenceDate);

    assert.equal(result.recognizedTableCount, 1);
    assert.equal(result.homeworkList.length, 0);
    assert.equal(result.unmatchedRows, 1);
});

test('deduplicates identical rows found in repeated visible tables', () => {
    const row = { cells: ['14/10/2026', 'Math', 'Exercise 1'] };
    const result = parseHomeworkTables([
        { rows: [row] },
        { rows: [row] }
    ], referenceDate);

    assert.equal(result.matchedRows, 1);
    assert.equal(result.homeworkList.length, 1);
});

test('classifies Reminder and 提醒 pages separately from homework', () => {
    assert.equal(detectListKind({
        pathname: '/student/Reminder.aspx',
        pageTitle: '4E Class - SMS',
        headings: ['4E CLASS', 'Reminder']
    }), 'reminder');
    assert.equal(detectListKind({
        pathname: '/student/notice',
        headings: ['提醒']
    }), 'reminder');
    assert.equal(detectListKind({
        pathname: '/student/homework',
        headings: ['Homework']
    }), 'homework');
    assert.equal(detectListKind({ headings: ['功課'] }), 'homework');
    assert.equal(detectListKind({ headings: ['提醒', 'Homework'] }), 'unknown');
    assert.equal(detectListKind({ primaryHeading: '提醒', headings: ['提醒', 'Homework'] }), 'reminder');
    assert.equal(detectListKind({ headings: ['4E CLASS'] }), 'unknown');
});

test('prioritizes Reminder headings and reminder containers over a homework URL', () => {
    assert.equal(detectListKind({
        pathname: '/student/homework',
        headings: ['4E 班', '提醒']
    }), 'reminder');
    assert.equal(detectListKind({
        pathname: '/student/homework',
        headings: ['4E 班', '提醒'],
        tableMetadata: [
            'section.student-homework-table',
            'section.student-reminder-table'
        ]
    }), 'reminder');
    assert.equal(detectListKind({
        pathname: '/student/homework',
        headings: ['提醒', 'Homework'],
        tableMetadata: ['main section.student-reminder-table.student-reminder-table-full']
    }), 'reminder');
    assert.equal(detectListKind({
        pathname: '/student/homework',
        tableMetadata: ['main section.student-reminder-table']
    }), 'reminder');
});

test('selects only matching list tables when both are present in the DOM', () => {
    const homeworkTable = { metadata: 'section.student-homework-table', rows: [] };
    const reminderTable = { metadata: 'section.student-reminder-table', rows: [] };
    const tables = [homeworkTable, reminderTable];

    assert.deepEqual(selectTablesForListKind(tables, 'homework'), [homeworkTable]);
    assert.deepEqual(selectTablesForListKind(tables, 'reminder'), [reminderTable]);
});

test('preserves untyped tables but excludes a marked opposite-list table', () => {
    const homeworkTable = { metadata: 'section.student-homework-table', rows: [] };
    const unknownTable = { metadata: 'table.data-grid', rows: [] };
    assert.deepEqual(selectTablesForListKind([homeworkTable, unknownTable], 'reminder'), [unknownTable]);
    assert.deepEqual(selectTablesForListKind([unknownTable], 'reminder'), [unknownTable]);
});

test('routes reminder and homework data to separate storage keys', () => {
    assert.equal(storageKeyForListKind('reminder'), 'reminderList');
    assert.equal(storageKeyForListKind('homework'), 'homeworkList');
    assert.equal(storageKeyForListKind('unknown'), '');
});

test('parses the English Reminder table shown in the supplied reference', () => {
    const result = parseHomeworkTables([{
        rows: [
            { cells: [
                { text: 'DATE', isHeader: true },
                { text: 'SUBJECT', isHeader: true },
                { text: 'DETAILS', isHeader: true }
            ] },
            ...Array.from({ length: 15 }, (_, index) => ({
                cells: [
                    `${14 + (index % 3)}/10/2026`,
                    ['Chinese History', 'Chemistry', 'English Language'][index % 3],
                    ['*X1:導引問題8', 'X2: $20', 'Reading RT'][index % 3] + ` (${index + 1})`
                ]
            }))
        ]
    }], referenceDate);

    assert.equal(result.recognizedTableCount, 1);
    assert.equal(result.homeworkList.length, 15);
    assert.equal(result.homeworkList[0].subject, 'Chinese History');
    assert.match(result.homeworkList[0].content, /導引問題8/);
    assert.equal(result.homeworkList[1].subject, 'Chemistry');
    assert.match(result.homeworkList[1].content, /X2: \$20/);
    assert.equal(result.homeworkList[2].subject, 'English Language');
    assert.equal(result.homeworkList[2].content, 'Reading RT (3)');
});
