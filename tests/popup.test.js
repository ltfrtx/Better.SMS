const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parseDocument } = require('../sms-document.js');

const root = path.join(__dirname, '..');
const popupHTML = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/sms-synthetic.html'), 'utf8');
const scripts = ['date-utils.js', 'homework-parser.js', 'sms-document.js', 'sms-client.js', 'subject-filter.js', 'analysis-utils.js', 'analysis-ui.js', 'popup.js'];
const clone = value => JSON.parse(JSON.stringify(value));
const sampleProfile = { x1: 'PHY', x2: 'CHEM', x3: 'ICT', mathGroup: 'Gp6', modules: 'NONE', dateFilter: 'ALL' };

function fixtureFor(date, html = fixture) { return html.replace('value="2026-10-29"', `value="${date}"`); }
function snapshot(date) {
    const dom = new JSDOM(fixtureFor(date));
    const result = parseDocument(dom.window.document, date);
    dom.window.close();
    return result;
}
function makePopup(options = {}) {
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', e => errors.push(e));
    const dom = new JSDOM(popupHTML, { url: 'https://extension.test/popup.html', runScripts: 'outside-only', virtualConsole });
    const { window } = dom;
    if (options.now) {
        const OriginalDate = window.Date;
        window.__fakeNow = new OriginalDate(options.now).getTime();
        window.Date = class FrozenDate extends OriginalDate {
            constructor(...args) { super(...(args.length ? args : [window.__fakeNow])); }
            static now() { return window.__fakeNow; }
        };
    }
    const intervals = [];
    if (options.captureIntervals) {
        window.setInterval = (fn, milliseconds) => { intervals.push({ fn, milliseconds }); return intervals.length; };
        window.clearInterval = () => {};
    }
    const store = clone(options.store || {});
    const changeListeners = [];
    const requests = [];
    window.chrome = {
        runtime: { lastError: null },
        storage: {
            local: {
                get(keys, callback) {
                    const value = {};
                    keys.forEach(key => { if (Object.hasOwn(store, key)) value[key] = clone(store[key]); });
                    queueMicrotask(() => callback(value));
                },
                set(values, callback) {
                    const changes = {};
                    for (const [key, value] of Object.entries(values)) {
                        changes[key] = { oldValue: store[key], newValue: clone(value) };
                        store[key] = clone(value);
                    }
                    queueMicrotask(() => {
                        changeListeners.forEach(listener => listener(changes, 'local'));
                        if (callback) callback();
                    });
                }
            },
            onChanged: { addListener(fn) { changeListeners.push(fn); } }
        },
        tabs: {
            query(_query, callback) { queueMicrotask(() => callback(options.tab ? [{ id: 12, active: true }] : [])); },
            sendMessage(_id, message, callback) {
                queueMicrotask(() => callback(options.tab ? { ok: true, data: snapshot(message.fromDate) } : null));
            }
        }
    };
    window.fetch = async (url, init) => {
        requests.push({ url: String(url), init });
        if (options.networkFailure) throw new TypeError('Failed to fetch');
        if (options.deferFirst && requests.length === 1) {
            await new Promise((resolve, reject) => {
                init.signal.addEventListener('abort', () => {
                    const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
                }, { once: true });
            });
        }
        const from = new URL(url).searchParams.get('date');
        return {
            ok: true, status: 200,
            url: options.redirectToLogin ? 'https://sms.twghlkss.edu.hk/login.php?portal=student' : String(url),
            text: async () => fixtureFor(from, options.html || fixture)
        };
    };
    for (const script of scripts) window.eval(fs.readFileSync(path.join(root, script), 'utf8'));
    return { dom, window, doc: window.document, store, requests, errors, intervals };
}
async function waitFor(condition, timeout = 3000) {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeout) throw new Error('Timed out waiting for popup state');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
function change(window, el, value) {
    el.value = value;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

test('popup fetches both sections, applies one profile, persists view preference and supports a historical date', async t => {
    const app = makePopup({ store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { window, doc, store, requests, errors } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(requests[0].init.credentials, 'include');
    assert.equal(new URL(requests[0].url).pathname, '/student/records.php');
    assert.equal(new URL(requests[0].url).searchParams.get('feature'), 'homework');
    assert.equal(doc.querySelectorAll('#hw-list .hw-card').length, 3);
    assert.equal(doc.querySelectorAll('#reminder-list .hw-card').length, 3);
    assert.equal(doc.querySelector('#reminders-section').hidden, true);
    doc.querySelector('#tab-reminders').click();
    assert.equal(doc.querySelector('#homework-section').hidden, true);
    assert.equal(doc.querySelector('#reminders-section').hidden, false);
    assert.equal(doc.querySelector('#tab-reminders').getAttribute('aria-selected'), 'true');
    doc.querySelector('#settings-button').click();
    const stacked = doc.querySelector('input[name="view-mode"][value="stacked"]');
    stacked.checked = true; stacked.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(doc.querySelector('#homework-section').hidden, false);
    assert.equal(doc.querySelector('#reminders-section').hidden, false);
    assert.equal(doc.querySelector('#list-tabs').hidden, false);
    assert.equal(doc.querySelector('#tab-reminders').hidden, true);
    assert.equal(doc.querySelector('#tab-homework').textContent.includes('功課＋提醒'), true);
    assert.equal(doc.querySelector('#lists-panel').getAttribute('role'), 'tabpanel');
    await waitFor(() => store.savedState.viewMode === 'stacked');
    const checkbox = doc.querySelector('#hw-list .hw-checkbox');
    checkbox.click();
    await waitFor(() => Object.values(store.completedHomeworkMap || {}).includes(true));
    doc.querySelector('#settings-close').click();
    doc.querySelector('#custom-date').value = '2020-01-01';
    doc.querySelector('#apply-custom-date').click();
    await waitFor(() => requests.length > 1 && store.sourceStartDate === '2020-01-01');
    assert.equal(new URL(requests.at(-1).url).searchParams.get('date'), '2020-01-01');
    assert.equal(store.savedState.fromDate, '2020-01-01');
    assert.equal(store.savedState.dateFilter, 'CUSTOM');
    assert.equal(doc.querySelector('#source-date').textContent.includes('2020-01-01'), true);
    assert.deepEqual(errors, []);
});

test('rapid changes to several profile selectors do not revert to older saved state', async t => {
    const app = makePopup({ store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.doc.querySelector('#sync-status').classList.contains('synced'));
    change(app.window, app.doc.querySelector('#profile-x1'), 'ECON');
    change(app.window, app.doc.querySelector('#profile-x2'), 'BIO');
    change(app.window, app.doc.querySelector('#profile-x3'), 'PHY');
    await waitFor(() => app.store.savedState.x1 === 'ECON' && app.store.savedState.x2 === 'BIO' && app.store.savedState.x3 === 'PHY');
    assert.equal(app.doc.querySelector('#profile-x1').value, 'ECON');
    assert.equal(app.doc.querySelector('#profile-x2').value, 'BIO');
    assert.equal(app.doc.querySelector('#profile-x3').value, 'PHY');
});

test('redirected login preserves the previously successful cache and shows an error', async t => {
    const data = snapshot('2020-01-01');
    const app = makePopup({ redirectToLogin: true, store: {
        savedState: { ...sampleProfile, fromDate: '2020-01-01' }, recordsSchemaVersion: 2,
        homeworkList: data.homeworkList, reminderList: data.reminderList,
        sourceStartDate: '2020-01-01', lastUpdated: '11/2 09:00', isSynced: true
    } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.doc.querySelector('#sync-status').classList.contains('error'));
    assert.equal(app.store.homeworkList.length, 6);
    assert.equal(app.store.reminderList.length, 4);
    assert.equal(app.store.lastUpdated, '11/2 09:00');
    assert.match(app.doc.querySelector('#sync-message').textContent, /登入/);
    assert.match(app.doc.querySelector('#sync-message').textContent, /上次成功/);
    assert.equal(app.doc.querySelectorAll('#hw-list .hw-card').length, 3);
});

test('falls back to a same-origin SMS tab when the extension fetch is blocked', async t => {
    const app = makePopup({ networkFailure: true, tab: true, store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(app.store.syncDiagnostics.source, 'sms-tab');
    assert.equal(app.store.homeworkList.length, 6);
    assert.equal(app.store.reminderList.length, 4);
    assert.doesNotMatch(JSON.stringify(app.store.syncDiagnostics), /fictional|測試/);
});

test('legacy mixed cache is not mislabeled as homework after an upgrade', async t => {
    const app = makePopup({ networkFailure: true, store: {
        homeworkList: [{ date: '02/11/2026', subject: 'English', content: 'old mixed entry' }],
        completedHomeworkMap: { legacy: true }
    } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.doc.querySelector('#sync-status').classList.contains('error'));
    assert.doesNotMatch(app.doc.querySelector('#hw-list').textContent, /old mixed entry/);
    assert.equal(app.store.homeworkList.length, 1);
    assert.equal(app.store.completedHomeworkMap.legacy, true);
});

test('HTML metacharacters from SMS records are displayed as text, not executable markup', async t => {
    const html = fixture.replace('測試：中文作業', '&lt;img src=x onerror=alert(1)&gt;');
    const app = makePopup({ html, store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(app.doc.querySelector('#hw-list img'), null);
    assert.match(app.doc.querySelector('#hw-list').textContent, /<img src=x/);
});

test('an in-flight later-date fetch is restarted when the user selects an earlier covered date', async t => {
    const data = snapshot('2020-01-01');
    const app = makePopup({ deferFirst: true, store: {
        savedState: { ...sampleProfile, fromDate: '2025-01-01' }, recordsSchemaVersion: 2,
        homeworkList: data.homeworkList, reminderList: data.reminderList,
        sourceStartDate: '2020-01-01', lastUpdated: '11/2 09:00', isSynced: true
    } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.requests.length === 1);
    app.doc.querySelector('#custom-date').value = '2022-01-01';
    app.doc.querySelector('#apply-custom-date').click();
    await waitFor(() => app.requests.length === 2 && app.store.sourceStartDate === '2022-01-01');
    assert.equal(new URL(app.requests[1].url).searchParams.get('date'), '2022-01-01');
    assert.equal(app.requests[0].init.signal.aborted, true);
});

test('date controls start collapsed, show the saved selection, and remain functional when expanded', async t => {
    const app = makePopup({ store: { savedState: { ...sampleProfile, dateFilter: 'NEXT_WEEK' } } });
    t.after(() => app.dom.window.close());
    const { doc, store } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    const dateBox = doc.querySelector('#date-accordion');
    assert.equal(dateBox.open, false);
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '下星期');
    assert.equal(doc.querySelector('[data-date-filter="NEXT_WEEK"]').getAttribute('aria-pressed'), 'true');
    dateBox.querySelector('summary').click();
    assert.equal(dateBox.open, true);
    doc.querySelector('[data-date-filter="TODAY"]').click();
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '今天');
    await waitFor(() => store.savedState.dateFilter === 'TODAY');
    dateBox.querySelector('summary').click();
    assert.equal(dateBox.open, false);
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '今天');
    dateBox.querySelector('summary').click();
    doc.querySelector('#custom-date').value = '2020-01-01';
    doc.querySelector('#apply-custom-date').click();
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '指定：2020-01-01');
    await waitFor(() => store.sourceStartDate === '2020-01-01');
});

test('developer tools are inside the settings dialog and can still be enabled', async t => {
    const app = makePopup({ store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc, store } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    const settings = doc.querySelector('#settings-panel');
    const developer = doc.querySelector('#developer-tools');
    assert.equal(settings.hidden, true);
    assert.equal(settings.contains(developer), true);
    assert.equal(developer.open, false);
    doc.querySelector('#settings-button').click();
    assert.equal(settings.hidden, false);
    developer.querySelector('summary').click();
    assert.equal(developer.open, true);
    doc.querySelector('#dev-mode-toggle').click();
    assert.equal(doc.querySelector('#dev-panel').hidden, false);
    assert.equal(doc.querySelector('#dev-mode-state').textContent, '已啟用');
    await waitFor(() => store.developerMode === true);
    doc.querySelector('#settings-close').click();
    assert.equal(settings.hidden, true);
});

test('teacher-priority filtering applies independently to homework and reminders', async t => {
    const row = '<tr><td>03/11/2026</td><td>9</td><td>Physics</td><td>X1: wrong-label example</td><td>30 分鐘</td><td>FHM</td></tr>';
    let html = fixture.replace('</tbody>', `${row}</tbody>`);
    const last = html.lastIndexOf('</tbody>');
    html = html.slice(0, last) + row + html.slice(last);
    const app = makePopup({ html, store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    await waitFor(() => app.doc.querySelector('#sync-status').classList.contains('synced'));
    assert.doesNotMatch(app.doc.querySelector('#hw-list').textContent, /wrong-label example/);
    assert.doesNotMatch(app.doc.querySelector('#reminder-list').textContent, /wrong-label example/);
    change(app.window, app.doc.querySelector('#profile-x3'), 'PHY');
    assert.match(app.doc.querySelector('#hw-list').textContent, /wrong-label example/);
    assert.match(app.doc.querySelector('#hw-list').textContent, /依老師歸入 X3/);
    assert.match(app.doc.querySelector('#reminder-list').textContent, /wrong-label example/);
});

test('Beta donut uses only filtered incomplete homework and updates after completion', async t => {
    const app = makePopup({ store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(doc.querySelector('#settings-panel').contains(doc.querySelector('#analysis-content')), false);
    assert.match(doc.querySelector('#analysis-section .analysis-title').textContent, /測試版/);
    assert.equal(doc.querySelector('#analysis-section').hidden, true);
    doc.querySelector('#tab-analysis').click();
    assert.equal(doc.querySelector('#analysis-section').hidden, false);
    await waitFor(() => doc.querySelector('#analysis-total'));
    assert.equal(doc.querySelector('#analysis-total').textContent, '1 小時 10 分鐘');
    assert.equal(doc.querySelectorAll('#analysis-content .analysis-task').length, 3);
    assert.equal(doc.querySelectorAll('#analysis-content .analysis-arc').length, 3);
    assert.doesNotMatch(doc.querySelector('#analysis-content').textContent, /fictional physics reminder/);
    assert.match(doc.querySelector('#analysis-content').textContent, /不計休息/);
    doc.querySelector('#tab-homework').click();
    doc.querySelector('#hw-list .hw-checkbox').click(); // 10 minute Chinese task
    doc.querySelector('#tab-analysis').click();
    await waitFor(() => doc.querySelector('#analysis-total') && doc.querySelector('#analysis-total').textContent === '1 小時');
    assert.equal(doc.querySelectorAll('#analysis-content .analysis-task').length, 2);
});

test('Beta marks missing durations and never represents the known subtotal as a complete estimate', async t => {
    const extra = '<tr><td>02/11/2026</td><td>9</td><td>Mathematics</td><td>Gp6 unknown time</td><td>全日</td><td>HWS</td></tr>';
    const html = fixture.replace('</tbody>', `${extra}</tbody>`);
    const app = makePopup({ html, store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    doc.querySelector('#tab-analysis').click();
    await waitFor(() => doc.querySelector('#analysis-total'));
    assert.equal(doc.querySelector('#analysis-total').textContent, '1 小時 10 分鐘');
    assert.equal(doc.querySelectorAll('#analysis-content .analysis-task').length, 4);
    assert.match(doc.querySelector('#analysis-content').textContent, /1 項時間未能辨識/);
    assert.match(doc.querySelector('#analysis-content').textContent, /並非完整估算/);
    assert.equal(doc.querySelector('#analysis-content .analysis-hero-label').textContent, '已知時數估算完成');
});

test('Beta analysis respects the selected date and never counts reminder entries', async t => {
    const extra = '<tr><td>03/11/2026</td><td>9</td><td>Mathematics</td><td>Gp6 later assignment</td><td>20 分鐘</td><td>HWS</td></tr>';
    const app = makePopup({ html: fixture.replace('</tbody>', `${extra}</tbody>`), store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    doc.querySelector('#date-accordion summary').click();
    doc.querySelector('#custom-date').value = '2026-11-03';
    doc.querySelector('#apply-custom-date').click();
    await waitFor(() => doc.querySelector('#date-filter-summary').textContent === '指定：2026-11-03');
    doc.querySelector('#tab-analysis').click();
    await waitFor(() => doc.querySelector('#analysis-total'));
    assert.equal(doc.querySelector('#analysis-total').textContent, '20 分鐘');
    assert.equal(doc.querySelectorAll('#analysis-content .analysis-task').length, 1);
    assert.match(doc.querySelector('#analysis-content').textContent, /Gp6 later assignment/);
    assert.doesNotMatch(doc.querySelector('#analysis-content').textContent, /fictional joint lesson/);
});

test('Beta excludes the other Physics class from analysis and surfaces conflicts for the correct class', async t => {
    const row = '<tr><td>03/11/2026</td><td>9</td><td>Physics</td><td>X1: FHM conflict task</td><td>180 分鐘</td><td>FHM</td></tr>';
    const app = makePopup({ html: fixture.replace('</tbody>', `${row}</tbody>`), store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    doc.querySelector('#tab-analysis').click();
    await waitFor(() => doc.querySelector('#analysis-total'));
    assert.equal(doc.querySelector('#analysis-total').textContent, '1 小時 10 分鐘');
    assert.doesNotMatch(doc.querySelector('#analysis-content').textContent, /FHM conflict task/);
    change(app.window, doc.querySelector('#profile-x3'), 'PHY');
    await waitFor(() => doc.querySelector('#analysis-total')?.textContent === '4 小時 10 分鐘');
    assert.match(doc.querySelector('#analysis-content').textContent, /FHM conflict task/);
    assert.match(doc.querySelector('#analysis-content').textContent, /依老師歸入 X3/);
    assert.match(doc.querySelector('#analysis-content').textContent, /老師：FHM/);
});

test('Beta warns if analysis is based on an old cache after a sync error', async t => {
    const data = snapshot('2020-01-01');
    const app = makePopup({ redirectToLogin: true, store: {
        savedState: { ...sampleProfile, fromDate: '2020-01-01' }, recordsSchemaVersion: 2,
        homeworkList: data.homeworkList, reminderList: data.reminderList,
        sourceStartDate: '2020-01-01', lastUpdated: '11/2 09:00', isSynced: true
    } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('error'));
    doc.querySelector('#tab-analysis').click();
    await waitFor(() => doc.querySelector('#analysis-total'));
    assert.match(doc.querySelector('#analysis-content').textContent, /使用上次成功資料/);
    assert.equal(doc.querySelector('#analysis-total').textContent, '1 小時 10 分鐘');
});

test('migrates a legacy module setting and applies the Math Group to homework and reminders', async t => {
    const extraHw = '<tr><td>03/11/2026</td><td>10</td><td>Mathematics</td><td>M2 homework example</td><td>20 分鐘</td><td>SYT</td></tr>';
    const m1Rem = '<tr><td>03/11/2026</td><td>11</td><td>Mathematics</td><td>M1 reminder example</td><td>0 分鐘</td><td>CPC</td></tr>';
    const m2Rem = '<tr><td>03/11/2026</td><td>12</td><td>Mathematics</td><td>M2 reminder example</td><td>0 分鐘</td><td>SYT</td></tr>';
    let html = fixture.replace('</tbody>', `${extraHw}</tbody>`);
    const last = html.lastIndexOf('</tbody>');
    html = html.slice(0, last) + m1Rem + m2Rem + html.slice(last);
    const app = makePopup({ html, store: { savedState: { ...sampleProfile, mathGroup: 'Gp1', modules: 'NONE' } } });
    t.after(() => app.dom.window.close());
    const { doc, window, store } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    await waitFor(() => !Object.hasOwn(store.savedState, 'modules'));
    assert.equal(doc.querySelector('#profile-modules'), null);
    assert.match(doc.querySelector('#profile-math').selectedOptions[0].textContent, /M1/);
    assert.match(doc.querySelector('#hw-list').textContent, /M1: fictional module exercise/);
    assert.doesNotMatch(doc.querySelector('#hw-list').textContent, /M2 homework example/);
    assert.match(doc.querySelector('#reminder-list').textContent, /M1 reminder example/);
    assert.doesNotMatch(doc.querySelector('#reminder-list').textContent, /M2 reminder example/);
    change(window, doc.querySelector('#profile-math'), 'Gp2');
    assert.doesNotMatch(doc.querySelector('#hw-list').textContent, /M1: fictional module exercise/);
    assert.match(doc.querySelector('#hw-list').textContent, /M2 homework example/);
    assert.doesNotMatch(doc.querySelector('#reminder-list').textContent, /M1 reminder example/);
    assert.match(doc.querySelector('#reminder-list').textContent, /M2 reminder example/);
    change(window, doc.querySelector('#profile-math'), 'Gp6');
    assert.doesNotMatch(doc.querySelector('#hw-list').textContent, /M1: fictional module|M2 homework example/);
    assert.doesNotMatch(doc.querySelector('#reminder-list').textContent, /M[12] reminder example/);
    change(window, doc.querySelector('#profile-math'), 'ALL');
    assert.match(doc.querySelector('#hw-list').textContent, /M1: fictional module exercise/);
    assert.match(doc.querySelector('#hw-list').textContent, /M2 homework example/);
    assert.match(doc.querySelector('#reminder-list').textContent, /M1 reminder example/);
    assert.match(doc.querySelector('#reminder-list').textContent, /M2 reminder example/);
});

test('analysis totals and synchronised date controls distinguish tomorrow, school day and any date', async t => {
    const saturday = '<tr><td>31/10/2026</td><td>9</td><td>Mathematics</td><td>Gp6 Saturday task</td><td>15 分鐘</td><td>HWS</td></tr>';
    const tuesday = '<tr><td>03/11/2026</td><td>10</td><td>Mathematics</td><td>Gp6 Tuesday task</td><td>20 分鐘</td><td>HWS</td></tr>';
    const app = makePopup({ now: new Date(2026, 9, 30, 12), html: fixture.replace('</tbody>', `${saturday}${tuesday}</tbody>`), store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc, store, requests } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    doc.querySelector('#tab-analysis').click();
    assert.equal(doc.querySelector('#analysis-total').textContent, '1 小時 45 分鐘');
    const daySummary = () => [...doc.querySelectorAll('#analysis-content .analysis-day summary')].map(node => node.textContent);
    assert.equal(daySummary().length, 3);
    assert.match(daySummary()[0], /31\/10\/2026.*1 項.*15 分鐘/);
    assert.match(daySummary()[1], /02\/11\/2026.*3 項.*1 小時 10 分鐘/);
    assert.match(daySummary()[2], /03\/11\/2026.*1 項.*20 分鐘/);
    doc.querySelector('#analysis-section [data-date-filter="TOMORROW"]').click();
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '明天');
    assert.equal(doc.querySelector('#analysis-total').textContent, '15 分鐘');
    assert.match(doc.querySelector('#hw-list').textContent, /Saturday task/);
    assert.doesNotMatch(doc.querySelector('#hw-list').textContent, /Tuesday task/);
    assert.equal(doc.querySelector('#date-accordion [data-date-filter="TOMORROW"]').getAttribute('aria-pressed'), 'true');
    doc.querySelector('#analysis-section [data-date-filter="NEXT_SCHOOL_DAY"]').click();
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '下個上學天');
    assert.equal(doc.querySelector('#analysis-total').textContent, '1 小時 10 分鐘');
    assert.match(daySummary()[0], /02\/11\/2026.*3 項/);
    doc.querySelector('#analysis-custom-date').value = '2026-11-03';
    doc.querySelector('#analysis-apply-custom-date').click();
    assert.equal(doc.querySelector('#custom-date').value, '2026-11-03');
    assert.equal(doc.querySelector('#analysis-total').textContent, '20 分鐘');
    assert.match(doc.querySelector('#analysis-content').textContent, /Tuesday task/);
    assert.doesNotMatch(doc.querySelector('#analysis-content').textContent, /fictional joint lesson/);
    // Going backwards from the original 30 Oct source must trigger a fresh fetch.
    doc.querySelector('#analysis-custom-date').value = '2026-10-29';
    doc.querySelector('#analysis-apply-custom-date').click();
    await waitFor(() => requests.some(r => new URL(r.url).searchParams.get('date') === '2026-10-29'));
    await waitFor(() => store.sourceStartDate === '2026-10-29');
    assert.equal(store.savedState.fromDate, '2026-10-29');
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '指定：2026-10-29');
});

test('three tabs and stacked mode support keyboard navigation and persist the analysis view', async t => {
    const app = makePopup({ store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc, window, store } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    const key = (id, value) => doc.querySelector(id).dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true }));
    key('#tab-homework', 'ArrowRight');
    assert.equal(doc.activeElement.id, 'tab-reminders');
    key('#tab-reminders', 'ArrowRight');
    assert.equal(doc.activeElement.id, 'tab-analysis');
    assert.equal(doc.querySelector('#analysis-section').hidden, false);
    key('#tab-analysis', 'Home'); assert.equal(doc.activeElement.id, 'tab-homework');
    key('#tab-homework', 'End'); assert.equal(doc.activeElement.id, 'tab-analysis');
    doc.querySelector('#settings-button').click();
    const stacked = doc.querySelector('input[name="view-mode"][value="stacked"]');
    stacked.checked = true; stacked.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(doc.querySelector('#tab-reminders').hidden, true);
    assert.equal(doc.querySelector('#analysis-section').hidden, false);
    assert.equal(doc.querySelector('#lists-panel').hidden, true);
    doc.querySelector('#settings-close').click();
    key('#tab-analysis', 'ArrowRight');
    assert.equal(doc.activeElement.id, 'tab-homework');
    assert.equal(doc.querySelector('#lists-panel').hidden, false);
    assert.equal(doc.querySelector('#homework-section').hidden, false);
    assert.equal(doc.querySelector('#reminders-section').hidden, false);
    key('#tab-homework', 'ArrowLeft'); assert.equal(doc.activeElement.id, 'tab-analysis');
    await waitFor(() => store.savedState.viewMode === 'stacked' && store.savedState.activeTab === 'analysis');
    const reloaded = makePopup({ store });
    t.after(() => reloaded.dom.window.close());
    await waitFor(() => reloaded.doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(reloaded.doc.querySelector('#analysis-section').hidden, false);
    assert.equal(reloaded.doc.querySelector('#tab-reminders').hidden, true);
});

test('when the selected day is earlier than the failed cache, analysis does not imply it was covered', async t => {
    const data = snapshot('2026-10-30');
    const app = makePopup({ now: new Date(2026, 9, 30, 12), redirectToLogin: true, store: {
        savedState: { ...sampleProfile, fromDate: '2026-10-30' }, recordsSchemaVersion: 2,
        homeworkList: data.homeworkList, reminderList: data.reminderList,
        sourceStartDate: '2026-10-30', isSynced: true
    } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('error'));
    doc.querySelector('#tab-analysis').click();
    doc.querySelector('#analysis-custom-date').value = '2026-10-29';
    doc.querySelector('#analysis-apply-custom-date').click();
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('error'));
    assert.match(doc.querySelector('#analysis-content').textContent, /現有快取未涵蓋所選日期/);
    assert.equal(doc.querySelector('#source-date').textContent.includes('2026-10-30'), true);
});

test('minute clock keeps a day expanded but relative dates roll over at midnight', async t => {
    const saturday = '<tr><td>31/10/2026</td><td>9</td><td>Mathematics</td><td>Gp6 Saturday task</td><td>15 分鐘</td><td>HWS</td></tr>';
    const app = makePopup({ now: new Date(2026, 9, 30, 23, 58), captureIntervals: true,
        html: fixture.replace('</tbody>', `${saturday}</tbody>`), store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc, window, intervals } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    doc.querySelector('#tab-analysis').click();
    doc.querySelector('#analysis-section [data-date-filter="TOMORROW"]').click();
    const day = doc.querySelector('.analysis-day');
    assert.equal(day.open, true);
    day.querySelector('summary').focus();
    const callback = intervals.at(-1);
    assert.equal(callback.milliseconds, 60000);
    window.__fakeNow += 60000;
    callback.fn();
    assert.equal(doc.querySelector('.analysis-day'), day);
    assert.equal(doc.activeElement, day.querySelector('summary'));
    assert.equal(doc.querySelector('#analysis-finish-time').textContent, '00:14');
    window.__fakeNow += 60000;
    callback.fn(); // It is now Saturday; "tomorrow" means Sunday, not Saturday.
    assert.equal(doc.querySelector('.analysis-day'), null);
    assert.match(doc.querySelector('#analysis-content').textContent, /沒有未完成功課/);
});

test('migrates old student field without losing Math/X choices or completion ticks', async t => {
    const data = snapshot('2026-10-30');
    const item = data.homeworkList.find(row => row.subject === 'Chinese Language');
    assert.ok(item);
    const key = `${item.date}_${item.subject}_${item.content}_${item.teacher}`;
    const oldState = { student: '0', mathGroup: 'Gp6', x1: 'PHY', x2: 'CHEM', x3: 'ICT', dateFilter: 'ALL', viewMode: 'tabs' };
    const app = makePopup({ store: { savedState: oldState, completedHomeworkMap: { [key]: true } } });
    t.after(() => app.dom.window.close());
    const { doc, store } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    await waitFor(() => !Object.hasOwn(store.savedState, 'student'));
    assert.equal(doc.querySelector('#profile-student'), null);
    assert.equal(doc.querySelector('#profile-math').value, 'Gp6');
    assert.equal(doc.querySelector('#profile-x1').value, 'PHY');
    assert.equal(doc.querySelector('#profile-x2').value, 'CHEM');
    assert.equal(doc.querySelector('#profile-x3').value, 'ICT');
    assert.match(doc.querySelector('#profile-summary-tag').textContent, /Math Gp6.*X1 PHY.*X2 CHEM.*X3 ICT/);
    assert.equal(store.completedHomeworkMap[key], true);
    const card = [...doc.querySelectorAll('#hw-list .hw-card')].find(node => node.textContent.includes('測試：中文作業'));
    assert.ok(card && card.querySelector('.hw-checkbox').checked);
});

test('analysis date accordion starts collapsed and mirrors both shared date controls', async t => {
    const app = makePopup({ now: new Date(2026, 9, 30, 12), store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    doc.querySelector('#tab-analysis').click();
    const acc = doc.querySelector('#analysis-date-accordion');
    assert.equal(acc.open, false);
    assert.equal(doc.querySelector('#analysis-date-summary').textContent, '全部已載入');
    acc.querySelector('summary').click();
    assert.equal(acc.open, true);
    acc.querySelector('[data-date-filter="TOMORROW"]').click();
    assert.equal(doc.querySelector('#analysis-date-summary').textContent, '明天');
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '明天');
    assert.equal(doc.querySelector('#date-accordion [data-date-filter="TOMORROW"]').getAttribute('aria-pressed'), 'true');
    doc.querySelector('#analysis-custom-date').value = '2026-11-03';
    doc.querySelector('#analysis-apply-custom-date').click();
    assert.equal(doc.querySelector('#analysis-date-summary').textContent, '指定：2026-11-03');
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '指定：2026-11-03');
    assert.equal(doc.querySelector('#custom-date').value, '2026-11-03');
    acc.querySelector('summary').click();
    assert.equal(acc.open, false);
    doc.querySelector('#date-accordion [data-date-filter="NEXT_WEEK"]').click();
    assert.equal(doc.querySelector('#analysis-date-summary').textContent, '下星期');
    assert.equal(doc.querySelector('#date-filter-summary').textContent, '下星期');
});

test('theme defaults to light, survives rapid preference changes and reload, and can be reset', async t => {
    const app = makePopup({ store: { savedState: sampleProfile } });
    t.after(() => app.dom.window.close());
    const { doc, window, store } = app;
    await waitFor(() => doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(doc.documentElement.dataset.theme, 'light');
    assert.equal(doc.querySelector('input[name="theme"][value="light"]').checked, true);
    doc.querySelector('#settings-button').click();
    const dark = doc.querySelector('input[name="theme"][value="dark"]');
    dark.checked = true; dark.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(doc.documentElement.dataset.theme, 'dark');
    change(window, doc.querySelector('#profile-x2'), 'BIO');
    await waitFor(() => store.savedState.theme === 'dark' && store.savedState.x2 === 'BIO');
    const reloaded = makePopup({ store });
    t.after(() => reloaded.dom.window.close());
    await waitFor(() => reloaded.doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(reloaded.doc.documentElement.dataset.theme, 'dark');
    assert.equal(reloaded.doc.querySelector('input[name="theme"][value="dark"]').checked, true);
    assert.equal(reloaded.doc.querySelector('#profile-x2').value, 'BIO');
    const light = reloaded.doc.querySelector('input[name="theme"][value="light"]');
    light.checked = true; light.dispatchEvent(new reloaded.window.Event('change', { bubbles: true }));
    await waitFor(() => reloaded.store.savedState.theme === 'light');
    assert.equal(reloaded.doc.documentElement.dataset.theme, 'light');
    const fallback = makePopup({ store: { savedState: { ...sampleProfile, theme: 'invalid' } } });
    t.after(() => fallback.dom.window.close());
    await waitFor(() => fallback.doc.querySelector('#sync-status').classList.contains('synced'));
    assert.equal(fallback.doc.documentElement.dataset.theme, 'light');
});
