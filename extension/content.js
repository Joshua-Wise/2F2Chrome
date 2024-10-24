console.log('2F2Chrome content script loaded');

chrome.runtime.sendMessage({action: "contentScriptLoaded"}, response => {
    if (chrome.runtime.lastError) {
        console.error('Error sending content script loaded message:', chrome.runtime.lastError);
    } else {
        console.log('Content script loaded message sent successfully');
    }
});

let codePatterns = [];
const processedCodes = new Set();
let observer = null;

// Load the patterns from the JSON file
fetch(chrome.runtime.getURL('patterns.json'))
  .then(response => response.json())
  .then(data => {
    codePatterns = data.codePatterns;
    console.log('Code patterns loaded:', codePatterns);
    startObserving();
  })
  .catch(error => console.error('Error loading code patterns:', error));

function extract2FACode(text) {
    for (let pattern of codePatterns) {
        const regex = new RegExp(pattern.platformPattern, 'i');
        const match = text.match(regex);
        if (match && match[1]) {
            console.log(`Code matched for platform ${pattern.platformName}:`, match[1]);
            return {
                code: match[1],
                platform: pattern.platformName
            };
        }
    }
    console.log('No code match found for text:', text);
    return null;
}

function isUnreadMessage(element) {
  // Check for the 'unread' class on the element or its ancestors
  const hasUnreadClass = element.classList.contains('unread') || !!element.closest('.unread');
  
  // Check for the data attribute indicating an unread message
  const hasUnreadAttribute = element.getAttribute('data-e2e-is-unread') === 'true' ||
                             !!element.closest('[data-e2e-is-unread="true"]');
  
  const isUnread = hasUnreadClass || hasUnreadAttribute;
  console.log('Is unread message:', isUnread, 'Element:', element);
  return isUnread;
}

function processMessage(element) {
  console.log('Processing message element:', element);
  if (!isUnreadMessage(element)) {
      console.log('Message is not unread, skipping');
      return;
  }

  // Look for the specific element containing the message text
  const snippetElement = element.querySelector('.snippet-text span[dir="auto"]');
  if (!snippetElement) {
      console.log('Snippet text element not found, skipping');
      return;
  }

  const messageText = snippetElement.textContent.trim();
  console.log('Processing message text:', messageText);
  const codeInfo = extract2FACode(messageText);
  if (codeInfo && !processedCodes.has(codeInfo.code)) {
      console.log(`2FA code found: ${codeInfo.code} (${codeInfo.platform})`);
      processedCodes.add(codeInfo.code);
      
      try {
          chrome.runtime.sendMessage({
              action: "processPendingCode",
              code: codeInfo.code,
              platform: codeInfo.platform
          }, response => {
              if (chrome.runtime.lastError) {
                  console.error('Error sending message:', chrome.runtime.lastError);
                  if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                      console.log('Extension context invalidated, attempting to recover...');
                      recoverFromInvalidation(codeInfo);
                  }
              } else if (response && response.success) {
                  console.log('Code processed successfully');
              } else {
                  console.error('Failed to process code:', response && response.error);
              }
          });
      } catch (error) {
          console.error('Error in processMessage:', error);
          if (error.message.includes('Extension context invalidated')) {
              console.log('Extension context invalidated, attempting to recover...');
              recoverFromInvalidation(codeInfo);
          }
      }
  } else {
      console.log('No new 2FA code found in this message');
  }
}

function recoverFromInvalidation(codeInfo) {
  console.log('Attempting to recover from extension context invalidation');
  // Attempt to copy the code to clipboard directly
  const success = copyTextToClipboard(codeInfo.code);
  if (success) {
      console.log('Code copied to clipboard after context invalidation');
      if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('2FA Code Detected', {
              body: `Code ${codeInfo.code} (${codeInfo.platform}) has been copied to your clipboard.`
          });
      }
  } else {
      console.error('Failed to copy code after context invalidation');
  }
}

function copyTextToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let success = false;
  try {
      success = document.execCommand('copy');
      console.log(success ? 'Text copied to clipboard' : 'Unable to copy text to clipboard');
  } catch (err) {
      console.error('Failed to copy text: ', err);
  }

  document.body.removeChild(textArea);
  return success;
}

function startObserving() {
  console.log('Starting observation');
  const targetNode = document.body;
  const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-e2e-is-unread'] };

  observer = new MutationObserver(function(mutationsList) {
      console.log('Mutations observed:', mutationsList.length);
      try {
          for(let mutation of mutationsList) {
              if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(node => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                          if (isUnreadMessage(node)) {
                              processMessage(node);
                          }
                          node.querySelectorAll('.unread, [data-e2e-is-unread="true"]').forEach(processMessage);
                      }
                  });
              } else if (mutation.type === 'attributes') {
                  if (isUnreadMessage(mutation.target)) {
                      processMessage(mutation.target);
                  }
              }
          }
      } catch (error) {
          console.error('Error in MutationObserver callback:', error);
          if (error.message.includes('Extension context invalidated')) {
              console.log('Extension context invalidated in MutationObserver, attempting to recover...');
              observer.disconnect();
              setTimeout(startObserving, 1000);
          }
      }
  });

  observer.observe(targetNode, config);
  console.log('MutationObserver started');

  // Initial scan of existing unread messages
  targetNode.querySelectorAll('.unread, [data-e2e-is-unread="true"]').forEach(processMessage);
}

// Add a function to periodically check for new messages
function periodicCheck() {
  console.log('Performing periodic check for new messages');
  document.querySelectorAll('.unread, [data-e2e-is-unread="true"]').forEach(processMessage);
}

// Set up periodic checking
setInterval(periodicCheck, 5000);  // Check every 5 seconds

window.addEventListener('error', function(event) {
  console.error('Global error caught:', event.error);
  if (event.error.message.includes('Extension context invalidated')) {
      console.log('Extension context invalidated, attempting to recover...');
      if (observer) {
          observer.disconnect();
      }
      setTimeout(startObserving, 1000);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in content script:', request);
    if (request.action === "copyToClipboard") {
        const success = copyTextToClipboard(request.code);
        console.log('Copy to clipboard result:', success);
        sendResponse({success: success});
    }
    return true;
});

// Listen for page visibility changes
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('Page became visible, checking for new messages');
    periodicCheck();
  }
});

console.log('2F2Chrome content script setup complete');