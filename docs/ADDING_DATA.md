# Adding or changing a shop or schedule (phase 1, JSON)

Every change is three edits in one commit. The tests enforce the first two;
the third is the versioning rule.

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

## 3. The version

Bump `VERSION` in `lib/version.ts` by 0.0.0.1 and add a CHANGELOG line in the
same edit. `tests/version.test.ts` fails otherwise — and on GitHub Pages the
workflow runs the tests before it builds, so a missed bump is a failed deploy,
not a silent one.

## Then

```
npm test && npx tsc --noEmit -p tsconfig.json && npm run build
```

Push to `main`; the Pages workflow deploys. Verify with
`curl -s https://blissvibes.github.io/TCG-PlayMap/version.json`.
