chrome.runtime.onInstalled.addListener(() => {
    console.log('Study Assistant installed');
    chrome.storage.local.set({
        isMonitoring: false,
        startTime: null
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'error') {
        console.error('Extension error:', message.error);
    }
});