/**
 * The site version and its CODE change log.
 *
 * VERSIONING RULE (binding; Mark, 2026-10-10): the scheme is
 * MAJOR.MINOR.PATCH.BUILD, odometer-style (0.1.0.9 -> 0.1.1.0). The version is
 * for the SITE: a commit that changes site code bumps the last segment by one,
 * in the same commit, with a CHANGELOG entry written for the person using the
 * site. A commit that only changes data (shops, schedules, docs) does NOT bump,
 * unless Mark says that one should because it is different somehow; that entry
 * then carries `dataBump` with his reason. tests/version.test.ts enforces all
 * of it (scripts/lib/versionRule.mjs) and asserts VERSION against the top entry
 * so the two cannot drift.
 *
 * THIS IS NOT THE CALENDAR LOG. Changes to what is ON the calendar - a shop
 * added, Pokémon night moving from Thursday to Wednesday - go in
 * data/calendar_log.json and render on the Log tab. This file is for changes
 * to the site itself.
 */

export const VERSION = "0.1.6.6";

export interface ChangeEntry {
  version: string;
  date: string;      // YYYY-MM-DD
  changes: string[];
  /**
   * Only on a version given to a DATA-only update, and only because Mark asked
   * for it ("different somehow"): why. tests/version.test.ts refuses a
   * data-only bump without it. Never set for a site change.
   */
  dataBump?: string;
}

