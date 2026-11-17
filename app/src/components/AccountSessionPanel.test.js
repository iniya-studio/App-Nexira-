import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

let vite;
let AccountSessionPanel;

before(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.js', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  });
  ({ AccountSessionPanel } = await vite.ssrLoadModule('/src/components/AccountSessionPanel.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderPanel(sessionState, props = {}) {
  return renderToStaticMarkup(React.createElement(AccountSessionPanel, {
    lifecycle: {},
    sessionState,
    language: 'en',
    ...props,
  }));
}

test('guest account renders the conversion form with required identity and password constraints', () => {
  const html = renderPanel({ status: 'guest' });

  assert.match(html, /id="account-session-title"/);
  assert.match(html, /Guest account active/);
  assert.match(html, /id="account-email"/);
  assert.match(html, /id="account-username"/);
  assert.match(html, /pattern="\[a-zA-Z0-9_\]\{3,20\}"/);
  assert.match(html, /id="account-display-name"/);
  assert.match(html, /id="account-password"/);
  assert.match(html, /minlength="12"/i);
  assert.match(html, /Convert your guest identity to a permanent account/);
  assert.match(html, /Continue with Google/);
});

test('signed-out account renders sign-in, registration entry, recovery and Google entry points', () => {
  const html = renderPanel({ status: 'signed-out' });

  assert.match(html, /id="account-login-email"/);
  assert.match(html, /id="account-login-password"/);
  assert.match(html, /Forgot password\?/);
  assert.match(html, /Sign in or create account/);
  assert.match(html, /Create account/);
  assert.match(html, /Continue with Google/);
});

test('password-reset deep link renders only the reset form and enforces the password minimum', () => {
  const html = renderPanel(
    { status: 'signed-out' },
    { resetToken: 'r'.repeat(43) },
  );

  assert.match(html, /id="account-reset-password"/);
  assert.match(html, /minlength="12"/i);
  assert.match(html, /Set new password/);
  assert.doesNotMatch(html, /id="account-login-email"/);
  assert.doesNotMatch(html, /Continue with Google/);
});

test('unverified registered account exposes email resend and revocation for other active sessions', () => {
  const html = renderPanel({
    status: 'authenticated',
    account: { email: 'player@example.com' },
    authentication: { passwordEnabled: true, providers: [] },
    emailVerification: { required: true, verified: false, delivery: 'NOT_CONFIGURED' },
    sessions: [
      { sessionId: 'current', isCurrent: true, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' },
      { sessionId: 'other', isCurrent: false, status: 'ACTIVE', createdAt: '2026-01-02T00:00:00.000Z' },
    ],
  });

  assert.match(html, /player@example\.com/);
  assert.match(html, /Resend verification email/);
  assert.match(html, /Verify your email to complete account security/);
  assert.match(html, /Revoke session/);
  assert.match(html, /Sign out all devices/);
  assert.doesNotMatch(html, /Sign in to NEXIRA/);
});

test('verified registered account shows verified state and hides the resend action', () => {
  const html = renderPanel({
    status: 'authenticated',
    account: { email: 'verified@example.com' },
    authentication: { passwordEnabled: true, providers: ['GOOGLE'] },
    emailVerification: { required: false, verified: true },
    sessions: [],
  });

  assert.match(html, /Account email is verified/);
  assert.match(html, /GOOGLE/);
  assert.doesNotMatch(html, /Resend verification email/);
});

test('initializing session does not expose account actions before identity is known', () => {
  const html = renderPanel({ status: 'initializing' });
  assert.equal(html, '');
});

test('Persian account view renders localized sign-in and Google actions', () => {
  const html = renderPanel({ status: 'signed-out' }, { language: 'fa' });
  assert.match(html, /مدیریت حساب/);
  assert.match(html, /ورود به نکسیرا/);
  assert.match(html, /ادامه با Google/);
});
