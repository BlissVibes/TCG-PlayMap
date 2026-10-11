#!/usr/bin/env node
/**
 * PULL DISNEY LORCANA STORES + EVENTS FROM RAVENSBURGER PLAY.
 *
 *   node scripts/lorcana/pull.mjs [--out data/candidates/lorcana-ravensburger.json]
 *        [--back 35] [--ahead 56]
 *
 * Ravensburger Play (tcg.ravensburgerplay.com) runs on the same Carde.io
 * platform as the Riftbound locator, and its API has the same shape, so this
 * script reuses scripts/riftbound/pull.mjs's slot builder and writes the same
 * candidate file format. scripts/candidates/merge.mjs then decides what the
 * pull means for the calendar. This script never touches data/shops.json or
 * data/events.json.
 *
 * TERMS. Carde.io's terms forbid scripted access (docs/SOURCES.md, the
 * Carde.io row, quotes s3(5) and s8). Mark's decision, 2026-10-10: pull
 * anyway, LIGHTLY. What that means here, and none of it is optional:
 *   - run by hand, never on a schedule, never more than weekly;
 *   - ONE search over the region (the importer's DEFAULT_REGION circle), not
 *     overlapping centres: every page is fetched once;
 *   - PAUSE_MS between requests, a hard MAX_REQUESTS cap;
 *   - no retries. Any HTTP error stops the run and writes nothing, so a
 *     struggling or refusing server is never hit again by this process.
 * If the API starts refusing, stop and tell Mark; do not work around it.
 *
 * Differences from Riftbound that matter:
 *   - The events endpoint returns EVERY game on the platform unless filtered,
 *     so the game is filtered by slug in the request and checked again on
 *     each row (game_type).
 *   - Times are converted in the store's zone (Los Angeles for this region),
 *     not the zone typed on the event: a few events here carry
 *     America/New_York and would land three hours off.
 *   - Lorcana stores run weekly Draft and Sealed, so those are weekly nights
 *     here, and each slot records its format (Core Constructed, Draft, ...).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isMain } from "../lib/isMain.mjs";
import { addDays, buildSlots, local, splitAddress } from "../riftbound/pull.mjs";
import { DEFAULT_REGION } from "../candidates/merge.mjs";

const API = "https://api.cloudflare.ravensburgerplay.com/hydraproxy/api/v2";
export const LOCATOR = "https://tcg.ravensburgerplay.com";
export const GAME = { id: 1, slug: "disney-lorcana", type: "LORCANA" };
export const PAUSE_MS = 1500, MAX_REQUESTS = 60, PAGE_SIZE = 100;
const TZ = "America/Los_Angeles";

/** One-offs: championships, challenges, prereleases, release and special events. NOT draft or sealed. */
export const SPECIAL = /championship|challenge|qualifier|pre-?release|release (event|party|celebration)|launch|special event|\bcup\b|learn[- ]to[- ]play|convention/i;
/** Weekly events that are casual rather than competitive. */
export const CASUAL = /casual|open play|meet-?up|hangout|free play|league|learn[- ]to[- ]play/i;

const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k]; return null; };

/** Only real, in-person Lorcana events. Exported for tests. */
export function isLorcanaEvent(e) {
  return e?.game_type === GAME.type || e?.game === GAME.id;
}

/** API store record -> one candidate-file store row (without its slots). Exported for tests. */
export function storeRow(s) {
  const full = pick(s, "full_address", "address");
  let parts = splitAddress(full);
  // A bare street line ("1 Elm St") parses as a city. When the line carried no
  // state or ZIP, trust the store's own city field and keep the line as the street.
  if (full && !parts.zip && !parts.state && pick(s, "city")) parts = { address: String(full).trim(), city: null, state: null, zip: null };
  const handle = (v, base) => (v ? (/^https?:/.test(v) ? v : `${base}${String(v).replace(/^@/, "")}`) : null);
  return {
    sourceId: s.uuid ?? `store-${s.id}`, storeNumber: s.id,
    name: String(s.name ?? "").trim(), ...parts,
    city: parts.city ?? pick(s, "city"),
    state: parts.state ?? pick(s, "administrative_area_level_1_short", "state") ?? null,
    zip: parts.zip ?? (/^\d{5}/.exec(String(pick(s, "zipcode") ?? ""))?.[0] ?? null),
    lat: Number(pick(s, "latitude")) || null, lng: Number(pick(s, "longitude")) || null,
    phone: pick(s, "phone_number", "preferred_contact_phone"),
    website: pick(s, "website"),
    socials: Object.fromEntries(Object.entries({
      discord: pick(s, "discord_url"), facebook: pick(s, "facebook_url"),
      instagram: handle(pick(s, "instagram_url", "instagram_handle"), "https://www.instagram.com/"),
      x: handle(pick(s, "twitter_url", "twitter_handle"), "https://x.com/"),
    }).filter(([, v]) => v)),
    sourceUrl: s.uuid ? `${LOCATOR}/stores/${s.uuid}` : null,
    game: "lorcana",
  };
}