/** Newest first. Every commit adds to the top entry or creates a new one. */
export const CHANGELOG: ChangeEntry[] = [
  {
    version: "0.1.6.6",
    date: "2026-10-11",
    changes: ["Shops we know about but have no schedule for are now on the map too, as a dashed grey pin; the popup says to call the store."],
  },
  {
    version: "0.1.6.5",
    date: "2026-10-11",
    changes: ["Internal: a script that finds card shops from OpenStreetMap, for shops no publisher's store locator lists."],
  },
  {
    version: "0.1.6.4",
    date: "2026-10-10",
    changes: ["Internal: the roadmap no longer plans a database; the site stays a static page."],
  },
  {
    version: "0.1.6.3",
    date: "2026-10-10",
    changes: ["The page loads faster: shop and schedule data is now fetched separately instead of being built into the page. If it fails to load, the page says so and offers a retry."],
  },
  {
    version: "0.1.6.2",
    date: "2026-10-10",
    changes: ["A data update can carry a version only when Mark asks for it; the rule is now written into the project instructions."],
  },
  {
    version: "0.1.6.1",
    date: "2026-10-10",
    changes: ["The version number now changes only when the site itself changes. Shop and schedule updates show as 'data updated' in the footer instead."],
  },
  {
    version: "0.1.6.0",
    date: "2026-10-10",
    changes: ["Internal: the importer no longer reports a night as missing when the store's own schedule has it within two hours."],
  },
  {
    version: "0.1.5.9",
    date: "2026-10-10",
    changes: ["Lorcana nights from the Ravensburger Play listing added to hand-entered shops: entry fees for Collectors Lounge, IT'S TIME! and Paper Hero's HB; The Game Hub Thursday draft."],
  },
  {
    version: "0.1.5.8",
    date: "2026-10-10",
    changes: ["Lorcana schedules refreshed from Ravensburger Play: 56 new shops, 118 new weekly nights, 173 upcoming special events, 7 prices filled in."],
  },
  {
    version: "0.1.5.7",
    date: "2026-10-10",
    changes: ["Internal: the Riftbound pull reads its arguments before making any request."],
  },
  {
    version: "0.1.5.6",
    date: "2026-10-10",
    changes: ["The 'partial schedule' mark now stays on a shop until a person has checked its schedule, however many games the store locators list there."],
  },
  {
    version: "0.1.5.5",
    date: "2026-10-10",
    changes: ["Internal: a Lorcana importer (Ravensburger Play) ready for a first run; importers can now share a shop."],
  },
  {
    version: "0.1.5.4",
    date: "2026-10-10",
    changes: ["Sources: Mark's decision on the Carde.io locators recorded (pull anyway, lightly)."],
  },
  {
    version: "0.1.5.3",
    date: "2026-10-10",
    changes: ["Schedules added for Top Deck Keep (28 dated events) and The Game Hub & Comic Bug (1 weekly night)."],
  },
  {
    version: "0.1.5.2",
    date: "2026-10-10",
    changes: ["Schedules added for Tilted Gaming, Topspot Cards (21 weekly nights plus dated events from their calendars)."],
  },
  {
    version: "0.1.5.1",
    date: "2026-10-10",
    changes: ["Event rows without a published entry fee now say so (80 rows); Turn Zero Games flagged for an address/phone check."],
  },
  {
    version: "0.1.5.0",
    date: "2026-10-10",
    changes: ["Sources: the Riftbound and Lorcana locators' terms recorded; bulk pulls on hold pending a decision."],
  },
  {
    version: "0.1.4.9",
    date: "2026-10-10",
    changes: ["Runbooks: Chrome pass, needsMark, today's data run."],
  },
  {
    version: "0.1.4.8",
    date: "2026-10-10",
    changes: ["Schedules added for Dxn Provisions, JJs Collectibles, The Crimson Guild, SugoiStuff TCG, Stormxtcg Camarillo, Anteiku Cafe (68 weekly nights)."],
  },
  {
    version: "0.1.4.7",
    date: "2026-10-10",
    changes: ["Schedules added for Chrono & Cosmo, BGE's Tabletop, Akh Trading Card Co, Collectors Lounge (41 weekly nights)."],
  },
  {
    version: "0.1.4.6",
    date: "2026-10-10",
    changes: ["Schedules added for It's Time!, Card Cave, Collectors Lounge (17 weekly nights plus Lorcana prerelease dates)."],
  },
  {
    version: "0.1.4.5",
    date: "2026-10-10",
    changes: ["Schedules added for TCG Tavern (8 weekly nights)."],
  },
  {
    version: "0.1.4.4",
    date: "2026-10-10",
    changes: ["Schedules added for Side Quest Games, Shuffle and Cut Games (2 weekly nights)."],
  },
  {
    version: "0.1.4.3",
    date: "2026-10-10",
    changes: ["Lost Levels TCG entry fees added from a browser read; Mooncards marked as needing a human look."],
  },
  {
    version: "0.1.4.2",
    date: "2026-10-10",
    changes: ["Research batch 22 - Wildcard Cyclone weekly schedule (24 nights, read from their schedule image); Treasuretopia, Turn Zero Games, Viking TCG, Warpact Games blocked."],
  },
  {
    version: "0.1.4.1",
    date: "2026-10-10",
    changes: ["Research batch 21 - Tilted Gaming hours added; TK Collectibles, Top Choice Gaming, Top Deck Keep, TopSpot Cards blocked (no readable schedules)."],
  },
  {
    version: "0.1.4.0",
    date: "2026-10-10",
    changes: ["Research batch 20 - Graveyard TCG, The Light, Olympus Project, TheCollectorsKut, Three J's blocked (no readable schedules)."],
  },
  {
    version: "0.1.3.9",
    date: "2026-10-10",
    changes: ["Research batch 19 - The Game Chest (four stores) and The Game Hub & Comic Bug blocked (no readable schedules)."],
  },
  {
    version: "0.1.3.8",
    date: "2026-10-10",
    changes: ["Research batch 18 - Rawmon, Psycho Turtle Collectibles and Recharge Cafe events added; Rawmon and Recharge Cafe addresses updated; Ready Set Ripz and Robo Hunters blocked."],
  },
  {
    version: "0.1.3.7",
    date: "2026-10-10",
    changes: ["Research batch 17 - hours added for PokeBox USA, PokeMall TCG, Project CCG Alhambra; five shops blocked (no readable schedules)."],
  },
  {
    version: "0.1.3.6",
    date: "2026-10-10",
    changes: ["Research batch 16 - Paper Hero's Games Huntington Beach schedule (16 weekly nights, 22 special events); Paper Hero's Comics, Pandy's, Perfect Rares, Phantom Cards blocked."],
  },
  {
    version: "0.1.3.5",
    date: "2026-10-10",
    changes: ["Research batch 15 - Next-Gen Games schedule (12 weekly nights); Nexus Tabletop Games, Odyssey Games, NAV Toys, Orange Claw Club blocked."],
  },
  {
    version: "0.1.3.4",
    date: "2026-10-10",
    changes: ["Research batch 14 - Mega City One hours added; Minera Sports Cards, Miss Play TCG, Mon's TCG, Mooncards blocked (no readable schedules)."],
  },
  {
    version: "0.1.3.3",
    date: "2026-10-10",
    changes: ["Research batch 13 - Lost Levels TCG dated events; Lost Planet Games, Loot Box, Magic and Monsters, Main Street Cards blocked; A.G. Collectibles fees filled."],
  },
  {
    version: "0.1.3.2",
    date: "2026-10-10",
    changes: ["Added The Mystery Shop (Oxnard) weekly nights, Spellhold Games events and more A.G. Collectibles dates; new games Godzilla, UniVersus, Ultraman, Cardfight!! Vanguard, Shadowverse."],
  },
  {
    version: "0.1.3.1",
    date: "2026-10-10",
    changes: ["Calendar: each event is now one compact line (time, game, shop, cost); tap it for the event name, phone, directions and the map. On a phone the week starts with today. Setup now asks you to pick your games first."],
  },
  {
    version: "0.1.3.0",
    date: "2026-10-10",
    changes: ["Map: nearby shops group into a numbered bubble until you zoom in, the map opens framed on the shops near you, and long shop popups scroll instead of running off the map."],
  },
  {
    version: "0.1.2.9",
    date: "2026-10-10",
    changes: ["Shops whose schedule is only partly known are marked 'partial', and the map popup always shows what we know about the shop. Weekly night names no longer carry an old date."],
  },
  {
    version: "0.1.2.8",
    date: "2026-10-10",
    changes: ["Schedules added for Kingslayer Games Fountain Valley and Lake Forest (31 weekly nights); new game: Sorcery."],
  },
  {
    version: "0.1.2.7",
    date: "2026-10-10",
    changes: ["Store hours and notes added for It's Time!, JJs Collectibles, Joyful Toad TCG, Junkyard Cards, Kartelles and Collectibles (0 weekly nights; no schedules published)."],
  },
  {
    version: "0.1.2.6",
    date: "2026-10-10",
    changes: ["Schedules added for Haiku POP Gaming & Collectibles (5 weekly nights)."],
  },
  {
    version: "0.1.2.5",
    date: "2026-10-10",
    changes: ["Schedules added for Game Ogre, Gather and Play Cafe (9 weekly nights)."],
  },
  {
    version: "0.1.2.4",
    date: "2026-10-10",
    changes: ["Schedules added for Game n' Grounds, Game Nights (2 weekly nights)."],
  },
  {
    version: "0.1.2.3",
    date: "2026-10-10",
    changes: ["Schedules added for Emerald Knights Comics and Games (11 weekly nights)."],
  },
  {
    version: "0.1.2.2",
    date: "2026-10-10",
    changes: ["Schedules added for Double D20's Cards & Games (0 weekly nights; dated prerelease and RCQ events only)."],
  },
  {
    version: "0.1.2.1",
    date: "2026-10-10",
    changes: ["Schedules added for Comic Quest, Collector Legion (4 weekly nights)."],
  },
  {
    version: "0.1.2.0",
    date: "2026-10-10",
    changes: ["Store hours and notes added for Cardboard Games, Card Cave, Card Game Coliseum, Chrono & Cosmo, Collectible Exchange (0 weekly nights; no schedules published)."],
  },
  {
    version: "0.1.1.9",
    date: "2026-10-10",
    changes: ["Schedules added for Brookhurst Hobbies, BoomLoot (5 weekly nights)."],
  },
  {
    version: "0.1.1.8",
    date: "2026-10-10",
    changes: ["Schedules added for Board Game Paradise, Arcane Maid Cafe (11 weekly nights)."],
  },
  {
    version: "0.1.1.7",
    date: "2026-10-10",
    changes: ["Schedules added for A Hidden Fortress, A.G. Collectibles (0 weekly nights; dated prerelease and release events only)."],
  },
  {
    version: "0.1.1.6",
    date: "2026-10-10",
    changes: ["Riftbound schedules refreshed from the official store locator: 120 new shops, 160 new weekly nights, 36 upcoming special events, 5 prices filled in."],
  },
  {
    version: "0.1.1.5",
    date: "2026-10-10",
    changes: ["Riftbound import skips stores outside Greater Los Angeles."],
  },
  {
    version: "0.1.1.4",
    date: "2026-10-10",
    changes: ["Test rejects two shop rows at one address."],
  },
  {
    version: "0.1.1.3",
    date: "2026-10-10",
    changes: ["Paper Hero's Games added: Sherman Oaks and Santa Monica Blvd weekly nights, fees and upcoming special events; Neuroscape and Cyberpunk TCG added."],
  },
  {
    version: "0.1.1.2",
    date: "2026-10-10",
    changes: ["Data scripts run from a folder path containing spaces."],
  },
  {
    version: "0.1.1.1",
    date: "2026-10-09",
    changes: [
      "First visit now starts with a quick setup: your ZIP and distance, the TCGs you play, and any you want hidden. The calendar no longer opens on every event at once.",
      "With no game picked, the calendar shows your TCGs; 'Show all TCGs' shows everything. Hidden TCGs stay hidden until you unhide them in Settings.",
      "Settings has a per-TCG 'Mine' and 'Hide' switch, and can run setup again. Your choices are remembered in this browser.",
      "Every event now shows what it costs to play, or 'Cost not listed' when the store doesn't say.",
      "The map only shows shops running a game you're looking at.",
    ],
  },
  {
    version: "0.1.1.0",
    date: "2026-10-09",
    changes: ["Internal: a script to pull which LA stores run Bandai games (Gundam, Dragon Ball, One Piece, Union Arena, Digimon), for a one-time map build-out."],
  },
  {
    version: "0.1.0.9",
    date: "2026-10-09",
    changes: ["Beyblade X nights are now on the calendar, with their own filter chip (Bear Cave CCG, Tuesdays 6 PM)."],
  },
  {
    version: "0.1.0.8",
    date: "2026-10-03",
    changes: ["CoreTCG's phone number added, so every shop's events now have a call button."],
  },
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
