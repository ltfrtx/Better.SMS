const test = require('node:test');
const assert = require('node:assert/strict');
const filter = require('../subject-filter.js');

const profile = { x1: 'PHY', x2: 'CHEM', x3: 'ICT', mathGroup: 'Gp6', modules: 'NONE' };
const item = (subject, teacher, content = '') => ({ subject, teacher, content });
const visible = (entry, p = profile) => filter.evaluate(entry, p).visible;

test('the supplied teacher timetable is transcribed for every selectable option', () => {
    assert.deepEqual(filter.MATH, { Gp1: 'CPC', Gp2: 'SYT', Gp3: 'AWY', Gp4: 'NOK', Gp5: 'TKP', Gp6: 'HWS' });
    assert.deepEqual(filter.ELECTIVES.x1, { PHY: 'LWY', CHEM: 'LCO', HIST: 'TKY', CHIS: 'HKC', JAP: 'ATH', ECON: 'TYN' });
    assert.deepEqual(filter.ELECTIVES.x2, { BAFS: 'TPY', BIO: 'YSL', CHEM: 'PTW', CHIS: 'WCL', TH: 'CLY', VA: 'LNF' });
    assert.deepEqual(filter.ELECTIVES.x3, { BIO: 'NWK', ECON: 'LYK', GEOG: 'LHH', HIST: 'ATH', ICT: 'YMT', PHY: 'FHM' });
});

test('every elective uses both the subject and teacher, including ATH in two different blocks', () => {
    const names = { PHY: 'Physics', CHEM: 'Chemistry', HIST: 'History', CHIS: 'Chinese History', JAP: 'Japanese', ECON: 'Economics', BAFS: 'BAFS', BIO: 'Biology', TH: 'Tourism and Hospitality Studies', VA: 'Visual Arts', GEOG: 'Geography', ICT: 'ICT' };
    for (const [block, options] of Object.entries(filter.ELECTIVES)) {
        const codes = Object.keys(options);
        for (const [code, teacher] of Object.entries(options)) {
            const p = { x1: 'ALL', x2: 'ALL', x3: 'ALL', mathGroup: 'ALL', modules: 'ALL', [block]: code };
            assert.equal(visible(item(names[code], teacher), p), true, `${block} ${code}`);
            p[block] = codes.find(other => other !== code);
            assert.equal(visible(item(names[code], teacher), p), false, `${block} ${code} must not match ${p[block]}`);
        }
    }
});

test('common subjects always show, but Chinese History is an elective', () => {
    for (const entry of [item('Chinese Language', 'HKC'), item('中文', 'WCL'), item('English Language', 'LWY'), item('STEAM', 'YMT')]) {
        assert.equal(visible(entry), true, entry.subject);
        assert.equal(filter.evaluate(entry, profile).warning, '');
    }
    assert.equal(visible(item('Chinese History', 'WCL', 'X2')), false);
    assert.equal(visible(item('中國歷史', 'WCL', 'X2'), { ...profile, x2: 'CHIS' }), true);
});

test('other and unknown compulsory subjects are kept with a warning, even with an elective teacher', () => {
    for (const entry of [item('Other', 'HWS'), item('CSD', 'YMT'), item('Integrated Science', 'LWY')]) {
        const answer = filter.evaluate(entry, profile);
        assert.equal(answer.visible, true);
        assert.match(answer.warning, /核對/);
    }
});

test('separates math groups using group markers and teacher codes', () => {
    assert.equal(visible(item('Mathematics', 'HWS', '*Gp6: exercise')), true);
    assert.equal(visible(item('Mathematics', 'SYT', '*SYT: exercise')), false);
    assert.equal(visible(item('數學', '無', '第六組 exercise')), true);
    const unknown = filter.evaluate(item('Math', '無', 'All students'), profile);
    assert.equal(unknown.visible, true);
    assert.match(unknown.warning, /未能確認/);
    const conflict = filter.evaluate(item('Math', 'SYT', 'Gp6 exercise'), profile);
    assert.equal(conflict.visible, true);
    assert.match(conflict.warning, /不一致/);
});

test('M1 and M2 are independent from normal groups, and default to showing all', () => {
    const m1 = item('Mathematics', 'CPC', '*M1: revision');
    const m2 = item('Mathematics', 'SYT', 'M2 homework');
    assert.equal(visible(m1), false);
    assert.equal(visible(m2), false);
    assert.equal(visible(m1, { ...profile, modules: 'M1' }), true);
    assert.equal(visible(m2, { ...profile, modules: 'M1' }), false);
    assert.equal(visible(m2, { ...profile, modules: 'M2' }), true);
    assert.equal(visible(m1, { ...profile, modules: 'ALL' }), true);
    assert.equal(visible(item('Mathematics Extended', 'CPC', 'exercise'), { ...profile, modules: 'M1' }), true);
    // CPC is Gp1 as well as M1: without a group label this may be M1,
    // so retain it with a warning; an explicit Gp1 is reliably filtered.
    const ambiguous = filter.evaluate(item('Mathematics', 'CPC', 'exercise'), { ...profile, modules: 'M1' });
    assert.equal(ambiguous.visible, true);
    assert.match(ambiguous.warning, /M1/);
    assert.equal(visible(item('Mathematics', 'CPC', 'Gp1 exercise'), { ...profile, modules: 'M1' }), false);
    assert.equal(visible(item('Mathematics', 'SYT', 'exercise'), { ...profile, modules: 'M2' }), true);
    assert.equal(visible(item('Other', 'SYT', '*M2: module work'), { ...profile, modules: 'M2' }), true);
});

test('explicit X labels can contain punctuation and inconsistent teacher/block data is kept for either possible owner', () => {
    const conflict = item('Physics', 'FHM', '*X1: assignment');
    const forX1 = filter.evaluate(conflict, profile);
    assert.equal(forX1.visible, true); assert.match(forX1.warning, /不一致/);
    assert.equal(visible(conflict, { ...profile, x1: 'HIST', x3: 'PHY' }), true);
    assert.equal(visible(conflict, { ...profile, x1: 'HIST', x3: 'ICT' }), false);
    assert.deepEqual(filter.electiveBlocks('*X1/X2: check'), ['x1', 'x2']);
    assert.deepEqual(filter.electiveBlocks('exercise EX1 and 2'), []);
});

test('when a subject could be in more than one block but teacher is missing, do not hide a possible match', () => {
    const entry = item('Chemistry', '無', 'exercise');
    assert.equal(visible(entry, { ...profile, x1: 'CHEM', x2: 'BIO' }), true);
    assert.equal(visible(entry, { ...profile, x1: 'PHY', x2: 'CHEM' }), true);
    assert.equal(visible(entry, { ...profile, x1: 'PHY', x2: 'BIO' }), false);
    assert.match(filter.evaluate(entry, profile).warning, /未能確認/);
});
