# Sources — where each shop's schedule came from, and what could not be read

One row per shop. When a shop's schedule is re-checked, update the date and
note anything that changed (and log it in `data/calendar_log.json`).

| shop | schedule source | readable automatically? | checked | notes |
|---|---|---|---|---|
| King Fandom | https://www.kingfandom.com/pages/tournaments | **Yes** — Shopify page, plain HTML list per weekday with time and fee | 2026-09-30 | The store's other page, `/pages/marketplace-schedule`, shows a month calendar whose day-to-game mapping disagrees with the tournaments page (Pokémon Thu vs Wed, MTG Sat vs Fri). Tournaments page used; **needs confirming with the store.** Lorcana is "coming soon" (Wed) and Naruto "next year" (Sun) — not added. |
| RWT Collective | https://www.rwtcollective.com/pages/organized-play | **Yes** — Shopify page, per-weekday list with times | 2026-09-30 | No fees, no casual-vs-tournament labels; store says "prizing, event format and round count may vary". All rows marked `tournament`; **needs confirming.** Lorcana fee/format ($10, Core Constructed) came from the Ravensburger Play Network listing. Super Smash Bros (Sat 7 PM) omitted — not a TCG. |
| CoreTCG | https://www.facebook.com/CoreTradingCardGames/upcoming_hosted_events | **No** — website links only to Facebook | 2026-09-30 | On the map with no events. Mark to supply the weekly schedule. Runs regionals (Yu-Gi-Oh!, One Piece, Grand Archive) that would be one-off `date` rows. |
| Fire & Dice | Facebook page header image (supplied by Mark 2026-09-30) | **No** — image only | 2026-09-30 | Transcribed by hand from the 1920×1080 weekly schedule graphic. "Constructed" rows → `tournament`; League / Nexus Night / Commander Bounty Hunter → `play` (judgement call, **confirm**). Board Game Night and D&D omitted — not TCGs. |

## What was tried and did not work

- **WebSearch summaries** are second-hand and were wrong in detail (one put
  King Fandom's Yu-Gi-Oh! on Saturday only). Always fetch the store's page.
- **Facebook** cannot be fetched from here at all (login wall). Header images
  can be read when Mark pastes the CDN URL, as with Fire & Dice.
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
