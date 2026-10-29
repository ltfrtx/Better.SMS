const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { parseDocument } = require('../sms-document.js');

const root = path.join(__dirname, '..');
const popupHTML = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/sms-synthetic.html'), 'utf8');
const scripts = ['date-utils.js', 'homework-parser.js', 'sms-document.js', 'sms-client.js', 'subject-filter.js', 'popup.js'];
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
    return { dom, window, doc: window.document, store, requests, errors };
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
    assert.equal(doc.querySelector('#list-tabs').hidden, true);
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
