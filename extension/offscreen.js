// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'copyToClipboardOffscreen') {
    if (typeof request.code !== 'string') {
      console.error('Offscreen: Invalid code received for copying.', request);
      sendResponse({ success: false, error: 'Invalid code type' });
      return true; // Keep channel open for async response if needed, though sending sync here
    }

    navigator.clipboard.writeText(request.code)
      .then(() => {
        console.log('Offscreen: Code copied to clipboard successfully:', request.code);
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error('Offscreen: Failed to copy code to clipboard.', err);
        // Send the actual error message back if possible
        sendResponse({ success: false, error: err.message || 'Unknown error during copy' });
      });
    return true; // Indicates that the response will be sent asynchronously
  }
});
