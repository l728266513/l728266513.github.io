'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, POSTS, PUBLIC, postFiles, validatePublicPosts } = require('./diary-files.cjs');
const { parsePost } = require('./diary-crypto.cjs');

const files = validatePublicPosts();
const result = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
if (result.status === 0) {
  const tracked = result.stdout.split('\0').filter(Boolean);
  for (const file of tracked) {
    if (file.startsWith('.private/') || file.startsWith('source/_drafts/')) throw new Error('私有原文被 Git 追踪：' + file);
  }
  const staged = spawnSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: ROOT, encoding: 'utf8' });
  if (staged.status !== 0) throw new Error('无法检查 Git 暂存区。');
  for (const file of staged.stdout.split('\0').filter(name => name.startsWith('source/_posts/') && name.endsWith('.md'))) {
    const blob = spawnSync('git', ['show', ':' + file], { cwd: ROOT, encoding: 'utf8' });
    if (blob.status !== 0) throw new Error('无法检查暂存文章：' + file);
    try { require('./diary-crypto.cjs').validateStub(blob.stdout); }
    catch (_) { throw new Error('暂存区仍含未加密日记：' + file + '。请先运行 git add source/_posts。'); }
  }
}

if (fs.existsSync(POSTS)) {
  const privateFiles = postFiles(POSTS);
  if (privateFiles.length !== files.length || privateFiles.some(name => !files.includes(name))) throw new Error('本机原文与公开密文不匹配。');
  const output = path.join(ROOT, 'public');
  const outputText = fs.existsSync(output) ? [path.join(output, 'search.json'), path.join(output, 'atom.xml')].filter(fs.existsSync).map(file => fs.readFileSync(file, 'utf8')).join('\n') : '';
  for (const name of privateFiles) {
    const body = parsePost(fs.readFileSync(path.join(POSTS, name), 'utf8')).body.trim();
    if (!body) continue;
    const publicText = fs.readFileSync(path.join(PUBLIC, name), 'utf8');
    if (publicText.includes(body)) throw new Error('正文出现在公开文章：' + name);
    if (outputText.includes(body)) throw new Error('正文出现在网站索引或 RSS：' + name);
  }
}
console.log(`隐私检查通过：${files.length} 篇公开文章均为加密格式。`);
