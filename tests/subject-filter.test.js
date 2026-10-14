const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesSelectedElectives } = require('../subject-filter.js');

const profileWithoutChemistry = { x1: 'PHY', x2: 'BIO', x3: 'BIO' };
const profileWithX2Chemistry = { x1: 'PHY', x2: 'CHEM', x3: 'BIO' };

test('filters untagged Chemistry by selected electives instead of passing it through', () => {
    const reminder = { subject: 'Chemistry', content: '$20 for your goggles and folder', teacher: '無' };
    assert.equal(matchesSelectedElectives(reminder, profileWithoutChemistry), false);
    assert.equal(matchesSelectedElectives(reminder, profileWithX2Chemistry), true);
});

test('honors X2 markers when deciding whether Chemistry is selected', () => {
    const reminder = { subject: 'Chemistry', content: 'X2: $20', teacher: '無' };
    assert.equal(matchesSelectedElectives(reminder, profileWithoutChemistry), false);
    assert.equal(matchesSelectedElectives(reminder, profileWithX2Chemistry), true);
});

test('keeps core subjects and lets ALL slots remain unfiltered', () => {
    assert.equal(matchesSelectedElectives({ subject: 'English Language' }, profileWithoutChemistry), true);
    assert.equal(matchesSelectedElectives({ subject: 'Chemistry' }, { x1: 'ALL', x2: 'BIO', x3: 'BIO' }), true);
});

test('does not confuse Chinese History with the History elective', () => {
    const row = { subject: 'Chinese History' };
    assert.equal(matchesSelectedElectives(row, { x1: 'PHY', x2: 'BIO', x3: 'HIST' }), false);
    assert.equal(matchesSelectedElectives(row, { x1: 'CHIS', x2: 'BIO', x3: 'HIST' }), true);
});
