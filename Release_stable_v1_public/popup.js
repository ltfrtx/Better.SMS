// popup.js
let rawHomeworkList = [];

document.addEventListener('DOMContentLoaded', () => {
    const filterSelect = document.getElementById('subject-filter');

    chrome.storage.local.get(['homeworkList'], (result) => {
        rawHomeworkList = result.homeworkList || [];

        initSubjectFilter(rawHomeworkList);

        renderHomeworkList(rawHomeworkList);
    });

    filterSelect.addEventListener('change', (e) => {
        const selectedSubject = e.target.value;
        if (selectedSubject === 'ALL') {
            renderHomeworkList(rawHomeworkList);
        } else {
            const filtered = rawHomeworkList.filter(item => item.subject === selectedSubject);
            renderHomeworkList(filtered);
        }
    });
});

function initSubjectFilter(list) {
    const filterSelect = document.getElementById('subject-filter');
    const subjects = [...new Set(list.map(item => item.subject))]; // 取得唯一科目清單

    subjects.forEach(sub => {
        if (sub) {
            const option = document.createElement('option');
            option.value = sub;
            option.textContent = sub;
            filterSelect.appendChild(option);
        }
    });
}

function renderHomeworkList(list) {
    const listContainer = document.getElementById('hw-list');
    const countBadge = document.getElementById('hw-count');

    countBadge.textContent = `${list.length} 項`;

    if (list.length === 0) {
        listContainer.innerHTML = '<div class="empty"> 此條件下沒有功課項目！</div>';
        return;
    }

    listContainer.innerHTML = '';
    list.forEach(hw => {
        const card = document.createElement('div');
        card.className = 'hw-card';
        card.innerHTML = `
            <div class="hw-header">
                <span class="subject">${escapeHtml(hw.subject)}</span>
                <span class="date-badge"> ${escapeHtml(hw.date)}</span>
            </div>
            <div class="content">${escapeHtml(hw.content)}</div>
            <div class="footer">
                <span>  ${escapeHtml(hw.time || '未指定時間')}</span>
                <span>老師：${escapeHtml(hw.teacher || '無')}</span>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}