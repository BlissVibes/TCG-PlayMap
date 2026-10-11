# Roadmap — where TCG PlayMap is going

Written 2026-09-30, the day the repo started. Mark's brief, condensed:

> A map and a calendar of where and when each TCG can be played locally,
> starting with Los Angeles. Mostly hand-fed data at first, a web search to
> populate other cities later, then logged-in users submitting shops and
> schedule changes for review. GitHub Pages for now, Vercel later. Users build
> their own calendar from the blocks and, once accounts exist, keep it.

The phases below are ordered so that each one ships something visible and
none of them requires rewriting the one before. The seams that make that true
are called out, because they are the only parts of phase 1 that were built
with phase 4 in mind.

## Phase 1 — static site, hand-fed data (NOW)

- Next.js static export (`output: "export"`) deployed to GitHub Pages by
  `.github/workflows/pages.yml`. No server, no secrets, nothing to pay for.
- Data is three committed JSON files under `data/`, read through
  `lib/data.ts`'s `DataSource` interface. **Seam #1**: the UI only ever calls
  `getDataSource().load()`.
- Map (Leaflet, vendored; OSM tiles), week/month calendar, filters (ZIP +
  radius 5–250 mi, game, casual/tournament), "My calendar" picks, calendar
  log, site changelog. Preferences in localStorage through `lib/prefs.ts`.
  **Seam #2**: `Prefs` is a serialisable object with stable keys; it is the
  document that gets saved to an account later.
- Adding data is a JSON edit + a calendar-log line (see
  `docs/ADDING_DATA.md`). Since 2026-10-10 a data change does not bump the
  site version.

Done when: Mark can look at it, and the four seed shops read correctly.

## Phase 2 — data served as static JSON (done 2026-10-10, v0.1.6.3)

- The three data files are no longer compiled into the page. The build copies
  `data/{shops,events,calendar_log}.json` to `/data/*.json`
  (`scripts/copy_data.mjs`) and the page fetches them at runtime through the
  same `DataSource` seam. They stay in `data/` in the repo; that is still
  where people and importers edit them.
- `validateData` runs on every load, because Collectify's FEED_FAILURES table
  is entirely "the read succeeded and returned something wrong".
- A load that fails, comes back empty or fails validation is an ERROR the
  visitor sees, with a retry. A blank map is never presented as the truth.
- Each build stamps the data with a content hash (`?v=`), so a new page is
  never paired with an older cached copy.
- No database. Mark, 2026-10-10: Firebase is off the roadmap. The site stays a
  static page with nothing to run and nothing to pay for until submissions
  (phase 5) need somewhere to land.

## Phase 3 — move to Vercel, add the server side

- Delete `output: "export"` and `NEXT_PUBLIC_BASE_PATH`. Nothing else in the
  app changes.
- `/api/version` and `/api/health` (Collectify Rule 7: verify the FEED, not
  the build). The "fails on zero shops" half already exists without a server:
  it is the page's data-load error state and the acceptance check on it; a
  server health route would report the same condition to a monitor.
- Admin routes behind a token for edits without a commit.
- Multi-city: `Shop.tz` is already stored; the calendar starts rendering in
  the shop's zone when shops span zones. City/region becomes a selector, the
  ZIP+radius filter already works anywhere in the US.

## Phase 4 — accounts and personal calendars

- An auth provider and a small database, chosen when this phase starts; no
  provider is assumed. On first sign-in, upload the local `Prefs.myEvents` to
  the user's record instead of discarding it; afterwards the account is the
  source and localStorage is the cache.
- Settings additions that are already stubbed in the UI copy: "saved to your
  account".

## Phase 5 — submissions and review

- Signed-in users submit a new shop or a schedule change. Submissions land in
  a `submissions` store with `status: pending`, never directly in `events`.
  This is the first thing that needs a database (see phase 4: an auth provider
  and a small database when submissions arrive).
- A review bench (Collectify's `app/review/` is the pattern: a queue, a
  card, approve/reject, and the resulting calendar-log line written
  automatically). Approving writes the event row AND its log line in one
  transaction — Collectify Rule 16: two writers to one document need a test
  that runs them against each other.
- Auto-review for trivial cases (a time change on an existing row from the
  shop's own account) can come later; start with everything human-reviewed.

## Phase 6 — populate by search

- A scraper per shop-site shape, starting with the Shopify "pages/…" pattern
  both King Fandom and RWT use. Output is a *proposed* diff to `events.json`
  (or a submission in phase 5 terms), never a direct write: every scraped
  schedule so far has needed a human to resolve a contradiction (King
  Fandom's two pages disagree on Pokémon's day).
- Discovery: play-network locators (Wizards, Pokémon, Ravensburger, Bandai)
  list stores by ZIP and are structured; a per-ZIP sweep seeds shops for a new
  city. Facebook-only shops (CoreTCG, Fire & Dice) stay manual.
- A `confidence` field is already on every event for exactly this: scraped
  rows render with a "web" mark until someone verifies them.

## Explicitly not planned

- Per-user notifications / reminders — out of scope until accounts exist.
- Ticketing / registration — link to the store, never take money.
- Non-TCG events (board game nights, D&D) — the calendar log records that a
  shop runs them; the calendar does not list them.
