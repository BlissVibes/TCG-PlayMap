# Local run: the data work, and where it stands

**Status, 2026-10-10 (live at v0.1.3.1, 127 shops, 488 events):**

| step | state |
|---|---|
| 1. Riftbound populate | **Done 2026-10-10.** 120 shops created, 160 weekly nights, 36 special events, 5 fees filled; 1 store skipped as outside the region (Roanoke VA, 2,146 mi). |
| 2. Paper Hero's (two LA stores) | **Done 2026-10-10**, by hand from the two Google Calendars. Landed before step 1, with `sourceIds.riftbound` on both rows so the importer linked them instead of creating them again. |
| 3. Research queue | **In progress.** 120 entries on live main: 17 `done`, 43 `blocked`, 60 `todo`. Count it again before quoting it: `data/research_queue.json` on `origin/main`. |
| 4. Bandai TCG+ | **Pending** (Mark, on his Mac). |
| 5. Chrome pass over the blocked shops | New 2026-10-10, see below. |
| 6. Mark's own follow-up (`needsMark`) | New 2026-10-10, see below. |

What the run changed in the tools, so the commands below are still right:
- The scripts now run from a folder path with a space in it (0.1.1.2). Before
  that every one of them, including `bump_version.mjs`, exited 0 having done
  nothing.
- The importer skips stores outside Greater LA (0.1.1.5), cleans dates out of
  weekly titles and re-cleans the rows it owns on every run (0.1.2.9).
- `tests/shopDupes.test.ts` fails on two shop rows for one place (0.1.1.4).
- **Order matters when two sessions work at once:** the importer only sees the
  `shops.json` in its own checkout. A hand-entered shop must be on that
  checkout (pull first) before `--apply`, or the store is created twice.

Written 2026-10-09. The cloud session that built the pipelines stopped before
running any bulk data scrapes; Mark wants those done in a **local Claude
run**. Work through these in order. Each step ends with the CLAUDE.md gates
(rule 5) and a commit. Data commits do not bump the version (2026-10-10). Read CLAUDE.md first.

## 1. Riftbound: populate the map (one run, ~2 minutes)

Carde.io terms forbid scripted access; Mark's 2026-10-10 decision: pull anyway, lightly — manual trigger only, never more than weekly, polite pacing. (Clauses: `docs/SOURCES.md`, the Carde.io row.)

The official Riftbound store locator has an API that answers without a login. A dry run on
2026-10-09 found **174 Greater-LA stores, 121 with a weekly Riftbound night**,
every night with its fee.

```
node scripts/riftbound/pull.mjs                 # ~56 requests, 1.5 s apart
node scripts/candidates/merge.mjs data/candidates/riftbound-locator.json            # dry run: READ the report
node scripts/candidates/merge.mjs data/candidates/riftbound-locator.json --apply
```

- On Node ≥ 22 behind a proxy, prefix the pull with `NODE_USE_ENV_PROXY=1`.
- **Read the dry-run report before `--apply`.** The first run (2026-10-10)
  gave 120 new shops, 160 weekly nights, 36 special events and 5 fees filled
  in. A refresh should show few or none of each. Expect exactly one "NEEDS A
  HUMAN" line: CoreTCG's old Saturday-noon night, which their Oct 2 schedule
  dropped. Do not add that one. Read "Skipped (outside region)" too: one
  Roanoke VA store is expected there; anything else in it is a question.
- `--apply` also writes `data/research_queue.json`: one `todo` entry per new
  shop. That queue is step 3.
- Commit `data/*.json` and `data/candidates/riftbound-locator.json` together.
  No version bump: a data run does not move the site version (`docs/ADDING_DATA.md`,
  section 3). `--bump` no longer exists.
- Later refreshes are the same three commands. The GitHub workflow "Refresh
  Riftbound from the official locator" does exactly this, with a manual
  trigger only, and can be put on a weekly schedule (see its header).

## 2. Paper Hero's Games: the two LA stores (worked example for step 3)

Both stores publish a **public Google Calendar** covering every game. Mark
asked for these specifically. Do them by hand, following
`docs/SHOP_RESEARCH.md`, so the runbook has a finished example:

| store | shop id after step 1 | iCal feed |
|---|---|---|
| Sherman Oaks, 14109 Burbank Blvd | `paper-heros-games-sherman-oaks` | `https://calendar.google.com/calendar/ical/paperherosgames%40gmail.com/public/basic.ics` |
| Santa Monica Blvd, 11304 Santa Monica Blvd | `paper-heros-games-santa-monica` | `https://calendar.google.com/calendar/ical/mshumd4garrccmdg0q98v4fpu0%40group.calendar.google.com/public/basic.ics` |

