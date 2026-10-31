const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHomeworkTables } = require('../homework-parser.js');

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
