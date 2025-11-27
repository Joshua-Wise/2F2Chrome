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
let debounceTimer = null;
const processedElements = new WeakSet();

// Load the patterns from the JSON file
fetch(chrome.runtime.getURL('patterns.json'))
  .then(response => response.json())
  .then(data => {
    codePatterns = data.codePatterns;
    console.log('Code patterns loaded:', codePatterns);
    startObserving();
  })
  .catch(error => console.error('Error loading code patterns:', error));

// Validate that the extracted code is a legitimate 2FA code
function validateCode(code, text) {
    // Basic validation: check length
    if (!code || code.length < 4 || code.length > 8) {
        return false;
    }

    // Filter out obvious false positives
    const falsePositivePatterns = [
        /^\d{10}$/,  // 10-digit numbers (likely phone numbers)
        /^\d{11}$/,  // 11-digit numbers (also likely phone numbers)
        /^[0-9-]{10,}$/,  // Phone number formats
        /^\d{3,4}[- ]\d{3,4}$/,  // Partial phone numbers
    ];

    for (const pattern of falsePositivePatterns) {
        if (pattern.test(code)) {
            console.log('Code failed validation (false positive pattern):', code);
            return false;
        }
    }

    // Check for contextual clues that this is NOT a 2FA code
    const negativeContextWords = [
        'phone', 'call', 'contact', 'number to call', 'dial',
        'customer service', 'support line', 'hotline'
    ];

    const textLower = text.toLowerCase();
    const codeIndex = text.indexOf(code);

    if (codeIndex > -1) {
        // Check 50 characters before and after the code
        const contextStart = Math.max(0, codeIndex - 50);
        const contextEnd = Math.min(text.length, codeIndex + code.length + 50);
        const context = text.substring(contextStart, contextEnd).toLowerCase();

        for (const word of negativeContextWords) {
            if (context.includes(word)) {
                console.log('Code failed validation (negative context):', code, 'Word:', word);
                return false;
            }
        }
    }

    // Check for positive contextual clues
    const positiveContextWords = [
        'verification', 'verify', 'code', 'otp', 'passcode', 'authenticate',
        'security', 'access', 'login', 'sign in', 'confirmation', 'confirm',
        'two-factor', '2fa', 'one-time', 'temporary', 'expires'
    ];

    let hasPositiveContext = false;
    for (const word of positiveContextWords) {
        if (textLower.includes(word)) {
            hasPositiveContext = true;
            break;
        }
    }

    if (!hasPositiveContext) {
        console.log('Code failed validation (no positive context):', code);
        return false;
    }

    console.log('Code passed validation:', code);
    return true;
}

function extract2FACode(text) {
    for (let pattern of codePatterns) {
        // Use 'i' flag for case-insensitive and 's' flag for dotAll (. matches newlines)
        const regex = new RegExp(pattern.platformPattern, 'is');
        const match = text.match(regex);
        if (match && match[1]) {
            const code = match[1].trim();
            console.log(`Code matched for platform ${pattern.platformName}:`, code);

            // Validate the code before returning
            if (validateCode(code, text)) {
                return {
                    code: code,
                    platform: pattern.platformName
                };
            } else {
                console.log(`Code validation failed for ${pattern.platformName}, continuing search...`);
                // Continue searching with other patterns
            }
        }
    }
    console.log('No valid code match found for text:', text.substring(0, 200));
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
  // Try multiple selectors to get message text with improved resilience
  const selectors = [
    '.snippet-text span[dir="auto"]',     // Conversation list snippet
    '.text-msg span[dir="ltr"]',          // Actual message content (common format)
    '.text-msg span[dir="auto"]',         // Actual message content (alternative)
    '.text-msg',                           // Fallback to text-msg container
    'div[jsname] span[dir="ltr"]',        // Generic message span
    'div[jsname] span[dir="auto"]',       // Generic message span alternative
    '.message-content',                    // Alternative message content class
    '[data-message-text]',                 // Data attribute for message text
    '.msg-text',                           // Alternative msg text class
    'span[data-text="true"]',              // Data attribute variant
    '[role="article"] span',               // ARIA role based selection
    '.conversation-message-bubble span'    // Message bubble content
  ];

  for (const selector of selectors) {
    const textElement = element.querySelector(selector);
    if (textElement) {
      const text = textElement.textContent.trim();
      if (text && text.length > 3) {  // Minimum length check to avoid empty/noise
        console.log(`Found message text using selector "${selector}":`, text);
        return text;
      }
    }
  }

  // Fallback: try to get any text content from the element
  const text = element.textContent.trim();
  if (text && text.length > 3) {
    console.log('Using element textContent as fallback:', text.substring(0, 100));
    return text;
  }

  console.log('No message text found in element');
  return null;
}

