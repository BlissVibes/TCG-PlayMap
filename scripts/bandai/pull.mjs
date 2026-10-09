#!/usr/bin/env node
/**
 * PULL LA-AREA STORE EVENTS FROM BANDAI TCG+ - run on Mark's Mac, logged in.
 *
 *   node scripts/bandai/pull.mjs --curl ~/bandai-request.txt [--days 90]
 *        [--lat 34.05 --lng -118.30 --miles 60] [--games gundam,dbs_fusion,...]
 *
 * WHY THIS EXISTS AND WHAT IT IS NOT. Bandai's TCG+ is the only place most
 * Bandai-game store events are listed (Gundam, Dragon Ball Fusion World, One
 * Piece, Union Arena, Digimon). Its terms (lp.bandai-tcg-plus.com/terms/en/
 * §5, §7) forbid automated access; Mark decided on 2026-10-09 to do a light
 * pull anyway with a secondary account, for a small friends-only map: one
 * initial population of WHICH shops run these games, then occasional pulls
 * for special events (regionals, finals, prereleases). This script is built
 * for exactly that and nothing heavier:
 *   - it replays ONE request copied from Mark's own logged-in browser
 *     ("Copy as cURL"), changing only the game, dates and page - no guessed
 *     headers, no app spoofing, no login handling, no token stored anywhere;
 *   - it is slow on purpose (2.5 s between requests) and capped (150 requests);
 *   - raw responses stay in bandai-pull/ (gitignored). Only the derived
 *     summary - which store runs which game on which night, plus special
 *     events - is meant to be committed, as data/candidates/bandai-tcgplus.json,
 *     and every row in it is a LEAD (confidence "scraped") to merge by hand.
 *
 * The response shape was not observable from the cloud session (guests get
 * 403), so parsing is defensive: it finds the array of event objects wherever
 * it sits, reads the fields the TCG+ web client itself reads, and the first
 * run (--probe) prints the shape so the parser can be adjusted if needed.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

/** TCG+ game_title_id (English editions) -> our game id. From /api/masterdata, 2026-10-09. */
export const GAMES = {
  gundam: 16, dbs_fusion: 10, onepiece: 4, union_arena: 12, digimon: 2, naruto: 20,
};
const wanted = (arg("games", Object.keys(GAMES).join(","))).split(",").map((s) => s.trim()).filter(Boolean);

const days = Number(arg("days", "90"));
const lat = arg("lat", "34.05"), lng = arg("lng", "-118.30"), miles = arg("miles", "60");
const PAGE = 100, PAUSE_MS = 2500, MAX_REQUESTS = flag("probe") ? 1 : 150;

// ── Parse the copied curl command ────────────────────────────────────────────
/** Split a shell command line into words, honouring '…', "…" and \-newlines. */
export function shellWords(s) {
  const out = []; let cur = ""; let q = null; let any = false;
  s = s.replace(/\\\r?\n/g, " ");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === "$") {                  // $'…' ANSI-C quoting: backslash escapes, ' ends
      if (c === "'") q = null;
      else if (c === "\\" && i + 1 < s.length) {
        const n = s[++i];
        cur += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n;
      } else cur += c;
    } else if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"' && i + 1 < s.length) cur += s[++i];
      else cur += c;
    } else if (c === "'" || c === '"') { q = c; any = true; }
    else if (c === "$" && s[i + 1] === "'") { q = "$"; any = true; i++; }  // Chrome on macOS
    else if (/\s/.test(c)) { if (cur || any) out.push(cur); cur = ""; any = false; }
    else if (c === "\\" && i + 1 < s.length) cur += s[++i];
    else cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

export function parseCurl(text) {
  const w = shellWords(text.trim());
  if (w[0] !== "curl") throw new Error("the file must contain a command starting with `curl` (DevTools > Copy as cURL)");
  let url = null;
  /** @type {Record<string, string>} */
  const headers = {};
  for (let i = 1; i < w.length; i++) {
    const t = w[i];
    if (t === "-H" || t === "--header") {
      const h = w[++i]; const k = h.indexOf(":");
      if (k > 0) headers[h.slice(0, k).trim().toLowerCase()] = h.slice(k + 1).trim();
    } else if (t === "-b" || t === "--cookie") headers["cookie"] = w[++i];
    else if (t === "-A" || t === "--user-agent") headers["user-agent"] = w[++i];
    else if (["-X", "--request", "--data", "--data-raw", "-d", "--data-binary"].includes(t)) i++;
    else if (!t.startsWith("-") && /^https?:\/\//.test(t)) url = t;
  }
  if (!url) throw new Error("no URL found in the curl command");
  return { url: new URL(url), headers };
}

// ── Find events in a response of unknown shape ───────────────────────────────
const EVENT_KEYS = ["event_title", "start_datetime", "event_id", "organizer_name"];
export function findEventArray(json) {
  let best = null;
  const walk = (v, depth) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) {
      const objs = v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
      const hits = objs.filter((o) => EVENT_KEYS.some((k) => k in o)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { arr: objs, hits };
      for (const x of v.slice(0, 3)) walk(x, depth + 1);
    } else if (typeof v === "object") for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(json, 0);
  return best ? best.arr : [];
}

const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k]; return null; };

