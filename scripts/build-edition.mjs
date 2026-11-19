// Sift: builds today's edition. No AI, no API keys, free to run.
//
// 1. Gathers fresh posts from Hacker News, Reddit, GitHub, Bluesky and design blogs.
// 2. Ranks them with simple, editable rules (see TASTE below).
// 3. Picks 3 builds, 1 debate, 1 "steal this", 1 news item and 1 wildcard.
// 4. Adds real words from real people: the author's own description and top comments.
// 5. Writes editions/latest.json and editions/YYYY-MM-DD.json.
//
// Run:  node scripts/build-edition.mjs
// Optional env: GITHUB_TOKEN, BSKY_HANDLE + BSKY_APP_PASSWORD, SIFT_TZ, DRY_RUN=1, MOCK=path/to/candidates.json

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITIONS = path.join(ROOT, 'editions');
const TZ = process.env.SIFT_TZ || 'Africa/Addis_Ababa';
const MOCK = process.env.MOCK;
const UA = 'SiftDigest/1.0 (personal daily reader)';
const NOW = Date.now();
const HOURS = (h) => h * 3600 * 1000;

// =====================================================================
// TASTE: edit these to tune what Sift picks.
// =====================================================================
const SUBREDDITS = ['ClaudeAI', 'UXDesign', 'userexperience', 'web_design', 'SideProject', 'FigmaDesign'];
const RSS_FEEDS = [
  // [name, url, role]  role: steal | news | wildcard | any
  ['Smashing Magazine', 'https://www.smashingmagazine.com/feed/', 'steal'],
  ['CSS-Tricks', 'https://css-tricks.com/feed/', 'steal'],
  ['Nielsen Norman Group', 'https://www.nngroup.com/feed/rss/', 'steal'],
  ['UX Collective', 'https://uxdesign.cc/feed', 'steal'],
  ['Simon Willison', 'https://simonwillison.net/atom/everything/', 'steal'],
  ['Sidebar', 'https://sidebar.io/feed.xml', 'any'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml', 'news'],
  ['Colossal', 'https://www.thisiscolossal.com/feed/', 'wildcard'],
  ['Atlas Obscura', 'https://www.atlasobscura.com/feeds/latest', 'wildcard']
];
const BSKY_QUERIES = ['built with claude', 'claude code', 'ux design', 'figma'];

const BOOST_CLAUDE = /\bclaude\b|anthropic|\bmcp\b/i;
const BOOST_DESIGN = /\b(design|designer|ux|ui|figma|typograph|font|color|colour|interface|prototype|accessib|animation|css|layout|icon)/i;
const BUILD_WORDS = /\b(i built|i made|we built|i created|made a|built a|built an|my side project|introducing|launch(ed|ing)? my)\b/i;
const STEAL_WORDS = /\b(how to|how i|how we|guide|tips?|pattern|technique|lessons?|learned|prompt|tutorial|checklist|trick|ways to|why you should|best practice|cheat ?sheet|explained)\b/i;
const NEWS_WORDS = /\b(launch|launches|announce|announces|released?|releases|introduc|now (available|supports|lets)|update|rolls out|open[- ]sources?|acquir)/i;
const NEWS_TOPICS = /\b(figma|apple|google|adobe|framer|canva|anthropic|claude|openai|browser|safari|chrome|firefox|css|design|github|android|ios|ai)\b/i;
const WILD_WORDS = /\b(science|space|nasa|planet|art|artist|history|historic|ancient|archaeolog|nature|animal|bird|ocean|music|museum|photo|photograph|physics|biology|map|architecture|sculpture|painting|cooking|food|bridge|forest|volcano|telescope|microscope)/i;
const NOT_WILD = /\b(ai|llm|gpt|claude|startup|saas|api|javascript|python|rust)\b/i;
const DEBATE_HINTS = /\b(disagree|but|however|not sure|on the other hand|i think|actually|wrong|problem|counter|instead|unless|depends)\b/gi;
// Skip outrage, drama and hype.
const BLOCK = /\b(trump|biden|election|democrat|republican|senate|congress|israel|gaza|ukraine|russia|war\b|killed|murder|shooting|layoffs?|fired|lawsuit|sues|crypto|bitcoin|ethereum|nft|memecoin|porn|nsfw|scam)\b/i;

const TECH = [
  'Claude Code', 'Claude', 'MCP', 'ChatGPT', 'GPT', 'Gemini', 'Llama', 'Ollama', 'Figma', 'Framer', 'Blender',
  'React', 'Next.js', 'Svelte', 'Vue', 'Astro', 'Tailwind', 'Three.js', 'WebGL', 'WebGPU',
  'TypeScript', 'JavaScript', 'Python', 'Rust', 'Swift', 'SwiftUI', 'Kotlin', 'Flutter',
  'SQLite', 'Postgres', 'Supabase', 'Firebase', 'Cloudflare', 'Raspberry Pi', 'Arduino', 'ESP32'
];

// =====================================================================
// helpers
// =====================================================================
async function get(url, { json = true, headers = {}, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`${res.status}`);
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(t);
  }
}

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/&#8230;|&hellip;/g, '…')
    .replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, ', ')
    .replace(/&#x2F;/g, '/').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function clean(html, max = 400) {
  const text = decode(String(html || '').replace(/<p>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+—\s+/g, ', ')
    .trim();
  return cut(text, max);
}

function cut(text, max) {
  if (!text || text.length <= max) return text || '';
  const s = text.slice(0, max - 1);
  const end = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '));
  if (end > max * 0.6) return s.slice(0, end + 1);
  return s.slice(0, s.lastIndexOf(' ')) + '…';
}

function shortTitle(t, max = 48) {
  if (t.length <= max) return t;
  const s = t.slice(0, max - 1);
  return s.slice(0, s.lastIndexOf(' ')).replace(/[,:;\-]$/, '') + '…';
}

function tidyTitle(t) {
  return decode(t)
    .replace(/^(show|launch|ask|tell) hn:\s*/i, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s+[-|]\s+(reddit|youtube)$/i, '')
    .replace(/\s+—\s+/g, ': ')
    .trim();
}

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'].forEach((k) => x.searchParams.delete(k));
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
  } catch {
    return String(u || '').toLowerCase();
  }
}

