const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('1.9.0 retains the toolbar action popup and declares the 800 by 600 target', () => {
    assert.equal(manifest.action.default_popup, 'popup.html');
    assert.equal(manifest.version, '1.9.0');
    assert.equal(manifest.version_name, 'BetterSMS_1.9.0');
    assert.match(html, /html\s*\{\s*width:\s*800px;\s*height:\s*600px;/);
    assert.match(html, /constrained-screen/);
    assert.match(html, /BetterSMS_1\.9\.0/);
});

test('wide layout and stacked-mode sections keep homework and reminders distinct', () => {
    assert.match(html, /@media\s*\(min-width:\s*680px\)/);
    assert.match(html, /#hw-list,\s*#reminder-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    assert.notEqual(doc.getElementById('homework-section'), doc.getElementById('reminders-section'));
    assert.equal(doc.querySelector('#date-accordion').open, false);
    assert.equal(doc.querySelector('#developer-tools').closest('#settings-panel').id, 'settings-panel');
    dom.window.close();
});

test('wide analysis overview groups the original estimate, metrics and square SVG', () => {
    const dom = new JSDOM('<!doctype html><div id="analysis"></div>', { runScripts: 'outside-only' });
    const w = dom.window;
    for (const file of ['date-utils.js','analysis-utils.js','analysis-ui.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
    const target = w.document.getElementById('analysis');
    w.BetterSMSAnalysisUI.render(target, [{subject:'Math', date:'02/11/2026', time:'30 分鐘', content:'Test'}], {dataAvailable:true});
    assert.ok(target.querySelector('.analysis-overview .analysis-facts .analysis-hero'));
    assert.ok(target.querySelector('.analysis-overview .analysis-facts .analysis-metrics'));
    assert.ok(target.querySelector('.analysis-overview .analysis-chart .analysis-donut'));
    assert.equal(target.querySelector('.analysis-donut').getAttribute('viewBox'), '0 0 120 120');
    assert.equal(target.querySelector('#analysis-total').textContent, '30 分鐘');
    assert.match(target.querySelector('.analysis-scope').textContent, /不含提醒/);
    dom.window.close();
});

test('header is sticky and student name selector is removed while four subjects remain', () => {
    assert.match(html, /\.header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*-14px;/s);
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    assert.equal(doc.querySelector('#profile-student'), null);
    assert.doesNotMatch(doc.querySelector('#profile-accordion').textContent, /選擇學生姓名/);
    for (const id of ['profile-math', 'profile-x1', 'profile-x2', 'profile-x3']) {
        assert.ok(doc.getElementById(id), `missing ${id}`);
    }
    assert.equal(doc.querySelector('#analysis-date-accordion').open, false);
    assert.ok(doc.querySelector('#analysis-date-accordion #analysis-custom-date'));
    assert.ok(doc.querySelector('#analysis-date-summary'));
    assert.equal(doc.querySelectorAll('input[name="theme"]').length, 2);
    dom.window.close();
});
