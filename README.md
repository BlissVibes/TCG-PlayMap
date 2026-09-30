# TCG PlayMap · Los Angeles

Where and when to play trading card games around Los Angeles: a map of card
shops that host play, and a calendar of their weekly events and tournaments.

**Live:** https://blissvibes.github.io/TCG-PlayMap/ (GitHub Pages; enable it
once under Settings → Pages → Source: *GitHub Actions*)

## What it does

- **Map** — one pin per shop, a 🏆 badge on shops running a tournament this
  week, popup with the week's events and links to the store and to Google /
  Apple Maps.
- **Calendar** — one week by default (schedules repeat weekly), month view
  for pre-releases and regionals, previous/next navigation.
- **Filters** — near a ZIP within 5–250 miles; by game; casual play vs
  🏆 tournaments.
- **My calendar** — pick the blocks you play; everything else greys out.
  Click a block to see the shop on the map. Saved in the browser for now.
- **Log** — every addition, removal and change to the calendar, per game and
  shop, plus the site's own changelog.

## Develop

```
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run typecheck
npm run build        # static export to out/
```

Data lives in `data/*.json`. To add a shop or an event, read
`docs/ADDING_DATA.md`. Long-term plan: `docs/ROADMAP.md`. Shapes:
`docs/DATA_MODEL.md`. Where each schedule came from: `docs/SOURCES.md`.

## Built from

The map, geo and versioning patterns are lifted from
[Collectify-Wrapper](https://github.com/BlissVibes/Collectify-Wrapper)
(`web/lib/geo.ts`, `web/lib/leafletCdn.ts`, `web/components/pinMap.tsx`,
`web/lib/version.ts`), whose rules about verifying deploys and never typing a
coordinate by hand apply here too.
