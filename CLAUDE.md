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

   Then the browser: `CHROME_PATH=<chromium> npm run acceptance` against the
   fresh `out/`. It opens the page with a FRESH profile and checks what a
   first visitor sees (blocks, a pin per shop, block-to-map jump, theme
   toggle, no page errors). On 2026-09-30 every other gate was green and the
   live map had zero pins; only this caught it.

6. **Verify the deploy, not the build.** A push to `main` deploys via a
   relay run on `claude/busy-dirac-gsnjt7` (header of
   `.github/workflows/pages.yml` says why); expect TWO workflow runs and
   ~2 minutes. Repo settings (Pages, environments) cannot be changed from an
   agent session - the API paths are blocked by the proxy - so ask Mark for
   those and never burn calls retrying them.
   `curl -s https://blissvibes.github.io/TCG-PlayMap/version.json` must show
   the version just shipped, then
   `npm run acceptance -- https://blissvibes.github.io/TCG-PlayMap/`. When Firestore arrives, add a health check that
   fails on zero shops — "the request succeeded and the map is empty" is the
   failure mode that has never once been a crash.

7. **Scraped is not verified.** Every event carries `confidence`. A schedule
   read from a website or an image is `scraped` until the store or Mark
   confirms it; record what could not be read in `docs/SOURCES.md`.

8. **Non-TCG events are logged, not listed** — with one exception. Board game
   nights and D&D go in the shop's `notes` and a calendar-log `note`, never
   in `events.json`. **Beyblade X IS listed** (game id `beyblade`; Mark,
   2026-10-09: "keep beyblade nights"). Ask before adding any other non-TCG.

9. **Always record and show the cost.** Every event row gets a `fee` when the
   store publishes one ("$10", "Free", "$5 (includes a pack)"), copied as
   written. If the store publishes none, leave `fee` out and say so in notes;
   the UI then shows "Cost not listed", never a blank (Mark, 2026-10-09:
   "always show the cost associated with attending each tcg's play night").
   Every block, month chip and map popup renders it via `feeLabel`.

10. **Importers own their rows; humans own theirs.** Rows with an `origin`
    (e.g. `riftbound-locator`) are written and ended by
    `scripts/candidates/merge.mjs`; never hand-edit or delete them. The
    importer never edits a hand-entered row except to fill a missing `fee`, and
    adds no weekly nights at a hand-entered shop; it reports those under
    "NEEDS A HUMAN". Bulk sources and their access status are in
    `docs/SOURCES.md`.

11. **Where the data work stands.** `docs/LOCAL_RUN.md` is the ordered list
    of pending data runs: the Riftbound populate, Paper Hero's, the research
    queue, and Bandai. Bulk per-shop research (`data/research_queue.json`) is
    meant for Sonnet/Haiku sessions following `docs/SHOP_RESEARCH.md`. Hand
    that file to such a session as its instructions.
