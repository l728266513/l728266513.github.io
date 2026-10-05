'use strict';

const { basename } = require('node:path');
const { stripHTML, unescapeHTML, escapeHTML } = require('hexo-util');

function plainText(html) {
  return unescapeHTML(stripHTML(String(html || '').replace(/<\/(?:p|div|h[1-6])>|<br\s*\/?\s*>/gi, ' '))).replace(/\s+/g, ' ').trim();
}

// Run before Hexo's permalink filter; keep the Markdown files untouched.
hexo.extend.filter.register('post_permalink', function (post) {
  const legacy = (hexo.config.legacy_posts || {})[basename(post.source)];
  if (!legacy && post.__permalink) return post;
  const data = Object.create(post);
  if (legacy) Object.defineProperty(data, '__permalink', { value: legacy });
  else Object.defineProperty(data, 'slug', { value: post.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '') });
  return data;
}, 5);

hexo.extend.helper.register('plain_text', plainText);
hexo.extend.helper.register('post_summary', function (post, length = 88) {
  const text = plainText(post.description || post.excerpt || post.content);
  const chars = Array.from(text);
  return chars.length > length ? chars.slice(0, length).join('') + '…' : text;
});
hexo.extend.helper.register('reading_stats', function (post) {
  if (post.reading && Number.isInteger(post.reading.words) && Number.isInteger(post.reading.minutes)) return post.reading;
  const text = plainText(post.content);
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const words = (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
  return { words: han + words, minutes: Math.max(1, Math.ceil((han + words) / 300)) };
});
hexo.extend.helper.register('year_groups', function (posts) {
  const groups = new Map();
  posts.forEach(post => {
    const year = post.date.format('YYYY');
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(post);
  });
  return Array.from(groups, ([year, entries]) => ({ year, entries }));
});

const icons = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  diagonal: '<path d="M6 18 18 6M6 6h12v12"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  moon: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  rss: '<circle cx="5" cy="19" r="1"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  book: '<path d="M12 5v15m0-15C8 2 4 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-2-1-6-2-10 1Z"/>',
  leaf: '<path d="M20 3C10 2 3 6 4 13c.6 4 5 6 9 4 5-3 6-8 7-14ZM4 21 15 10"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>'
};
hexo.extend.helper.register('icon', name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.arrow}</svg>`);

hexo.extend.generator.register('ember-data', function (locals) {
  const posts = locals.posts.sort('-date').toArray();
  const base = hexo.config.url.replace(/\/$/, '');
  const root = hexo.config.root;
  const url = path => `${base}/${path.replace(/^\//, '')}`;
  const index = posts.map(post => ({ title: post.title, url: `${root}${post.path.replace(/^\//, '')}`, date: post.date.format('YYYY.MM.DD'), tags: post.tags.map(tag => tag.name) }));
  const xml = text => escapeHTML(String(text));
  const lockNotice = '这篇日记需要输入密码后阅读。';
  const updated = posts.length ? posts.reduce((max, p) => p.updated > max ? p.updated : max, posts[0].updated).toISOString() : new Date(0).toISOString();
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${xml(hexo.config.title)}</title><subtitle>${xml(hexo.config.subtitle)}</subtitle><id>${xml(base)}/</id><link href="${xml(base)}/"/><link href="${xml(base)}/atom.xml" rel="self"/><updated>${updated}</updated><author><name>${xml(hexo.config.author)}</name></author>${posts.map(post => `<entry><title>${xml(post.title)}</title><id>${xml(post.permalink)}</id><link href="${xml(post.permalink)}"/><published>${post.date.toISOString()}</published><updated>${post.updated.toISOString()}</updated><summary>${xml(lockNotice)}</summary><content type="text">${xml(lockNotice)}</content></entry>`).join('')}</feed>`;
  const urls = ['', 'archives/', 'about/', ...posts.map(post => post.path), ...locals.tags.map(tag => tag.path)];
  const sitemap = `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path => `<url><loc>${xml(url(path))}</loc></url>`).join('')}</urlset>`;
  const aliases = Object.entries(hexo.config.legacy_aliases || {}).map(([from, to]) => {
    const destination = `${root}${to}`;
    return { path: `${from}index.html`, data: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>正在前往文章 · ${xml(hexo.config.title)}</title><link rel="canonical" href="${xml(url(to))}"><meta http-equiv="refresh" content="0;url=${xml(destination)}"></head><body><p>文章已归档。<a href="${xml(destination)}">继续阅读</a></p><script>location.replace(${JSON.stringify(destination)} + location.search + location.hash);</script></body></html>` };
  });
  return [
    { path: 'search.json', data: JSON.stringify(index) },
    { path: 'atom.xml', data: feed },
    { path: 'sitemap.xml', data: sitemap },
    { path: 'robots.txt', data: `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n` },
    { path: '.nojekyll', data: '' },
    ...aliases
  ];
});
