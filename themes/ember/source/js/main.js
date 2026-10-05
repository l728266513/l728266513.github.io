(() => {
  'use strict';

  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const themeMedia = matchMedia('(prefers-color-scheme: dark)');
  let manualTheme = false;
  try { manualTheme = ['light', 'dark'].includes(localStorage.getItem('ember-theme')); } catch (_) {}
  function setTheme(theme) {
    root.dataset.theme = theme;
    themeButton.setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
    themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#1c2421' : '#f8f7f3';
  }
  themeButton.hidden = false;
  setTheme(root.dataset.theme);
  themeButton.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    manualTheme = true;
    setTheme(theme);
    try { localStorage.setItem('ember-theme', theme); } catch (_) {}
  });
  themeMedia.addEventListener('change', event => { if (!manualTheme) setTheme(event.matches ? 'dark' : 'light'); });

  const quoteHeading = document.querySelector('.intro-quote');
  if (quoteHeading) {
    let quotes = [];
    try { quotes = JSON.parse(quoteHeading.dataset.quotes || '[]'); } catch (_) {}
    if (Array.isArray(quotes) && quotes.length) {
      let previous = -1;
      try { previous = Number(sessionStorage.getItem('ember-intro-quote')); } catch (_) {}
      let index = Math.floor(Math.random() * quotes.length);
      if (quotes.length > 1 && index === previous) index = (index + 1) % quotes.length;
      const quote = quotes[index] || {};
      const primary = quoteHeading.querySelector('.quote-primary');
      const secondary = quoteHeading.querySelector('.quote-secondary');
      primary.textContent = quote.zh || '';
      secondary.textContent = quote.en || '';
      secondary.hidden = !quote.en;
      try { sessionStorage.setItem('ember-intro-quote', String(index)); } catch (_) {}
    }
  }

  const protectedArticle = document.querySelector('.protected-article');
  if (protectedArticle) {
    const form = protectedArticle.querySelector('.unlock-form');
    const passwordInput = protectedArticle.querySelector('#post-password');
    const message = protectedArticle.querySelector('.unlock-message');
    const gate = protectedArticle.querySelector('.article-gate');
    const template = protectedArticle.querySelector('#protected-content');
    const body = protectedArticle.querySelector('.article-body');
    const submit = form.querySelector('button[type="submit"]');
    const sessionKey = `ember-unlocked:${location.pathname}`;

    const envelope = JSON.parse(template.content.textContent);
    function bytesFromBase64(value) {
      return Uint8Array.from(atob(value), character => character.charCodeAt(0));
    }
    async function decryptContent(password) {
      if (!window.crypto || !window.crypto.subtle || !window.TextEncoder || !window.TextDecoder) throw new Error('unsupported');
      if (envelope.v !== 1 || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== 600000) throw new Error('format');
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytesFromBase64(envelope.salt), iterations: envelope.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesFromBase64(envelope.iv), additionalData: new TextEncoder().encode('ember-diary:v1'), tagLength: 128 }, key, bytesFromBase64(envelope.ciphertext));
      const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
      if (typeof payload.html !== 'string') throw new Error('format');
      return payload.html;
    }
    function reveal(html) {
      body.innerHTML = html;
      body.hidden = false;
      gate.hidden = true;
      protectedArticle.classList.add('is-unlocked');
    }
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) decryptContent(saved).then(reveal).catch(() => sessionStorage.removeItem(sessionKey));
    } catch (_) {}
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!passwordInput.value) return;
      submit.disabled = true;
      message.textContent = '正在验证…';
      try {
        const html = await decryptContent(passwordInput.value);
        reveal(html);
        try { sessionStorage.setItem(sessionKey, passwordInput.value); } catch (_) {}
        passwordInput.value = '';
        message.textContent = '';
      } catch (error) {
        message.textContent = error.message === 'unsupported' ? '当前浏览器不支持解密，请使用 HTTPS 或现代浏览器。' : error.message === 'format' ? '日记格式错误，请联系站点主人。' : '密码不正确，请再试一次。';
        passwordInput.select();
      } finally {
        submit.disabled = false;
      }
    });
  }

  const dialog = document.querySelector('.search-dialog');
  const input = document.querySelector('#search-input');
  const status = document.querySelector('.search-status');
  const results = document.querySelector('.search-results');
  const trigger = document.querySelector('.search-trigger');
  let records = null;
  let loading = null;
  let debounce = null;
  let lastFocused = null;

  function highlight(node, text, terms) {
    const lower = text.toLocaleLowerCase();
    let offset = 0;
    while (offset < text.length) {
      let position = text.length;
      let matched = '';
      for (const term of terms) {
        const index = lower.indexOf(term, offset);
        if (index !== -1 && index < position) { position = index; matched = term; }
      }
      node.append(document.createTextNode(text.slice(offset, position)));
      if (!matched) break;
      const mark = document.createElement('mark');
      mark.textContent = text.slice(position, position + matched.length);
      node.append(mark);
      offset = position + matched.length;
    }
  }

  function renderResults() {
    results.replaceChildren();
    const query = input.value.trim().toLocaleLowerCase();
    if (!records) return;
    if (!query) { status.textContent = '输入关键词，找回某一刻。'; return; }
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = records.map(post => {
      const title = post.title.toLocaleLowerCase();
      const haystack = `${post.title} ${post.tags.join(' ')}`.toLocaleLowerCase();
      return { post, hit: terms.every(term => haystack.includes(term)), score: terms.reduce((sum, term) => sum + (title.includes(term) ? 1 : 0), 0) };
    }).filter(entry => entry.hit).sort((a, b) => b.score - a.score);
    status.textContent = matches.length ? `找到 ${matches.length} 篇文字${matches.length > 30 ? '，显示前 30 篇，请增加关键词缩小范围' : ''}。` : '还没有找到这段文字，换一个关键词试试。';
    for (const { post } of matches.slice(0, 30)) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = post.url;
      const heading = document.createElement('div');
      heading.className = 'search-result-heading';
      const title = document.createElement('h3');
      highlight(title, post.title, terms);
      const date = document.createElement('time');
      date.textContent = post.date;
      date.dateTime = post.date.replaceAll('.', '-');
      heading.append(title, date);
      const excerpt = document.createElement('p');
      excerpt.textContent = '输入密码后阅读';
      link.append(heading, excerpt);
      item.append(link);
      results.append(item);
    }
  }

  async function loadIndex() {
    if (records) { renderResults(); return; }
    if (loading) return loading;
    status.textContent = '正在翻开日记…';
    loading = (async () => {
      const response = await fetch(dialog.dataset.index);
      if (!response.ok) throw new Error('Could not load search index');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid search index');
      records = data;
      renderResults();
    })().catch(() => { status.textContent = '暂时无法加载搜索。请检查连接，关闭后重试。'; }).finally(() => { loading = null; });
    return loading;
  }
  function openSearch() {
    if (dialog.open) return;
    lastFocused = document.activeElement;
    dialog.showModal();
    input.focus();
    loadIndex();
  }
  if (typeof dialog.showModal === 'function') {
    trigger.hidden = false;
    trigger.addEventListener('click', openSearch);
    document.querySelector('.close-search').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    });
    dialog.addEventListener('close', () => { if (lastFocused && lastFocused.isConnected) lastFocused.focus(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    });
    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(renderResults, 100); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        const first = results.querySelector('a');
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    results.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const links = Array.from(results.querySelectorAll('a'));
      const index = links.indexOf(document.activeElement);
      if (index === -1) return;
      event.preventDefault();
      if (event.key === 'ArrowUp' && index === 0) input.focus();
      else links[Math.max(0, Math.min(links.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
    });
    document.querySelector('.search-form').addEventListener('submit', event => {
      event.preventDefault();
      clearTimeout(debounce);
      renderResults();
      const first = results.querySelector('a');
      if (first) first.click();
    });
  }

  const copyButton = document.querySelector('.copy-link');
  if (copyButton && navigator.clipboard && window.isSecureContext) {
    copyButton.hidden = false;
    let resetCopy;
    copyButton.addEventListener('click', async () => {
      const label = copyButton.querySelector('span');
      const feedback = document.querySelector('#copy-status');
      try {
        await navigator.clipboard.writeText(document.querySelector('link[rel="canonical"]').href);
        label.textContent = '已复制';
        feedback.textContent = '文章链接已复制到剪贴板。';
      } catch (_) { label.textContent = '复制未成功'; feedback.textContent = '浏览器未允许复制，请复制地址栏中的链接。'; }
      clearTimeout(resetCopy);
      resetCopy = setTimeout(() => { label.textContent = '复制链接'; feedback.textContent = ''; }, 2400);
    });
  }
  const topButton = document.querySelector('.back-to-top');
  let scrollPending = false;
  function refreshScroll() { topButton.hidden = window.scrollY < 650; scrollPending = false; }
  window.addEventListener('scroll', () => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(refreshScroll); } }, { passive: true });
  refreshScroll();
  topButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    document.querySelector('.brand').focus({ preventScroll: true });
  });
})();
