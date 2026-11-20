(function () {
  'use strict';

  var app = document.getElementById('app');
  var edition = null;
  var current = null; // the story on screen, for Save and ideas
  var currentDate = null; // the edition that story came from

  var KIND = {
    claude: 'Built with Claude',
    build: 'Build',
    debate: 'Debate',
    steal: 'Steal this',
    news: 'Worth knowing',
    wildcard: 'Wildcard'
  };

  // ---------- small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u || '')) ? esc(u) : '';
  }
  function store(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: fine */ }
  }

  var ICON = {
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    bigCheck: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    mark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg>',
    marked: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
    out: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  // ---------- read state ----------
  function readKey() { return 'sift-read-' + edition.date; }
  function readSet() { return store(readKey(), []); }
  function markRead(i) {
    var r = readSet();
    if (r.indexOf(i) === -1) { r.push(i); save(readKey(), r); }
  }

  // ---------- saved stories and ideas (kept in this browser) ----------
  function savedList() { return store('sift-saved', []); }
  function ideas() { return store('sift-sparks', []); }
  function storyKey(st) { return st.url || st.title; }
  function isSaved(st) {
    var k = storyKey(st);
    return savedList().some(function (x) { return storyKey(x.story) === k; });
  }
  function toggleSave(st) {
    var list = savedList();
    var k = storyKey(st);
    var at = -1;
    list.forEach(function (x, n) { if (storyKey(x.story) === k) at = n; });
    if (at === -1) list.push({ story: st, date: edition.date, savedAt: Date.now() });
    else list.splice(at, 1);
    save('sift-saved', list);
    return at === -1;
  }
  function addIdea(text, st) {
    var all = ideas();
    all.push({ text: text, date: edition.date, from: st ? st.title : undefined, fromUrl: st ? st.url : undefined });
    save('sift-sparks', all);
  }
  function savedCount() { return savedList().length + ideas().length; }

  // ---------- Send to Focus (Hasset's desktop app, opened through a focus:// link) ----------
  // Only on computers: Focus on the phone doesn't take these links yet.
  var onComputer = !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  var siftBase = location.origin + location.pathname.replace(/[^/]*$/, '');
  function focusHref(kind, text, st, date) {
    var q = new URLSearchParams();
    q.set('kind', kind);
    // Focus reads the whole story from this edition file, so the link stays short.
    // Ideas from a story go into that story's page, so they carry the same details.
    if (kind === 'story' || st) { q.set('src', siftBase); q.set('ed', date || (edition && edition.date) || ''); }
    if (text) q.set('text', String(text).slice(0, 2000));
    if (st && st.title) q.set('title', st.title);
    if (st && st.url) q.set('url', st.url);
    q.set('from', 'Sift');
    return 'focus://add?' + q.toString();
  }
  function sendIdeaLink(x, idx) {
    if (!onComputer) return '';
    if (x.sentAt) return '<span class="meta focus-send sent">In Focus</span>';
    return '<a class="text-btn focus-send' + (x.sentAt ? ' sent' : '') + '" href="' + esc(focusHref('idea', x.text, x.from ? { title: x.from, url: x.fromUrl } : null, x.date)) + '"' +
      (idx != null ? ' data-sent-idea="' + idx + '"' : '') + '>' + (x.sentAt ? 'Sent to Focus' : 'Send to Focus') + '</a>';
  }
  // Saving on a computer also sends it to Focus. Must run inside the click/submit, so Chrome allows it.
  function openFocus(href) {
    // A moment later, so the screen updates first. Chrome still counts it as part of the tap.
    setTimeout(function () {
      try { window.location.href = href; } catch (err) { /* Focus not installed: the save still counts */ }
    }, 60);
  }
  function storySummary(st) {
    return st.dek || (st.body ? String(st.body).split(/\n\s*\n/)[0] : '');
  }
  function sendStoryLink(st) {
    if (!onComputer || !st) return '';
    var summary = st.dek || (st.body ? String(st.body).split(/\n\s*\n/)[0] : '');
    return '<a class="text-btn focus-send" href="' + esc(focusHref('story', summary, st)) + '">Send story to Focus</a>';
  }

  function ideaForm(label) {
    return '<form class="idea-form" data-form="idea">' +
      '<label for="idea-text" class="label label--plain">' + esc(label || 'Save an idea') + '</label>' +
      '<textarea id="idea-text" rows="2" placeholder="Something this sparked, a thing to try, a note to self"></textarea>' +
      '<button type="submit" class="btn btn--outline">' + ICON.mark + 'Save idea</button>' +
      '<p class="idea-saved meta" hidden>' + ICON.check + ' Saved to your ideas</p>' +
      '</form>';
  }

  // A short taste of a story for the home list.
  function preview(st) {
    var t = st.dek || st.body || (st.views && st.views[0] && st.views[0].text) || st.why || '';
    t = String(t).split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
    return t.length > 170 ? t.slice(0, 169).replace(/\s+\S*$/, '') + '…' : t;
  }

  function progress(count, total, label) {
    var bars = '';
    for (var i = 0; i < total; i++) bars += '<span class="' + (i < count ? 'on' : '') + '"></span>';
    return '<div class="progress" role="img" aria-label="' + esc(label) + '" style="grid-template-columns: repeat(' + total + ', minmax(0, 1fr))">' + bars + '</div>';
  }

  // ---------- screens ----------
  function renderToday() {
    var s = edition.stories;
    var read = readSet();
    var lead = s[0];
    var rows = '';
    for (var i = 1; i < s.length; i++) {
      var isRead = read.indexOf(i) !== -1;
      var st = s[i];
      rows += '<a href="#/s/' + (i + 1) + '" class="story-row' + (isRead ? ' read' : '') + '">' +
        '<span class="row-between"><span class="label label--accent">' + esc(KIND[st.type] || st.type) + '</span>' +
          (isRead ? '<span class="check meta" aria-label="Read">' + ICON.check + '</span>' : '') + '</span>' +
        '<span class="row-title">' + esc(st.title) + '</span>' +
        (preview(st) ? '<span class="preview">' + esc(preview(st)) + '</span>' : '') +
        '<span class="meta">' + esc([st.source, st.minutes ? st.minutes + ' min' : ''].filter(Boolean).join(' · ')) + '</span>' +
        '</a>';
    }
    var allRead = read.length >= s.length;
    app.innerHTML =
      '<header class="masthead"><span class="wordmark">Sift</span>' +
        '<span class="masthead-right"><span class="meta" style="font-weight:500">' + esc(edition.dateLabel) + '</span>' +
        '<a class="saved-link" href="#/saved" aria-label="Saved stories and ideas">' + ICON.mark + (savedCount() ? '<span>' + savedCount() + '</span>' : '') + '</a></span></header>' +
      '<div class="edition-info">' +
        '<div class="row-between"><span class="label label--plain">Edition ' + esc(String(edition.edition).padStart(2, '0')) + '</span>' +
        '<span class="meta">' + s.length + ' stories · about ' + esc(edition.minutes || 6) + ' min</span></div>' +
        progress(read.length, s.length, read.length + ' of ' + s.length + ' stories read') +
      '</div>' +
      '<a class="lead" href="#/s/1">' +
        '<span class="label label--accent">Lead story · ' + esc(KIND[lead.type] || lead.type) + '</span>' +
        '<span class="headline">' + esc(lead.title) + '</span>' +
        (lead.dek ? '<span class="dek">' + esc(lead.dek) + '</span>' : '') +
        '<span class="row-between meta"><span>' + esc(lead.source || '') + (lead.minutes ? ' · ' + esc(lead.minutes) + ' min' : '') + '</span>' +
        '<span class="read">' + (read.indexOf(0) !== -1 ? 'Read again' : 'Read') + ICON.arrow + '</span></span>' +
      '</a>' +
      '<nav class="list" aria-label="In this edition"><span class="label label--plain">In this edition</span>' + rows + '</nav>' +
      (allRead
        ? '<a class="btn btn--accent" href="#/done">You\'re caught up' + ICON.check + '</a>'
        : '<p class="footnote">No feed. When these are done, you\'re done.</p>') +
      (navigator.onLine === false ? '<p class="footnote">You\'re offline. This is the last edition Sift saved.</p>' : '') +
      installCard();
  }

  function saveButton(st) {
    var on = isSaved(st);
    return '<button type="button" class="save-btn' + (on ? ' on' : '') + '" data-action="toggle-save" aria-pressed="' + on + '">' +
      (on ? ICON.marked + 'Saved' : ICON.mark + 'Save') + '</button>';
  }

  function topbar(i, total, st) {
    return '<div class="topbar"><a class="back" href="#/">' + ICON.back + 'Today</a>' +
      '<span class="topbar-right"><span class="meta">' + (i + 1) + ' of ' + total + '</span>' + saveButton(st) + '</span></div>';
  }

  function head(st) {
    return '<div class="story-head">' +
      '<span class="label label--accent">' + esc(KIND[st.type] || st.type) + (st.type === 'wildcard' ? ' · Outside tech' : '') + '</span>' +
      '<h1 class="headline">' + esc(st.title) + '</h1>' +
      (st.byline || st.source ? '<span class="meta">' + esc([st.byline, st.source && 'on ' + st.source].filter(Boolean).join(' · ')) + '</span>' : '') +
      '</div>';
  }

  function why(st) {
    return st.why ? '<div class="panel panel--tint"><span class="label label--plain">Why it made the cut</span><p>' + esc(st.why) + '</p></div>' : '';
  }

  function quote(q, label, cls) {
    if (!q || !q.text) return '';
    return '<figure class="panel ' + (cls || 'panel--tint') + '">' +
      '<span class="label label--plain">' + esc(label || 'What people said') + '</span>' +
      '<blockquote>' + paras('\u201C' + q.text + '\u201D') + '</blockquote>' +
      (q.author ? '<figcaption>' + esc(q.author) + '</figcaption>' : '') +
      '</figure>';
  }

  function signals(st) {
    if (!st.signals || !st.signals.length) return '';
    return '<div class="signals"><span class="label label--plain">Why it\'s here</span><span class="meta">' +
      st.signals.map(esc).join(' · ') + '</span></div>';
  }

  function statPair(stat) {
    if (!stat || !stat.before || !stat.after) return '';
    return '<div class="stat-pair">' +
      '<div class="stat"><span class="stat-value" style="color:var(--muted)">' + esc(stat.before.value) + '</span><span class="stat-label">' + esc(stat.before.label) + '</span></div>' +
      '<span aria-hidden="true">' + ICON.arrow + '</span>' +
      '<div class="stat"><span class="stat-value accent">' + esc(stat.after.value) + '</span><span class="stat-label">' + esc(stat.after.label) + '</span></div>' +
      '</div>';
  }

  function paras(text) {
    return String(text || '').split(/\n\s*\n/).filter(Boolean)
      .map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  function conversation(st) {
    var list = st.discussion || [];
    if (!list.length) return st.quote ? quote(st.quote) : '';
    return '<section class="section"><span class="label label--plain">What people said</span><ul class="comments">' +
      list.map(function (c) {
        return '<li>' + paras(c.text) + (c.author ? '<span class="meta">' + esc(c.author) + '</span>' : '') + '</li>';
      }).join('') + '</ul></section>';
  }

  function credit(st) {
    var src = safeUrl(st.url);
    var talk = safeUrl(st.discussionUrl);
    var bits = [];
    if (src) bits.push('<a href="' + src + '" target="_blank" rel="noopener noreferrer">' + (st.source ? esc(st.source) : 'Source') + '</a>');
    else if (st.source) bits.push(esc(st.source));
    if (talk && talk !== src) bits.push('<a href="' + talk + '" target="_blank" rel="noopener noreferrer">Join the discussion</a>');
    return bits.length ? '<p class="credit">From ' + bits.join(' · ') + '</p>' : '';
  }

  function bodyFor(st) {
    var html = st.body ? '<div class="body">' + paras(st.body) + '</div>' : '';
    if (st.type === 'build' || st.type === 'claude') {
      html += statPair(st.stat);
      if (st.made && st.made.length) {
        html += '<div class="section"><span class="label label--plain">How it was made</span><div class="chips">' +
          st.made.map(function (m) { return '<span class="chip">' + esc(m) + '</span>'; }).join('') + '</div></div>';
      }
      html += why(st) + conversation(st);
    } else if (st.type === 'debate' && st.views && st.views.length) {
      var labels = ['One view', 'Another view', 'Also worth reading'];
      var looks = ['panel--solid', 'panel--outline', 'panel--tint'];
      html += '<div class="stack">' + st.views.slice(0, 3).map(function (v, k) {
        return quote(v, labels[k], looks[k]);
      }).join('') + '</div>' + conversation(st);
    } else if (st.type === 'debate') {
      html += '<div class="stack">' +
        (st['for'] ? '<div class="panel panel--solid"><span class="label label--plain">The case for</span><p>' + esc(st['for']) + '</p></div>' : '') +
        (st.against ? '<div class="panel panel--outline"><span class="label label--plain">The worry</span><p>' + esc(st.against) + '</p></div>' : '') +
        (st.agree ? '<div class="panel panel--tint"><span class="label label--plain">Where people agree</span><p>' + esc(st.agree) + '</p></div>' : '') +
        '</div>';
    } else if (st.type === 'steal') {
      if (st.stats && st.stats.length) {
        html += '<div class="stat-grid">' + st.stats.slice(0, 2).map(function (x, k) {
          return '<div class="stat"><span class="stat-value' + (k === 0 ? ' accent' : '') + '">' + esc(x.value) + '</span><span class="stat-label">' + esc(x.label) + '</span></div>';
        }).join('') + '</div>';
      }
      if (st.code) html += '<div class="section"><span class="label label--plain">The pattern</span><pre class="code"><code>' + esc(st.code) + '</code></pre></div>';
      if (st.note) html += '<p class="meta" style="margin:0;line-height:1.45">' + esc(st.note) + '</p>';
      html += why(st) + conversation(st);
    } else {
      html += why(st) + conversation(st);
    }
    return html + signals(st);
  }

  function renderStory(i) {
    var s = edition.stories;
    if (i < 0 || i >= s.length) { location.hash = '#/'; return; }
    var st = s[i];
    markRead(i);
    var next = i + 1 < s.length
      ? '<a class="btn btn--solid" href="#/s/' + (i + 2) + '">Next' + ICON.arrow + '</a>'
      : '<a class="btn btn--accent" href="#/done">Finish edition' + ICON.check + '</a>';
    var prev = i > 0
      ? '<a class="btn btn--outline" href="#/s/' + i + '">' + ICON.back + 'Previous</a>'
      : '<a class="btn btn--outline" href="#/">All stories</a>';
    next = '<div class="pager">' + prev + next + '</div>';
    current = st; currentDate = edition.date;
    app.innerHTML = topbar(i, s.length, st) + head(st) + bodyFor(st) + ideaForm('An idea from this?') +
      '<div class="actions actions--stack">' + credit(st) + next + '</div>';
    window.scrollTo(0, 0);
  }

  // ---------- saved screen ----------
  function renderSaved() {
    current = null;
    var list = savedList();
    var all = ideas();
    var ideaItems = all.map(function (x, idx) {
      return '<li><p>' + esc(x.text) + '</p>' +
        '<span class="row-between meta"><span>' + (x.from ? 'From: ' + esc(x.from) : esc(x.date || '')) + '</span>' +
        '<span class="idea-tools">' + sendIdeaLink(x, idx) +
        '<button type="button" class="icon-btn" data-action="delete-idea" data-index="' + idx + '" aria-label="Delete idea">' + ICON.trash + '</button></span></span></li>';
    }).reverse().join('');
    var storyItems = list.map(function (x, idx) {
      return '<li><a href="#/saved/' + idx + '">' +
        '<span class="label label--accent">' + esc(KIND[x.story.type] || x.story.type) + '</span>' +
        '<span class="saved-title">' + esc(x.story.title) + '</span>' +
        '<span class="meta">' + esc(x.date || '') + (x.story.source ? ' · ' + esc(x.story.source) : '') + '</span></a></li>';
    }).reverse().join('');
    app.innerHTML =
      '<div class="topbar"><a class="back" href="#/">' + ICON.back + 'Today</a><span></span></div>' +
      '<h1 class="headline">Saved</h1>' +
      ideaForm('Jot down an idea') +
      '<section class="section"><div class="row-between"><span class="label label--plain">Ideas (' + all.length + ')</span>' +
        (all.length ? '<button type="button" class="text-btn" data-action="copy-ideas">Copy all</button>' : '') + '</div>' +
        (all.length ? '<ul class="comments saved-ideas">' + ideaItems + '</ul>' : '<p class="meta" style="margin:0">No ideas yet. Anything you jot down here or under a story lands in this list.</p>') +
      '</section>' +
      '<section class="section"><span class="label label--plain">Stories (' + list.length + ')</span>' +
        (list.length ? '<ul class="saved-stories">' + storyItems + '</ul>' : '<p class="meta" style="margin:0">Tap Save on any story to keep it here after the edition changes.</p>') +
      '</section>' +
      '<p class="footnote">Saved items live in this browser on this device.</p>';
    window.scrollTo(0, 0);
  }

  function renderSavedStory(k) {
    var x = savedList()[k];
    if (!x) { location.hash = '#/saved'; return; }
    var st = x.story;
    current = st; currentDate = x.date;
    app.innerHTML =
      '<div class="topbar"><a class="back" href="#/saved">' + ICON.back + 'Saved</a><span class="topbar-right">' + saveButton(st) + '</span></div>' +
      head(st) + bodyFor(st) + ideaForm('An idea from this?') +
      '<div class="actions actions--stack">' + credit(st) + '<a class="btn btn--outline" href="#/saved">Back to saved</a></div>';
    window.scrollTo(0, 0);
  }

  function renderDone() {
    var s = edition.stories;
    var read = readSet();
    var sparks = store('sift-sparks', []);
    var list = sparks.length
      ? '<div class="sparks"><div class="row-between"><span class="label label--plain">Your ideas</span><a class="meta" href="#/saved">See all</a></div><ul>' +
        sparks.slice(-5).reverse().map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join('') + '</ul></div>'
      : '';
    app.innerHTML =
      '<div class="done-head done">' +
        '<div class="done-check">' + ICON.bigCheck + '</div>' +
        '<h1 class="headline">You\'re caught up.</h1>' +
        '<p class="body" style="color:var(--muted)">' + read.length + ' of ' + s.length + ' stories. That\'s everything for today.</p>' +
        progress(read.length, s.length, read.length + ' of ' + s.length + ' stories read') +
      '</div>' +
      '<form class="make" id="make">' +
        '<span class="headline">What will you make with this?</span>' +
        '<label for="idea">One idea is enough</label>' +
        '<textarea id="idea" rows="3" placeholder="e.g. add a dark mode to my portfolio"></textarea>' +
        '<button type="submit" class="btn btn--save">Save idea</button>' +
      '</form>' +
      list +
      '<div class="done-foot"><span class="meta">Next edition tomorrow at 5:00</span><a href="#/">Back to today\'s edition</a></div>';

    document.getElementById('make').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = document.getElementById('idea').value.trim();
      if (!t) { document.getElementById('idea').focus(); return; }
      addIdea(t);
      renderDone();
      var form = document.getElementById('make');
      form.querySelector('button').outerHTML = '<div class="saved-note">' + ICON.check + 'Saved for later</div>';
    });
    window.scrollTo(0, 0);
  }

  function route() {
    if (!edition) return;
    var h = location.hash || '#/';
    var m = h.match(/^#\/s\/(\d+)$/);
    var sv = h.match(/^#\/saved\/(\d+)$/);
    if (m) renderStory(parseInt(m[1], 10) - 1);
    else if (sv) renderSavedStory(parseInt(sv[1], 10));
    else if (h === '#/saved') renderSaved();
    else if (h === '#/done') renderDone();
    else renderToday();
  }

  // ---------- install as an app (PWA) ----------
  var installPrompt = null;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    if (edition && (location.hash || '#/') === '#/') renderToday();
  });
  window.addEventListener('appinstalled', function () { installPrompt = null; if (edition && (location.hash || '#/') === '#/') renderToday(); });

  function installCard() {
    if (standalone || store('sift-install-dismissed', false)) return '';
    if (installPrompt) {
      return '<div class="install"><div><strong>Add Sift to your home screen</strong><span class="meta">Opens like an app, works offline.</span></div>' +
        '<div class="install-actions"><button type="button" class="btn btn--solid" data-action="install">Install</button>' +
        '<button type="button" class="text-btn" data-action="dismiss-install">Not now</button></div></div>';
    }
    if (isIOS) {
      return '<div class="install"><div><strong>Add Sift to your home screen</strong><span class="meta">In Safari, tap Share, then \u201CAdd to Home Screen\u201D.</span></div>' +
        '<div class="install-actions"><button type="button" class="text-btn" data-action="dismiss-install">Got it</button></div></div>';
    }
    return '';
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* fine: site still works */ });
    });
  }

  // Swipe left or right on a story to move between stories.
  var touch = null;
  app.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || e.target.closest('textarea, pre, .chips')) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  app.addEventListener('touchend', function (e) {
    if (!touch) return;
    var m = (location.hash || '').match(/^#\/s\/(\d+)$/);
    var dx = e.changedTouches[0].clientX - touch.x;
    var dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (!m || Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    var n = parseInt(m[1], 10) + (dx < 0 ? 1 : -1);
    if (n < 1) location.hash = '#/';
    else if (n > edition.stories.length) location.hash = '#/done';
    else location.hash = '#/s/' + n;
  }, { passive: true });

  // One listener for every button and form, so screens can re-render freely.
  app.addEventListener('click', function (e) {
    var sent = e.target.closest('[data-sent-idea]');
    if (sent) {
      var list = ideas(); var k = parseInt(sent.getAttribute('data-sent-idea'), 10);
      if (list[k]) { list[k].sentAt = Date.now(); save('sift-sparks', list); }
      setTimeout(function () { sent.textContent = 'Sent to Focus'; sent.classList.add('sent'); }, 0);
      return;
    }
    var b = e.target.closest('[data-action]');
    if (!b) return;
    var a = b.getAttribute('data-action');
    if (a === 'toggle-save' && current) {
      var on = toggleSave(current);
      b.outerHTML = saveButton(current);
      if (on && onComputer) openFocus(focusHref('story', storySummary(current), current, currentDate));
      if (!on && /^#\/saved\//.test(location.hash)) location.hash = '#/saved';
    } else if (a === 'install' && installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then(function () { installPrompt = null; renderToday(); });
    } else if (a === 'dismiss-install') {
      save('sift-install-dismissed', true);
      renderToday();
    } else if (a === 'delete-idea') {
      var all = ideas();
      all.splice(parseInt(b.getAttribute('data-index'), 10), 1);
      save('sift-sparks', all);
      renderSaved();
    } else if (a === 'copy-ideas') {
      var text = ideas().map(function (x) { return '- ' + x.text + (x.from ? ' (from: ' + x.from + ')' : ''); }).join('\n');
      try {
        navigator.clipboard.writeText(text).then(function () { b.textContent = 'Copied'; }, function () { b.textContent = 'Copy failed'; });
      } catch (err) { b.textContent = 'Copy failed'; }
    }
  });
  app.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.getAttribute('data-form') !== 'idea') return;
    e.preventDefault();
    var box = f.querySelector('textarea');
    var t = box.value.trim();
    if (!t) { box.focus(); return; }
    addIdea(t, current);
    box.value = '';
    if (onComputer) {
      var mine = ideas(); mine[mine.length - 1].sentAt = Date.now(); save('sift-sparks', mine);
      openFocus(focusHref('idea', t, current, currentDate));
    }
    if (location.hash === '#/saved') { renderSaved(); return; }
    var note = f.querySelector('.idea-saved');
    if (note) {
      note.innerHTML = ICON.check + (onComputer ? ' Saved and sent to Focus' : ' Saved to your ideas');
      note.hidden = false;
      clearTimeout(note._t);
      note._t = setTimeout(function () { note.hidden = true; }, 2500);
    }
  });

  fetch('editions/latest.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data || !data.stories || !data.stories.length) throw new Error('empty');
      edition = data;
      window.addEventListener('hashchange', route);
      route();
    })
    .catch(function () {
      app.innerHTML = '<p class="error">Today\'s edition isn\'t ready yet. Check back soon.</p>';
    });
})();
