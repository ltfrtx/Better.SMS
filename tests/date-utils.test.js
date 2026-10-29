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

test('next school day skips weekends only', () => {
    assert.equal(dates.toDateKey(dates.getNextSchoolDay(new Date(2026, 9, 30))), '2026-11-02'); // Friday
    assert.equal(dates.toDateKey(dates.getNextSchoolDay(new Date(2026, 10, 1))), '2026-11-02'); // Sunday
});

test('next calendar week means the following Monday through Sunday', () => {
    for (const day of [26, 29]) { // Monday and Thursday
        const range = dates.getFilterRange('NEXT_WEEK', new Date(2026, 9, day));
        assert.equal(dates.toDateKey(range.start), '2026-11-02');
        assert.equal(dates.toDateKey(range.end), '2026-11-08');
    }
    const sunday = dates.getFilterRange('NEXT_WEEK', new Date(2026, 10, 1));
    assert.equal(dates.toDateKey(sunday.start), '2026-11-02');
});

test('seven days includes today and exactly six subsequent calendar dates', () => {
    const now = new Date(2026, 9, 29);
    const entry = dateISO => ({ dateISO });
    assert.equal(dates.matchesDateFilter(entry('2026-10-29'), 'NEXT_7_DAYS', now), true);
    assert.equal(dates.matchesDateFilter(entry('2026-11-04'), 'NEXT_7_DAYS', now), true);
    assert.equal(dates.matchesDateFilter(entry('2026-11-05'), 'NEXT_7_DAYS', now), false);
    assert.equal(dates.matchesDateFilter(entry('2026-11-02'), 'CUSTOM', now, '2026-11-02'), true);
    assert.equal(dates.matchesDateFilter(entry('2026-11-02'), 'CUSTOM', now, 'not-a-date'), false);
});

test('tomorrow is the next calendar day even when the next school day skips a weekend', () => {
    const friday = new Date(2026, 9, 30, 23, 45);
    const tomorrow = dates.getFilterRange('TOMORROW', friday);
    assert.equal(dates.toDateKey(tomorrow.start), '2026-10-31');
    assert.equal(dates.toDateKey(tomorrow.end), '2026-10-31');
    assert.equal(dates.toDateKey(dates.getFilterRange('NEXT_SCHOOL_DAY', friday).start), '2026-11-02');
    assert.equal(dates.matchesDateFilter({ dateISO: '2026-10-31' }, 'TOMORROW', friday), true);
    assert.equal(dates.matchesDateFilter({ dateISO: '2026-11-02' }, 'TOMORROW', friday), false);
    assert.equal(dates.toDateKey(dates.getFilterRange('TOMORROW', new Date(2026, 11, 31)).start), '2027-01-01');
    assert.equal(dates.toDateKey(dates.getFilterRange('TOMORROW', new Date(2028, 1, 28)).start), '2028-02-29');
});
