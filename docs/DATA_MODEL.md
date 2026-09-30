# Data model

Three collections. Today they are `data/shops.json`, `data/events.json`,
`data/calendar_log.json`; in Firestore they keep the same names and shapes,
with document id = `id`. Types live in `lib/schedule.ts` and `lib/data.ts`;
the validator is `validateData` in `lib/data.ts` and the tests run it against
the committed files.

## Shop

| field | type | notes |
|---|---|---|
| `id` | slug | stable; ends up in URLs and document ids. Never rename. |
| `name`, `address`, `city`, `state`, `zip` | string | as the store publishes them |
| `lat`, `lon` | number | **from a geocoder, never typed** (`scripts/geocode.mjs`). (0,0) and out-of-range are rejected. |
| `tz` | IANA zone | `America/Los_Angeles` for every LA shop; the hook for multi-city |
| `website`, `phone`, `socials`, `hours` | optional | display only |
| `games` | GameId[] | what the store supports even without an event row |
| `notes` | string | free text shown in the popup when there are no events |
| `active` | boolean | `false` hides a closed shop without deleting its history |
| `source` | `{url?, checked, note?}` | where the row came from and when it was last checked |

## Event

| field | type | notes |
|---|---|---|
| `id` | string | unique; convention `<shop>-<day>-<game>[-<qualifier>]` |
| `shopId` | Shop.id | |
| `game` | GameId | from `lib/games.ts`; unknown ids are rejected |
| `kind` | `play` \| `tournament` | the trophy icon means exactly `tournament` |
| `title`, `format`, `fee`, `notes` | optional strings | "Friday Night Magic", "Commander", "$10" |
| `weekday` **or** `date` | 0–6 (Sun=0) **or** YYYY-MM-DD | exactly one. Weekly rows repeat; dated rows happen once. |
| `start`, `end?` | `HH:MM` 24h | shop-local time |
| `validFrom`, `validUntil` | YYYY-MM-DD | bound a weekly row; how a schedule CHANGE is recorded (end the old row, start the new) |
| `skipDates` | YYYY-MM-DD[] | holidays, a week the store runs a regional instead |
| `confidence` | `verified` \| `scraped` \| `unverified` | renders as a small mark until verified |
| `source` | as Shop | |

**Never edit a published row's weekday/time in place.** End it with
`validUntil`, add a new row, and write a `changed` line in the calendar log.
The log has to be able to say what the calendar used to say.

## Calendar log entry

| field | type | notes |
|---|---|---|
| `date` | YYYY-MM-DD | when we learned of / recorded the change |
| `action` | `added` \| `removed` \| `changed` \| `note` | |
| `game` | GameId \| null | null for shop-level entries |
| `shopId` | Shop.id | |
| `summary` | string | written for players, not developers |

This is separate from the site changelog in `lib/version.ts`, which records
changes to the site itself.

## Occurrence (derived, never stored)

`occurrencesInRange(events, shops, from, to, origin)` expands weekly rows into
dated instances joined to their shop, with `distanceMi` from the origin. Both
the map and the calendar consume the same filtered occurrence list so they
cannot disagree.

## Preferences (per browser today, per account later)

`lib/prefs.ts`: `zip`, `origin`, `radiusMi`, `games`, `kind`, `myEvents`
(event ids picked for "My calendar"), `myOnly`, `showDistance`, `theme`.
Serialisable with stable keys so it can be uploaded on first sign-in.
