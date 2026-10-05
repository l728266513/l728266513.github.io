'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePost, encrypt, decrypt, serializeStub, validateStub } = require('./diary-crypto.cjs');
const { webcrypto } = require('node:crypto');

test('加密正文和原始 Markdown 可以无损恢复', () => {
  const raw = '---\ntitle: 一天\ndate: 2026-10-05 08:00:00\n---\n\n秘密文字\n';
  const { metadata } = parsePost(raw);
  const payload = { html: '<p>秘密文字</p>', markdown: raw };
  const stub = serializeStub(metadata, { words: 4, minutes: 1 }, encrypt(payload, 'correct horse battery staple'));
  assert.ok(!stub.includes('秘密文字'));
  assert.deepEqual(decrypt(validateStub(stub).encrypted, 'correct horse battery staple'), payload);
  assert.throws(() => decrypt(validateStub(stub).encrypted, 'bad password'));
});

test('公开文章拒绝正文和任意字段', () => {
  const metadata = parsePost('---\ntitle: 一天\ndate: 2026-10-05 08:00:00\n---\n').metadata;
  const stub = serializeStub(metadata, { words: 0, minutes: 1 }, encrypt({ html: '', markdown: '' }, 'a'));
  assert.throws(() => validateStub(stub + 'raw body'));
  assert.throws(() => validateStub(stub.replace('title:', 'description: secret\ntitle:')));
});

test('浏览器 Web Crypto 与本机加密格式兼容', async () => {
  const password = 'long browser password';
  const envelope = encrypt({ html: '<p>已解密</p>', markdown: '原文' }, password);
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(envelope.salt, 'base64'), iterations: envelope.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const data = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64'), additionalData: new TextEncoder().encode('ember-diary:v1'), tagLength: 128 }, key, Buffer.from(envelope.ciphertext, 'base64'));
  assert.equal(JSON.parse(new TextDecoder().decode(data)).html, '<p>已解密</p>');
});
