// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { compile, extract2FACode } = require('../extension/detector.js');
const patterns = compile(require(path.join(__dirname, '../extension/patterns.json')).codePatterns);

const shouldMatch = [
  ['Your La Trobe Financial Online code is 482913.', '482913'], // issue #5
  ['G-123456 is your Google verification code.', '123456'],
  ['Your Twilio verification code is: 654321', '654321'],
  ['Your Amazon verification code is: 112233', '112233'],
  ['Microsoft code: 12345678', '12345678'],
  ['Your Chase code will arrive shortly. Code: 55512345', '55512345'],
  ['Your verification code is 4821. Do not share it.', '4821'],
  ['123456 is your Link verification code', '123456'],
  ['Use 908172 as your one-time passcode for Acme. It expires in 10 minutes.', '908172'],
  ['Your one-time passcode is 908172', '908172'],
  ['Your OTP is 7731', '7731'],
  ['Your security code: A1B2C3', 'A1B2C3'],
  ['Your PIN is 5521', '5521'],
  ['839201 is your Instacart verification code.', '839201'],
  ['Your DoorDash verification code is: 291843', '291843'],
  ['您的验证码是 739201', '739201'],
  ['Your sign-in code is 44120. Expires in 5 min.', '44120'],
];

const shouldNotMatch = [
  'Your code expires in 10 minutes',
  'Use code SAVE20 at checkout for 20% off',
  'Your PIN reminder: please visit our website',
  'Hey, are we still on for dinner at 7?',
  'Your order 482913 has shipped',
  'Questions? Call us at 1-800-555-1234',
  'Your package with tracking number 99887766 is out for delivery',
];

for (const [text, code] of shouldMatch) {
  test(`matches: ${text}`, () => {
    const r = extract2FACode(text, patterns);
    assert.ok(r, 'expected a match');
    assert.strictEqual(r.code, code);
  });
}

for (const text of shouldNotMatch) {
  test(`ignores: ${text}`, () => {
    assert.strictEqual(extract2FACode(text, patterns), null);
  });
}
