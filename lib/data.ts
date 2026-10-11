/**
 * THE DATA SOURCE - one seam between "where the data lives" and everything
 * that reads it.
 *
 * The data is three JSON files committed under data/. Until 0.1.6.3 this
 * module imported them, which compiled every shop and event into the page's
 * JavaScript: 837 KB (112 KB gzipped) at 184 shops, growing with every
 * research batch. Now the build copies them to /data/*.json
 * (scripts/copy_data.mjs) and the page FETCHES them at runtime. The UI only
 * ever calls `getDataSource().load()`, so that change was this file and the
 * page's loading / error states.
 *
 * `validateData` runs on every load, not only in the tests. Every failure
 * mode in Collectify's docs/FEED_FAILURES.md was "the read succeeded and
 * returned something wrong" - a row with a game nobody spelled right, a shop
 * at (0,0), an event pointing at a renamed shop id. And a load that fails, or
 * comes back empty, THROWS: the page shows an error with a retry. It must
 * never draw an empty map and call it the truth (CLAUDE.md rule 6).
 *
 * This file imports no data. Tests and build-time code that want the committed
 * files directly use lib/dataCommitted.ts.
 */

import { isGameId } from "./games";
import { isDateStr, isTimeStr, type PlayEvent, type Shop } from "./schedule";

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

/**
 * The day the data last changed: the newest date in the calendar log, which
 * gets a line for every shop or night added, moved or removed. Since
 * 2026-10-10 a data update does not move the site version, so this is how a
 * visitor (and whoever is checking a deploy) sees how fresh the schedules are.
 * Null when the log has no usable date.
 */
export function dataUpdated(log: readonly Pick<CalendarLogEntry, "date">[]): string | null {
  let newest: string | null = null;
  for (const l of log) if (isDateStr(l.date) && (newest == null || l.date > newest)) newest = l.date;
  return newest;
}

/** A load that failed, came back empty, or failed validation. `message` is for the visitor. */
export class DataLoadError extends Error {
  /** Detail for the console, never shown: URLs, statuses, validation lines. */
  detail: string;
  constructor(message: string, detail = "") { super(message); this.name = "DataLoadError"; this.detail = detail; }
}

/**
 * Turn three fetched payloads into usable data, or throw. "The request
 * succeeded" is not enough: each must be an array, there must be shops and
 * events, and the set must pass validateData.
 */
export function checkLoaded(raw: { shops: unknown; events: unknown; log: unknown }): PlayMapData {
  for (const k of ["shops", "events", "log"] as const) {
    if (!Array.isArray(raw[k])) throw new DataLoadError("The schedule data did not load properly.", `${k} is not an array`);
  }
  const data = raw as PlayMapData;
  if (data.shops.length === 0 || data.events.length === 0) {
    throw new DataLoadError("The schedule data came back empty.", `${data.shops.length} shops, ${data.events.length} events`);
  }
  const errs = validateData(data);
  if (errs.length) throw new DataLoadError("The schedule data failed its checks.", errs.slice(0, 20).join("; "));
  return data;
}

/**
 * The data as static files next to the page: `<base>/data/shops.json?v=<stamp>`
 * and friends. `stamp` is the build's hash of the data (scripts/copy_data.mjs),
 * so a cached copy from an older build is never paired with this page.
 */
export function fetchDataSource(base: string, stamp: string, fetchImpl: typeof fetch = fetch): DataSource {
  const url = (name: string) => `${base}/data/${name}.json${stamp ? `?v=${stamp}` : ""}`;
  const get = async (name: string): Promise<unknown> => {
    let res: Response;
    try { res = await fetchImpl(url(name)); }
    catch (e) { throw new DataLoadError("Could not reach the schedule data. Check your connection.", `${url(name)}: ${String(e)}`); }
    if (!res.ok) throw new DataLoadError("Could not load the schedule data.", `${url(name)}: HTTP ${res.status}`);
    try { return await res.json(); }
    catch (e) { throw new DataLoadError("The schedule data did not load properly.", `${url(name)}: ${String(e)}`); }
  };
  return {
    async load() {
      const [shops, events, log] = await Promise.all([get("shops"), get("events"), get("calendar_log")]);
      return checkLoaded({ shops, events, log });
    },
  };
}

/** The one place that decides where data comes from. */
export function getDataSource(): DataSource {
  return fetchDataSource(process.env.NEXT_PUBLIC_BASE_PATH || "", process.env.NEXT_PUBLIC_DATA_STAMP || "");
}
