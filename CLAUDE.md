# Working rules for this repo

Inherited from Collectify-Wrapper where they earned their keep; shortened to
what applies to a static site with JSON data. Read `docs/ROADMAP.md` before
proposing structure — the phases are already laid out.

1. **Version bump on every commit.** Bump `VERSION` in `lib/version.ts` by
   0.0.0.1 (odometer, `MAJOR.MINOR.PATCH.BUILD`) and add a user-facing
   CHANGELOG line in the same edit. `tests/version.test.ts` enforces it and the
   Pages workflow runs tests before building, so a missed bump is a failed
   deploy.

2. **Two logs, never mixed.** Changes to the SITE go in `lib/version.ts`.
   Changes to what is ON THE CALENDAR (a shop, a game night moving) go in
   `data/calendar_log.json`, one line per game affected, written for players.
   `docs/ADDING_DATA.md` is the runbook.

3. **Never type a coordinate.** `node scripts/geocode.mjs "<address>"` and
   read the display name back. `validateData` rejects (0,0) and out-of-range.

4. **Never edit a published schedule row in place.** End it (`validUntil`),
   add the new row (`validFrom`), log it as `changed`. The log must be able to
   say what the calendar used to say.

5. **Gates, in order, and the push depends on them:**
   ```
   npm test > /tmp/t.log 2>&1; T=$?
   npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1; C=$?
   npm run build > /tmp/b.log 2>&1; B=$?
   [ $T -eq 0 ] && [ $C -eq 0 ] && [ $B -eq 0 ] || exit 1
   ```
   `next build` does not typecheck test files; tsc does.

6. **Verify the deploy, not the build.**
   `curl -s https://blissvibes.github.io/TCG-PlayMap/version.json` must show
   the version just shipped. When Firestore arrives, add a health check that
   fails on zero shops — "the request succeeded and the map is empty" is the
   failure mode that has never once been a crash.

7. **Scraped is not verified.** Every event carries `confidence`. A schedule
   read from a website or an image is `scraped` until the store or Mark
   confirms it; record what could not be read in `docs/SOURCES.md`.

8. **Non-TCG events are logged, not listed.** Board game nights and D&D go in
   the shop's `notes` and a calendar-log `note`, never in `events.json`.
