/**
 * PER-BROWSER PREFERENCES, in localStorage.
 *
 * Everything a visitor sets - their ZIP, radius, game filter, theme, and the
 * blocks they picked for "My calendar" - is remembered here so the site opens
 * the way they left it. localStorage is the whole persistence layer for now.
 *
 * WHEN ACCOUNTS ARRIVE (docs/ROADMAP.md, phase 4) the same shape is what gets
 * saved to the user's document: `myEvents` in particular is the personal
 * calendar Mark wants signed-in users to keep across devices. Keep this
 * object serialisable and keep the keys stable so a local calendar can be
 * uploaded on first sign-in rather than thrown away.
 *
 * Every read is defensive. localStorage is user-editable and can be blocked
 * (private windows), so a junk or missing value falls back to the default and
 * never takes the page down with it.
 */

import { DEFAULT_RADIUS_MI, normalizeRadius, type GeoOrigin } from "./geo";
import { isGameId, type GameId } from "./games";
import type { EventKind } from "./schedule";

export interface Prefs {
  zip: string;
  origin: GeoOrigin | null;
  radiusMi: number;
  games: GameId[];
  kind: EventKind | null;
  /** Event ids the visitor picked for their own calendar. */
  myEvents: string[];
  /** Grey out everything not in myEvents. */
  myOnly: boolean;
  /** Show "12.4 mi" next to the shop on calendar blocks (when a ZIP is set). */
  showDistance: boolean;
  theme: "light" | "dark";
}

const KEY = "tcg-playmap:prefs:v1";

export const DEFAULT_PREFS: Prefs = {
  zip: "", origin: null, radiusMi: DEFAULT_RADIUS_MI, games: [], kind: null,
  myEvents: [], myOnly: false, showDistance: true, theme: "light",
};

/** Coerce anything that came out of storage into a valid Prefs. Exported for tests. */
export function sanitizePrefs(raw: unknown): Prefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const origin = p.origin as Partial<GeoOrigin> | null | undefined;
  const okOrigin = origin && typeof origin.lat === "number" && typeof origin.lon === "number"
    && Number.isFinite(origin.lat) && Number.isFinite(origin.lon) && typeof origin.label === "string";
  return {
    zip: typeof p.zip === "string" ? p.zip : "",
    origin: okOrigin ? { lat: origin.lat!, lon: origin.lon!, label: origin.label! } : null,
    radiusMi: normalizeRadius(p.radiusMi),
    games: Array.isArray(p.games) ? p.games.filter(isGameId) : [],
    kind: p.kind === "play" || p.kind === "tournament" ? p.kind : null,
    myEvents: Array.isArray(p.myEvents) ? p.myEvents.filter((x): x is string => typeof x === "string") : [],
    myOnly: p.myOnly === true,
    showDistance: p.showDistance !== false,
    theme: p.theme === "dark" ? "dark" : "light",
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // First visit: follow the OS theme once, then remember whatever they pick.
      const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      return { ...DEFAULT_PREFS, theme: dark ? "dark" : "light" };
    }
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage blocked. The page still works; it just forgets on reload.
  }
}
