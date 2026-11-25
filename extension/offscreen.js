chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.target !== 'offscreen' || request.action !== 'copyToClipboardOffscreen') return false;

  if (typeof request.code !== 'string') {
    sendResponse({ success: false, error: 'Invalid code type' });
    return false;
  }

  // navigator.clipboard needs document focus, which an offscreen document
  // never has, so execCommand is the supported route here.
  const textArea = document.createElement('textarea');
  textArea.value = request.code;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    const ok = document.execCommand('copy');
    sendResponse(ok ? { success: true } : { success: false, error: 'execCommand("copy") failed' });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  } finally {
    textArea.remove();
  }
  return false;
});
