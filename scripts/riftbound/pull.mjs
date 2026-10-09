#!/usr/bin/env node
/**
 * PULL RIFTBOUND STORES + EVENTS FROM THE OFFICIAL LOCATOR API.
 *
 *   node scripts/riftbound/pull.mjs [--out data/candidates/riftbound-locator.json]
 *        [--back 35] [--ahead 56]
 *
 * The Riftbound store locator (locator.riftbound.uvsgames.com) is backed by an
 * open JSON API on api.riftbound.uvsgames.com: no login, no key. Its robots
 * rules allow everything but player profiles (docs/SOURCES.md). This script
 * reads it politely - 1.5 s between requests, a hard request cap - across
 * fourteen search centres that between them cover Greater LA (LA, Orange,
 * Ventura counties and the western Inland Empire; the last four added no new
 * stores in the 2026-10-09 survey, so coverage is believed complete).
 *
 * It does NOT touch data/shops.json or data/events.json. It writes a candidate
 * file - every store with its RECURRING weekly slots (same weekday + local
 * time seen at least twice in the window, still running) and its upcoming
 * one-off/special events - and scripts/candidates/merge.mjs decides what that
 * means for the calendar. Pull and merge are separate so a bad pull can be
 * inspected before it changes anything.
 *
 * Cost is first-class: events carry `cost_in_cents`, and every slot records
 * the fee players pay ("$10", "Free", or null when the store entered none).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const API = "https://api.riftbound.uvsgames.com/api/v2";
const LOCATOR = "https://locator.riftbound.uvsgames.com";
const GAME_ID = 3;            // Riftbound in the locator's game table
const PAUSE_MS = 1500, MAX_REQUESTS = 200;

/** Search centres: [name, lat, lon, miles]. Overlap is deliberate; stores and
 *  events are de-duplicated by id. */
export const CENTRES = [
  ["los-angeles", 34.05, -118.25, 25], ["san-fernando-valley", 34.2, -118.5, 20],
  ["orange-county", 33.75, -117.87, 25], ["south-orange-county", 33.6, -117.68, 15],
  ["inland-empire", 34.06, -117.6, 25], ["riverside", 33.95, -117.4, 15],
  ["san-bernardino", 34.1, -117.29, 15], ["san-gabriel-valley", 34.1, -117.95, 15],
  ["south-bay", 33.8, -118.25, 15], ["antelope-valley", 34.62, -118.15, 20],
  ["santa-clarita", 34.42, -118.55, 15], ["ventura", 34.27, -119.23, 15],
  ["oxnard", 34.2, -119.18, 12], ["malibu", 34.04, -118.75, 12],
];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** One-offs that matter to players: everything that is not the weekly local. */
export const SPECIAL = /skirmish|regional|qualifier|championship|pre-?rift|pre-?release|release|launch|rebound|sealed|draft|trial|cup|convention|super nexus|2v2|team|trios|learn[- ]to[- ]play/i;
/** Weekly events that are casual rather than competitive (no trophy). */
export const CASUAL = /open play|casual|meet-?up|learn[- ]to[- ]play|hangout|free play/i;

// ── helpers ──────────────────────────────────────────────────────────────────
const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k]; return null; };

