/* Subject/group matching shared by the popup and unit tests. */
(function attachBetterSMSSubjectFilter(root) {
    'use strict';

    // The subject/teacher combinations are transcribed from the supplied timetable.
    const MATH = {
        Gp1: 'CPC', Gp2: 'SYT', Gp3: 'AWY',
        Gp4: 'NOK', Gp5: 'TKP', Gp6: 'HWS'
    };
    const ELECTIVES = {
        x1: { PHY: 'LWY', CHEM: 'LCO', HIST: 'TKY', CHIS: 'HKC', JAP: 'ATH', ECON: 'TYN' },
        x2: { BAFS: 'TPY', BIO: 'YSL', CHEM: 'PTW', CHIS: 'WCL', TH: 'CLY', VA: 'LNF' },
        x3: { BIO: 'NWK', ECON: 'LYK', GEOG: 'LHH', HIST: 'ATH', ICT: 'YMT', PHY: 'FHM' }
    };
    const ALL_ELECTIVES = Object.entries(ELECTIVES).flatMap(([block, subjects]) =>
        Object.entries(subjects).map(([code, teacher]) => ({ block, code, teacher }))
    );

    function normalize(value) {
        return String(value == null ? '' : value).normalize('NFKC').toUpperCase().replace(/\s+/g, ' ').trim();
    }

    function teacherTokens(value) {
        const text = normalize(value);
        return new Set(text.match(/\b[A-Z]{2,5}\b/g) || []);
    }

    // Match Chinese History before History; Chinese LANGUAGE is a common subject,
    // whereas Chinese History is a selectable elective.
    function electiveSubject(value) {
        const s = normalize(value);
        if (/\b(?:CHIS|CHINESE\s+HISTORY)\b|中國歷史|中国历史|中史/.test(s)) return 'CHIS';
        if (/\b(?:PHY|PHYSICS)\b|物理/.test(s)) return 'PHY';
        if (/\b(?:CHEM|CHEMISTRY)\b|化學|化学/.test(s)) return 'CHEM';
        if (/\b(?:HIST|HISTORY)\b|歷史|历史/.test(s)) return 'HIST';
        if (/\b(?:JAP|JAPANESE)\b|日語|日语|日文/.test(s)) return 'JAP';
        if (/\b(?:ECON|ECONOMICS)\b|經濟|经济/.test(s)) return 'ECON';
        if (/\b(?:BAFS|BUSINESS\s*,?\s*ACCOUNTING\s+AND\s+FINANCIAL\s+STUDIES)\b|企會財|企会财|企業、?會計與財務|企业、?会计与财务/.test(s)) return 'BAFS';
        if (/\b(?:BIO|BIOLOGY)\b|生物/.test(s)) return 'BIO';
        if (/\b(?:TH|THS|TOURISM(?:\s+AND\s+HOSPITALITY(?:\s+STUDIES)?)?)\b|旅遊與款待|旅游与款待|旅遊|旅游|旅航/.test(s)) return 'TH';
        if (/\b(?:VA|VAD|VISUAL\s+ARTS?)\b|視覺藝術|视觉艺术|視藝|视艺/.test(s)) return 'VA';
        if (/\b(?:GEOG|GEOGRAPHY)\b|地理/.test(s)) return 'GEOG';
        if (/\b(?:ICT|INFORMATION\s+(?:AND|&)\s+COMMUNICATION(?:S)?\s+TECHNOLOGY)\b|資訊(?:及|與)?通訊科技|资讯(?:及|与)?通讯科技|資訊科技|资讯科技|電腦|电脑/.test(s)) return 'ICT';
        return null;
    }

    function isCommonSubject(value) {
        const s = normalize(value);
        if (electiveSubject(s) === 'CHIS') return false;
        return /\bSTEAM\b|科學科技工程藝術數學|科学科技工程艺术数学/.test(s) ||
            /^(?:CHINESE(?:\s+LANG(?:UAGE)?)?|CHI|中國語文|中国语文|中文|華文|华文|語文|语文)(?:\s*[-(（:]|$)/.test(s) ||
            /\bENGLISH\b|^ENG(?:\s*[-(（:]|$)|英文|英語|英语|英國語文|英国语文/.test(s);
    }

    function isMathSubject(value) {
        const s = normalize(value);
        return /\b(?:MATH|MATHS|MATHEMATICS)\b|數學|数学|^M\s*[12]$/.test(s);
    }

    function moduleNumbers(value) {
        const s = normalize(value);
        const found = new Set();
        for (const match of s.matchAll(/(?:^|[^A-Z0-9])(?:M\s*([12])|MODULE\s*([12]))(?![A-Z0-9])/g)) {
            found.add(match[1] || match[2]);
        }
        for (const match of s.matchAll(/(?:延伸|延伸單元|延伸单元|單元|单元)\s*([一二12])/g)) {
            found.add(match[1] === '一' ? '1' : match[1] === '二' ? '2' : match[1]);
        }
        return [...found];
    }

    function mathGroups(value) {
        const s = normalize(value);
        const found = new Set();
        for (const match of s.matchAll(/\b(?:GP|GROUP)\s*0?([1-6])\b/g)) found.add(`Gp${match[1]}`);
        const digits = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
        for (const match of s.matchAll(/(?:第\s*)?([1-6一二三四五六])\s*[組组]/g)) {
            found.add(`Gp${digits[match[1]] || match[1]}`);
        }
        return [...found];
    }

    function electiveBlocks(value) {
        const s = normalize(value);
        const result = new Set();
        for (const match of s.matchAll(/(?:^|[^A-Z0-9])X\s*([123])(?![A-Z0-9])/g)) result.add(`x${match[1]}`);
        return [...result];
    }

    function result(visible, warning = '') {
        return { visible, warning };
    }

    function moduleAllowed(module, choice) {
        if (!['ALL', 'NONE', 'M1', 'M2', 'BOTH'].includes(choice)) choice = 'ALL';
        return choice === 'ALL' || choice === 'BOTH' || choice === `M${module}`;
    }

    function filterMath(record, profile) {
        const subject = normalize(record.subject);
        const content = normalize(record.content);
        const teacher = teacherTokens(record.teacher);
        const modules = moduleNumbers(`${subject} ${content}`);
        const looksExtended = /\bEXTENDED\b|延伸/.test(subject);

        // CPC and SYT also teach ordinary groups, so a teacher alone does NOT
        // turn a normal Mathematics entry into M1/M2.
        if (!modules.length && looksExtended) {
            if (teacher.has('CPC')) modules.push('1');
            if (teacher.has('SYT')) modules.push('2');
            if (!modules.length) return result(true, '延伸單元未能確認，請核對 SMS');
        }
        if (modules.length) {
            return result(modules.some(number => moduleAllowed(number, profile.modules)));
        }

        const chosen = Object.prototype.hasOwnProperty.call(MATH, profile.mathGroup) ? profile.mathGroup : 'ALL';
        if (chosen === 'ALL') return result(true);
        const groupsFromText = mathGroups(`${subject} ${content}`);
        const groupsFromTeacher = Object.entries(MATH)
            .filter(([, code]) => teacher.has(code))
            .map(([group]) => group);

        // Some records place the teacher code in the description instead.
        const contentTokens = teacherTokens(content);
        const groupsFromContentTeacher = Object.entries(MATH)
            .filter(([, code]) => contentTokens.has(code))
            .map(([group]) => group);
        const candidates = new Set([...groupsFromText, ...groupsFromTeacher, ...groupsFromContentTeacher]);
        if (!candidates.size) return result(true, '數學組別未能確認，請核對 SMS');
        const conflict = groupsFromText.length && groupsFromTeacher.length &&
            !groupsFromText.some(group => groupsFromTeacher.includes(group));
        if (candidates.has(chosen)) return result(true, conflict ? '數學組別與老師不一致，請核對 SMS' : '');

        // CPC and SYT also teach M1 and M2. Without an explicit Gp marker,
        // an apparently different math group could actually be the student's
        // extension module, so retain that possibility rather than hide it.
        const hasCpc = teacher.has('CPC') || contentTokens.has('CPC');
        const hasSyt = teacher.has('SYT') || contentTokens.has('SYT');
        if (!groupsFromText.length && ((hasCpc && moduleAllowed('1', profile.modules)) ||
            (hasSyt && moduleAllowed('2', profile.modules)))) {
            return result(true, '可能是 M1／M2，缺少明確組別標記，請核對 SMS');
        }
        return result(false);
    }

    function filterElective(record, profile) {
        const code = electiveSubject(record.subject);
        const blocks = electiveBlocks(`${record.subject || ''} ${record.content || ''}`);
        const tokens = teacherTokens(record.teacher);
        const teacherPairs = ALL_ELECTIVES.filter(entry => tokens.has(entry.teacher));
        const matchingTeacherPairs = code ? teacherPairs.filter(entry => entry.code === code) : [];

        const allowed = pair => {
            const choice = profile[pair.block];
            return !choice || choice === 'ALL' || !ELECTIVES[pair.block][choice] || choice === pair.code;
        };
        const showCandidates = (pairs, warning = '') => result(pairs.some(allowed), warning);

        // General subjects such as Other/CSD must not be hidden just because
        // their teacher also teaches an elective. An explicit X label can make
        // an otherwise unknown subject an elective, but without one it stays.
        if (!code && !blocks.length) return result(true, '未列於選科表，請核對是否適用');

        // User-selected rule: for a recognised subject/teacher combination,
        // the timetable teacher decides the X block, even if the description
        // says something different. ATH teaches JAP in X1 and HIST in X3, so
        // matching the subject as well as the teacher is essential.
        if (matchingTeacherPairs.length) {
            let warning = '';
            const agrees = !blocks.length || matchingTeacherPairs.some(pair => blocks.includes(pair.block));
            if (!agrees) {
                const assigned = [...new Set(matchingTeacherPairs.map(pair => pair.block.toUpperCase()))].join('／');
                warning = `X 組標記與老師不一致；依老師歸入 ${assigned}，請核對 SMS`;
            } else if (matchingTeacherPairs.length > 1) {
                warning = '有多個老師或組別，請核對 SMS';
            }
            return showCandidates(matchingTeacherPairs, warning);
        }

        if (code && teacherPairs.length) {
            // A recognised teacher assigned to a DIFFERENT subject (not just
            // a different X) is not enough to identify the real lesson. Keep
            // it visible rather than silently invent a subject assignment.
            return result(true, '科目與老師不一致，無法確認組別，請核對 SMS');
        }

        if (!code && teacherPairs.length) {
            // An unknown subject with an explicit X can still be identified by
            // a unique teacher. If one teacher maps to multiple subjects,
            // the X label helps only when it selects a unique candidate.
            const matchingBlocks = teacherPairs.filter(pair => blocks.includes(pair.block));
            const candidates = teacherPairs.length === 1 ? teacherPairs : matchingBlocks.length === 1 ? matchingBlocks : teacherPairs;
            const mismatch = !candidates.some(pair => blocks.includes(pair.block));
            const warning = mismatch ? 'X 組標記與老師不一致；以老師為準，請核對 SMS' :
                candidates.length > 1 ? '老師對應多個組別，請核對 SMS' : '科目名稱未能確認，請核對 SMS';
            return showCandidates(candidates, warning);
        }

        // If the teacher is unavailable or not in the timetable, fall back to
        // an explicit X marker, then to every possible block for the subject.
        if (blocks.length) {
            const candidates = [];
            let unresolved = false;
            blocks.forEach(block => {
                const pair = code && ALL_ELECTIVES.find(entry => entry.block === block && entry.code === code);
                if (pair) candidates.push(pair); else unresolved = true;
            });
            if (unresolved || !candidates.length) return result(true, '科目或 X 組別未能確認，請核對 SMS');
            return showCandidates(candidates, '未能以老師確認，已按 X 標記分類');
        }
        const candidates = ALL_ELECTIVES.filter(entry => entry.code === code);
        if (!candidates.length) return result(true, '科目或 X 組別未能確認，請核對 SMS');
        return showCandidates(candidates, 'X 組別未能確認，請核對 SMS');
    }

    function evaluate(record, profile = {}) {
        if (!record || typeof record !== 'object') return result(true);
        if (isCommonSubject(record.subject)) return result(true);
        const subject = normalize(record.subject);
        // Explicit M1/M2 entries can occasionally be filed as Other.
        const otherModule = /^(?:OTHER|其他)$/.test(subject) &&
            /^\s*[*\[(（-]*\s*(?:M\s*[12]|MODULE\s*[12])\b/.test(normalize(record.content));
        if (isMathSubject(record.subject) || otherModule) return filterMath(record, profile);
        return filterElective(record, profile);
    }

    const api = { MATH, ELECTIVES, electiveSubject, isCommonSubject, moduleNumbers, mathGroups, electiveBlocks, evaluate };
    root.BetterSMSSubjectFilter = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
