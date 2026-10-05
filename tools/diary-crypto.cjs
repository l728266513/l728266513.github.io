'use strict';

const { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } = require('node:crypto');
const { load, dump, JSON_SCHEMA } = require('js-yaml');

const ITERATIONS = 600000;
const AAD = 'ember-diary:v1';
const PUBLIC_FIELDS = ['title', 'date', 'updated', 'categories', 'tags', 'permalink', 'slug', 'published'];
const STUB_FIELDS = new Set([...PUBLIC_FIELDS, 'encrypted', 'reading']);

function parsePost(raw) {
  const match = String(raw).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error('日记必须包含完整的 YAML front matter。');
  const metadata = load(match[1], { schema: JSON_SCHEMA });
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('日记元数据格式错误。');
  return { metadata, body: match[2] };
}

function validateEnvelope(envelope) {
  if (!envelope || Object.keys(envelope).sort().join(',') !== 'ciphertext,iterations,iv,kdf,salt,v' ||
      envelope.v !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) {
    throw new Error('不支持的日记加密格式。');
  }
  for (const [key, size] of [['salt', 16], ['iv', 12], ['ciphertext', null]]) {
    const value = envelope[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || Buffer.from(value, 'base64').toString('base64') !== value) {
      throw new Error('损坏的日记密文。');
    }
    const length = Buffer.from(value, 'base64').length;
    if (size ? length !== size : length < 17) throw new Error('损坏的日记密文长度。');
  }
  return envelope;
}

function validateStub(raw) {
  const { metadata, body } = parsePost(raw);
  if (body.trim() || Object.keys(metadata).some(key => !STUB_FIELDS.has(key))) {
    throw new Error('公开文章包含正文或非公开字段；请把原文放在 .private/posts 后重新加密。');
  }
  if (typeof metadata.title !== 'string' || !metadata.title || typeof metadata.date !== 'string' || !metadata.date) {
    throw new Error('文章缺少公开标题或日期。');
  }
  const reading = metadata.reading;
  if (!reading || Object.keys(reading).sort().join(',') !== 'minutes,words' ||
      !Number.isSafeInteger(reading.words) || reading.words < 0 ||
      !Number.isSafeInteger(reading.minutes) || reading.minutes < 1) throw new Error('阅读统计格式错误。');
  validateEnvelope(metadata.encrypted);
  return metadata;
}

function encrypt(payload, password) {
  if (typeof password !== 'string' || !password) throw new Error('阅读密码不能为空。');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(AAD));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  key.fill(0);
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function decrypt(envelope, password) {
  validateEnvelope(envelope);
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const key = pbkdf2Sync(password, Buffer.from(envelope.salt, 'base64'), envelope.iterations, 32, 'sha256');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(AAD));
    decipher.setAuthTag(ciphertext.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString('utf8'));
  } finally { key.fill(0); }
}

function serializeStub(metadata, reading, encrypted) {
  const visible = Object.fromEntries(PUBLIC_FIELDS.filter(key => metadata[key] !== undefined).map(key => [key, metadata[key]]));
  const result = '---\n' + dump({ ...visible, reading, encrypted }, { schema: JSON_SCHEMA, lineWidth: -1, noRefs: true }) + '---\n';
  validateStub(result);
  return result;
}

module.exports = { ITERATIONS, AAD, PUBLIC_FIELDS, parsePost, validateEnvelope, validateStub, encrypt, decrypt, serializeStub };
