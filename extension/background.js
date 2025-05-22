// Initialize state
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let state = {
    contentScriptActive: false
};

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument?.()) {
    console.log('Offscreen document already exists.');
    return;
  }
  console.log('Creating offscreen document.');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Reason: To copy 2FA codes to the clipboard.',
  });
  console.log('Offscreen document created.');
}

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
            console.log('Background: Received processPendingCode for code:', request.code);
            ensureOffscreenDocument().then(() => {
                console.log('Background: Offscreen document ensured. Sending message to offscreen script.');
                return chrome.runtime.sendMessage({
                    action: "copyToClipboardOffscreen",
                    code: request.code
                });
            }).then(response => {
                console.log('Background: Response from offscreen script:', response);
                if (!response || !response.success) {
                    throw new Error(response?.error || 'Failed to copy code via offscreen document.');
                }
                console.log('Background: Code copied to clipboard successfully via offscreen.');
                return showNotification(request.code, request.platform);
            }).then(() => {
                return updateLatestCode(request.code, request.platform);
            }).then(() => {
                console.log('Background: Notification shown and storage updated.');
                sendResponse({ success: true, message: "Code processed and copied via offscreen." });
            }).catch(error => {
                console.error('Background: Error processing code or using offscreen document:', error);
                sendResponse({ success: false, error: error.message });
            });
            // Not closing document here to allow Chrome to manage its lifecycle or for potential rapid reuse.
            return true; // Indicate asynchronous response

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