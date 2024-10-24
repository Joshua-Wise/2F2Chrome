// Initialize state
let state = {
    contentScriptActive: false
};

// Single message listener for all message types
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background script:', request);

    switch (request.action) {
        case "contentScriptLoaded":
            state.contentScriptActive = true;
            sendResponse({ success: true });
            break;

        case "getContentScriptStatus":
            sendResponse({ active: state.contentScriptActive });
            break;

        case "processPendingCode":
            console.log('Processing pending code:', request.code);
            chrome.tabs.sendMessage(sender.tab.id, {
                action: "copyToClipboard",
                code: request.code
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error copying to clipboard:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else if (response && response.success) {
                    console.log('Code copied successfully');
                    showNotification(request.code, request.platform)
                        .then(() => updateLatestCode(request.code, request.platform))
                        .then(() => sendResponse({ success: true }))
                        .catch(error => {
                            console.error('Error in processing:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    console.error('Failed to copy code to clipboard');
                    sendResponse({ success: false, error: 'Failed to copy code' });
                }
            });
            break;

        default:
            console.log('Unknown action:', request.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }

    // Return true to indicate we will send a response asynchronously
    return true;
});

// Track tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes('messages.google.com')) {
        state.contentScriptActive = true;
    }
});

// Track tab removals
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.tabs.query({ url: '*://messages.google.com/*' }, (tabs) => {
        if (tabs.length === 0) {
            state.contentScriptActive = false;
        }
    });
});

function showNotification(code, platform) {
    return new Promise((resolve, reject) => {
        console.log('Attempting to show notification for code:', code);
        if (!chrome.notifications) {
            console.error('Notifications API not available');
            resolve(); // Resolve without showing notification
            return;
        }
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: '2FA Code Detected',
            message: `Code ${code} (${platform}) has been copied to your clipboard.`,
            priority: 2
        }, (notificationId) => {
            if (chrome.runtime.lastError) {
                console.error('Error showing notification:', chrome.runtime.lastError);
                resolve(); // Resolve even if notification fails
            } else {
                console.log('Notification shown:', notificationId);
                resolve();
            }
        });
    });
}

function updateLatestCode(code, platform) {
    return new Promise((resolve, reject) => {
        console.log('Updating latest code:', code);
        chrome.storage.local.get({ codeHistory: [] }, (result) => {
            let history = result.codeHistory;
            history.unshift({ code, platform, timestamp: new Date().toISOString() });
            history = history.slice(0, 5); // Keep only the last 5 codes
            chrome.storage.local.set({
                lastCode: code,
                lastPlatform: platform,
                codeHistory: history
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error updating storage:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    console.log('Storage updated with new code');
                    resolve();
                }
            });
        });
    });
}