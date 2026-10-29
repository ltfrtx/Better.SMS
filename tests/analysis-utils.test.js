const test = require('node:test');
const assert = require('node:assert/strict');
const analysis = require('../analysis-utils.js');

test('parses SMS durations and common Chinese and English variants', () => {
    const examples = [
        ['30 分鐘', 30], ['０ 分鐘', 0], ['1 小時 30 分鐘', 90], ['1.5 小時', 90],
        ['2 hours 15 mins', 135], ['45 minutes', 45], ['30', 30], [20, 20], ['1h 5m', 65]
    ];
    for (const [input, expected] of examples) assert.equal(analysis.parseMinutes(input), expected, String(input));
});

test('does not mistake missing durations, time-of-day or malformed values for minutes', () => {
    for (const value of ['', null, '全日', '08:00', '30 分鐘 extra', '-5 分鐘', Infinity, '99999999999999']) {
        assert.equal(analysis.parseMinutes(value), null, String(value));
    }
});

test('sums known times, groups by subject, and estimates the end across midnight', () => {
    const start = new Date(2026, 9, 29, 23, 30);
    const data = [
        { subject: 'Physics', time: '30 分鐘', content: 'A' },
        { subject: 'physics', time: '15 分鐘', content: 'B' },
        { subject: 'Math', time: '1 小時', content: 'C' },
        { subject: 'Math', time: '全日', content: 'D' },
        { subject: 'Chinese', time: '0 分鐘', content: 'E' }
    ];
    const summary = analysis.summarize(data, start);
    assert.equal(summary.rows.length, 5);
    assert.equal(summary.totalMinutes, 105);
    assert.equal(summary.knownCount, 4);
    assert.equal(summary.unknownCount, 1);
    assert.equal(summary.zeroCount, 1);
    assert.equal(summary.groups.length, 3);
    assert.equal(summary.groups[0].subject, 'Math');
    assert.equal(summary.groups[0].minutes, 60);
    assert.equal(summary.groups[0].unknownCount, 1);
    assert.equal(summary.groups[1].subject, 'Physics');
    assert.equal(summary.groups[1].minutes, 45);
    assert.equal(summary.finish.getDate(), 30);
    assert.equal(summary.finish.getHours(), 1);
    assert.equal(summary.finish.getMinutes(), 15);
    assert.equal(start.getHours(), 23); // input Date is not mutated
});

test('reports unknown and empty datasets without inventing finish times', () => {
    assert.equal(analysis.summarize([], new Date(2026, 0, 1)).finish, null);
    const unknown = analysis.summarize([{ subject: 'ICT', time: '全日' }], new Date(2026, 0, 1));
    assert.equal(unknown.unknownCount, 1);
    assert.equal(unknown.finish, null);
    const zero = analysis.summarize([{ subject: 'ICT', time: '0 分鐘' }], new Date(2026, 0, 1, 9, 20));
    assert.equal(zero.totalMinutes, 0);
    assert.equal(zero.finish.getHours(), 9);
    assert.equal(zero.finish.getMinutes(), 20);
});

test('formats hours and minutes without rounding away fractional minutes', () => {
    assert.equal(analysis.formatDuration(0), '0 分鐘');
    assert.equal(analysis.formatDuration(90), '1 小時 30 分鐘');
    assert.equal(analysis.formatDuration(120), '2 小時');
    assert.equal(analysis.formatDuration(1.5), '1.5 分鐘');
    assert.equal(analysis.formatDuration(NaN), '時間未明');
});
