/**
 * THE SCHEDULE MODEL - shops, the events they host, and turning a weekly
 * pattern into dated occurrences for whatever window the calendar shows.
 *
 * Two kinds of event share one type:
 *  - RECURRING: `weekday` is set. "Pokémon, Thursdays, 6 PM." This is almost
 *    every row, which is why the calendar defaults to a one-week view - a
 *    month of a weekly schedule is the same week four times.
 *  - ONE-OFF: `date` is set. A pre-release, a regional, a box tournament.
 *
 * A recurring row can be bounded (`validFrom` / `validUntil`) and can skip
 * dates (`skipDates`) - a shop closed for a holiday, a week the store runs a
 * regional instead. Bounding is how a schedule CHANGE is recorded without
 * losing history: end the old row, start the new one, log both in the
 * calendar log. Never edit a row's weekday or time in place once it has been
 * published; the log has to be able to say what the calendar used to say.
 *
 * Everything here is pure and date-string based ("YYYY-MM-DD"). All shops are
 * in one time zone today (America/Los_Angeles) and the calendar shows local
 * store time, so no instant math is needed and none is done. When the data
 * spans time zones (docs/ROADMAP.md, phase 3), the shop's `tz` field is where
 * that work starts.
 */

import { type GameId } from "./games";
import { distanceMi, withinRadius, type GeoOrigin } from "./geo";

/** 0 = Sunday .. 6 = Saturday, matching JavaScript's Date#getDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * "play" is casual / open play - show up and find a game. "tournament" is
 * organised, usually with an entry fee and prizing. The trophy icon on the map
 * and the calendar means exactly `kind === "tournament"` and nothing else.
 */
export type EventKind = "play" | "tournament";

/**
 * How much to trust a row. Rendered as a small mark on the calendar so a
 * reader can tell "the store told us" from "we read it off their website".
 *  - verified:   confirmed with the store, or Mark saw it in person.
 *  - scraped:    read from the store's own website or a play-network locator.
 *  - unverified: second-hand (a search summary, a reddit post, memory).
 */
export type Confidence = "verified" | "scraped" | "unverified";

export interface SourceRef {
  url?: string;
  /** YYYY-MM-DD the source was last checked. */
  checked: string;
  note?: string;
}

export interface Shop {
  /** Stable slug. Ends up in URLs and, later, as the Firestore document id. */
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lon: number;
  tz: string;
  website?: string;
  phone?: string;
  socials?: { facebook?: string; instagram?: string; discord?: string; threads?: string; x?: string };
  /** Free text, exactly as the store publishes it. */
  hours?: string;
  /** Games the store supports (stock, singles, space) even when no event row says so. */
  games?: GameId[];
  notes?: string;
  active: boolean;
  source: SourceRef;
}

export interface PlayEvent {
  id: string;
  shopId: string;
  game: GameId;
  kind: EventKind;
  /** "Friday Night Magic", "Commander pods", "Reality Fracture Pre-release". */
  title?: string;
  /** Recurring: set exactly one of weekday / date. */
  weekday?: Weekday;
  date?: string;
  /** 24h "HH:MM" in the shop's local time. */
  start: string;
  end?: string;
  /** Free text: "$10", "$5 (includes pack)", "Free". */
  fee?: string;
  format?: string;
  notes?: string;
  validFrom?: string;
  validUntil?: string;
  skipDates?: string[];
  confidence: Confidence;
  source?: SourceRef;
}

