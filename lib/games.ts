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
 * Ids are stable and lowercase because they end up in JSON data and in
 * visitors' saved preferences. Rename the LABEL freely; never rename an id.
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
  // White, at Mark's request (2026-10-13). chipVars() gives it dark text and a grey edge.
  mtg:           { label: "Magic: The Gathering",            short: "MTG",    color: "#ffffff" },
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
  // Purple, at Mark's request (2026-10-13); kept clear of Yu-Gi-Oh!'s blue-violet and Vanguard's dark purple.
  riftbound:     { label: "Riftbound",                       short: "RIFT",   color: "#a33ad6" },
  azuki:         { label: "Azuki TCG",                       short: "AZUKI",  color: "#e4587a" },
  union_arena:   { label: "Union Arena",                     short: "UA",     color: "#5b7fe0" },
  weiss:         { label: "Weiß Schwarz",                    short: "WS",     color: "#8a8f99" },
  cookierun:     { label: "CookieRun: Braverse",             short: "CRB",    color: "#b8743a" },
  hololive:      { label: "hololive OFFICIAL CARD GAME",     short: "HOLO",   color: "#5fb3e6" },
  oshipush:      { label: "OshiPush",                        short: "OSHI",   color: "#c86fc0" },
  naruto:        { label: "Naruto Kayou",                    short: "NARUTO", color: "#e58b1a" },
  palworld:      { label: "Palworld TCG",                    short: "PAL",    color: "#4f9a6e" },
  neuroscape:    { label: "Neuroscape TCG",                  short: "NEURO",  color: "#12a4c4" },
  sorcery:       { label: "Sorcery: Contested Realm",        short: "SORC",   color: "#6b4423" },
  cyberpunk:     { label: "Cyberpunk TCG",                   short: "CYBER",  color: "#b6d400" },
  godzilla:      { label: "Godzilla Card Game",              short: "GODZ",   color: "#2e7d32" },
  universus:     { label: "UniVersus",                       short: "UVS",    color: "#c2185b" },
  ultraman:      { label: "Ultraman Card Game",              short: "ULTRA",  color: "#e53935" },
  vanguard:      { label: "Cardfight!! Vanguard",            short: "CFV",    color: "#6a1b9a" },
  shadowverse:   { label: "Shadowverse: Evolve",             short: "SVE",    color: "#00897b" },
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

/** WCAG relative luminance of a #rrggbb colour, 0 (black) .. 1 (white). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0;
  const lin = (c: string) => { const v = parseInt(c, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
}

/**
 * THE CSS VARIABLES THAT PAINT A GAME CHIP. Every surface that colours by
 * game (filter chips, calendar blocks, month chips, the map popup, settings)
 * sets these three instead of a bare `--chip`, so a light colour cannot
 * silently become white-on-white:
 *   --chip       the fill;
 *   --chip-ink   text on the fill: dark on a near-white fill (Magic), else white;
 *   --chip-edge  the outline / block accent: grey for a near-white fill, which
 *                would otherwise vanish on the light theme; else the fill.
 * The thresholds only catch very light colours, so every other game keeps
 * the look it had.
 */
export function chipVars(id: GameId): Record<string, string> {
  const color = GAMES[id].color;
  const l = luminance(color);
  return {
    "--chip": color,
    "--chip-ink": l > 0.6 ? "#1a1d23" : "#fff",
    "--chip-edge": l > 0.85 ? "#9aa3b2" : color,
  };
}

/** The same, as an inline `style` string, for HTML built outside React (map popups). */
export function chipVarsCss(id: GameId): string {
  return Object.entries(chipVars(id)).map(([k, v]) => `${k}:${v}`).join(";");
}
