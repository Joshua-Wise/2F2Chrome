// Simulates the Google Messages DOM and runs the real content script in jsdom.
// Run with: npm run test:dom (needs: npm install)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ext = path.join(__dirname, '../extension');

const item = (id, text, unread) => `
<mws-conversation-list-item>
  <a href="/web/conversations/${id}" data-e2e-conversation data-e2e-is-unread="${unread}">
    <span class="name">Sender ${id}</span>
    <mws-conversation-snippet><span class="snippet-text"><span dir="auto">${text}</span></span></mws-conversation-snippet>
  </a>
</mws-conversation-list-item>`;

const html = `<!doctype html><body><nav id="list">
${item(1, 'Your La Trobe Financial Online code is 111111.', false)}
${item(2, 'See you tomorrow!', false)}
</nav><main id="conv">
<mws-message-wrapper><mws-text-message-part><div class="text-msg-content">Your Acme code is 222222</div></mws-text-message-part></mws-message-wrapper>
</main></body>`;

const dom = new JSDOM(html, { url: 'https://messages.google.com/web/conversations/3', runScripts: 'outside-only' });
const w = dom.window;
const copied = [];
let alive = true;
w.chrome = {
  runtime: {
    get id() { return alive ? 'x' : undefined; },
    getURL: p => 'file://' + path.join(ext, p),
    sendMessage: (msg, cb) => { if (msg.action === 'processPendingCode') copied.push(msg.code); cb && cb({ success: true }); },
    onMessage: { addListener() {} },
    lastError: undefined
  }
};
w.fetch = async () => ({ json: async () => JSON.parse(fs.readFileSync(path.join(ext, 'patterns.json'), 'utf8')) });
w.eval(fs.readFileSync(path.join(ext, 'detector.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(ext, 'content.js'), 'utf8'));

const d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snippet = id => d.querySelector(`a[href="/web/conversations/${id}"] .snippet-text span`);
const results = [];
const check = (name, cond) => { results.push(cond); console.log(cond ? 'PASS' : 'FAIL', name, JSON.stringify(copied)); };

(async () => {
  await sleep(6000); // past the baseline window
  check('codes already on the page at load are not copied', copied.length === 0);

  snippet(1).textContent = 'Your La Trobe Financial Online code is 333333.';
  await sleep(600);
  check('repeat sender: changed preview text is copied', copied.at(-1) === '333333');

  snippet(1).textContent = 'Your La Trobe Financial Online code is 444444.';
  await sleep(600);
  check('same sender a third time is copied', copied.at(-1) === '444444');

  d.getElementById('list').insertAdjacentHTML('afterbegin', item(9, 'G-555555 is your Google verification code.', true));
  await sleep(600);
  check('new unread conversation is copied', copied.at(-1) === '555555');

  snippet(2).textContent = 'You: my code is 666666';
  await sleep(600);
  check('own outgoing message is ignored', !copied.includes('666666'));

  d.getElementById('conv').insertAdjacentHTML('beforeend',
    '<mws-message-wrapper><mws-text-message-part><div class="text-msg-content">Your Acme verification code is 777777</div></mws-text-message-part></mws-message-wrapper>');
  await sleep(600);
  check('new message in open conversation is copied', copied.at(-1) === '777777');

  d.getElementById('conv').insertAdjacentHTML('afterbegin',
    '<mws-message-wrapper><div class="text-msg-content">Your Acme code is 888888</div></mws-message-wrapper>');
  await sleep(600);
  check('older message loaded by scrolling up is ignored', !copied.includes('888888'));

  w.history.pushState({}, '', '/web/conversations/4');
  d.getElementById('conv').innerHTML =
    '<mws-message-wrapper><div class="text-msg-content">Your Beta code is 999000</div></mws-message-wrapper>';
  await sleep(600);
  check('opening another conversation does not copy its old code', !copied.includes('999000'));

  snippet(1).textContent = 'Your La Trobe Financial Online code is 333333.';
  await sleep(600);
  check('duplicate code within 30 min is not copied twice', copied.filter(c => c === '333333').length === 1);

  alive = false;
  snippet(1).textContent = 'Your La Trobe Financial Online code is 121212.';
  await sleep(600);
  check('stops quietly after extension reload', !copied.includes('121212'));

  console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAILED');
  process.exit(results.every(Boolean) ? 0 : 1);
})();