export function normalizeEvent(e, game) {
  return {
    game,
    id: pick(e, "id", "event_id"),
    title: pick(e, "event_title", "title", "name"),
    series: pick(e, "event_series_title"),
    seriesType: pick(e, "event_series_type", "series_type"),   // 2 = official, 1 = official recognition, 3 = other
    start: pick(e, "start_datetime", "start_date"),
    end: pick(e, "end_datetime"),
    tz: pick(e, "event_time_zone", "time_zone"),
    fee: pick(e, "entry_fee"), feeCurrency: pick(e, "entry_fee_currency_code"),
    capacity: pick(e, "capacity"),
    format: pick(e, "game_format", "event_format"),
    store: pick(e, "organizer_name", "venue_name", "shop_name"),
    organizerId: pick(e, "organizer_id", "shop_id"),
    venue: pick(e, "venue_name"),
    address: pick(e, "address", "street_address"),
    lat: Number(pick(e, "latitude", "lat")) || null,
    lng: Number(pick(e, "longitude", "lng", "lon")) || null,
    url: pick(e, "organizer_url"),
  };
}

// ── Summarise: which store runs which game, when ─────────────────────────────
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SPECIAL = /regional|championship|finals?|qualifier|prerelease|pre-release|release event|launch|store championship|grand|ultimate|treasure cup|premier|national/i;

/** Local weekday + HH:MM for an event start. TCG+ is assumed to send ISO
 *  strings; with no offset we treat them as already-local store time. */
