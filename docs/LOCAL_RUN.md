# Local run: the data work that is waiting

Written 2026-10-09. The cloud session that built the pipelines stopped before
running any bulk data scrapes; Mark wants those done in a **local Claude
run**. Work through these in order. Each step ends with the CLAUDE.md gates
(rule 5) and a commit. Read CLAUDE.md first.

## 1. Riftbound: populate the map (one run, ~2 minutes)

The official Riftbound store locator has an open API (no login). A dry run on
2026-10-09 found **174 Greater-LA stores, 121 with a weekly Riftbound night**,
every night with its fee.

```
node scripts/riftbound/pull.mjs                 # ~56 requests, 1.5 s apart
node scripts/candidates/merge.mjs data/candidates/riftbound-locator.json            # dry run: READ the report
node scripts/candidates/merge.mjs data/candidates/riftbound-locator.json --apply --bump
```

- On Node ≥ 22 behind a proxy, prefix the pull with `NODE_USE_ENV_PROXY=1`.
- **Read the dry-run report before `--apply`.** Expect roughly 124 new shops,
  169 weekly nights, ~40 special events and 5 fees filled in. Expect exactly
  one "NEEDS A HUMAN" line: CoreTCG's old Saturday-noon night, which their
  Oct 2 schedule dropped. Do not add that one.
- `--apply` also writes `data/research_queue.json`: one `todo` entry per new
  shop. That queue is step 3.
- Commit `data/*.json`, `data/candidates/riftbound-locator.json` and
  `lib/version.ts` together.
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

## 4. Bandai TCG+ (Mark, on his Mac)

`scripts/bandai/README.md`. Mark runs it with his second account. It writes
`data/candidates/bandai-tcgplus.json`, a list of LEADS: which shops run
Gundam / Dragon Ball / One Piece / Union Arena / Digimon, and on which
nights. Feed those shops into the research queue (step 3) rather than
straight onto the calendar, and add their upcoming special events
(regionals, championships, prereleases) as dated rows with `confidence:
"scraped"`.
