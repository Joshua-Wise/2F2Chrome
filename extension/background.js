const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const MESSAGES_URL = 'https://messages.google.com/*';
const HISTORY_LIMIT = 5;

let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  // Two codes arriving together must not both try to create the document.
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Copy detected 2FA codes to the clipboard.'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function copyToClipboard(code) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'copyToClipboardOffscreen',
    code
  });
  if (!response || !response.success) {
    throw new Error((response && response.error) || 'Clipboard copy failed');
  }
}

async function showNotification(code, platform) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '2FA Code Detected',
      message: `Code ${code} (${platform}) has been copied to your clipboard.`,
      priority: 2
    });
  } catch (e) {
    console.error('Notification failed:', e);
  }
}

async function recordCode(code, platform, recordHistory) {
  const update = { lastCode: code, lastPlatform: platform };
  if (recordHistory) {
    const { codeHistory = [] } = await chrome.storage.local.get('codeHistory');
    codeHistory.unshift({ code, platform, timestamp: new Date().toISOString() });
    update.codeHistory = codeHistory.slice(0, HISTORY_LIMIT);
  }
  await chrome.storage.local.set(update);
}

async function processCode(code, platform) {
  const settings = await chrome.storage.local.get(['showNotifications', 'recordHistory']);
  let copied = true;
  try {
    await copyToClipboard(code);
  } catch (e) {
    copied = false;
    console.error('Copy failed:', e);
  }
  if (settings.showNotifications !== false) await showNotification(code, platform);
  await recordCode(code, platform, settings.recordHistory !== false);
  return copied;
}

// Keep Chrome's Memory Saver from unloading the Messages tab, which would
// stop the content script.
function protectTab(tabId) {
  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === 'offscreen') return false; // handled by offscreen.js

  switch (request.action) {
    case 'contentScriptLoaded':
      if (sender.tab) protectTab(sender.tab.id);
      sendResponse({ success: true });
      return false;

    case 'processPendingCode':
      processCode(request.code, request.platform)
        .then(copied => sendResponse({ success: copied }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;

    default:
      return false;
  }
});

// Content scripts only load on page load, so a Messages tab that was already
// open when the extension was installed or updated would otherwise do nothing
// until reloaded.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: MESSAGES_URL });
  for (const tab of tabs) {
    if (tab.discarded) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['detector.js', 'content.js']
    }).catch(e => console.warn('Injection failed for tab', tab.id, e));
  }
});