`python3 scripts/ics/summarise.py <file.ics> 2026-10-12 6` lists what is
current. On 2026-10-09 the stores ran, besides Riftbound (which step 1
already loads, so skip it):
- **Sherman Oaks:** Gundam Tue 6:15 PM $10; One Piece Tue 6 PM $10 (casual);
  Palworld Wed 5 PM $10; Pokémon Wed 6 PM $10; Lorcana Thu 5 PM $10;
  Neuroscape Thu 6 PM $10; MTG Cube Draft every other Thu 6:30 PM;
  Yu-Gi-Oh! Thu 6:30 PM and Sun 4 PM; FNM draft Fri 6 PM $30 (series ends
  Nov 6: `validUntil`); Cyberpunk Beta Sat 5 PM $10 (ends Oct 31, skips
  Oct 31); SWU Twin Suns Sat 7 PM $5 (casual); MTG Standard Sun 6 PM $10;
  MTG Canadian Highlander last Sunday of the month 6 PM $10.
- **Santa Monica Blvd:** Pokémon Mon 7 PM and Sat 3 PM $10; One Piece Wed
  6:30 PM $10; Yu-Gi-Oh! Advanced Wed 7 PM $10; Yu-Gi-Oh! GOAT every other Thu
  7 PM $10; Gundam Thu 7 PM $10; MTG Standard Thu 7 PM $10; FNM draft Fri
  7 PM; Neuroscape Sat 5 PM $10; SWU League Sat 3 PM (casual; the title says
  $10, the text says $5, so check); Lorcana Sun 4 PM $10; Cyberpunk meet-up
  Sun 5 PM $10.
- **Both:** many dated specials (prereleases, store championships, release
  events). Add the upcoming ones.

New game ids are needed for **Neuroscape** and **Cyberpunk TCG**
(`lib/games.ts`). Leave out Warhammer, board-game nights and D&D (rule 8).
Biweekly nights use `everyWeeks: 2` with a `validFrom`. Monthly nights become
dated rows.

## 3. The research queue: everyone else's other games (Sonnet / Haiku)

`data/research_queue.json`, built in step 1, lists every shop the importer
added. For those shops the map knows only about Riftbound. The job is to
find each shop's **full** weekly schedule for every TCG it runs. This is
bulk, repetitive work, meant for a cheaper model. The runbook is
`docs/SHOP_RESEARCH.md`.

Inputs worth handing the researcher along with the queue:
- `data/candidates/leads-gundam.json`: 6 shops with Gundam play confirmed on
  their own sites (Mystery Shop Oxnard, both Kingslayer stores, Brookhurst
  Hobbies, A.G. Collectibles, Spellhold), plus 32 unconfirmed leads from
  Bandai's 2024 store list.
- `data/candidates/leads-dragonball.json`: 6 Dragon Ball leads, only one
  with a (possibly stale) weekly night: A Hidden Fortress, Masters, Tue
  6:30 PM, $5.

**Where it stood on 2026-10-10:** 60 of 120 worked through; 17 `done`, 43
`blocked`. Most blocked shops keep their schedule on Instagram, Facebook or
Discord, or behind a calendar that only draws in a browser. Those are step 5.

## 4. Bandai TCG+ (Mark, on his Mac)

`scripts/bandai/README.md`. Mark runs it with his second account. It writes
`data/candidates/bandai-tcgplus.json`, a list of LEADS: which shops run
Gundam / Dragon Ball / One Piece / Union Arena / Digimon, and on which
nights. Feed those shops into the research queue (step 3) rather than
straight onto the calendar, and add their upcoming special events
(regionals, championships, prereleases) as dated rows with `confidence:
"scraped"`.

## 5. The Chrome pass: blocked shops, re-read in a real browser

A shop is `blocked` when `curl` could not read its schedule. Many of those
schedules are public and simply need a browser: a calendar widget that draws
with JavaScript, a site that answers `curl` with 403, an Instagram post.
A local Claude session re-reads them in **Mark's logged-in Chrome**, through
the Claude in Chrome tools. How to read each kind of page is in
`docs/SHOP_RESEARCH.md` ("The Chrome pass").

Rules for that session, all four binding:
- **Read-only.** Navigate and read. Never click a button that posts, follows,
  likes, joins, messages, RSVPs or buys, and never type into a form. It is
  Mark's own account in that browser.
- **Its own tab.** Open a new tab for the work; never reuse or close a tab
  Mark already had open.
- **Discord is never opened.** Not an invite link, not a server, not the app.
  A schedule that lives only in Discord gets `"needsMark": "discord"` on the
  shop's queue entry and the shop stays `blocked`.
- Everything read this way is still `confidence: "scraped"`, with the page
  URL as its source (rule 7).

Same batch size, gates and commit as step 3. A shop the Chrome pass does
read moves to `done`; one it cannot gets a `needsMark` value saying what
would unblock it.

## 6. Mark's own follow-up: the `needsMark` list

Whatever is left needs a person. The queue entries with a `needsMark` field
are that list:

```
node -e 'for (const q of require("./data/research_queue.json")) if (q.needsMark) console.log(q.needsMark.padEnd(9), q.name, "-", q.city)'
```

- `discord`: join or open the shop's Discord server and read its schedule
  channel.
- `phone`: call the shop. Usually the nights are known and a start time or a
  fee is not.
- `image`: the schedule is a graphic nobody could read (too small, cropped,
  behind a login). Paste the full-size image.

Hand what you learn to a research session; it writes the rows, the log lines
and clears the field. The field's convention is in `docs/DATA_MODEL.md`.
