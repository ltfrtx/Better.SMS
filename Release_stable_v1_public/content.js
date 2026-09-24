// content.js
console.log("Sms Extension Running...");

window.addEventListener('load', () => {
    if (window.location.href.includes("dashboard.php")) {
        console.log("Scan.");

        const rows = document.querySelectorAll("table tbody tr");
        const allHomework = [];

        rows.forEach(row => {
            const cols = row.querySelectorAll("td");
            if (cols.length >= 5) {
                const dateVal = cols[0]?.innerText.trim();
                const subjectVal = cols[1]?.innerText.trim();
                const contentVal = cols[2]?.innerText.trim();
                const timeVal = cols[3]?.innerText.trim();
                const teacherVal = cols[4]?.innerText.trim();

                if (dateVal && dateVal.includes('/') && subjectVal) {
                    allHomework.push({
                        date: dateVal,
                        subject: subjectVal,
                        content: contentVal,
                        time: timeVal,
                        teacher: teacherVal
                    });
                }
            }
        });

        chrome.storage.local.set({ homeworkList: allHomework }, () => {
            console.log("功課列表已更新，共 ", allHomework.length, " 項", allHomework);
        });
    }
});