const test = require('node:test');
const assert = require('node:assert/strict');
const dates = require('../date-utils.js');

function dateKey(value, referenceDate) {
    const parsed = dates.parseHomeworkDate(value, referenceDate);
    return parsed ? dates.toDateKey(parsed) : null;
}

test('parses common Hong Kong numeric and ISO date formats', () => {
    assert.equal(dateKey('14/10/2026'), '2026-10-14');
    assert.equal(dateKey('2026-10-14 08:30'), '2026-10-14');
    assert.equal(dateKey('10/14/2026'), '2026-10-14');
});

test('parses Chinese and English localized dates', () => {
    assert.equal(dateKey('2026年10月14日'), '2026-10-14');
    assert.equal(dateKey('10月14日', new Date(2026, 0, 1)), '2026-10-14');
    assert.equal(dateKey('Wednesday, October 14, 2026'), '2026-10-14');
    assert.equal(dateKey('14 Oct 2026'), '2026-10-14');
    assert.equal(dateKey('14th-Oct-2026'), '2026-10-14');
    assert.equal(dateKey('14/10/26'), '2026-10-14');
    assert.equal(dateKey('Oct 14, 26'), '2026-10-14');
});

test('rejects invalid calendar dates', () => {
    assert.equal(dateKey('31/02/2026'), null);
    assert.equal(dateKey('not a date'), null);
});

test('date keys are strictly validated and formatted in local calendar time', () => {
    assert.equal(dates.toDateKey(new Date(2026, 9, 4)), '2026-10-04');
    assert.equal(dates.fromDateKey('2026-02-30'), null);
    assert.equal(dates.fromDateKey('2026-10-14').getDate(), 14);
});
