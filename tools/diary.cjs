'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Hexo = require('hexo');
const { stripHTML, unescapeHTML } = require('hexo-util');
const { dump, JSON_SCHEMA } = require('js-yaml');
const { parsePost, validateStub, encrypt, decrypt, serializeStub } = require('./diary-crypto.cjs');
const { ROOT, PRIVATE, POSTS, PUBLIC, PASSWORD, postFiles, readPassword, validatePublicPosts, writeAtomic } = require('./diary-files.cjs');

async function encryptPosts() {
  const files = postFiles(POSTS);
  if (!files.length) throw new Error('没有本机原文。新建日记请运行 npm run new -- "标题"；恢复原文请运行 npm run diary:restore。');
  // A partial private backup must never silently leave some posts using an old password.
  for (const name of postFiles(PUBLIC)) {
    if (!files.includes(name)) throw new Error('缺少本机原文：' + name + '。请先恢复；删除文章时须同时删除原文和公开密文。');
  }
  const password = readPassword();
  const hexo = new Hexo(ROOT, { silent: true });
  await hexo.init();
  const pending = [];
  for (const name of files) {
    const raw = fs.readFileSync(path.join(POSTS, name), 'utf8');
    const { metadata, body } = parsePost(raw);
    if (metadata.encrypted) throw new Error('私有目录应保存原文，不能放入加密文件：' + name);
    // Use Hexo's normal Markdown, tag and highlighting pipeline, entirely on this computer.
    const rendered = await hexo.post.render(path.join(POSTS, name), { content: body });
    const html = rendered.content;
    const text = unescapeHTML(stripHTML(html.replace(/<\/(?:p|div|h[1-6])>|<br\s*\/?\s*>/gi, ' '))).replace(/\s+/g, ' ').trim();
    const words = (text.match(/\p{Script=Han}/gu) || []).length + (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
    const reading = { words, minutes: Math.max(1, Math.ceil(words / 300)) };
    const payload = { html, markdown: raw };
    const target = path.join(PUBLIC, name);
    let envelope;
    if (fs.existsSync(target)) {
      try {
        const previous = validateStub(fs.readFileSync(target, 'utf8')).encrypted;
        if (JSON.stringify(decrypt(previous, password)) === JSON.stringify(payload)) envelope = previous;
      } catch (_) { /* Raw migration, a changed password or changed content: encrypt afresh. */ }
    }
    const content = serializeStub(metadata, reading, envelope || encrypt(payload, password));
    // Round-trip every prepared article before replacing any public file.
    const verified = decrypt(validateStub(content).encrypted, password);
    if (verified.markdown !== raw || verified.html !== html) throw new Error('加密校验失败：' + name);
    pending.push({ target, content });
  }
  let changed = 0;
  for (const { target, content } of pending) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) { writeAtomic(target, content); changed++; }
  }
  console.log(`已验证 ${files.length} 篇日记，更新 ${changed} 个密文文件。密码未写入公开文件。`);
}

function migrate() {
  const originals = postFiles(PUBLIC).filter(name => {
    try { validateStub(fs.readFileSync(path.join(PUBLIC, name), 'utf8')); return false; }
    catch (_) { return true; }
  });
  fs.mkdirSync(POSTS, { recursive: true });
  for (const name of originals) {
    const raw = fs.readFileSync(path.join(PUBLIC, name));
    const target = path.join(POSTS, name);
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(raw)) throw new Error('私有目录存在不同版本，已停止迁移：' + name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, raw, { flag: 'wx', mode: 0o600 });
  }
  console.log(`已在本机私有目录备份 ${originals.length} 篇原文。`);
}

function restore() {
  const password = readPassword();
  const files = validatePublicPosts();
  const pending = files.map(name => {
    const { markdown } = decrypt(validateStub(fs.readFileSync(path.join(PUBLIC, name), 'utf8')).encrypted, password);
    if (typeof markdown !== 'string') throw new Error('密文不含可恢复原文：' + name);
    const target = path.join(POSTS, name);
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') !== markdown) throw new Error('本机原文已修改，拒绝覆盖：' + name);
    return { target, markdown };
  });
  for (const { target, markdown } of pending) if (!fs.existsSync(target)) writeAtomic(target, markdown);
  console.log(`已恢复 ${pending.length} 篇日记到 .private/posts，没有覆盖不同版本。`);
}

function newPost(title) {
  if (!title || /[<>:"/\\|?*\x00-\x1f]/.test(title)) throw new Error('请提供标题，且不要包含 Windows 文件名禁用字符。');
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
  const file = path.join(POSTS, `${parts.slice(0, 10)}-${title}.md`);
  fs.mkdirSync(POSTS, { recursive: true });
  const permalink = `${parts.slice(0, 10).replace(/-/g, '/')}/${randomUUID().slice(0, 12)}/`;
  fs.writeFileSync(file, '---\n' + dump({ title, date: parts, permalink, categories: ['日记'], tags: ['随想'] }, { schema: JSON_SCHEMA }) + '---\n\n', { flag: 'wx', mode: 0o600 });
  console.log('请编辑本机原文：' + file);
}

async function setPassword() {
  if (!process.stdin.isTTY) throw new Error('请在交互终端运行，或直接编辑 .private/reading-password.txt（单行密码）。');
  async function hiddenInput(prompt) {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    return new Promise((resolve, reject) => {
      let value = '';
      const cleanup = () => { process.stdin.off('data', listener); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
      const listener = chunk => {
        for (const character of chunk) {
          if (character === '\u0003') { cleanup(); reject(new Error('已取消。')); return; }
          if (character === '\r' || character === '\n') { cleanup(); resolve(value); return; }
          if (character === '\u007f' || character === '\b') value = Array.from(value).slice(0, -1).join('');
          else if (character >= ' ') value += character;
        }
      };
      process.stdin.on('data', listener);
    });
  }
  const password = await hiddenInput('输入新的阅读密码（不回显）：');
  if (!password || password.length > 256) throw new Error('密码长度须为 1 至 256 个字符。');
  const repeat = await hiddenInput('再次输入：');
  if (password !== repeat) throw new Error('两次密码不同，未修改。');
  if (password.length < 16) console.warn('提醒：短密码容易被离线猜中，建议使用至少 16 位的随机密码。');
  // Ensure a password rotation is possible before changing the local credential.
  if (fs.existsSync(PASSWORD)) {
    for (const name of postFiles(PUBLIC)) if (!fs.existsSync(path.join(POSTS, name))) throw new Error('改密码前请先用旧密码恢复全部原文。');
  }
  writeAtomic(PASSWORD, password + '\n');
  console.log('密码已保存在本机。请运行 npm run build，再提交密文并推送。');
}

async function main() {
  const command = process.argv[2];
  if (command === 'migrate') { migrate(); await encryptPosts(); }
  else if (command === 'encrypt') await encryptPosts();
  else if (command === 'prepare') {
    if (fs.existsSync(POSTS)) await encryptPosts();
    else console.log('当前环境没有私有原文，将直接构建现有密文。');
    validatePublicPosts();
  } else if (command === 'restore') restore();
  else if (command === 'new') newPost(process.argv.slice(3).join(' '));
  else if (command === 'password') await setPassword();
  else throw new Error('未知操作。');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
