/**
 * The site version and its CODE change log.
 *
 * VERSIONING RULE (binding, carried over from Collectify-Wrapper): the scheme
 * is MAJOR.MINOR.PATCH.BUILD, every commit bumps the last segment by one,
 * odometer-style (0.1.0.9 -> 0.1.1.0), in the SAME commit as the change, with
 * a CHANGELOG entry written for the person using the site. tests/version.test.ts
 * asserts VERSION against the top entry so the two cannot drift.
 *
 * THIS IS NOT THE CALENDAR LOG. Changes to what is ON the calendar - a shop
 * added, Pokémon night moving from Thursday to Wednesday - go in
 * data/calendar_log.json and render on the Log tab. This file is for changes
 * to the site itself.
 */

export const VERSION = "0.1.0.7";

export interface ChangeEntry {
  version: string;
  date: string;      // YYYY-MM-DD
  changes: string[];
}

/** Newest first. Every commit adds to the top entry or creates a new one. */
export const CHANGELOG: ChangeEntry[] = [
  {
    version: "0.1.0.7",
    date: "2026-10-03",
    changes: [
      "Every event block now has the shop's phone number (tap to call) and a Directions button; the map popup has both too.",
      "Month view now shows every event, the same as the week view. It used to stop at four per day and showed none on phones.",
      "Bear Cave CCG (Northridge) added with its weekly schedule: 22 slots across 11 games.",
    ],
  },
  {
    version: "0.1.0.6",
    date: "2026-09-30",
    changes: ["Internal: every push to main now deploys itself (the workflow relays onto the branch GitHub Pages accepts)."],
  },
  {
    version: "0.1.0.5",
    date: "2026-09-30",
    changes: ["King Fandom: withdrew the note claiming the store's two schedule pages disagreed - they match; Saturday Commander noted as pods of 4."],
  },
  {
    version: "0.1.0.4",
    date: "2026-09-30",
    changes: ["Fixed: the map showed no shop pins on a first visit until a filter was touched."],
  },
  {
    version: "0.1.0.3",
    date: "2026-09-30",
    changes: ["CoreTCG hours updated to 12-9 PM daily from Oct 2, 2026."],
  },
  {
    version: "0.1.0.2",
    date: "2026-09-30",
    changes: ["Internal: deploy workflow fix (GitHub Pages enablement is a one-time repo setting, not a workflow step)."],
  },
  {
    version: "0.1.0.1",
    date: "2026-09-30",
    changes: [
      "CoreTCG (Pasadena) weekly tournament schedule added, effective Oct 2, 2026 - 14 slots across 12 games. All four seed shops now have schedules.",
      "Light / dark toggle (☾ / ☀) in the header; the first visit follows your device setting.",
    ],
  },
  {
    version: "0.1.0.0",
    date: "2026-09-30",
    changes: [
      "First version: a map of Los Angeles card shops with weekly play, and a calendar of their events.",
      "Filter by ZIP code and distance (5 to 250 miles), by game, and by casual play vs tournament (trophy icon).",
      "Calendar shows one week by default, with a full-month view and previous/next navigation.",
      "Log tab lists every change to the calendar per game and shop, separately from this site changelog.",
      "Pick the blocks you play to build your own calendar; the rest greys out. Click a block to see the shop on the map. Settings can show the distance from your ZIP on each block.",
      "Seeded with King Fandom (Canoga Park), RWT Collective (West LA) and Fire & Dice (Northridge) weekly schedules; CoreTCG (Pasadena) is on the map with its schedule pending.",
    ],
  },
];
