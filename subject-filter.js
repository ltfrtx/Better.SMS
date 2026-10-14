/* Subject/option-aware filtering used for both homework and reminders. */
(function attachBetterSMSSubjectFilter(root) {
    'use strict';

    const COURSE_MAPS = {
        x1: {
            PHY: { teacher: 'LWY', names: ['PHY', 'PHYSICS', '物理'] },
            CHEM: { teacher: 'LCO', names: ['CHEM', 'CHEMISTRY', '化學', '化学'] },
            HIST: { teacher: 'TKY', names: ['HIST', 'HISTORY', '歷史', '历史'] },
            CHIS: { teacher: 'HKC', names: ['CHIS', 'CHINESE HISTORY', '中國歷史', '中国历史', '中史'] },
            JAP: { teacher: 'ATH', names: ['JAP', 'JAPANESE', '日語', '日语', '日文'] },
            ECON: { teacher: 'TYN', names: ['ECON', 'ECONOMICS', '經濟', '经济'] }
        },
        x2: {
            BAFS: { teacher: 'TPY', names: ['BAFS', '企會財', '企会财'] },
            BIO: { teacher: 'YSL', names: ['BIO', 'BIOLOGY', '生物'] },
            CHEM: { teacher: 'PTW', names: ['CHEM', 'CHEMISTRY', '化學', '化学'] },
            CHIS: { teacher: 'WCL', names: ['CHIS', 'CHINESE HISTORY', '中國歷史', '中国历史', '中史'] },
            TH: { teacher: 'CLY', names: ['TH', 'TOURISM', '旅航', '旅遊', '旅游', 'THS'] },
            VA: { teacher: 'LNF', names: ['VA', 'VISUAL ARTS', '視藝', '視覺藝術', '视觉艺术', 'VAD'] }
        },
        x3: {
            BIO: { teacher: 'NWK', names: ['BIO', 'BIOLOGY', '生物'] },
            ECON: { teacher: 'LYK', names: ['ECON', 'ECONOMICS', '經濟', '经济'] },
            GEOG: { teacher: 'LHH', names: ['GEOG', 'GEOGRAPHY', '地理'] },
            HIST: { teacher: 'ATH', names: ['HIST', 'HISTORY', '歷史', '历史'] },
            ICT: { teacher: 'YMT', names: ['ICT', '資訊科技', '信息技术', '電腦', '电脑'] },
            PHY: { teacher: 'FHM', names: ['PHY', 'PHYSICS', '物理'] }
        }
    };

    function normalized(value) {
        return String(value == null ? '' : value).normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim();
    }

    function aliasMatches(subject, alias) {
        const name = normalized(alias);
        if (!name) return false;
        // Avoid classifying Chinese History as the separate History elective.
        if (name === 'HISTORY' && subject.includes('CHINESE HISTORY')) return false;
        if (/^[A-Z0-9]+$/.test(name)) {
            return new RegExp(`(^|[^A-Z0-9])${name}($|[^A-Z0-9])`).test(subject);
        }
        return subject.includes(name);
    }

    function getItemText(item) {
        return {
            subject: normalized(item && item.subject),
            teacher: normalized(item && item.teacher),
            content: normalized(item && item.content)
        };
    }

    function matchesEntry(entry, itemText, includeContent) {
        const teacherMatches = entry.teacher && itemText.teacher.includes(entry.teacher);
        const subjectMatches = entry.names.some(name => aliasMatches(itemText.subject, name));
        const contentMatches = includeContent && entry.names.some(name => aliasMatches(itemText.content, name));
        return Boolean(teacherMatches || subjectMatches || contentMatches);
    }

    /**
     * Apply the selected X1/X2/X3 options to a homework/reminder row.
     * A row with an explicit X1/X2/X3 marker is checked against that slot.
     * An unmarked subject such as Chemistry is checked against every slot in
     * which that course is offered, fixing the old filter's prefix-only gap.
     */
    function matchesSelectedElectives(item, state = {}) {
        const itemText = getItemText(item);
        const slotMarker = `${itemText.subject} ${itemText.content}`.match(/(?:^|[^A-Z0-9])X([123])(?=$|[^A-Z0-9])/);

        if (slotMarker) {
            const slot = `x${slotMarker[1]}`;
            const selected = state[slot] || 'ALL';
            if (selected === 'ALL') return true;
            const entry = COURSE_MAPS[slot] && COURSE_MAPS[slot][selected];
            return entry ? matchesEntry(entry, itemText, true) : true;
        }

        const teacherCandidates = [];
        const subjectCandidates = [];
        Object.entries(COURSE_MAPS).forEach(([slot, courses]) => {
            Object.entries(courses).forEach(([code, entry]) => {
                if (entry.teacher && itemText.teacher.includes(entry.teacher)) {
                    teacherCandidates.push({ slot, code });
                }
                if (entry.names.some(name => aliasMatches(itemText.subject, name))) {
                    subjectCandidates.push({ slot, code });
                }
            });
        });

        const candidates = teacherCandidates.length ? teacherCandidates : subjectCandidates;
        if (!candidates.length) return true;
        return candidates.some(({ slot, code }) => {
            const selected = state[slot] || 'ALL';
            return selected === 'ALL' || selected === code;
        });
    }

    const api = { COURSE_MAPS, matchesSelectedElectives };
    root.BetterSMSSubjectFilter = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
