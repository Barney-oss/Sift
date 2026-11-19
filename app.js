(function () {
  'use strict';

  var app = document.getElementById('app');
  var edition = null;

  var KIND = {
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
    out: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  // ---------- read state ----------
  function readKey() { return 'sift-read-' + edition.date; }
  function readSet() { return store(readKey(), []); }
  function markRead(i) {
    var r = readSet();
    if (r.indexOf(i) === -1) { r.push(i); save(readKey(), r); }
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
      rows += '<a href="#/s/' + (i + 1) + '" class="' + (isRead ? 'read' : '') + '">' +
        '<span class="label label--accent kind">' + esc(KIND[s[i].type] || s[i].type) + '</span>' +
        '<span class="title">' + esc(s[i].short || s[i].title) + '</span>' +
        (isRead ? '<span class="check" aria-label="Read">' + ICON.check + '</span>' : '') +
        '</a>';
    }
    var allRead = read.length >= s.length;
    app.innerHTML =
      '<header class="masthead"><span class="wordmark">Sift</span><span class="meta" style="font-weight:500">' + esc(edition.dateLabel) + '</span></header>' +
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
        : '<p class="footnote">No feed. When these are done, you\'re done.</p>');
  }

  function topbar(i, total) {
    return '<div class="topbar"><a class="back" href="#/">' + ICON.back + 'Today</a>' +
      '<span class="meta">' + (i + 1) + ' of ' + total + '</span></div>';
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
    if (st.type === 'build') {
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
    app.innerHTML = topbar(i, s.length) + head(st) + bodyFor(st) + '<div class="actions actions--stack">' + credit(st) + next + '</div>';
    window.scrollTo(0, 0);
  }

  function renderDone() {
    var s = edition.stories;
    var read = readSet();
    var sparks = store('sift-sparks', []);
    var list = sparks.length
      ? '<div class="sparks"><span class="label label--plain">Your sparks</span><ul>' +
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
        '<button type="submit" class="btn btn--save">Save to Sparks</button>' +
      '</form>' +
      list +
      '<div class="done-foot"><span class="meta">Next edition tomorrow at 7:00</span><a href="#/">Back to today\'s edition</a></div>';

    document.getElementById('make').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = document.getElementById('idea').value.trim();
      if (!t) { document.getElementById('idea').focus(); return; }
      var all = store('sift-sparks', []);
      all.push({ text: t, date: edition.date });
      save('sift-sparks', all);
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
    if (m) renderStory(parseInt(m[1], 10) - 1);
    else if (h === '#/done') renderDone();
    else renderToday();
  }

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
