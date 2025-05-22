chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'copyToClipboardOffscreen') {
    if (typeof request.code !== 'string') {
      console.error('Offscreen: Invalid code received.', request);
      sendResponse({ success: false, error: 'Invalid code type' });
      return true;
    }

    const textArea = document.createElement('textarea');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px'; // Move it off-screen
    textArea.value = request.code;
    document.body.appendChild(textArea);
    
    textArea.select(); // Select the text

    let success = false;
    try {
      success = document.execCommand('copy');
      if (success) {
        console.log('Offscreen: Code copied successfully using execCommand:', request.code);
        sendResponse({ success: true });
      } else {
        console.error('Offscreen: execCommand("copy") failed.');
        sendResponse({ success: false, error: 'execCommand("copy") failed' });
      }
    } catch (err) {
      console.error('Offscreen: Error during execCommand("copy").', err);
      sendResponse({ success: false, error: err.message || 'Error during execCommand' });
    } finally {
      document.body.removeChild(textArea); // Clean up
    }
    return true; // For async response
  }
});