/**
 * THE DATA SOURCE - one seam between "where the data lives" and everything
 * that reads it.
 *
 * TODAY the data is three committed JSON files under data/ and this module
 * imports them at build time. That is deliberate: it lets the site be a static
 * GitHub Page with nothing to run and nothing to pay for while the shape of
 * the data is still being worked out by hand.
 *
 * LATER (docs/ROADMAP.md, phase 2) the same three collections move to
 * Firestore - `shops`, `events`, `calendar_log`, document ids equal to the
 * `id` fields here - and a second DataSource reads them. The UI only ever
 * calls `getDataSource().load()`, so the switch is one line in this file and
 * zero lines anywhere else. That is the entire reason this indirection exists
 * for what is currently three imports.
 *
 * `validateData` is the guard both sources share. Every failure mode listed in
 * Collectify's docs/FEED_FAILURES.md was "the read succeeded and returned
 * something wrong" - a row with a game nobody spelled right, a shop at (0,0),
 * an event pointing at a shop id that was renamed. The tests run it against
 * the committed JSON; the Firestore source will run it against every read.
 */

import { isGameId } from "./games";
import { isDateStr, isTimeStr, type PlayEvent, type Shop } from "./schedule";
import SHOPS from "@/data/shops.json";
import EVENTS from "@/data/events.json";
import LOG from "@/data/calendar_log.json";

/**
 * One line of the CALENDAR LOG: what changed on the calendar, for which game,
 * at which shop, and when we learned of it. This is the user-facing history
 * Mark asked for - separate from the site's code changelog (lib/version.ts) -
 * so a player can see that "Lorcana moved from Tuesday to Wednesday at RWT"
 * without reading commit messages.
 */
export interface CalendarLogEntry {
  /** YYYY-MM-DD the change was recorded. */
  date: string;
  action: "added" | "removed" | "changed" | "note";
  /** Game affected, or null for shop-level entries (new shop, closed shop). */
  game: string | null;
  shopId: string;
  summary: string;
}

export interface PlayMapData {
  shops: Shop[];
  events: PlayEvent[];
  log: CalendarLogEntry[];
}

export interface DataSource {
  load(): Promise<PlayMapData>;
}

/** Problems found in a data set. Empty means valid. */
export function validateData(data: PlayMapData): string[] {
  const errs: string[] = [];
  const shopIds = new Set<string>();
  for (const s of data.shops) {
    const at = `shop ${s.id ?? "?"}`;
    if (!s.id || !/^[a-z0-9-]+$/.test(s.id)) errs.push(`${at}: id must be a lowercase slug`);
    if (shopIds.has(s.id)) errs.push(`${at}: duplicate id`);
    shopIds.add(s.id);
    if (!s.name) errs.push(`${at}: missing name`);
    if (typeof s.lat !== "number" || typeof s.lon !== "number"
      || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)
      || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180
      || (s.lat === 0 && s.lon === 0)) errs.push(`${at}: bad coordinates`);
    if (!/^\d{5}$/.test(s.zip)) errs.push(`${at}: zip must be 5 digits`);
    if (!s.tz) errs.push(`${at}: missing tz`);
    if (typeof s.active !== "boolean") errs.push(`${at}: active must be boolean`);
    if (!s.source || !isDateStr(s.source.checked)) errs.push(`${at}: source.checked must be YYYY-MM-DD`);
    for (const g of s.games ?? []) if (!isGameId(g)) errs.push(`${at}: unknown game ${g}`);
  }
  const eventIds = new Set<string>();
  for (const e of data.events) {
    const at = `event ${e.id ?? "?"}`;
    if (!e.id) errs.push(`${at}: missing id`);
    if (eventIds.has(e.id)) errs.push(`${at}: duplicate id`);
    eventIds.add(e.id);
    if (!shopIds.has(e.shopId)) errs.push(`${at}: unknown shopId ${e.shopId}`);
    if (!isGameId(e.game)) errs.push(`${at}: unknown game ${e.game}`);
    if (e.kind !== "play" && e.kind !== "tournament") errs.push(`${at}: kind must be play|tournament`);
    const hasWeekday = e.weekday != null, hasDate = e.date != null;
    if (hasWeekday === hasDate) errs.push(`${at}: set exactly one of weekday / date`);
    if (hasWeekday && (!Number.isInteger(e.weekday) || e.weekday! < 0 || e.weekday! > 6)) errs.push(`${at}: weekday must be 0-6`);
    if (hasDate && !isDateStr(e.date)) errs.push(`${at}: date must be YYYY-MM-DD`);
    if (!isTimeStr(e.start)) errs.push(`${at}: start must be HH:MM`);
    if (e.end != null && !isTimeStr(e.end)) errs.push(`${at}: end must be HH:MM`);
    if (e.validFrom != null && !isDateStr(e.validFrom)) errs.push(`${at}: validFrom must be YYYY-MM-DD`);
    if (e.validUntil != null && !isDateStr(e.validUntil)) errs.push(`${at}: validUntil must be YYYY-MM-DD`);
    for (const d of e.skipDates ?? []) if (!isDateStr(d)) errs.push(`${at}: skipDate ${d} must be YYYY-MM-DD`);
    if (e.everyWeeks != null) {
      if (!Number.isInteger(e.everyWeeks) || e.everyWeeks < 2 || e.everyWeeks > 8) errs.push(`${at}: everyWeeks must be an integer 2-8`);
      if (!hasWeekday || !e.validFrom) errs.push(`${at}: everyWeeks needs a weekday and a validFrom to count from`);
    }
    if (!["verified", "scraped", "unverified"].includes(e.confidence)) errs.push(`${at}: bad confidence`);
  }
  for (const [i, l] of data.log.entries()) {
    const at = `log[${i}]`;
    if (!isDateStr(l.date)) errs.push(`${at}: date must be YYYY-MM-DD`);
    if (!["added", "removed", "changed", "note"].includes(l.action)) errs.push(`${at}: bad action`);
    if (l.game != null && !isGameId(l.game)) errs.push(`${at}: unknown game ${l.game}`);
    if (!shopIds.has(l.shopId)) errs.push(`${at}: unknown shopId ${l.shopId}`);
    if (!l.summary) errs.push(`${at}: missing summary`);
  }
  return errs;
}

/** The committed-JSON source. What the GitHub Page runs on. */
export const jsonDataSource: DataSource = {
  async load() {
    return {
      shops: SHOPS as Shop[],
      events: EVENTS as PlayEvent[],
      log: LOG as CalendarLogEntry[],
    };
  },
};

/**
 * The one place that decides where data comes from. When the Firestore source
 * exists, it is selected here (by NEXT_PUBLIC_DATA_SOURCE) and nowhere else.
 */
export function getDataSource(): DataSource {
  return jsonDataSource;
}
