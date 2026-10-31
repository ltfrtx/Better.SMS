/* global chrome, BetterSMSSmsClient */
// Optional same-origin fallback: the popup asks an already open SMS student
// page to fetch the same URL when browser cookie policy blocks a direct fetch.
// Only parsed records, never the HTML, login information or CSRF token, are sent.
(function installBetterSMSFetchFallback() {
    'use strict';
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || message.type !== 'BETTER_SMS_FETCH_RECORDS') return false;
        BetterSMSSmsClient.fetchRecords(message.fromDate).then(
            data => sendResponse({ ok: true, data }),
            error => sendResponse({
                ok: false,
                error: String((error && error.message) || 'SMS 連線失敗。'),
                diagnostics: (error && error.diagnostics) || null
            })
        );
        return true;
    });
})();
