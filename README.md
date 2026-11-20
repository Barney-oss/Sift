# Sift

A short daily edition of what people are building and thinking in tech and design, with a focus on AI design tools and things people ship with Claude. Usually 6 to 12 cards, then it ends.

Free to run: no AI, no API keys, no server bills.

## How it works

1. Every morning at 4:47 (Addis Ababa time), with backup runs at 5:23 and 6:53 in case GitHub skips one, a GitHub Action runs `scripts/build-edition.mjs`.
2. The script gathers fresh posts from Hacker News, Reddit, GitHub, Bluesky and a handful of design blogs.
3. Simple rules rank them and pick up to 12 cards: things built with Claude, builds, debates, "steal this", news and one wildcard. Quiet days are shorter, busy days longer (see `SLOTS` in the script).
4. Each card uses real words from real people: the maker's own description, the top comment, and for debates, three comments that disagree.
5. The edition is saved to `editions/latest.json` (plus a dated copy) and committed.
6. GitHub Pages serves the site, which reads `editions/latest.json`.

## Setup (one time)

1. **Push this folder** to your GitHub repo.
2. **Turn on Pages:** Settings → Pages → Source: *Deploy from a branch* → `main` / root.
3. **Allow the bot to commit:** Settings → Actions → General → Workflow permissions → *Read and write permissions*.
4. **Make the first edition:** Actions tab → *Daily edition* → *Run workflow*.

Optional: add `BSKY_HANDLE` and `BSKY_APP_PASSWORD` secrets (an app password from Bluesky settings) to include Bluesky posts.

## Tune the taste

Everything Sift likes and dislikes lives in the **TASTE** section at the top of `scripts/build-edition.mjs`:

- `SUBREDDITS`, `RSS_FEEDS`, `BSKY_QUERIES`: where it looks.
- `TOPIC`: your main topic (AI design tools). Matching stories get picked first.
- `CLAUDE_BUILD`: how "Built with Claude" stories are spotted.
- `BOOST_CLAUDE`, `BOOST_DESIGN`: topics that get a head start.
- `SLOTS`, `MAX_CARDS`: how many of each card, and how good extra ones must be.
- `BUILD_WORDS`, `STEAL_WORDS`, `NEWS_WORDS`, `WILD_WORDS`: how each card type is spotted.
- `BLOCK`: words that get a post thrown out (politics, drama, crypto hype).

Other settings:
- **Time:** change the `cron` line in `.github/workflows/daily-edition.yml` (it's in UTC).
- **Look:** colors and type live at the top of `styles.css`. Dark mode follows your phone.

## Run it locally

```bash
DRY_RUN=1 node scripts/build-edition.mjs   # just gather and rank, writes candidates.json
node scripts/build-edition.mjs             # build a real edition
npx serve .                                # then open http://localhost:3000
```

## Install it as an app

Sift is a PWA. On Android (Chrome), tap **Install** on the home screen card or use the menu → *Install app*. On iPhone (Safari), tap Share → *Add to Home Screen*. Once installed it opens full screen, has its own icon, and the last edition stays readable offline.

`sw.js` is the service worker: app files load instantly from cache and refresh in the background, editions are always fetched fresh when online. Bump `VERSION` in `sw.js` if you ever need every phone to drop its old cache.

Read state, saved stories and ideas stay in your browser only.

## Later: add an AI editor

If you ever want polished headlines and "why it made the cut" lines, an AI step can be added after the picking step. The site already shows a `why` field when one exists.
