const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
function app() {
    const dom = new JSDOM('<!doctype html><div id="analysis"></div>', { runScripts: 'outside-only' });
    for (const file of ['analysis-utils.js', 'analysis-ui.js']) dom.window.eval(fs.readFileSync(path.join(root, file), 'utf8'));
    return dom;
}

test('renders donut, per-subject legend, task details and a real cross-day estimate', () => {
    const dom = app(), w = dom.window, target = w.document.querySelector('#analysis');
    w.BetterSMSAnalysisUI.render(target, [
        { subject: 'Physics', content: 'Ex 3', date: '30/10/2026', time: '30 分鐘' },
        { subject: 'Math', content: 'Ex 8', date: '31/10/2026', time: '1 小時' }
    ], { dataAvailable: true, filterLabel: '下星期', now: new w.Date(2026, 9, 29, 23, 30) });
    assert.equal(target.querySelector('#analysis-finish-time').textContent, '01:00');
    assert.match(target.querySelector('.analysis-hero-time').textContent, /30\/10\/2026/);
    assert.equal(target.querySelector('#analysis-total').textContent, '1 小時 30 分鐘');
    assert.equal(target.querySelectorAll('.analysis-arc').length, 2);
    assert.equal(target.querySelectorAll('.analysis-task').length, 2);
    assert.match(target.querySelector('.analysis-scope').textContent, /下星期.*不含提醒/);
    assert.match(target.querySelector('.analysis-insight').textContent, /Math/);
    dom.window.close();
});

test('missing and zero times remain explicit and are not presented as a complete forecast', () => {
    const dom = app(), w = dom.window, target = w.document.querySelector('#analysis');
    w.BetterSMSAnalysisUI.render(target, [
        { subject: 'Math', time: '全日', content: 'Unknown' },
        { subject: 'English', time: '0 分鐘', content: 'Zero' }
    ], { dataAvailable: true, now: new w.Date(2026, 9, 29, 10, 0) });
    assert.equal(target.querySelector('#analysis-finish-time').textContent, '--:--');
    assert.match(target.textContent, /1 項時間未能辨識/);
    assert.match(target.textContent, /1 項顯示 0 分鐘/);
    assert.equal(target.querySelectorAll('.analysis-arc').length, 0);
    dom.window.close();
});

test('does not imply an empty task list if there is no synced data, and displays stale warnings', () => {
    const dom = app(), w = dom.window, target = w.document.querySelector('#analysis');
    w.BetterSMSAnalysisUI.render(target, [], { dataAvailable: false });
    assert.match(target.textContent, /尚未成功載入/);
    assert.equal(target.querySelector('#analysis-finish-time'), null);
    w.BetterSMSAnalysisUI.render(target, [], { dataAvailable: true, syncMessage: '同步失敗，使用上次資料。' });
    assert.match(target.textContent, /同步失敗/);
    assert.match(target.textContent, /沒有未完成功課/);
    dom.window.close();
});

test('escapes record content when rendering the analysis list', () => {
    const dom = app(), w = dom.window, target = w.document.querySelector('#analysis');
    w.BetterSMSAnalysisUI.render(target, [{ subject: 'Math', time: '10 分鐘', content: '<img src=x onerror=alert(1)>' }], { dataAvailable: true });
    assert.equal(target.querySelector('img'), null);
    assert.match(target.textContent, /<img src=x/);
    dom.window.close();
});

test('shows every subject tied for the most time instead of picking only one', () => {
    const dom = app(), w = dom.window, target = w.document.querySelector('#analysis');
    w.BetterSMSAnalysisUI.render(target, [{ subject: 'Math', time: '30 分鐘' }, { subject: 'Physics', time: '30 分鐘' }], { dataAvailable: true });
    assert.match(target.querySelector('.analysis-insight').textContent, /Math/);
    assert.match(target.querySelector('.analysis-insight').textContent, /Physics/);
    assert.match(target.querySelector('.analysis-insight').textContent, /每科/);
    dom.window.close();
});