function blob(c) {
  return `${c.title} ${c.text || ''}`;
}

async function safe(name, fn) {
  try {
    const items = await fn();
    console.log(`  ${name}: ${items.length}`);
    return items;
  } catch (e) {
    console.log(`  ${name}: skipped (${e.message})`);
    return [];
  }
}

// =====================================================================
// gatherers
// =====================================================================
async function hackerNews() {
  const since = Math.floor((NOW - HOURS(36)) / 1000);
  const base = 'https://hn.algolia.com/api/v1/search_by_date?hitsPerPage=50&numericFilters=';
  const lists = await Promise.all([
    get(`${base}created_at_i>${since},points>80&tags=story`),
    get(`${base}created_at_i>${since},points>20&tags=show_hn`),
    get(`${base}created_at_i>${since},points>15&tags=story&query=claude`)
  ]);
  const seen = new Set();
  return lists.flatMap((l) => l.hits)
    .filter((h) => !seen.has(h.objectID) && seen.add(h.objectID))
    .map((h) => ({
      kind: 'hn',
      id: h.objectID,
      source: 'Hacker News',
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      score: h.points || 0,
      comments: h.num_comments || 0,
      text: clean(h.story_text, 600),
      isShow: (h._tags || []).includes('show_hn')
    }));
}

async function reddit() {
  const out = [];
  for (const sub of SUBREDDITS) {
    try {
      const data = await get(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=12`);
      for (const { data: p } of data.data.children) {
        if (p.stickied || p.over_18) continue;
        out.push({
          kind: 'reddit',
          id: p.id,
          source: `r/${sub}`,
          title: p.title,
          url: p.is_self ? `https://www.reddit.com${p.permalink}` : p.url,
          discussion: `https://www.reddit.com${p.permalink}`,
          author: p.author,
          score: p.score || 0,
          comments: p.num_comments || 0,
          text: clean(p.selftext, 600),
          flair: p.link_flair_text || ''
        });
      }
    } catch (e) {
      console.log(`    r/${sub} skipped (${e.message})`);
    }
  }
  return out;
}

