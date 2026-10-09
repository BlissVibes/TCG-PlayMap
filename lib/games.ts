/**
 * THE GAME REGISTRY - every TCG the map and calendar know how to label.
 *
 * A closed list on purpose. Every event row carries a `game` id from this
 * table, the filter chips are generated from it, and the colours here are the
 * colours on the map pins and the calendar - so a game that is not listed
 * cannot be half-supported (shown on the calendar but missing from the filter,
 * say). Adding a game is one line here plus a calendar-log entry; the tests in
 * tests/data.test.ts refuse an event whose game id is not in this table.
 *
 * Ids are stable and lowercase because they end up in JSON data and, later,
 * in Firestore documents. Rename the LABEL freely; never rename an id.
 *
 * Colours were picked to be distinguishable from each other as small chips on
 * both the light and dark theme, not to match any publisher's branding.
 */

export interface GameInfo {
  /** Full name, for popups and the log. */
  label: string;
  /** 2-6 characters for a chip in a crowded calendar cell. */
  short: string;
  /** Chip / pin colour. */
  color: string;
}

export const GAMES = {
  pokemon:       { label: "Pokémon TCG",                     short: "PKMN",   color: "#e3b400" },
  mtg:           { label: "Magic: The Gathering",            short: "MTG",    color: "#e0632f" },
  yugioh:        { label: "Yu-Gi-Oh!",                       short: "YGO",    color: "#7b5cd6" },
  onepiece:      { label: "One Piece Card Game",             short: "OP",     color: "#d8262b" },
  lorcana:       { label: "Disney Lorcana",                  short: "LOR",    color: "#3a8fd9" },
  fab:           { label: "Flesh and Blood",                 short: "FAB",    color: "#a3162a" },
  digimon:       { label: "Digimon Card Game",               short: "DIGI",   color: "#2f8f4e" },
  dbs_fusion:    { label: "Dragon Ball Super: Fusion World", short: "DBS FW", color: "#ff8b1f" },
  dbs_masters:   { label: "Dragon Ball Super: Masters",      short: "DBS M",  color: "#b5671a" },
  gundam:        { label: "Gundam Card Game",                short: "GUNDAM", color: "#3d5aa8" },
  grand_archive: { label: "Grand Archive",                   short: "GA",     color: "#1f8a8a" },
  swu:           { label: "Star Wars: Unlimited",            short: "SWU",    color: "#6f7a2e" },
  riftbound:     { label: "Riftbound",                       short: "RIFT",   color: "#b8973a" },
  azuki:         { label: "Azuki TCG",                       short: "AZUKI",  color: "#e4587a" },
  union_arena:   { label: "Union Arena",                     short: "UA",     color: "#5b7fe0" },
  weiss:         { label: "Weiß Schwarz",                    short: "WS",     color: "#8a8f99" },
  cookierun:     { label: "CookieRun: Braverse",             short: "CRB",    color: "#b8743a" },
  hololive:      { label: "hololive OFFICIAL CARD GAME",     short: "HOLO",   color: "#5fb3e6" },
  oshipush:      { label: "OshiPush",                        short: "OSHI",   color: "#c86fc0" },
  naruto:        { label: "Naruto Kayou",                    short: "NARUTO", color: "#e58b1a" },
  palworld:      { label: "Palworld TCG",                    short: "PAL",    color: "#4f9a6e" },
  // Not a card game, listed on purpose (Mark, 2026-10-09: "keep beyblade
  // nights"). Shops run it on the same weekly rota as their TCG nights.
  beyblade:      { label: "Beyblade X",                      short: "BEY",    color: "#475569" },
  other:         { label: "Other",                           short: "OTHER",  color: "#6c7280" },
} as const satisfies Record<string, GameInfo>;

export type GameId = keyof typeof GAMES;

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export function isGameId(x: unknown): x is GameId {
  return typeof x === "string" && x in GAMES;
}

export function gameInfo(id: GameId): GameInfo {
  return GAMES[id];
}
