// 2F2Chrome content script for messages.google.com.
//
// Detection model: rather than relying on "unread" markers, remember the
// preview text of every conversation in the list and react when it changes.
// That catches repeat senders (same conversation, new text), works with the
// tab in the background, and never re-copies codes already on the page at load.
(() => {
  if (window.__twoF2ChromeLoaded) return; // guard against double injection
  window.__twoF2ChromeLoaded = true;

  const { compile, extract2FACode } = globalThis.TwoF2Detector;
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log('[2F2Chrome]', ...a);

  const BASELINE_MS = 5000;          // initial render: record, don't copy
  const CONVERSATION_SETTLE_MS = 2000; // after opening a conversation
  const CODE_DEDUPE_MS = 30 * 60 * 1000;

  // Selectors, most specific first. Google changes its markup occasionally,
  // so each has fallbacks.
  const SEL = {
    listItem: 'mws-conversation-list-item, a[href*="/web/conversations/"][data-e2e-conversation]',
    itemLink: 'a[href*="/web/conversations/"]',
    snippet: '.snippet-text, mws-conversation-snippet, [data-e2e-conversation-snippet]',
    unread: '[data-e2e-is-unread="true"], .unread',
    message: 'mws-message-wrapper, .text-msg-container',
    messageText: '.text-msg-content, .text-msg, mws-text-message-part',
    outgoing: '[is-outgoing="true"], [data-e2e-is-outgoing="true"], .outgoing'
  };

  let patterns = [];
  const startedAt = Date.now();
  const snippets = new Map();        // conversation key -> last preview text
  const seenMessages = new WeakSet();
  const seenCodes = new Map();       // code -> timestamp first seen
  let conversationPath = null;
  let conversationSettledAt = 0;
  let scanTimer = null;
  let observer = null;
  let lastScan = 0;

  const alive = () => !!(chrome.runtime && chrome.runtime.id);

  function shutdown() {
    if (observer) observer.disconnect();
    clearInterval(intervalId);
    log('extension context gone; stopped');
  }

  function textOf(el, selector) {
    const inner = selector && el.querySelector(selector);
    return ((inner || el).textContent || '').replace(/\s+/g, ' ').trim();
  }

  function conversationKey(item) {
    const link = item.matches(SEL.itemLink) ? item : item.querySelector(SEL.itemLink);
    return link ? link.getAttribute('href') : null;
  }

  // Look at a piece of text; copy a code from it, or just remember it.
  function consider(text, source, record) {
    const found = extract2FACode(text, patterns);
    if (!found) return;
    const now = Date.now();
    const seen = seenCodes.get(found.code);
    if (seen && now - seen < CODE_DEDUPE_MS) return;
    seenCodes.set(found.code, now);
    if (record) return; // baseline: already on the page, don't copy
    log('code found via', source, found);
    send(found);
  }

  function send(found) {
    if (!alive()) return shutdown();
    try {
      chrome.runtime.sendMessage({ action: 'processPendingCode', ...found }, () => {
        if (chrome.runtime.lastError) log('send failed', chrome.runtime.lastError.message);
      });
    } catch (e) {
      shutdown();
    }
  }

  function scanConversationList(baseline) {
    const items = new Set();
    document.querySelectorAll(SEL.listItem).forEach(el => {
      items.add(el.closest('mws-conversation-list-item') || el);
    });

    for (const item of items) {
      const key = conversationKey(item);
      if (!key) continue;
      const text = textOf(item, SEL.snippet);
      if (!text) continue;
      const previous = snippets.get(key);
      if (previous === text) continue;
      snippets.set(key, text);

      if (/^you:/i.test(text)) continue; // our own outgoing message
      const isNew = previous === undefined;
      const unread = item.matches(SEL.unread) || !!item.querySelector(SEL.unread);
      // Changed text in a known conversation, or a new unread conversation.
      const shouldCopy = !baseline && (!isNew || unread);
      consider(text, 'list', !shouldCopy);
    }
  }

  function scanOpenConversation(baseline) {
    if (location.pathname !== conversationPath) {
      conversationPath = location.pathname;
      conversationSettledAt = Date.now() + CONVERSATION_SETTLE_MS;
    }
    const settling = baseline || Date.now() < conversationSettledAt;

    const messages = Array.from(document.querySelectorAll(SEL.message))
      .filter(el => !el.parentElement || !el.parentElement.closest(SEL.message));
    // Only messages after the last one already seen are new arrivals;
    // scrolling up loads older messages above it.
    let lastSeen = -1;
    messages.forEach((msg, i) => { if (seenMessages.has(msg)) lastSeen = i; });

    messages.forEach((msg, i) => {
      if (seenMessages.has(msg)) return;
      seenMessages.add(msg);
      if (msg.matches(SEL.outgoing) || msg.querySelector(SEL.outgoing)) return;
      const text = textOf(msg, SEL.messageText);
      if (!text) return;
      consider(text, 'conversation', settling || i < lastSeen);
    });
  }

  function scan() {
    scanTimer = null;
    if (!alive()) return shutdown();
    if (!patterns.length) return;
    const baseline = Date.now() - startedAt < BASELINE_MS;
    try {
      scanConversationList(baseline);
      scanOpenConversation(baseline);
    } catch (e) {
      console.error('[2F2Chrome] scan failed', e);
    }
    lastScan = Date.now();
  }

  // Coalesce bursts of DOM changes into one scan. A scan reads the current
  // DOM, so nothing is lost by skipping intermediate mutation batches.
  function scheduleScan(delay = 250) {
    if (!scanTimer) scanTimer = setTimeout(scan, delay);
  }

  function start() {
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'data-e2e-is-unread']
    });
    scan();
    // Record anything rendered during the baseline window, then go live.
    setTimeout(scan, BASELINE_MS + 100);
  }

  // Safety net for missed mutations. Chrome may slow this in hidden tabs;
  // the MutationObserver is the primary trigger.
  const intervalId = setInterval(() => scheduleScan(0), 15000);
  document.addEventListener('visibilitychange', () => scheduleScan(0));

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req && req.action === 'ping') {
      sendResponse({
        active: !!observer,
        conversations: snippets.size,
        lastScan
      });
    }
  });

  fetch(chrome.runtime.getURL('patterns.json'))
    .then(r => r.json())
    .then(data => {
      patterns = compile(data.codePatterns);
      start();
      chrome.runtime.sendMessage({ action: 'contentScriptLoaded' }, () => void chrome.runtime.lastError);
      log('started with', patterns.length, 'patterns');
    })
    .catch(e => console.error('[2F2Chrome] failed to load patterns', e));
})();
