# Sources — where each shop's schedule came from, and what could not be read

One row per shop. When a shop's schedule is re-checked, update the date and
note anything that changed (and log it in `data/calendar_log.json`).

| shop | schedule source | readable automatically? | checked | notes |
|---|---|---|---|---|
| King Fandom | https://www.kingfandom.com/pages/tournaments | **Yes** — Shopify page, plain HTML list per weekday with time and fee | 2026-09-30 | The store's other page, `/pages/marketplace-schedule`, is a month calendar (plain HTML: day number, "Tournaments", game names) and it **agrees with the tournaments page on every day** — Sep 1, 2026 is a Tuesday, and read that way both pages match exactly. A summariser first read it with the 1st as a Sunday, shifting every game a day earlier; that "conflict" was recorded here and in the log before the raw HTML was checked. **Never accept a summariser's reading of a calendar grid: dump the text and anchor the day-of-week on a real date.** Lorcana is "coming soon" (Wed) and Naruto "next year" (Sun) — not added. |
| RWT Collective | https://www.rwtcollective.com/pages/organized-play | **Yes** — Shopify page, per-weekday list with times | 2026-09-30 | No fees, no casual-vs-tournament labels; store says "prizing, event format and round count may vary". All rows marked `tournament`; **needs confirming.** Lorcana fee/format ($10, Core Constructed) came from the Ravensburger Play Network listing. Super Smash Bros (Sat 7 PM) omitted — not a TCG. |
| CoreTCG | https://x.com/CoreTCG/status/2104985921091457209 (the "Weekly Tournaments as of Oct 2nd, 2026" graphic) | **Partly** — the website links only to Facebook (login wall), but X posts are readable via `api.fxtwitter.com/<user>/status/<id>` and `cdn.syndication.twimg.com/tweet-result?id=<id>&token=a`, which return the text and `pbs.twimg.com` media URLs; the image itself is then read by hand | 2026-09-30 | 14 weekly slots, all `tournament`, all `validFrom: 2026-10-02` because the post says the schedule starts then. No fees. The announcement's hours read "12PM - PM"; the store's follow-up post (per Mark) gives 12–9 PM daily from Oct 2 — **read the whole thread, not the first post.** Runs regionals (Yu-Gi-Oh!, One Piece, Grand Archive) that would be one-off `date` rows. |
| Fire & Dice | Facebook page header image (supplied by Mark 2026-09-30) | **No** — image only | 2026-09-30 | Transcribed by hand from the 1920×1080 weekly schedule graphic. "Constructed" rows → `tournament`; League / Nexus Night / Commander Bounty Hunter → `play` (judgement call, **confirm**). Board Game Night and D&D omitted — not TCGs. |

| Bear Cave CCG | Weekly schedule graphic on https://www.instagram.com/bearcaveccg/ (screenshot supplied by Mark 2026-10-03) | **No** — image only | 2026-10-03 | 22 slots transcribed by hand. No fees, no casual/tournament labels: all marked `tournament`, **confirm**. Beyblade X (Tue 6 PM) omitted — not a TCG. Sunday = "Special Events" (Discord) plus Yu-Gi-Oh! Edison Format 4 PM. Address/phone from Yelp & the Wizards locator; Nominatim's first hit at 8820 Reseda names "NJoy Games & Comics" (stale OSM label), so the plain-address coordinate was used. |

## What was tried and did not work

- **WebSearch summaries** are second-hand and were wrong in detail (one put
  King Fandom's Yu-Gi-Oh! on Saturday only). Always fetch the store's page.
- **Facebook** cannot be fetched from here at all (login wall), including
  `facebook.com/photo?fbid=…` links. Images can be read when Mark pastes the
  `scontent-….fbcdn.net` CDN URL (right-click → Copy image address), as with
  Fire & Dice.
- **X / Twitter** status pages return 402/JS shells, but the two endpoints in
  the CoreTCG row above work without login and hand back the media URL.
- **Nominatim** geocoded all four addresses correctly on the first try; RWT's
  hit was a café at the same street address, which is fine for a pin.

## Candidate sources for other shops / cities (phase 6)

Structured store locators, all searchable by ZIP:
- Wizards (Magic): https://locator.wizards.com/
- Pokémon: https://events.pokemon.com/
- Ravensburger (Lorcana): https://tcg.ravensburgerplay.com/
- Bandai (One Piece, DBS, Gundam, Union Arena): https://en.bandai-tcg-plus.com/
- Legend Story Studios (Flesh and Blood): https://fabtcg.com/locator/
- Riot (Riftbound): https://riftbound.leagueoflegends.com/ (store locator TBD)
- Grand Archive: https://omni.gatcg.com/ (events, not stores)
