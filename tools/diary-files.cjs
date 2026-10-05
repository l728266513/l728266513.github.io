'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateStub } = require('./diary-crypto.cjs');
const ROOT = path.resolve(__dirname, '..');
const PRIVATE = path.join(ROOT, '.private');
const POSTS = path.join(PRIVATE, 'posts');
const PUBLIC = path.join(ROOT, 'source', '_posts');
const PASSWORD = path.join(PRIVATE, 'reading-password.txt');

function postFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).map(entry => {
    if (!entry.isFile() || !entry.name.endsWith('.md')) throw new Error('日记目录仅支持 Markdown 文件：' + entry.name);
    return entry.name;
  }).sort();
}

function readPassword() {
  if (!fs.existsSync(PASSWORD)) throw new Error('缺少本机阅读密码，请先运行 npm run diary:password。');
  const value = fs.readFileSync(PASSWORD, 'utf8').replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
  if (!value || /[\r\n]/.test(value)) throw new Error('密码文件必须只包含一行非空密码。');
  return value;
}

function validatePublicPosts() {
  const files = postFiles(PUBLIC);
  for (const name of files) {
    try { validateStub(fs.readFileSync(path.join(PUBLIC, name), 'utf8')); }
    catch (_) { throw new Error('拒绝构建未加密或格式错误的文章：' + name + '。原文应放在 .private/posts。'); }
  }
  return files;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, content, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

module.exports = { ROOT, PRIVATE, POSTS, PUBLIC, PASSWORD, postFiles, readPassword, validatePublicPosts, writeAtomic };