/** One dated instance of an event, joined to its shop, with distance if known. */
export interface Occurrence {
  event: PlayEvent;
  shop: Shop;
  /** YYYY-MM-DD */
  date: string;
  distanceMi: number | null;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Local-midnight Date for a date string. Never parses via `new Date(str)`,
 *  which would read the string as UTC and shift the day in Los Angeles. */
export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isDateStr(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDateStr(s);
  return toDateStr(d) === s;
}

export function addDays(s: string, n: number): string {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function weekdayOf(s: string): Weekday {
  return parseDateStr(s).getDay() as Weekday;
}

/** The Sunday on or before `s`. Weeks run Sunday-Saturday (US calendar). */
export function startOfWeek(s: string): string {
  return addDays(s, -weekdayOf(s));
}

/** Seven date strings starting at the week containing `s`. */
export function weekDates(s: string): string[] {
  const start = startOfWeek(s);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * A month as a grid of whole weeks: the first row starts on the Sunday on or
 * before the 1st, the last row ends on the Saturday on or after the last day.
 * Rows are arrays of 7 date strings; `inMonth` tells the renderer which cells
 * to dim.
 */
export function monthGrid(year: number, month1: number): { date: string; inMonth: boolean }[][] {
  const first = `${year}-${String(month1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1, 0).getDate();
  const last = `${year}-${String(month1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  let cursor = startOfWeek(first);
  const end = addDays(last, 6 - weekdayOf(last));
  const rows: { date: string; inMonth: boolean }[][] = [];
  while (cursor <= end) {
    const row: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      row.push({ date: cursor, inMonth: cursor.slice(0, 7) === first.slice(0, 7) });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }
  return rows;
}

export const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"] as const;

/** "18:00" -> "6:00 PM". Tolerates "6pm"-style data by passing it through. */
export function formatTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const h = Number(m[1]), min = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

export function isTimeStr(t: unknown): t is string {
  if (typeof t !== "string") return false;
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

// ─── Expansion ────────────────────────────────────────────────────────────────

/** Does this event happen on this date? (Ignores the shop's active flag.) */
export function occursOn(ev: PlayEvent, date: string): boolean {
  if (ev.date) return ev.date === date;
  if (ev.weekday == null) return false;
  if (weekdayOf(date) !== ev.weekday) return false;
  if (ev.validFrom && date < ev.validFrom) return false;
  if (ev.validUntil && date > ev.validUntil) return false;
  if (ev.skipDates?.includes(date)) return false;
  return true;
}

/**
 * Every occurrence in [from, to], inclusive, sorted by date then start time
 * then shop name. Events whose shop is missing or inactive are dropped: a
 * closed store's Thursday Pokémon must not keep appearing because its rows
 * were never deleted.
 */
export function occurrencesInRange(
  events: PlayEvent[],
  shops: Shop[],
  from: string,
  to: string,
  origin: GeoOrigin | null = null,
): Occurrence[] {
  const byId = new Map(shops.map((s) => [s.id, s]));
  const out: Occurrence[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const ev of events) {
      const shop = byId.get(ev.shopId);
      if (!shop || !shop.active) continue;
      if (!occursOn(ev, d)) continue;
      out.push({ event: ev, shop, date: d, distanceMi: distanceMi(origin, shop.lat, shop.lon) });
    }
  }
  out.sort((a, b) =>
    a.date.localeCompare(b.date)
    || a.event.start.localeCompare(b.event.start)
    || a.shop.name.localeCompare(b.shop.name));
  return out;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export interface ScheduleFilter {
  origin: GeoOrigin | null;
  radiusMi: number;
  /** Empty set = every game. */
  games: ReadonlySet<GameId>;
  /** null = both. */
  kind: EventKind | null;
}

export const EMPTY_FILTER: ScheduleFilter = {
  origin: null, radiusMi: 25, games: new Set(), kind: null,
};

export function shopPassesFilter(shop: Shop, f: ScheduleFilter): boolean {
  return withinRadius(f.origin, shop.lat, shop.lon, f.radiusMi);
}

export function occurrencePassesFilter(o: Occurrence, f: ScheduleFilter): boolean {
  if (!shopPassesFilter(o.shop, f)) return false;
  if (f.games.size > 0 && !f.games.has(o.event.game)) return false;
  if (f.kind && o.event.kind !== f.kind) return false;
  return true;
}

export function filterOccurrences(occs: Occurrence[], f: ScheduleFilter): Occurrence[] {
  return occs.filter((o) => occurrencePassesFilter(o, f));
}

/** Group occurrences by date string, preserving order within each day. */
export function groupByDate(occs: Occurrence[]): Map<string, Occurrence[]> {
  const m = new Map<string, Occurrence[]>();
  for (const o of occs) {
    const arr = m.get(o.date);
    if (arr) arr.push(o); else m.set(o.date, [o]);
  }
  return m;
}
