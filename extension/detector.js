// 2FA code detection. Shared by the content script and the Node tests.
(function (root) {
  'use strict';

  // Words that suggest the message is a one-time code.
  const POSITIVE_CONTEXT = [
    'verification', 'verify', 'code', 'otp', 'passcode', 'authenticat',
    'security', 'access', 'login', 'log in', 'sign in', 'sign-in', 'confirmation',
    'confirm', 'two-factor', '2fa', 'one-time', 'one time', 'temporary', 'expires',
    'pin', '验证码', '驗證碼'
  ];

  // Words near the number that suggest it is not a one-time code.
  const NEGATIVE_CONTEXT = [
    'call us', 'call at', 'dial', 'phone number', 'customer service',
    'support line', 'hotline', 'order #', 'order number', 'tracking'
  ];

  function compile(patterns) {
    return (patterns || []).map(p => ({
      name: p.platformName,
      regex: new RegExp(p.platformPattern, 'i')
    }));
  }

  function validateCode(code, text) {
    if (!code || code.length < 4 || code.length > 8) return false;
    // Every code must contain at least one digit: rejects captured words
    // like "expires", "will", "reminder".
    if (!/\d/.test(code)) return false;

    const lower = text.toLowerCase();
    if (!POSITIVE_CONTEXT.some(w => lower.includes(w))) return false;

    const idx = text.indexOf(code);
    if (idx > -1) {
      const context = lower.substring(Math.max(0, idx - 30), idx + code.length + 30);
      if (NEGATIVE_CONTEXT.some(w => context.includes(w))) return false;
      // Part of a longer number, e.g. a phone number "555-123-4567".
      if (/\d[-.]$/.test(text.substring(0, idx)) || /^[-.]\d/.test(text.substring(idx + code.length))) return false;
    }
    return true;
  }

  function extract2FACode(text, compiled) {
    if (!text) return null;
    for (const p of compiled) {
      const match = text.match(p.regex);
      if (match && match[1]) {
        const code = match[1].trim();
        if (validateCode(code, text)) return { code, platform: p.name };
      }
    }
    return null;
  }

  const api = { compile, validateCode, extract2FACode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TwoF2Detector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
