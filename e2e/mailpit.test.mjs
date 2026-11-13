import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractVerifyLink } from './mailpit.mjs';

test('extracts the verification link from a plain text body', () => {
  const text = 'Hi Ana,\n\nVerify: http://localhost:4300/verify-email?token=ab_C-12.x~y\n\nBye';
  assert.equal(extractVerifyLink(text), 'http://localhost:4300/verify-email?token=ab_C-12.x~y');
});

test('extracts from html and stops at the closing quote', () => {
  const html = '<a href="https://cinevault.example/verify-email?token=tok_1">Verify</a>';
  assert.equal(extractVerifyLink(html), 'https://cinevault.example/verify-email?token=tok_1');
});

test('returns null when there is no verification link', () => {
  assert.equal(extractVerifyLink('reset: http://x/reset-password?token=abc'), null);
  assert.equal(extractVerifyLink(undefined), null);
});

test('refuses any address that is not on example.test', async () => {
  const { assertTestAddress, messagesTo, deleteMessagesTo } = await import('./mailpit.mjs');
  assert.doesNotThrow(() => assertTestAddress('e2e-abc@example.test'));
  for (const bad of [
    'me@gmail.com',
    'x@example.test.evil.com',
    'a b@example.test',
    '',
    undefined,
  ]) {
    assert.throws(() => assertTestAddress(bad), /example\.test/);
  }
  await assert.rejects(messagesTo('owner@cinevault.local'), /example\.test/);
  await assert.rejects(deleteMessagesTo('owner@cinevault.local'), /example\.test/);
});
