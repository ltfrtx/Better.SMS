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

test('Math Group alone controls M1/M2, including Gp6 and the unconfigured case', () => {
    const m1 = item('Mathematics', 'CPC', '*M1: revision');
    const m2 = item('Mathematics', 'SYT', 'M2 homework');
    const expected = { Gp1: ['M1', true, false], Gp2: ['M2', false, true],
        Gp3: ['NONE', false, false], Gp4: ['NONE', false, false],
        Gp5: ['NONE', false, false], Gp6: ['NONE', false, false], ALL: ['ALL', true, true] };
    for (const [group, [module, hasM1, hasM2]] of Object.entries(expected)) {
        assert.equal(filter.moduleForMathGroup(group), module);
        // Explicitly contradictory beta-era settings are ignored.
        const p = { ...profile, mathGroup: group, modules: hasM1 ? 'NONE' : 'BOTH' };
        assert.equal(visible(m1, p), hasM1, `${group} M1`);
        assert.equal(visible(m2, p), hasM2, `${group} M2`);
    }
    assert.equal(visible(item('Mathematics Extended', 'CPC', 'exercise'), { ...profile, mathGroup: 'Gp1' }), true);
    assert.equal(visible(item('Mathematics Extended', 'CPC', 'exercise'), { ...profile, mathGroup: 'Gp6', modules: 'M1' }), false);
    assert.equal(visible(item('Other', 'SYT', '*M2: module work'), { ...profile, mathGroup: 'Gp2' }), true);
    assert.equal(visible(item('Mathematics', 'CPC', 'Gp1 exercise'), { ...profile, mathGroup: 'Gp6', modules: 'M1' }), false);
    assert.equal(visible(item('Mathematics', 'SYT', 'exercise'), { ...profile, mathGroup: 'Gp2' }), true);
    assert.equal(visible(item('Mathematics', 'HWS', 'Gp6 exercise'), { ...profile, mathGroup: 'ALL', modules: 'NONE' }), true);
});

test('M1/M2 labels that conflict with a known teacher use the teacher with a warning', () => {
    const wrongM1 = item('Mathematics', 'SYT', 'M1: revision');
    const wrongM2 = item('Mathematics', 'CPC', 'M2: revision');
    const gp1 = { ...profile, mathGroup: 'Gp1' }, gp2 = { ...profile, mathGroup: 'Gp2' };
    assert.equal(visible(wrongM1, gp1), false);
    const m2Decision = filter.evaluate(wrongM1, gp2);
    assert.equal(m2Decision.visible, true);
    assert.match(m2Decision.warning, /依老師歸入 M2/);
    assert.equal(visible(wrongM2, gp2), false);
    assert.match(filter.evaluate(wrongM2, gp1).warning, /依老師歸入 M1/);
    assert.equal(visible(item('Mathematics', '無', 'M2 exercise'), gp2), true);
});

test('teacher wins when a same-subject X label conflicts with the timetable', () => {
    const conflict = item('Physics', 'FHM', '*X1: assignment');
    const forX1 = filter.evaluate(conflict, profile);
    assert.equal(forX1.visible, false); // X1 Physics alone is not enough.
    const forX3 = filter.evaluate(conflict, { ...profile, x1: 'HIST', x3: 'PHY' });
    assert.equal(forX3.visible, true);
    assert.match(forX3.warning, /依老師歸入 X3/);
    assert.equal(visible(conflict, { ...profile, x1: 'HIST', x3: 'ICT' }), false);
    assert.equal(visible(item('Physics', 'LWY', 'X3: assignment'), { ...profile, x1: 'PHY', x3: 'ICT' }), true);
    assert.equal(visible(item('Physics', 'LWY', 'X3: assignment'), { ...profile, x1: 'ECON', x3: 'PHY' }), false);
    assert.deepEqual(filter.electiveBlocks('*X1/X2: check'), ['x1', 'x2']);
    assert.deepEqual(filter.electiveBlocks('exercise EX1 and 2'), []);
});

test('same-named subjects are filtered by the correct block and teacher', () => {
    const cases = [
        ['Physics', 'LWY', 'x1', 'PHY', 'x3', 'PHY'],
        ['Physics', 'FHM', 'x3', 'PHY', 'x1', 'PHY'],
        ['Chemistry', 'LCO', 'x1', 'CHEM', 'x2', 'CHEM'],
        ['Chemistry', 'PTW', 'x2', 'CHEM', 'x1', 'CHEM'],
        ['Biology', 'YSL', 'x2', 'BIO', 'x3', 'BIO'],
        ['Biology', 'NWK', 'x3', 'BIO', 'x2', 'BIO'],
        ['Economics', 'TYN', 'x1', 'ECON', 'x3', 'ECON'],
        ['Economics', 'LYK', 'x3', 'ECON', 'x1', 'ECON'],
        ['Chinese History', 'HKC', 'x1', 'CHIS', 'x2', 'CHIS'],
        ['Chinese History', 'WCL', 'x2', 'CHIS', 'x1', 'CHIS']
    ];
    for (const [subject, teacher, rightBlock, rightCode, otherBlock, otherCode] of cases) {
        const selections = { x1: 'HIST', x2: 'VA', x3: 'ICT', mathGroup: 'Gp6', modules: 'NONE' };
        selections[rightBlock] = rightCode;
        assert.equal(visible(item(subject, teacher), selections), true, `${subject} ${teacher} correctly selected`);
        selections[rightBlock] = rightBlock === 'x2' ? 'VA' : 'HIST';
        selections[otherBlock] = otherCode;
        assert.equal(visible(item(subject, teacher), selections), false, `${subject} ${teacher} must not leak into ${otherBlock}`);
    }
});

test('subject disambiguates the teacher ATH in X1 Japanese versus X3 History', () => {
    const p = { ...profile, x1: 'JAP', x3: 'ICT' };
    assert.equal(visible(item('Japanese', 'ATH', 'X3 homework'), p), true);
    assert.equal(visible(item('History', 'ATH', 'X1 homework'), p), false);
    assert.equal(visible(item('History', 'ATH', 'X1 homework'), { ...p, x1: 'PHY', x3: 'HIST' }), true);
});

test('when the teacher cannot be reconciled with the subject, keep and warn rather than silently hide it', () => {
    const unexpected = filter.evaluate(item('Physics', 'TYN', 'X1'), profile);
    assert.equal(unexpected.visible, true);
    assert.match(unexpected.warning, /無法確認/);
    const unknownTeacher = filter.evaluate(item('Physics', 'unknown', '*X3 test'), { ...profile, x3: 'PHY' });
    assert.equal(unknownTeacher.visible, true);
    assert.match(unknownTeacher.warning, /X 標記/);
});

test('when a subject could be in more than one block but teacher is missing, do not hide a possible match', () => {
    const entry = item('Chemistry', '無', 'exercise');
    assert.equal(visible(entry, { ...profile, x1: 'CHEM', x2: 'BIO' }), true);
    assert.equal(visible(entry, { ...profile, x1: 'PHY', x2: 'CHEM' }), true);
    assert.equal(visible(entry, { ...profile, x1: 'PHY', x2: 'BIO' }), false);
    assert.match(filter.evaluate(entry, profile).warning, /未能確認/);
});