export function localSlot(start, tz = "America/Los_Angeles") {
  if (!start) return null;
  const s = String(start).replace(" ", "T");
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  if (!hasZone) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return { date: `${m[1]}-${m[2]}-${m[3]}`, weekday: d.getUTCDay(), time: `${m[4]}:${m[5]}` };
  }
  const d = new Date(s);
  if (isNaN(d)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WD.indexOf(parts.weekday),
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

export function summarise(events) {
  const stores = new Map();
  for (const e of events) {
    const key = `${(e.store || "?").toLowerCase()}|${e.address || ""}`;
    if (!stores.has(key)) stores.set(key, { store: e.store, address: e.address, lat: e.lat, lng: e.lng, organizerId: e.organizerId, url: e.url, games: {}, special: [] });
    const s = stores.get(key);
    const slot = localSlot(e.start, e.tz);
    const isSpecial = SPECIAL.test(`${e.title ?? ""} ${e.series ?? ""}`) || String(e.seriesType) === "2";
    if (isSpecial) { s.special.push({ game: e.game, date: slot?.date, time: slot?.time, title: e.title, series: e.series, fee: e.fee, tcgplusId: e.id }); continue; }
    if (!slot) continue;
    const g = (s.games[e.game] ??= {});
    const k = `${slot.weekday}@${slot.time}`;
    (g[k] ??= { weekday: WD[slot.weekday], time: slot.time, dates: [], titles: new Set(), fees: new Set() });
    g[k].dates.push(slot.date); g[k].titles.add(e.title); if (e.fee != null) g[k].fees.add(String(e.fee));
  }
  return [...stores.values()].map((s) => ({
    ...s,
    games: Object.fromEntries(Object.entries(s.games).map(([game, slots]) => [game,
      Object.values(slots).map((x) => ({
        weekday: x.weekday, time: x.time, seen: x.dates.length, recurring: x.dates.length >= 2,
        dates: x.dates.sort(), titles: [...x.titles].slice(0, 3), fees: [...x.fees],
      })).sort((a, b) => b.seen - a.seen)])),
    special: s.special.sort((a, b) => String(a.date).localeCompare(String(b.date))),
  })).sort((a, b) => String(a.store).localeCompare(String(b.store)));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (flag("help") || !arg("curl")) {
    console.log(readFileSync(new URL("./README.md", import.meta.url), "utf8"));
    process.exit(arg("curl") ? 0 : 2);
  }
  for (const g of wanted) if (!(g in GAMES)) { console.error(`unknown game ${g}; known: ${Object.keys(GAMES).join(", ")}`); process.exit(2); }
  const { url: base, headers } = parseCurl(readFileSync(arg("curl"), "utf8"));
  // localhost: the mock server in the script's own test (scratchpad), nothing else.
  if (!base.hostname.endsWith("bandai-tcg-plus.com") && base.hostname !== "localhost") throw new Error(`expected a bandai-tcg-plus.com request, got ${base.hostname}`);
  if (!base.pathname.includes("/event/list")) console.warn(`! the copied request is ${base.pathname}, not the event search; headers are reused, the path is replaced.`);
  delete headers["content-length"]; delete headers["accept-encoding"];

  const today = new Date(); const fmt = (d) => d.toISOString().slice(0, 10);
  const until = new Date(today.getTime() + days * 86400000);
  const stamp = fmt(today);
  const outDir = join("bandai-pull", stamp); mkdirSync(outDir, { recursive: true });

  let requests = 0; const all = [];
  for (const game of wanted) {
    for (let offset = 0; ; offset += PAGE) {
      if (requests >= MAX_REQUESTS) { console.warn(`! stopped at the ${MAX_REQUESTS}-request cap`); break; }
      const u = new URL("/api/user/event/list", base.origin);
      // Start from Mark's own query (keeps any flags the site sends), then set ours.
      for (const [k, v] of base.searchParams) u.searchParams.append(k, v);
      for (const k of ["game_title_id", "start_date", "end_date", "current_lat", "current_lng", "distance", "limit", "offset", "country_code[]", "pref_code[]"]) u.searchParams.delete(k);
      u.searchParams.set("game_title_id", String(GAMES[game]));
      u.searchParams.set("start_date", stamp); u.searchParams.set("end_date", fmt(until));
      u.searchParams.append("country_code[]", "US"); u.searchParams.append("pref_code[]", "US-CA");
      u.searchParams.set("current_lat", lat); u.searchParams.set("current_lng", lng); u.searchParams.set("distance", miles);
      u.searchParams.set("limit", String(PAGE)); u.searchParams.set("offset", String(offset));

      if (requests > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
      requests++;
      const res = await fetch(u, { headers });
      const body = await res.text();
      writeFileSync(join(outDir, `${game}-${offset}.json`), body);
      if (!res.ok) {
        console.error(`${game} offset ${offset}: HTTP ${res.status}. ${res.status === 401 || res.status === 403 ? "The copied request has probably expired - copy a fresh one and retry." : ""}`);
        if (res.status === 401 || res.status === 403) process.exit(1);
        break;
      }
      let json; try { json = JSON.parse(body); } catch { console.error(`${game}: response is not JSON (saved to ${outDir})`); break; }
      const events = findEventArray(json);
      if (flag("probe")) {
        console.log(`PROBE ${game}: HTTP ${res.status}, top-level keys: ${Object.keys(json).join(", ")}`);
        console.log(`found ${events.length} event objects; first one's keys:\n  ${Object.keys(events[0] ?? {}).join(", ")}`);
        console.log(`raw response saved to ${join(outDir, `${game}-${offset}.json`)}`);
        return;
      }
      all.push(...events.map((e) => normalizeEvent(e, game)));
      console.log(`${game} offset ${offset}: ${events.length} events`);
      if (events.length < PAGE) break;
    }
  }

  writeFileSync(join(outDir, "events.json"), JSON.stringify(all, null, 2));
  const summary = summarise(all);
  const candidates = {
    pulled: stamp, window: { from: stamp, to: fmt(until) }, origin: { lat: +lat, lng: +lng, miles: +miles },
    source: "Bandai TCG+ event search (logged-in pull by Mark); leads only, confidence: scraped",
    games: wanted, requests, events: all.length, stores: summary,
  };
  mkdirSync("data/candidates", { recursive: true });
  writeFileSync("data/candidates/bandai-tcgplus.json", JSON.stringify(candidates, null, 2) + "\n");
  console.log(`\n${all.length} events from ${summary.length} stores in ${requests} requests.`);
  console.log(`Raw responses: ${outDir}/ (not committed). Summary: data/candidates/bandai-tcgplus.json - commit and push that one file.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