async function github() {
  const since = new Date(NOW - HOURS(24 * 7)).toISOString().slice(0, 10);
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const queries = [`claude created:>${since}`, `figma created:>${since}`, `design created:>${since}`];
  const out = [];
  for (const q of queries) {
    const data = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`, { headers });
    for (const r of data.items || []) {
      if (r.stargazers_count < 25 || !r.description) continue;
      out.push({
        kind: 'github',
        id: r.full_name,
        source: 'GitHub',
        title: r.name.replace(/[-_]/g, ' '),
        repo: r.full_name,
        url: r.html_url,
        author: r.owner && r.owner.login,
        score: r.stargazers_count,
        text: clean(r.description, 300),
        language: r.language || undefined,
        isBuild: true
      });
    }
  }
  return out;
}

async function bluesky() {
  let headers = {};
  let host = 'https://public.api.bsky.app';
  if (process.env.BSKY_HANDLE && process.env.BSKY_APP_PASSWORD) {
    const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD })
    });
    if (!res.ok) throw new Error(`login ${res.status}`);
    headers = { Authorization: `Bearer ${(await res.json()).accessJwt}` };
    host = 'https://bsky.social';
  }
  const since = new Date(NOW - HOURS(36)).toISOString();
  const out = [];
  for (const q of BSKY_QUERIES) {
    const data = await get(`${host}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=top&limit=20&since=${since}`, { headers });
    for (const p of data.posts || []) {
      const likes = p.likeCount || 0;
      const text = clean(p.record && p.record.text, 500);
      if (likes < 30 || text.length < 60) continue;
      out.push({
        kind: 'bsky',
        id: p.uri,
        source: 'Bluesky',
        title: cut(text.split(/(?<=[.!?])\s/)[0], 90),
        url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,
        author: p.author.displayName || p.author.handle,
        score: likes,
        comments: p.replyCount || 0,
        text,
        isPost: true
      });
    }
  }
  return out;
}

function parseFeed(name, role, xml) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/g) || xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  const pick = (b, tag) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    return m ? m[1] : '';
  };
  return blocks.map((b, i) => {
    let link = clean(pick(b, 'link'), 500);
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/);
      link = m ? m[1] : '';
    }
    const date = Date.parse(clean(pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || pick(b, 'dc:date'), 60));
    return {
      kind: 'feed',
      id: link,
      source: name,
      role,
      title: clean(pick(b, 'title'), 200),
      url: link,
      author: clean(pick(b, 'dc:creator') || pick(b, 'name'), 60) || undefined,
      date,
      score: 10 - i,
      text: clean(pick(b, 'description') || pick(b, 'summary') || pick(b, 'content'), 600)
    };
  }).filter((x) => x.title && /^https?:/.test(x.url) && (!x.date || NOW - x.date < HOURS(60))).slice(0, 6);
}

async function feeds() {
  const all = await Promise.all(RSS_FEEDS.map(async ([name, url, role]) => {
    try {
      return parseFeed(name, role, await get(url, { json: false }));
    } catch (e) {
      console.log(`    ${name} skipped (${e.message})`);
      return [];
    }
  }));
  return all.flat();
}

// =====================================================================
// enrichment: real words from real people
// =====================================================================
async function commentsFor(c, n = 8) {
  if (MOCK) return c.topComments || [];
  try {
    if (c.kind === 'hn') {
      const item = await get(`https://hn.algolia.com/api/v1/items/${c.id}`);
      return (item.children || []).filter((x) => x.text && x.author)
        .slice(0, n).map((x) => ({ text: clean(x.text, 600), author: x.author }));
    }
    if (c.kind === 'reddit') {
      const data = await get(`https://www.reddit.com/comments/${c.id}.json?sort=top&limit=${n}`);
      return (data[1].data.children || []).map((x) => x.data)
        .filter((x) => x.body && x.author && x.author !== 'AutoModerator' && !x.stickied)
        .slice(0, n).map((x) => ({ text: clean(x.body, 600), author: x.author }));
    }
  } catch { /* fine */ }
  return [];
}

