# Adding or changing a shop or schedule (phase 1, JSON)

Every change is two edits in one commit, the data and its calendar-log line;
the tests enforce both. The third section is the versioning rule: a data
change does NOT bump the version.

## 1. The data

**New shop**

```
node scripts/geocode.mjs "770 S Arroyo Pkwy, Pasadena, CA 91105"
```

Check the display name is the street you meant, then add a row to
`data/shops.json` (see `docs/DATA_MODEL.md`). Add its ZIP to `data/zips.json`
with the same coordinates so the ZIP filter works offline for it.

**New weekly event** — a row in `data/events.json` with `weekday` (Sun=0),
`start` as `HH:MM`, `kind`, `game` from `lib/games.ts`, and a `source`. One row
per game: "Tue 12 PM: Gundam, DBS, Yu-Gi-Oh" is three rows.

**One-off event** (pre-release, regional) — same, with `date` instead of
`weekday`.

**Schedule change** — do NOT edit the old row. Set its `validUntil` to the
last date it ran, add a new row with `validFrom`, and log it as `changed`.

**Shop closed** — set `active: false`. Do not delete.

**New game** — one line in `lib/games.ts`. Pick a colour that is
distinguishable from its neighbours as a 10px chip on both themes.

## 2. The calendar log

Add a line to `data/calendar_log.json` for every game affected, written for a
player: "Pokémon moved from Thursday 6 PM to Wednesday 7 PM." Shop-level
entries (new shop, closure) use `game: null`. `tests/data.test.ts` fails if a
shop has events and no log entry at all.

## 3. The version: leave it alone

**A data change does not bump the version** (Mark, 2026-10-10: "we dont need
to update the version for every single shop update. its to be saved for
feature updates and changes."). If your commit touches only `data/`, `docs/`
or `README.md`, do not edit `lib/version.ts`; `tests/version.test.ts` fails
a data-only commit that bumps. Name the shops in the commit subject instead:
`Research batch 23: Game Empire, Brute Force Games; 3 blocked`.

The version moves when the SITE changes: anything outside those paths,
including a new game in `lib/games.ts`. Then run
`node scripts/bump_version.mjs "<what changed, for the person using the site>"`
before the gates; the same test fails a site change that does not bump.

The footer shows "data updated <date>", the newest date in
`data/calendar_log.json`, so freshness is visible without a version.

## Then

```
npm test && npx tsc --noEmit -p tsconfig.json && npm run build
```

Push to `main`; the Pages workflow deploys. Verify with
`curl -s https://blissvibes.github.io/TCG-PlayMap/version.json`. For a data
push the `version` there does not change: check `dataUpdated`, `shops` and
`events` against what you just committed
(`node -e 'console.log(require("./data/shops.json").length, require("./data/events.json").length)'`).
