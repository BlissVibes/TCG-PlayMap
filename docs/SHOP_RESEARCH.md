# Shop research runbook (for Sonnet / Haiku sessions)

**Your job:** take shops from `data/research_queue.json` and find each one's
FULL weekly play schedule: every trading card game it runs, the day, the
time, and **the cost**. Write what you find into `data/events.json`, following
the rules below. You are working on a live site that real players use to
decide where to drive, so a wrong night is worse than a missing one.

Read `CLAUDE.md` first; its rules are binding. This file covers how to do the
research.

## Batch size and stopping

- Take **5 shops per batch**, top of the queue first (`status: "todo"`).
  Finish a batch, run the gates, commit, then start the next.
- Spend at most **~15 tool calls per shop**. If the schedule is not findable
  in that budget, mark the shop `blocked` with a one-line reason and move on.
  Do not keep digging.
- Never re-research a shop marked `done` or `blocked` unless told to.

## Where to look, in order

1. **The shop's website.** Fetch the HTML with `curl` and look for pages
   named events, calendar, schedule, tournaments or organized-play. Shopify
   stores often use `/pages/events`; CrystalCommerce stores use `/calendar`.
2. **An embedded Google Calendar.** Search the page HTML for
   `calendar.google.com/calendar/embed?src=<ID>`. If you find one, the public
   feed is `https://calendar.google.com/calendar/ical/<ID>/public/basic.ics`.
   Run `python3 scripts/ics/summarise.py <file.ics> <today> 6` on it. This is
   the best source there is: it includes recurring series, skipped weeks and
   fees, usually in the event title ("6PM Pokemon Constructed $10").
3. **Official locators** that show events in plain HTML:
   - Magic: `https://locator.wizards.com/store/<id>`. Find the store id with
     a web search for "<shop name> locator.wizards.com". The events are in
     the page itself.
   - Riftbound: **skip.** The importer already loads it (see below).
4. **Linktree / Discord / Instagram / Facebook.** Facebook and Instagram
   pages are login-walled from cloud sessions. If a schedule is posted as an
   **image**, read the image itself. A `scontent…fbcdn.net` URL that Mark
   pastes works. X/Twitter posts can be read through
   `https://api.fxtwitter.com/<user>/status/<id>`; read the whole thread,
   because follow-up posts carry corrections (hours, times).
5. **Web search** last. Search snippets are often wrong in the details, so
   only use them to find a page, never as the source of a time or a fee.

**Bandai TCG+** (Gundam, Dragon Ball, One Piece, Union Arena, Digimon): do
not scrape it from a cloud session. Bandai's guest API returns 403, and its
terms forbid automated access. Use the shop's own sources, or the leads in
`data/candidates/` from Mark's Mac pull.

## Calendar grids: the trap

A month grid read by a summariser can come back shifted by a day. On
2026-09-30 a summariser read King Fandom's calendar with September 1 as a
Sunday; it was a Tuesday, so every game landed on the wrong night, and a false
"conflict" went into the calendar log. **Always pull the raw text and anchor
the weekday to a real date** (`date -d 2026-10-13 +%A`).

## Writing it down

For each weekly night, add one row to `data/events.json` (one JSON object per
line, like the existing rows):

```json
{ "id": "<shopId>-<day>-<game>[-<qualifier>]", "shopId": "<shopId>", "game": "<id from lib/games.ts>",
  "kind": "tournament|play", "title": "<as the store names it>", "weekday": 0-6, "start": "HH:MM",
  "fee": "$10", "format": "Constructed", "confidence": "scraped",
  "source": { "url": "<where you read it>", "checked": "<today>" } }
```

- **`fee` is required.** Copy it the way the store writes it: "$10",
  "Free", "$5 (includes a pack)". If the store really publishes no price,
  leave `fee` out and say so in `notes` ("Store lists no entry fee"). The site
  then shows "Cost not listed", which is honest; a guessed fee is not.
- **`kind`:** "tournament" for anything with standings or prizes. "play" for
  casual nights, meet-ups, leagues described as casual, and open play.
- **Weekday:** 0 = Sunday … 6 = Saturday. **Time:** 24-hour, store-local.
- **Every other week:** `"everyWeeks": 2` plus a `"validFrom"` set to a date
  the night actually ran. **Monthly** ("last Sunday"): add the next few dates
  as dated rows (`"date": "YYYY-MM-DD"` instead of `weekday`).
- **Special events** (prereleases, release events, championships,
  regionals) within the next ~8 weeks: dated rows, with their fee.
- **Do not add Riftbound weekly nights.** The locator importer owns those
  (rows with `"origin"`). Never edit or delete a row that has `origin`. If a
  shop's own site disagrees with an imported Riftbound row, write it in the
  queue entry's `notes` for a human.
- **Non-TCG events** (board games, D&D, Warhammer): leave them out and
  mention them in the shop's `notes`. The exception is **Beyblade X**, which
  IS listed (game id `beyblade`).
- **A game missing from `lib/games.ts`:** add it there (one line, a
  distinguishable colour) in the same commit.
- **Fix the shop row too** if you learn its real hours, phone or website
  (`data/shops.json`). Replace "Other games and store hours not yet
  researched." in its notes with what you found.

Then add **one calendar-log line per game** you added, in
`data/calendar_log.json`:

```json
{ "date": "<today>", "action": "added", "game": "pokemon", "shopId": "<shopId>", "summary": "Pokémon: Wed 6 PM ($10), Sat 3 PM ($10)." }
```

And update the shop's queue entry: `"status": "done"`, a `"checked": "<today>"`,
and `"notes"` saying which source you used, or `"blocked"` with the reason.

## Gates and commit (per batch)

```
npm test > /tmp/t.log 2>&1; T=$?
npx tsc --noEmit -p tsconfig.json > /tmp/tsc.log 2>&1; C=$?
npm run build > /tmp/b.log 2>&1; B=$?
[ $T -eq 0 ] && [ $C -eq 0 ] && [ $B -eq 0 ] || exit 1
node scripts/bump_version.mjs "Schedules added for <shop>, <shop>, … (<N> weekly nights)."
npm test    # again: the version test checks the bump
```

Stage by explicit path (`data/events.json data/shops.json
data/calendar_log.json data/research_queue.json lib/version.ts`, plus
`lib/games.ts` if you added a game). Commit with a message naming the shops.
Push to `main` only when the human running you says so.

## Worked example

Paper Hero's Games (two LA stores) is step 2 of `docs/LOCAL_RUN.md`. Once it
is done, its rows in `data/events.json` are the model to copy: Google
Calendar source, fees, `everyWeeks`, dated specials.
