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
        // Use 'i' flag for case-insensitive and 's' flag for dotAll (. matches newlines)
        const regex = new RegExp(pattern.platformPattern, 'is');
        const match = text.match(regex);
        if (match && match[1]) {
            console.log(`Code matched for platform ${pattern.platformName}:`, match[1]);
            return {
                code: match[1],
                platform: pattern.platformName
            };
        }
    }
    console.log('No code match found for text:', text.substring(0, 200));
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

function extractMessageText(element) {
  // Try multiple selectors to get message text
  const selectors = [
    '.snippet-text span[dir="auto"]',  // Conversation list snippet
    '.text-msg span[dir="ltr"]',       // Actual message content (common format)
    '.text-msg span[dir="auto"]',      // Actual message content (alternative)
    '.text-msg',                        // Fallback to text-msg container
    'div[jsname] span[dir="ltr"]',     // Generic message span
    'div[jsname] span[dir="auto"]'     // Generic message span alternative
  ];

  for (const selector of selectors) {
    const textElement = element.querySelector(selector);
    if (textElement) {
      const text = textElement.textContent.trim();
      if (text) {
        console.log(`Found message text using selector "${selector}":`, text);
        return text;
      }
    }
  }

  // Fallback: try to get any text content from the element
  const text = element.textContent.trim();
  if (text) {
    console.log('Using element textContent as fallback:', text.substring(0, 100));
    return text;
  }

  console.log('No message text found in element');
  return null;
}

function processMessage(element) {
  console.log('Processing message element:', element);

  // For actual messages in conversation, we don't require the unread check
  // as they may already be marked as read when we process them
  const isInConversationView = !!element.closest('.conversation-content, [role="main"]');

  if (!isInConversationView && !isUnreadMessage(element)) {
      console.log('Message is not unread and not in conversation view, skipping');
      return;
  }

  const messageText = extractMessageText(element);
  if (!messageText) {
      console.log('No message text found, skipping');
      return;
  }

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
  console.warn('Extension context was invalidated. A 2FA code was detected but might not have been fully processed by the background script.');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('2FA Code Detected (Extension Issue)', {
        body: `Code ${codeInfo.code} (${codeInfo.platform}) was found. Please check your clipboard. If not copied, the extension might need attention (e.g., reload or reinstall).`
    });
  } else {
    console.log('HTML5 Notifications not available or permission denied. Cannot show fallback notification.');
  }
  // No direct clipboard copy attempt here, background script is responsible.
  // This function now primarily serves to inform the user about the potential issue.
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
                          // Check if it's an unread message in the list
                          if (isUnreadMessage(node)) {
                              processMessage(node);
                          }
                          // Check for unread messages within the added node
                          node.querySelectorAll('.unread, [data-e2e-is-unread="true"]').forEach(processMessage);

                          // Check if it's a new message in the conversation view
                          // Look for elements with text-msg class (actual messages)
                          if (node.classList?.contains('text-msg') || node.querySelector('.text-msg')) {
                              processMessage(node);
                          }
                          // Also check for message bubbles that might contain 2FA codes
                          node.querySelectorAll('.text-msg, [jsname] .message-text').forEach(processMessage);
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

  // Initial scan of existing unread messages and conversation messages
  targetNode.querySelectorAll('.unread, [data-e2e-is-unread="true"], .text-msg').forEach(processMessage);
}

// Add a function to periodically check for new messages
function periodicCheck() {
  console.log('Performing periodic check for new messages');
  // Check both unread messages in list and messages in open conversation
  document.querySelectorAll('.unread, [data-e2e-is-unread="true"], .text-msg').forEach(processMessage);
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

// Listen for page visibility changes
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('Page became visible, checking for new messages');
    periodicCheck();
  }
});

console.log('2F2Chrome content script setup complete');