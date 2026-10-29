/* Beta chart renderer: all labels come from DOM text nodes, not HTML injection. */
(function attachBetterSMSAnalysisUI(root) {
    'use strict';

    const analysis = root.BetterSMSAnalysis;
    const palette = ['#0284c7', '#0d9488', '#8b5cf6', '#f59e0b', '#e11d48', '#6366f1', '#65a30d', '#ea580c', '#0891b2', '#be185d'];
    const svgNS = 'http://www.w3.org/2000/svg';

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }
    function svgElement(tag, attrs) {
        const node = document.createElementNS(svgNS, tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
        return node;
    }
    function shortDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${date.getFullYear()}`;
    }
    function clock(date) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    function percentage(value) {
        const rounded = Math.round(value * 10) / 10;
        return value > 0 && rounded === 0 ? '<0.1%' : `${rounded}%`;
    }

    function donut(summary) {
        const svg = svgElement('svg', { viewBox: '0 0 120 120', class: 'analysis-donut', role: 'img' });
        const label = summary.totalMinutes > 0
            ? summary.groups.filter(group => group.minutes > 0).map(group => `${group.subject} ${analysis.formatDuration(group.minutes)}`).join('，')
            : '目前沒有可繪製的已知分鐘數';
        svg.setAttribute('aria-label', `科目時間分布：${label}`);
        const radius = 43;
        const circumference = 2 * Math.PI * radius;
        svg.appendChild(svgElement('circle', { cx: 60, cy: 60, r: radius, fill: 'none', stroke: '#e2e8f0', 'stroke-width': 14 }));
        let offset = 0;
        summary.groups.forEach((group, index) => {
            const length = summary.totalMinutes > 0 ? group.minutes / summary.totalMinutes * circumference : 0;
            if (length > 0) {
                const arc = svgElement('circle', {
                    cx: 60, cy: 60, r: radius, fill: 'none', stroke: palette[index % palette.length],
                    'stroke-width': 14, 'stroke-dasharray': `${length} ${Math.max(0, circumference - length)}`,
                    'stroke-dashoffset': -offset, transform: 'rotate(-90 60 60)', class: 'analysis-arc'
                });
                svg.appendChild(arc);
                offset += length;
            }
        });
        const total = svgElement('text', { x: 60, y: 58, 'text-anchor': 'middle', class: 'analysis-donut-number' });
        total.textContent = String(summary.totalMinutes);
        const unit = svgElement('text', { x: 60, y: 75, 'text-anchor': 'middle', class: 'analysis-donut-unit' });
        unit.textContent = '已知分鐘';
        svg.appendChild(total); svg.appendChild(unit);
        return svg;
    }

    function makeLegend(groups) {
        const legend = element('ul', 'analysis-legend');
        groups.forEach((group, index) => {
            const row = element('li', 'analysis-legend-row');
            const dot = element('span', 'analysis-dot');
            dot.style.backgroundColor = group.minutes > 0 ? palette[index % palette.length] : '#cbd5e1';
            dot.setAttribute('aria-hidden', 'true');
            const details = element('span', 'analysis-legend-label');
            const title = element('strong', '', group.subject);
            const duration = group.knownCount ? analysis.formatDuration(group.minutes) : '時間未明';
            const unknown = group.unknownCount ? ` · ${group.unknownCount} 項未估時` : '';
            const percent = group.minutes > 0 ? ` · ${percentage(group.percentage)}` : '';
            details.append(title, element('small', '', `${duration}${percent}${unknown}`));
            row.append(dot, details); legend.appendChild(row);
        });
        return legend;
    }

    function makeTaskList(rows) {
        const list = element('ul', 'analysis-task-list');
        rows.forEach(row => {
            const task = row.task;
            const item = element('li', 'analysis-task');
            const title = element('div', 'analysis-task-title');
            title.append(element('strong', '', row.subject), element('span', 'analysis-task-duration',
                row.minutes === null ? '時間未明' : analysis.formatDuration(row.minutes)));
            item.appendChild(title);
            if (task.content) item.appendChild(element('div', 'analysis-task-content', task.content));
            const teacher = task.teacher && task.teacher !== '無' ? ` · 老師：${task.teacher}` : '';
            item.appendChild(element('small', 'analysis-task-date', `SMS 日期：${task.date || task.dateISO || '未提供'}${teacher}`));
            if (task.analysisWarning) item.appendChild(element('div', 'analysis-task-warning', `⚠ ${task.analysisWarning}`));
            list.appendChild(item);
        });
        return list;
    }

    function makeDayGroups(summary, previousOpen) {
        const days = analysis.groupByDate(summary.rows, summary.start);
        const list = element('div', 'analysis-day-list');
        const weekday = ['日', '一', '二', '三', '四', '五', '六'];
        days.forEach((day, index) => {
            const section = element('details', 'analysis-day');
            section.dataset.analysisDate = day.key;
            section.open = previousOpen.has(day.key) ? previousOpen.get(day.key) : (days.length === 1 || (!previousOpen.size && index === 0));
            const header = element('summary', 'analysis-day-summary');
            const dateLabel = day.date ? `${shortDate(day.date)}（週${weekday[day.date.getDay()]}）` : '日期未明';
            const left = element('span', 'analysis-day-date', dateLabel);
            const duration = day.knownCount ? analysis.formatDuration(day.minutes) : '時間未明';
            const unknown = day.unknownCount ? ` · ${day.unknownCount} 項未估時` : '';
            const right = element('span', 'analysis-day-total', `${day.rows.length} 項 · ${duration}${unknown}`);
            header.append(left, right);
            section.append(header, makeTaskList(day.rows));
            list.appendChild(section);
        });
        return { list, count: days.length };
    }

    // Update the clock without rebuilding the chart or closing any expanded day.
    function updateClock(container, now = new Date()) {
        if (!container || !container.__analysisRecords) return;
        const time = container.querySelector('#analysis-finish-time');
        const day = container.querySelector('#analysis-finish-date');
        const note = container.querySelector('#analysis-hero-note');
        if (!time || !day || !note) return;
        const summary = analysis.summarize(container.__analysisRecords, now);
        const usableFinish = summary.finish && !(summary.unknownCount && summary.totalMinutes === 0);
        time.textContent = usableFinish ? clock(summary.finish) : '--:--';
        day.textContent = usableFinish ? shortDate(summary.finish) : '時間不足以估算';
        note.textContent = `從 ${shortDate(summary.start)} ${clock(summary.start)} 開始，假設連續完成所選範圍的功課，不計休息。`;
    }

    function render(container, records, options = {}) {
        if (!container || !analysis) return;
        const previousOpen = new Map(Array.from(container.querySelectorAll('details.analysis-day')).map(node => [node.dataset.analysisDate, node.open]));
        container.replaceChildren();
        container.__analysisRecords = null;
        const scope = element('p', 'analysis-scope', `範圍：${options.filterLabel || '全部已載入'} · 只計未完成功課，不含提醒`);
        container.appendChild(scope);
        if (!options.dataAvailable) {
            container.appendChild(element('div', 'analysis-empty', '尚未成功載入 SMS 資料，暫時無法分析。'));
            return;
        }
        if (options.syncMessage) container.appendChild(element('p', 'analysis-alert', options.syncMessage));
        const summary = analysis.summarize(records, options.now || new Date());
        if (!summary.rows.length) {
            container.appendChild(element('div', 'analysis-empty', '目前篩選範圍內沒有未完成功課。'));
            return;
        }

        const hero = element('div', 'analysis-hero');
        const estimatedLabel = summary.unknownCount ? '已知時數估算完成' : '預計完成時間';
        hero.appendChild(element('div', 'analysis-hero-label', estimatedLabel));
        // When only zero-minute work is known and other durations are missing,
        // showing "now" as a finish time would be misleading.
        const timeRow = element('div', 'analysis-hero-time');
        const time = element('strong', '', '--:--');
        time.id = 'analysis-finish-time';
        const day = element('span', '', '時間不足以估算');
        day.id = 'analysis-finish-date';
        timeRow.append(time, day); hero.appendChild(timeRow);
        const note = element('div', 'analysis-hero-note');
        note.id = 'analysis-hero-note';
        hero.appendChild(note);
        container.appendChild(hero);
        container.__analysisRecords = Array.isArray(records) ? records.slice() : [];
        updateClock(container, options.now || new Date());

        const metrics = element('div', 'analysis-metrics');
        const taskMetric = element('div', 'analysis-metric');
        taskMetric.append(element('small', '', '待完成功課'), element('strong', '', `${summary.rows.length} 項`));
        const minuteMetric = element('div', 'analysis-metric');
        const total = element('strong', '', analysis.formatDuration(summary.totalMinutes));
        total.id = 'analysis-total';
        minuteMetric.append(element('small', '', '已知總時間'), total);
        metrics.append(taskMetric, minuteMetric); container.appendChild(metrics);

        if (summary.unknownCount) {
            container.appendChild(element('p', 'analysis-alert', `有 ${summary.unknownCount} 項時間未能辨識，未計入總時數；完成時間並非完整估算。`));
        }
        if (summary.zeroCount) {
            container.appendChild(element('p', 'analysis-note', `${summary.zeroCount} 項顯示 0 分鐘，按 SMS 原值計算。`));
        }

        const chart = element('div', 'analysis-chart');
        chart.append(donut(summary), makeLegend(summary.groups));
        container.appendChild(chart);
        const top = summary.groups.find(group => group.minutes > 0);
        if (top) {
            const ties = summary.groups.filter(group => group.minutes === top.minutes).map(group => group.subject);
            const duration = analysis.formatDuration(top.minutes);
            container.appendChild(element('p', 'analysis-insight', `需時最多：${ties.join('、')} · ${ties.length > 1 ? '每科 ' : ''}${duration}`));
        }
        const dayGroups = makeDayGroups(summary, previousOpen);
        const heading = element('div', 'analysis-list-heading', `按 SMS 日期分類 · ${dayGroups.count} 日`);
        container.append(heading, dayGroups.list);
    }

    root.BetterSMSAnalysisUI = { render, updateClock };
})(globalThis);