/** "4116 Burbank Blvd, Burbank, CA 91505, USA" -> parts. */
export function splitAddress(full) {
  if (!full) return { address: null, city: null, state: null, zip: null };
  // Some stores type their address on several lines; treat line breaks as commas.
  const parts = String(full).split(/,|\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (/^(USA|US|United States)$/i.test(parts.at(-1) ?? "")) parts.pop();
  // "…, Orange, CA, 92869" - state and ZIP as separate parts: rejoin them.
  if (/^\d{5}(-\d{4})?$/.test(parts.at(-1) ?? "") && /^[A-Z]{2}$/.test(parts.at(-2) ?? "")) {
    const zip = parts.pop(); parts[parts.length - 1] += ` ${zip}`;
  }
  const m = /^([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/.exec(parts.at(-1) ?? "");
  // "…, Northridge 91324" - city and ZIP, no state (the caller fills state in).
  const cz = !m && /^(.*?)\s+(\d{5})(?:-\d{4})?$/.exec(parts.at(-1) ?? "");
  if (cz) { parts.pop(); return { address: parts.join(", ") || null, city: cz[1], state: null, zip: cz[2] }; }
  if (!m) return { address: parts.slice(0, -1).join(", ") || null, city: parts.at(-1) ?? null, state: null, zip: null };
  parts.pop();
  const city = parts.pop() ?? null;
  return { address: parts.join(", ") || null, city, state: m[1], zip: m[2] };
}

/** cents -> "$10" / "$12.50" / "Free"; null when the store entered no cost. */
export function feeText(cents) {
  if (cents == null) return null;
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "Free";
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}

/** Local date / weekday / HH:MM for an ISO instant in a time zone. */
export function local(iso, tz = "America/Los_Angeles") {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WEEKDAY.indexOf(p.weekday), time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

const mostCommon = (xs) => {
  const c = new Map(); for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * Turn raw locator events into per-store recurring slots + upcoming specials.
 * A slot is RECURRING when its weekday+time occurred at least twice in the
 * window and its latest occurrence is no more than 21 days before `today`
 * (a series that stopped a month ago is not a weekly night any more).
 */
export function buildSlots(events, today) {
  const byStore = new Map();
  for (const e of events) {
    if (e.event_is_online || e.is_test_event || e.is_template) continue;
    if (e.event_status && /cancel/i.test(e.event_status)) continue;
    const storeId = e.store?.id; if (storeId == null) continue;
    const when = local(e.start_datetime, e.timezone || "America/Los_Angeles");
    const name = String(e.name ?? "").trim();
    const special = SPECIAL.test(name) || (e.event_type && e.event_type !== "LOCALS");
    const row = { id: e.id, ...when, name, desc: String(e.description ?? ""), fee: feeText(e.cost_in_cents), special };
    if (!byStore.has(storeId)) byStore.set(storeId, []);
    byStore.get(storeId).push(row);
  }
  const cutoff = addDays(today, -21);
  const out = new Map();
  for (const [storeId, rows] of byStore) {
    const slots = new Map();
    for (const r of rows.filter((x) => !x.special)) {
      const k = `${r.weekday}@${r.time}`;
      if (!slots.has(k)) slots.set(k, []);
      slots.get(k).push(r);
    }
    const recurring = [];
    const used = new Set();
    for (const [k, rs] of slots) {
      const dates = [...new Set(rs.map((r) => r.date))].sort();
      if (dates.length < 2 || dates.at(-1) < cutoff) continue;
      rs.forEach((r) => used.add(r.id));
      const latest = rs.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
      const title = mostCommon(rs.map((r) => r.name));
      recurring.push({
        weekday: rs[0].weekday, time: rs[0].time, seen: dates.length, dates,
        firstSeen: dates[0], lastSeen: dates.at(-1),
        title, fee: mostCommon(rs.map((r) => r.fee)),
        kind: CASUAL.test(`${title} ${latest.desc}`) ? "play" : "tournament",
        eventUrl: `${LOCATOR}/events/${latest.id}`,
      });
    }
    const special = rows
      .filter((r) => !used.has(r.id) && r.date >= today)
      .map((r) => ({
        date: r.date, time: r.time, title: r.name, fee: r.fee,
        kind: CASUAL.test(`${r.name} ${r.desc}`) ? "play" : "tournament",
        special: r.special, eventUrl: `${LOCATOR}/events/${r.id}`,
      }))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    out.set(storeId, { recurring: recurring.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)), special });
  }
  return out;
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── network ──────────────────────────────────────────────────────────────────
let requests = 0;
async function getJson(url) {
  if (requests >= MAX_REQUESTS) throw new Error(`request cap (${MAX_REQUESTS}) reached - refusing to continue`);
  if (requests > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  requests++;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "tcg-playmap/0.1 (+https://github.com/BlissVibes/TCG-PlayMap)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function pagedAll(firstUrl) {
  const out = []; let url = firstUrl;
  while (url) {
    const d = await getJson(url);
    out.push(...(d.results ?? []));
    // `next` is the next PAGE NUMBER on this API (not a URL, unlike DRF's default).
    if (d.next == null || d.next === "") url = null;
    else if (/^https?:/.test(String(d.next))) url = String(d.next);
    else { const u = new URL(url); u.searchParams.set("page", String(d.next)); url = u.toString(); }
  }
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const out = arg("out", "data/candidates/riftbound-locator.json");
  const today = local(new Date().toISOString()).date;
  const from = addDays(today, -Number(arg("back", "35"))), to = addDays(today, Number(arg("ahead", "56")));

  const stores = new Map();   // numeric store id -> record
  const events = new Map();
  for (const [name, lat, lon, mi] of CENTRES) {
    const gs = await pagedAll(`${API}/game-stores/?game_id=${GAME_ID}&latitude=${lat}&longitude=${lon}&num_miles=${mi}&page_size=100&page=1`);
    for (const g of gs) if (g.store?.id != null) stores.set(g.store.id, { uuid: g.id, ...g.store });
    const ev = await pagedAll(`${API}/events/?game_slug=riftbound&latitude=${lat}&longitude=${lon}&num_miles=${mi}&start_date_after=${from}T00:00:00Z&start_date_before=${to}T23:59:59Z&page_size=100&page=1`);
    for (const e of ev) { delete e.full_header_image_url; events.set(e.id, e); }
    console.log(`${name}: ${gs.length} stores, ${ev.length} events (totals ${stores.size} / ${events.size})`);
  }

  // A store can appear only through its events (not in a centre's store list):
  for (const e of events.values()) {
    const s = e.store; if (s?.id != null && !stores.has(s.id)) stores.set(s.id, { uuid: null, ...s });
  }

  const slots = buildSlots([...events.values()], today);
  const rows = [...stores.values()].filter((s) => !/\btest(ing)? store\b/i.test(String(s.name))).map((s) => {
    const parts = splitAddress(pick(s, "full_address", "address"));
    const sl = slots.get(s.id) ?? { recurring: [], special: [] };
    return {
      sourceId: s.uuid ?? `store-${s.id}`, storeNumber: s.id,
      name: String(s.name ?? "").trim(), ...parts,
      state: parts.state ?? pick(s, "state") ?? null,
      lat: Number(pick(s, "latitude")) || null, lng: Number(pick(s, "longitude")) || null,
      phone: pick(s, "phone_number", "preferred_contact_phone"),
      website: pick(s, "website"),
      socials: Object.fromEntries(Object.entries({
        discord: pick(s, "discord_url"), facebook: pick(s, "facebook_url"),
        instagram: pick(s, "instagram_url"), x: pick(s, "twitter_url", "twitter_handle"),
      }).filter(([, v]) => v)),
      sourceUrl: s.uuid ? `${LOCATOR}/stores/${s.uuid}` : null,
      game: "riftbound", recurring: sl.recurring, special: sl.special,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    source: "riftbound-locator", pulled: today, window: { from, to },
    requests, storeCount: rows.length, eventCount: events.size,
    storesWithWeekly: rows.filter((r) => r.recurring.length).length, stores: rows,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n${rows.length} stores (${payload.storesWithWeekly} with a weekly night), ${events.size} events, ${requests} requests -> ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
}