// ── network: paced, capped, and it never retries ─────────────────────────────
let requests = 0;
async function getJson(url) {
  if (requests >= MAX_REQUESTS) throw new Error(`request cap (${MAX_REQUESTS}) reached - refusing to continue`);
  if (requests > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  requests++;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "tcg-playmap/0.1 (+https://github.com/BlissVibes/TCG-PlayMap)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url} - stopping, nothing written (no retry by design)`);
  return res.json();
}

async function pagedAll(firstUrl, label) {
  const out = []; let url = firstUrl;
  while (url) {
    const d = await getJson(url);
    out.push(...(d.results ?? []));
    console.log(`  ${label}: page ${d.current_page_number ?? "?"}, ${out.length} of ${d.count ?? "?"}`);
    const next = d.next_page_number ?? d.next;
    if (next == null || next === "") url = null;
    else { const u = new URL(url); u.searchParams.set("page", String(next)); url = u.toString(); }
  }
  return out;
}

const USAGE = "usage: node scripts/lorcana/pull.mjs [--out <file.json>] [--back <days>] [--ahead <days>]\n"
  + "Makes about 17 paced requests to Ravensburger Play. Run by hand, never more than weekly (docs/SOURCES.md).";

/**
 * Read the arguments BEFORE any request. Anything unrecognised stops the run:
 * on 2026-10-10 `pull.mjs --help` was typed to see the options, the script
 * ignored the flag, and a second full pull went out. A source we agreed to
 * touch lightly must not be pulled by a typo. Exported for tests.
 */
/** @returns {{ out?: string, back?: number, ahead?: number, help?: boolean, error?: string }} */
export function parseArgs(argv) {
  /** @type {{ out: string, back: number, ahead: number }} */
  const opts = { out: "data/candidates/lorcana-ravensburger.json", back: 35, ahead: 56 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--out" && argv[i + 1] && !argv[i + 1].startsWith("--")) opts.out = argv[++i];
    else if ((a === "--back" || a === "--ahead") && /^\d+$/.test(argv[i + 1] ?? "")) opts[a.slice(2)] = Number(argv[++i]);
    else return { error: `unrecognised or incomplete argument: ${a}` };
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); return; }
  if (opts.error) { console.error(`${opts.error}\n${USAGE}`); process.exit(2); }
  const arg = (n) => opts[n];
  const out = arg("out");
  const today = local(new Date().toISOString(), TZ).date;
  const from = addDays(today, -arg("back")), to = addDays(today, arg("ahead"));
  const { lat, lon, miles } = DEFAULT_REGION;
  const where = `latitude=${lat}&longitude=${lon}&num_miles=${miles}`;

  const stores = new Map();
  const gs = await pagedAll(`${API}/game-stores/?game_id=${GAME.id}&${where}&page_size=${PAGE_SIZE}&page=1`, "stores");
  for (const g of gs) if (g.store?.id != null && (g.game?.id ?? GAME.id) === GAME.id) stores.set(g.store.id, { uuid: g.id, ...g.store });

  const events = new Map();
  let otherGames = 0;
  const ev = await pagedAll(`${API}/events/?game_slug=${GAME.slug}&${where}&start_date_after=${from}T00:00:00Z&start_date_before=${to}T23:59:59Z&page_size=${PAGE_SIZE}&page=1`, "events");
  for (const e of ev) {
    if (!isLorcanaEvent(e)) { otherGames++; continue; }
    delete e.full_header_image_url;
    events.set(e.id, e);
  }
  // A store can appear only through its events:
  for (const e of events.values()) {
    const s = e.store; if (s?.id != null && !stores.has(s.id)) stores.set(s.id, { uuid: null, ...s });
  }

  const slots = buildSlots([...events.values()], today, { locator: LOCATOR, special: SPECIAL, casual: CASUAL, tz: TZ, withFormat: true });
  const rows = [...stores.values()].filter((s) => !/\btest(ing)? store\b/i.test(String(s.name))).map((s) => {
    const sl = slots.get(s.id) ?? { recurring: [], special: [] };
    return { ...storeRow(s), recurring: sl.recurring, special: sl.special };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    source: "ravensburger-play", pulled: today, window: { from, to },
    region: { ...DEFAULT_REGION }, requests, storeCount: rows.length, eventCount: events.size,
    storesWithWeekly: rows.filter((r) => r.recurring.length).length, stores: rows,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n${rows.length} stores (${payload.storesWithWeekly} with a weekly night), ${events.size} Lorcana events${otherGames ? ` (${otherGames} other-game rows dropped)` : ""}, ${requests} requests -> ${out}`);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