async function pageDescription(url) {
  if (MOCK || !url || /news\.ycombinator|reddit\.com|bsky\.app/.test(url)) return '';
  try {
    const html = (await get(url, { json: false, timeout: 10000 })).slice(0, 300000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:description|description)["']/i);
    return m ? clean(m[1], 300) : '';
  } catch {
    return '';
  }
}

function goodQuote(comments, avoid = []) {
  const used = new Set(avoid);
  const c = comments.find((x) => !used.has(x.text) && x.text.length >= 50 && x.text.length <= 600 && !/^(this|nice|cool|great|wow)[.!]*$/i.test(x.text));
  return c ? { text: cut(c.text, 240), author: c.author } : null;
}

function madeWith(c) {
  const t = blob(c);
  let found = TECH.filter((k) => new RegExp(`(^|[^A-Za-z])${k.replace(/[.+]/g, '\\$&')}([^A-Za-z]|$)`, 'i').test(t));
  if (found.includes('Claude Code')) found = found.filter((k) => k !== 'Claude');
  if (found.includes('SwiftUI')) found = found.filter((k) => k !== 'Swift');
  if (c.language && !found.includes(c.language)) found.push(c.language);
  return found.slice(0, 4);
}

function signals(c) {
  const s = [];
  if (c.kind === 'hn') { if (c.isShow) s.push('Show HN'); s.push(`${c.score} points`, `${c.comments} comments`); }
  else if (c.kind === 'reddit') s.push(`${c.score} upvotes`, `${c.comments} comments`);
  else if (c.kind === 'github') s.push(`${c.score} stars this week`);
  else if (c.kind === 'bsky') s.push(`${c.score} likes`);
  else s.push(`New from ${c.source}`);
  if (BOOST_CLAUDE.test(blob(c))) s.push('Mentions Claude');
  return s;
}

// =====================================================================
// ranking and picking
// =====================================================================
function percentiles(pool) {
  const bySource = {};
  pool.forEach((c) => (bySource[c.source] = bySource[c.source] || []).push(c));
  for (const list of Object.values(bySource)) {
    list.sort((a, b) => a.score + (a.comments || 0) * 0.5 - (b.score + (b.comments || 0) * 0.5));
    list.forEach((c, i) => (c.pct = list.length > 1 ? i / (list.length - 1) : 0.5));
  }
  // Blog posts have no votes, so they start in the middle instead of on top.
  pool.forEach((c) => { if (c.kind === 'feed') c.pct = 0.4; });
}

function base(c) {
  let v = c.pct || 0;
  if (BOOST_CLAUDE.test(blob(c))) v += 0.35;
  if (BOOST_DESIGN.test(blob(c))) v += 0.2;
  if ((c.text || '').length > 80) v += 0.1;
  return v;
}

function isBuild(c) {
  return c.isShow || c.isBuild || BUILD_WORDS.test(blob(c)) || /showcase|project|i made/i.test(c.flair || '') || c.source === 'r/SideProject';
}

function pickBest(pool, used, test, scoreFn = base, perSource = 9) {
  const counts = {};
  [...used].forEach((c) => (counts[c.source] = (counts[c.source] || 0) + 1));
  return pool
    .filter((c) => !used.has(c) && test(c) && (counts[c.source] || 0) < perSource)
    .sort((a, b) => scoreFn(b) - scoreFn(a))[0];
}

function words(t) {
  return new Set(t.toLowerCase().match(/[a-z]{4,}/g) || []);
}

function debateViews(comments) {
  const pool = comments.filter((x) => x.text.length >= 60);
  if (pool.length < 3) return null;
  const first = pool[0];
  const fw = words(first.text);
  const second = pool.slice(1).map((x) => {
    const w = words(x.text);
    const overlap = [...w].filter((k) => fw.has(k)).length / Math.max(1, w.size);
    const hints = (x.text.match(DEBATE_HINTS) || []).length;
    return { x, v: hints - overlap * 4 };
  }).sort((a, b) => b.v - a.v)[0].x;
  const third = pool.find((x) => x !== first && x !== second);
  return [first, second, third].map((x) => ({ text: cut(x.text, 220), author: x.author }));
}

// =====================================================================
// memory of recent editions (no repeats)
// =====================================================================
async function recentUrls() {
  const urls = new Set();
  try {
    const files = (await readdir(EDITIONS)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-7);
    for (const f of files) {
      const e = JSON.parse(await readFile(path.join(EDITIONS, f), 'utf8'));
      e.stories.forEach((s) => s.url && urls.add(normUrl(s.url)));
    }
  } catch { /* first run */ }
  return urls;
}

async function lastEdition() {
  try {
    const e = JSON.parse(await readFile(path.join(EDITIONS, 'latest.json'), 'utf8'));
    return { n: e.edition || 0, date: e.date };
  } catch {
    return { n: 0, date: null };
  }
}

// =====================================================================
// cards
// =====================================================================
function minutesFor(story) {
  const n = JSON.stringify(story).split(/\s+/).length;
  return Math.max(1, Math.round(n / 180));
}

async function buildCard(c, lead) {
  const [desc, comments] = await Promise.all([pageDescription(c.url), commentsFor(c)]);
  const body = c.text || desc;
  const story = {
    type: 'build',
    title: tidyTitle(c.title),
    byline: c.author || undefined,
    body: cut(body, 320) || undefined,
    made: madeWith({ ...c, text: `${c.text || ''} ${desc}` }),
    quote: goodQuote(comments) || undefined,
    signals: signals(c)
  };
  if (c.kind === 'github') story.title = `${c.repo.split('/')[1]}: ${c.text}`.replace(/\.$/, '');
  if (lead) story.dek = cut(desc || c.text || '', 110) || undefined;
  return story;
}

async function debateCard(c) {
  const comments = await commentsFor(c, 12);
  const views = debateViews(comments);
  if (!views) return null;
  const desc = c.text || (await pageDescription(c.url));
  return {
    type: 'debate',
    title: tidyTitle(c.title),
    body: cut(desc, 280) || undefined,
    views,
    signals: signals(c),
    url: c.discussion
  };
}

async function simpleCard(type, c) {
  const desc = c.text || (await pageDescription(c.url));
  const comments = c.kind === 'hn' || c.kind === 'reddit' ? await commentsFor(c) : [];
  return {
    type,
    title: tidyTitle(c.title),
    byline: c.author || undefined,
    body: cut(desc, 320) || undefined,
    quote: goodQuote(comments) || undefined,
    signals: signals(c)
  };
}

// =====================================================================
// main
// =====================================================================
async function main() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(NOW);
  const dateLabel = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).format(NOW);
  console.log(`Building Sift for ${today}`);

  let all;
  if (MOCK) {
    all = JSON.parse(await readFile(MOCK, 'utf8'));
    console.log(`Using mock data: ${all.length}`);
  } else {
    console.log('Gathering:');
    all = (await Promise.all([
      safe('Hacker News', hackerNews),
      safe('Reddit', reddit),
      safe('GitHub', github),
      safe('Bluesky', bluesky),
      safe('Blogs and feeds', feeds)
    ])).flat();
  }

  const recent = await recentUrls();
  const seen = new Set();
  const pool = all.filter((c) => {
    const k = normUrl(c.url);
    if (!c.title || BLOCK.test(blob(c)) || seen.has(k) || recent.has(k)) return false;
    seen.add(k);
    return true;
  });
  percentiles(pool);
  console.log(`Candidates after filtering: ${pool.length}`);
  if (pool.length < 12) throw new Error('Too few candidates today; keeping the previous edition.');

  if (process.env.DRY_RUN) {
    await writeFile(path.join(ROOT, 'candidates.json'), JSON.stringify(pool, null, 2));
    console.log('DRY_RUN: wrote candidates.json');
    return;
  }

  const used = new Set();
  const take = (c) => { if (c) used.add(c); return c; };
  const picks = [];

  // 1-3. Builds (no more than 2 from one source)
  for (let i = 0; i < 3; i++) {
    const c = take(pickBest(pool, used, isBuild, base, 2));
    if (c) picks.push(['build', c]);
  }

  // The lead should be the richest story: prefer one with the maker's own words and a discussion.
  const richness = (c) => base(c) + (c.kind === 'github' ? -0.3 : 0) + ((c.text || '').length > 60 ? 0.15 : 0) + (c.comments > 20 ? 0.15 : 0);
  picks.sort((a, b) => richness(b[1]) - richness(a[1]));

  // 4. Debate: lots of comments relative to points, so people disagree
  const debatable = pool
    .filter((c) => !used.has(c) && (c.kind === 'hn' || c.kind === 'reddit') && c.comments >= 60)
    .sort((a, b) => (b.comments * Math.min(2, b.comments / Math.max(1, b.score))) - (a.comments * Math.min(2, a.comments / Math.max(1, a.score))))
    .slice(0, 4);
  let debate = null;
  for (const c of debatable) {
    debate = await debateCard(c);
    if (debate) { used.add(c); debate.source = c.source; break; }
  }

  // 5. Steal this
  const steal = take(pickBest(pool, used, (c) => c.role === 'steal' || STEAL_WORDS.test(c.title),
    (c) => base(c) + (STEAL_WORDS.test(c.title) ? 0.4 : 0) + (c.role === 'steal' ? 0.2 : 0)));

  // 6. Worth knowing
  const news = take(pickBest(pool, used, (c) => !isBuild(c) && (c.role === 'news' || (NEWS_WORDS.test(c.title) && NEWS_TOPICS.test(c.title)))));

  // 7. Wildcard
  const wild = take(pickBest(pool, used, (c) => c.role === 'wildcard' || (WILD_WORDS.test(c.title) && !NOT_WILD.test(c.title))));

  const stories = [];
  for (let i = 0; i < picks.length; i++) {
    const s = await buildCard(picks[i][1], i === 0);
    s.source = picks[i][1].source; s.url = picks[i][1].url;
    stories.push(s);
  }
  if (debate) stories.push(debate);
  for (const [type, c] of [['steal', steal], ['news', news], ['wildcard', wild]]) {
    if (!c) continue;
    const s = await simpleCard(type, c);
    s.source = c.source; s.url = c.url;
    stories.push(s);
  }

  // Short list titles, reading time, tidy empties
  for (const s of stories) {
    s.short = shortTitle(s.title);
    s.minutes = minutesFor(s);
    Object.keys(s).forEach((k) => (s[k] === undefined || s[k] === '' || (Array.isArray(s[k]) && !s[k].length)) && delete s[k]);
  }
  if (stories.length < 5) throw new Error(`Only ${stories.length} stories today; keeping the previous edition.`);

  const last = await lastEdition();
  const edition = {
    edition: last.date === today ? last.n : last.n + 1,
    date: today,
    dateLabel,
    minutes: Math.max(4, stories.reduce((t, s) => t + s.minutes, 0)),
    generatedAt: new Date(NOW).toISOString(),
    stories
  };

  await mkdir(EDITIONS, { recursive: true });
  const out = JSON.stringify(edition, null, 2) + '\n';
  await writeFile(path.join(EDITIONS, `${today}.json`), out);
  await writeFile(path.join(EDITIONS, 'latest.json'), out);
  console.log(`Wrote edition ${edition.edition}:`);
  stories.forEach((s) => console.log(`  ${s.type.padEnd(8)} ${s.title} (${s.source})`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