function processMessage(element) {
  // Skip if we've already processed this element
  if (processedElements.has(element)) {
    console.log('Element already processed, skipping');
    return;
  }

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

  // Mark element as processed
  processedElements.add(element);

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

// Debounced processing to avoid excessive processing
function debouncedProcess(callback, delay = 300) {
  return function(...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => callback.apply(this, args), delay);
  };
}

// Batch process mutations for better performance
function processMutations(mutationsList) {
  console.log('Processing mutations:', mutationsList.length);
  const elementsToProcess = new Set();

  try {
    for(let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if it's an unread message in the list
            if (isUnreadMessage(node)) {
              elementsToProcess.add(node);
            }
            // Check for unread messages within the added node
            node.querySelectorAll('.unread, [data-e2e-is-unread="true"]').forEach(el => elementsToProcess.add(el));

            // Check if it's a new message in the conversation view
            // Look for elements with text-msg class (actual messages)
            if (node.classList?.contains('text-msg') || node.querySelector('.text-msg')) {
              elementsToProcess.add(node);
            }
            // Also check for message bubbles that might contain 2FA codes
            node.querySelectorAll('.text-msg, [jsname] .message-text').forEach(el => elementsToProcess.add(el));
          }
        });
      } else if (mutation.type === 'attributes') {
        if (isUnreadMessage(mutation.target)) {
          elementsToProcess.add(mutation.target);
        }
      }
    }

    // Process all collected elements
    elementsToProcess.forEach(el => processMessage(el));
  } catch (error) {
    console.error('Error in processMutations:', error);
    if (error.message.includes('Extension context invalidated')) {
      console.log('Extension context invalidated, attempting to recover...');
      if (observer) {
        observer.disconnect();
      }
      setTimeout(startObserving, 1000);
    }
  }
}

function startObserving() {
  console.log('Starting observation');
  const targetNode = document.body;
  const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-e2e-is-unread'] };

  observer = new MutationObserver(function(mutationsList) {
    console.log('Mutations observed:', mutationsList.length);
    // Use debouncing to batch mutations and reduce processing overhead
    debouncedProcess(() => processMutations(mutationsList), 200)();
  });

  observer.observe(targetNode, config);
  console.log('MutationObserver started');

  // Initial scan of existing unread messages and conversation messages
  targetNode.querySelectorAll('.unread, [data-e2e-is-unread="true"], .text-msg').forEach(processMessage);
}

// Add a function to periodically check for new messages
function periodicCheck() {
  console.log('Performing periodic check for new messages');
  // Only check unread messages and recent conversation messages to reduce overhead
  const unreadMessages = document.querySelectorAll('.unread, [data-e2e-is-unread="true"]');

  // For conversation view, only check recent messages (last 10)
  const conversationMessages = Array.from(document.querySelectorAll('.text-msg')).slice(-10);

  unreadMessages.forEach(processMessage);
  conversationMessages.forEach(processMessage);
}

// Set up periodic checking with reduced frequency (10 seconds instead of 5)
// The MutationObserver should catch most messages, this is just a safety net
setInterval(periodicCheck, 10000);  // Check every 10 seconds

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