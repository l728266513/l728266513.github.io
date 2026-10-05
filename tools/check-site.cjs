'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('js-yaml');
const { unescapeHTML } = require('hexo-util');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
const config = load(fs.readFileSync(path.join(root, '_config.yml'), 'utf8'));
const origin = new URL(config.url).origin;
const failures = [];
const aliasRoutes = new Set(Object.keys(config.legacy_aliases || {}).map(route => `${route.replace(/^\/+|\/+$/g, '')}/index.html`));
function check(condition, message) { if (!condition) failures.push(message); }
function walk(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
function routeFile(urlPath) {
  let pathname = decodeURIComponent(urlPath);
  if (pathname.endsWith('/')) pathname += 'index.html';
  return path.join(output, pathname.replace(/^\//, ''));
}
assert(fs.existsSync(output), 'Run npm run build first.');
const htmlFiles = walk(output).filter(file => file.endsWith('.html'));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(output, file).replaceAll('\\', '/');
  const pageUrl = new URL(relative, `${config.url}/`);
  check(/<title>[^<]+<\/title>/.test(html), `Missing page title: ${relative}`);
  check(!html.includes('http://example.com'), `Placeholder domain: ${relative}`);
  check(html.includes('name="viewport"'), `Missing viewport: ${relative}`);
  if (/^\d{4}\/\d{2}\/\d{2}\//.test(relative) && !aliasRoutes.has(relative)) {
    check(html.includes('class="protected-article"'), `Missing password gate: ${relative}`);
    check(html.includes('"ciphertext"') && html.includes('"PBKDF2-SHA256"'), `Missing encrypted payload: ${relative}`);
    check(!html.includes('data-password-hash=') && !html.includes('atob(template.content'), `Legacy password gate: ${relative}`);
    check(html.includes('id="busuanzi_value_page_pv"'), `Missing page view counter: ${relative}`);
  }
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  check(canonical && unescapeHTML(canonical[1]).startsWith(`${config.url}/`), `Incorrect canonical: ${relative}`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = unescapeHTML(match[1]);
    if (/^(?:data:|mailto:|tel:|javascript:)/i.test(href)) continue;
    const url = new URL(href, pageUrl);
    if (url.origin !== origin) continue;
    const target = routeFile(url.pathname);
    check(fs.existsSync(target), `Broken link in ${relative}: ${href}`);
    if (url.hash && target.endsWith('.html') && fs.existsSync(target)) {
      const id = decodeURIComponent(url.hash.slice(1));
      const destination = fs.readFileSync(target, 'utf8');
      check(destination.includes(`id="${id}"`) || destination.includes(`name="${id}"`), `Missing anchor in ${relative}: ${href}`);
    }
  }
}
const search = JSON.parse(fs.readFileSync(path.join(output, 'search.json'), 'utf8'));
check(new Set(search.map(post => post.url)).size === search.length, 'Duplicate search routes');
for (const post of search) {
  check(fs.existsSync(routeFile(post.url)), `Search result has no article: ${post.title}`);
  check(post.title && Array.isArray(post.tags), `Empty search record: ${post.url}`);
  check(!Object.prototype.hasOwnProperty.call(post, 'text'), `Search index exposes article text: ${post.url}`);
}
for (const [source, legacy] of Object.entries(config.legacy_posts || {})) {
  if (!fs.existsSync(path.join(root, 'source', '_posts', source))) continue;
  check(fs.existsSync(routeFile('/' + legacy)), `Missing legacy route: ${legacy}`);
  check(search.some(post => post.url === '/' + legacy), `Legacy route absent from search: ${legacy}`);
}
for (const alias of Object.keys(config.legacy_aliases || {})) check(fs.existsSync(routeFile('/' + alias)), `Missing old alias: ${alias}`);
for (const required of ['404.html', 'atom.xml', 'sitemap.xml', 'robots.txt', '.nojekyll', 'about/index.html', 'archives/index.html']) check(fs.existsSync(path.join(output, required)), `Missing output: ${required}`);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Passed: ${htmlFiles.length} HTML pages, ${search.length} protected articles, internal links, anchors, canonical URLs, legacy links, feed, sitemap and 404.`);
