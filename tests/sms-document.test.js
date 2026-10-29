const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { parseDocument, sectionKind } = require('../sms-document.js');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/sms-synthetic.html'), 'utf8');
function parse(html = fixture, from = '2026-10-29') {
    const dom = new JSDOM(html, { url: 'https://sms.twghlkss.edu.hk/student/records.php?feature=homework' });
    try { return parseDocument(dom.window.document, from, new Date(2026, 9, 29)); }
    finally { dom.window.close(); }
}

test('separates the two SMS tables using their section headings and six real columns', () => {
    const result = parse();
    assert.equal(result.homeworkList.length, 6);
    assert.equal(result.reminderList.length, 4);
    assert.equal(result.sourceStartDate, '2026-10-29');
    assert.deepEqual(result.homeworkList[1], {
        date: '02/11/2026', dateISO: '2026-11-02', subject: 'Physics',
        content: '*X1: fictional physics exercise', teacher: 'LWY', time: '30 分鐘'
    });
    assert.equal(result.reminderList[1].content, '*X1: fictional physics reminder');
    assert.equal(result.diagnostics.sections.homework.unmatchedRows, 0);
    assert.equal(result.diagnostics.sections.reminders.unmatchedRows, 0);
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /fictional|測試/);
});

test('a matching homework and reminder are both retained, not cross-section deduplicated', () => {
    const h = fixture.replace('測試：中文提醒', '測試：中文作業').replace('<td>0 分鐘</td><td>WCH</td>', '<td>10 分鐘</td><td>WCH</td>');
    const data = parse(h);
    assert.equal(data.homeworkList[0].content, data.reminderList[0].content);
    assert.equal(data.homeworkList.length, 6);
    assert.equal(data.reminderList.length, 4);
});

test('English section titles and column headings work', () => {
    assert.equal(sectionKind('Homework'), 'homework');
    assert.equal(sectionKind('Reminders'), 'reminders');
    const translated = fixture.replace('>功課</h2>', '>Homework</h2>').replace('>提醒</h2>', '>Reminders</h2>')
        .replaceAll('>日期</th>', '>Date</th>').replaceAll('>科目</th>', '>Subject</th>')
        .replaceAll('>內容</th>', '>Content</th>').replaceAll('>預計時間</th>', '>Estimated Time</th>')
        .replaceAll('>指派老師</th>', '>Teacher</th>');
    const result = parse(translated);
    assert.equal(result.homeworkList.length, 6);
    assert.equal(result.reminderList.length, 4);
});

test('recognizes a valid empty table or an explicit no-reminders message', () => {
    const dom = new JSDOM(fixture);
    const doc = dom.window.document;
    const sections = doc.querySelectorAll('.student-homework-record-table');
    sections[0].querySelector('tbody').innerHTML = '<tr><td colspan="6">沒有相關功課</td></tr>';
    sections[1].outerHTML = '<p>沒有提醒</p>';
    const result = parseDocument(doc, '2026-10-29');
    assert.deepEqual(result.homeworkList, []);
    assert.deepEqual(result.reminderList, []);
    dom.window.close();
});

test('rejects login pages, missing sections, bad rows and date-range truncation', () => {
    assert.throws(() => parse('<html><body><form>Login</form></body></html>'), /登入/);
    const missing = fixture.replace('>提醒</h2>', '>其他資料</h2>');
    assert.throws(() => parse(missing), /提醒/);
    const broken = fixture.replace('<td>02/11/2026</td><td>2</td><td>Physics</td>', '<td>not a date</td><td>2</td><td>Physics</td>');
    assert.throws(() => parse(broken), /未能辨識/);
    assert.throws(() => parse(fixture, '2026-10-01'), /晚於要求/);
    const noDate = fixture.replace('value="2026-10-29"', 'value=""');
    assert.throws(() => parse(noDate), /起始日期/);
});

test('a date in the description does not rescue a malformed due-date column', () => {
    const broken = fixture.replace('<td>02/11/2026</td><td>2</td><td>Physics</td><td>*X1:', '<td>tomorrow</td><td>2</td><td>Physics</td><td>02/11/2026 *X1:');
    assert.throws(() => parse(broken), /未能辨識/);
});
