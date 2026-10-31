/* Authenticated, read-only fetch of the SMS homework page. */
(function attachBetterSMSSmsClient(root) {
    'use strict';

    const HOMEWORK_URL = 'https://sms.twghlkss.edu.hk/student/records.php?feature=homework';
    const dates = root.BetterSMSDateUtils;
    const documentReader = root.BetterSMSSmsDocument;

    function buildUrl(fromDate) {
        if (!dates.fromDateKey(fromDate)) throw new Error('載入起始日期無效。');
        const url = new URL(HOMEWORK_URL);
        url.searchParams.set('date', fromDate);
        return url.href;
    }

    async function fetchRecords(fromDate, options = {}) {
        const url = buildUrl(fromDate);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
        const externalSignal = options.signal;
        const abortFromOutside = () => controller.abort();
        if (externalSignal) {
            if (externalSignal.aborted) controller.abort();
            else externalSignal.addEventListener('abort', abortFromOutside, { once: true });
        }
        try {
            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                redirect: 'follow',
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`SMS 回應 HTTP ${response.status}；請確認已登入。`);
            const finalUrl = new URL(response.url || url);
            if (finalUrl.origin !== 'https://sms.twghlkss.edu.hk' || finalUrl.pathname !== '/student/records.php') {
                throw new Error('SMS 將請求轉到其他頁面，請先登入後再重新整理。');
            }
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return documentReader.parseDocument(doc, fromDate);
        } catch (error) {
            if (error && error.name === 'AbortError' && !(externalSignal && externalSignal.aborted)) {
                throw new Error('連線 SMS 逾時；請檢查網絡或登入狀態。');
            }
            throw error;
        } finally {
            clearTimeout(timer);
            if (externalSignal) externalSignal.removeEventListener('abort', abortFromOutside);
        }
    }

    root.BetterSMSSmsClient = { HOMEWORK_URL, buildUrl, fetchRecords };
})(globalThis);
