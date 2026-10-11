#!/usr/bin/env node
/**
 * DISCOVER CARD SHOPS FROM OPENSTREETMAP (Overpass API). LEADS, NOT LISTINGS.
 *
 *   node scripts/osm/pull.mjs [--tiles r1c2,r2c3] [--since YYYY-MM-DD]
 *        [--out data/candidates/osm-shops.json] [--rebucket] [--no-pull] [--list-tiles]
 *
 * --no-pull makes no request at all: it re-reads the leads file against the
 * current data/shops.json (a lead that has since become one of our shops moves
 * to alreadyKnown) and rewrites the counts. Run it after a research batch.
 *
 * What it is for: finding shops the play-network locators do not know about.
 * OSM says a shop EXISTS and where; it says nothing about what it runs or
 * when. So this writes data/candidates/osm-shops.json, a list of LEADS for a
 * person or a research session to triage (docs/LOCAL_RUN.md). It never touches
 * data/shops.json or data/events.json and is not in merge.mjs's candidate shape.
 *
 * Source and terms: OpenStreetMap data, ODbL, (c) OpenStreetMap contributors.
 * The public Overpass instance asks for an identifying User-Agent and modest
 * use. This script sends one, queries one tile at a time, waits PAUSE_MS
 * between tiles, tries a tile at most MAX_TRIES times with a growing wait
 * after 429 / 504, and stops the whole run after three tiles in a row fail.
 *
 * TILES. One query over the whole 120-mile region times out (504), which is
 * how the first, hand-run discovery on 2026-10-10 ended up as 16 ad-hoc tiles
 * with three gaps. The region's bounding box is cut into a fixed grid here
 * (tilesFor), tiles wholly outside the circle are dropped, and every tile has
 * a stable name (r<row>c<col>, rows from the south), so `--tiles` can re-run
 * exactly the ones that failed and `--since` skips tiles pulled on or after a
 * date.
 *
 * RE-RUNS KEEP PEOPLE'S WORK. Leads are merged by osmId (mergeLeads):
 *   - any field this script does not produce (triage, evidence, notes, ...)
 *     is kept exactly;
 *   - a lead's `bucket` is kept once assigned (a person may have corrected
 *     it); `--rebucket` recomputes it, but never for a lead that has `triage`;
 *   - `possibleDuplicateOf` is this script's guess; once a person has written
 *     `duplicateOf` or `distinctFromKnown` on a lead, the guess is not re-added;
 *   - a lead OSM no longer returns is NEVER dropped. It is marked `osmGone`
 *     with the date, and only if the tile covering it was actually pulled in
 *     this run. A tile that failed or was skipped says nothing about its leads;
 *   - a lead that is now one of our shops moves to `alreadyKnown`, whole.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isMain } from "../lib/isMain.mjs";
import { sameShopReason } from "../lib/shopDupes.mjs";
import { DEFAULT_REGION, miles, slug } from "../candidates/merge.mjs";

export const OVERPASS = "https://overpass-api.de/api/interpreter";
export const USER_AGENT = "tcg-playmap/0.1 (+https://github.com/BlissVibes/TCG-PlayMap; shop discovery, a few tiles per run)";
export const PAUSE_MS = 8000, MAX_TRIES = 3, QUERY_TIMEOUT_S = 180, GRID = { rows: 5, cols: 6 };

/** OSM `shop` values that are a card/game shop often enough to fetch without a name match. */
export const SHOP_TAGS = ["games", "hobby", "toys", "collector", "trading_cards"];
export const NAME_RE = "card|tcg|game|comic|hobby|collectib";

/** National chains: real shops, never an independent play space. Matched on the name. */
export const CHAINS = [
  "gamestop", "target", "walmart", "michaels", "hobby lobby", "barnes & noble", "barnes and noble", "five below", "big 5",
  "build-a-bear", "lego", "toys r us", "toys\"r\"us", "disney store", "disney outlet", "hot topic", "boxlunch", "box lunch", "funko",
  "party city", "joann", "jo-ann", "best buy", "costco", "cvs", "walgreens", "dollar tree", "99 cents only", "daiso", "hallmark",
];
const CHAIN_RE = new RegExp(`(^|[^a-z0-9])(${CHAINS.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})([^a-z0-9]|$)`, "i");
/** Shop types that are a card/game shop by their tag alone. */
const CORE_SHOPS = new Set(["games", "collector", "trading_cards", "hobby", "comics", "sports_collectibles"]);
/** Shop types where a "card" or "game" in the name is almost never ours. */
const NOT_OURS = new Set(["supermarket", "convenience", "hairdresser", "mall", "craft", "jewelry", "laundry", "car_repair", "bicycle", "vacant", "department_store", "clothes", "beauty", "alcohol", "mobile_phone", "stationery"]);
const STRONG_NAME = /\b(tcg|trading cards?|card shop|cards? (&|and|n) |cards?\b|comics?\b|collectib\w*|hobb(y|ies)\b|games?\b|gaming\b)/i;
const NOT_A_SHOP_NAME = /greeting|gift ?card|business card|card ?room|casino|poker|arcade|esports?|video ?games?|game ?day|gamers? (bar|lounge)|escape/i;

// ── pure helpers (exported for tests) ────────────────────────────────────────

/**
 * The region's bounding box cut into a fixed grid, minus tiles that lie wholly
 * outside the circle. bbox is [south, west, north, east].
 * @returns {{ name: string, bbox: number[] }[]}
 */
export function tilesFor(region = DEFAULT_REGION, grid = GRID) {
  const dLat = region.miles / 69.05, dLon = region.miles / (69.17 * Math.cos((region.lat * Math.PI) / 180));
  const south = region.lat - dLat, west = region.lon - dLon;
  const hLat = (2 * dLat) / grid.rows, hLon = (2 * dLon) / grid.cols;
  const out = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const bbox = [south + r * hLat, west + c * hLon, south + (r + 1) * hLat, west + (c + 1) * hLon].map((x) => Number(x.toFixed(5)));
      // Nearest point of the tile to the centre: outside the circle means nothing in it is in the region.
      const nearLat = Math.min(Math.max(region.lat, bbox[0]), bbox[2]), nearLon = Math.min(Math.max(region.lon, bbox[1]), bbox[3]);
      if (miles(region.lat, region.lon, nearLat, nearLon) > region.miles) continue;
      out.push({ name: `r${r}c${c}`, bbox });
    }
  }
  return out;
}

export function buildQuery(bbox) {
  const b = `(${bbox.join(",")})`;
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];\n(\n`
    + `  nwr["shop"~"^(${SHOP_TAGS.join("|")})$"]${b};\n`
    + `  nwr["shop"]["name"~"${NAME_RE}",i]${b};\n`
    + `  nwr["amenity"]["name"~"${NAME_RE}",i]${b};\n`
    + `);\nout center tags;`;
}

const inBbox = (lat, lon, [s, w, n, e]) => lat >= s && lat < n && lon >= w && lon < e;

/**
 * likely | unlikely | chain, from the name and tags alone.
 * @param {{ name?: string|null, osmShop?: string|null, osmAmenity?: string|null }} lead
 * @returns {"likely"|"unlikely"|"chain"}
 */
export function bucketOf({ name, osmShop, osmAmenity }) {
  const n = String(name ?? "");
  if (CHAIN_RE.test(n)) return "chain";
  if (osmShop && CORE_SHOPS.has(osmShop)) return "likely";
  if (NOT_A_SHOP_NAME.test(n)) return "unlikely";
  if (osmShop && !NOT_OURS.has(osmShop) && STRONG_NAME.test(n)) return "likely";
  // No shop tag at all (a cafe, a school): only an unmistakable name counts.
  if (!osmShop && /\b(tcg|trading cards?|card shop|comics?|collectib\w*)\b/i.test(n)) return "likely";
  return "unlikely";
}

/**
 * One Overpass element -> the fields this script owns on a lead; null when it has no name or no position.
 * @param {any} el
 * @returns {any}
 */
export function leadFromElement(el) {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  const name = String(t.name ?? "").trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const address = [street, t["addr:unit"] ? `#${t["addr:unit"]}` : null].filter(Boolean).join(" ") || null;
  return {
    name, address, city: t["addr:city"] ?? null, zip: /^\d{5}/.exec(String(t["addr:postcode"] ?? ""))?.[0] ?? null,
    lat, lon, website: t.website ?? t["contact:website"] ?? null, phone: t.phone ?? t["contact:phone"] ?? null,
    hours: t.opening_hours ?? null, osmId: `${el.type}/${el.id}`, osmShop: t.shop ?? null, osmAmenity: t.amenity ?? null,
  };
}

/**
 * Where a lead stands against the shops already on the map.
 * known: it IS one of them (scripts/lib/shopDupes.mjs, the same rule the data test uses).
 * possibleDuplicateOf: probably one of them but not surely - the same name
 * somewhere else, or a differently named shop within NEAR_KNOWN_MI (a unit in
 * the same building, or the same shop under its other name).
 */
export const NEAR_KNOWN_MI = 0.057;   // 300 ft
export function againstShops(lead, shops, region = DEFAULT_REGION) {
  const asShop = { id: lead.osmId, name: lead.name, address: lead.address ?? "", lat: lead.lat, lon: lead.lon, active: true };
  let nearest = null, known = null, sameName = null;
  for (const s of shops) {
    const d = miles(lead.lat, lead.lon, s.lat, s.lon);
    if (!nearest || d < nearest.d) nearest = { s, d };
    if (!known && s.active !== false) { const why = sameShopReason(asShop, s); if (why) known = { knownAs: s.id, why }; }
    if (slug(s.name) === slug(lead.name) && (!sameName || d < sameName.miles)) sameName = { id: s.id, miles: Number(d.toFixed(2)), why: "same name, different coordinates" };
  }
  return {
    known,
    fields: {
      nearestKnownCity: nearest?.s.city ?? null,
      nearestKnownMi: nearest ? Number(nearest.d.toFixed(1)) : null,
      milesFromLaCenter: Math.round(miles(region.lat, region.lon, lead.lat, lead.lon)),
      ...(known ? {}
        : sameName ? { possibleDuplicateOf: sameName }
        : nearest && nearest.d <= NEAR_KNOWN_MI ? { possibleDuplicateOf: { id: nearest.s.id, miles: Number(nearest.d.toFixed(2)), why: "another known shop within 300 ft" } }
        : {}),
    },
  };
}

/** Fields this script writes on a lead. Everything else on an existing lead belongs to whoever added it. */
const OWNED = ["name", "address", "city", "zip", "lat", "lon", "website", "phone", "hours", "osmId", "osmShop", "osmAmenity",
  "nearestKnownCity", "nearestKnownMi", "milesFromLaCenter", "possibleDuplicateOf"];

/**
 * Merge a fresh pull into the existing leads file.
 * existing: the parsed leads file, or null on a first run. elements: Overpass
 * elements from the tiles that were pulled. pulled: the tiles pulled
 * SUCCESSFULLY in this run. shops: data/shops.json.
 * @param {{ existing: any, elements: any[], pulled: { name: string, bbox: number[] }[], shops: any[], today: string, region?: any, rebucket?: boolean }} args
 * @returns {{ leads: Record<string, any[]>, alreadyKnown: any[], stats: Record<string, number> }}
 */
export function mergeLeads({ existing, elements, pulled, shops, today, region = DEFAULT_REGION, rebucket = false }) {
  const old = new Map();   // osmId -> lead, from every bucket and from alreadyKnown
  for (const l of [...Object.values(existing?.leads ?? {}).flat(), ...(existing?.alreadyKnown ?? [])]) if (l?.osmId) old.set(l.osmId, l);

  const fresh = new Map();
  for (const el of elements) {
    const lead = leadFromElement(el);
    if (!lead || fresh.has(lead.osmId)) continue;
    if (miles(region.lat, region.lon, lead.lat, lead.lon) > region.miles) continue;
    fresh.set(lead.osmId, lead);
  }
  const wasPulled = (l) => Number.isFinite(l.lat) && Number.isFinite(l.lon) && pulled.some((t) => inBbox(l.lat, l.lon, t.bbox));

  const leads = { likely: [], unlikely: [], chain: [] }, alreadyKnown = [];
  const stats = { new: 0, updated: 0, gone: 0, kept: 0, nowKnown: 0 };
  for (const id of new Set([...old.keys(), ...fresh.keys()])) {
    const prev = old.get(id), now = fresh.get(id);
    // Start from everything the old row had (triage, evidence, a hand-set bucket...), then lay our own fields over it.
    let row = { ...(prev ?? {}) };
    if (now) {
      for (const k of OWNED) delete row[k];
      row = { ...now, ...row };
      delete row.osmGone;
      if (prev) stats.updated++; else stats.new++;
    } else if (prev && !("osmGone" in prev) && wasPulled(prev)) {
      row.osmGone = today;        // its tile was read and it was not there
      stats.gone++;
    } else stats.kept++;          // not looked at in this run: unknown, not absent

    // An old alreadyKnown stub has no coordinates; it stays what it was.
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) { alreadyKnown.push(row); continue; }
    const vs = againstShops(row, shops, region);
    delete row.possibleDuplicateOf;
    Object.assign(row, vs.fields);
    // A person has already ruled on this one (`duplicateOf`: it IS that shop;
    // `distinctFromKnown`: it is NOT). Our guess must not come back on every run.
    if (row.duplicateOf || row.distinctFromKnown) delete row.possibleDuplicateOf;
    if (vs.known) {
      if (!(prev && "knownAs" in prev)) stats.nowKnown++;
      alreadyKnown.push({ ...row, knownAs: vs.known.knownAs, why: vs.known.why });
      continue;
    }
    delete row.knownAs; delete row.why;
    if (!row.bucket || (rebucket && !row.triage)) row.bucket = bucketOf(row);
    (leads[row.bucket] ?? (leads[row.bucket] = [])).push(row);
  }
  const byDist = (a, b) => (a.milesFromLaCenter ?? 1e9) - (b.milesFromLaCenter ?? 1e9) || String(a.name).localeCompare(String(b.name));
  for (const k of Object.keys(leads)) leads[k].sort(byDist);
  alreadyKnown.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { leads, alreadyKnown, stats };
}

/**
 * Arguments are read BEFORE any request; anything unrecognised stops the run (see scripts/lorcana/pull.mjs).
 * @returns {{ out?: string, tiles?: string[]|null, since?: string|null, rebucket?: boolean, listTiles?: boolean, noPull?: boolean, help?: boolean, error?: string }}
 */
export function parseArgs(argv) {
  /** @type {{ out: string, tiles: string[]|null, since: string|null, rebucket: boolean, listTiles: boolean, noPull: boolean }} */
  const opts = { out: "data/candidates/osm-shops.json", tiles: null, since: null, rebucket: false, listTiles: false, noPull: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--rebucket") opts.rebucket = true;
    else if (a === "--list-tiles") opts.listTiles = true;
    else if (a === "--no-pull") opts.noPull = true;
    else if (a === "--out" && v && !v.startsWith("--")) { opts.out = v; i++; }
    else if (a === "--tiles" && /^r\d+c\d+(,r\d+c\d+)*$/.test(v ?? "")) { opts.tiles = v.split(","); i++; }
    else if (a === "--since" && /^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) { opts.since = v; i++; }
    else return { error: `unrecognised or incomplete argument: ${a}` };
  }
  return opts;
}

/**
 * Which tiles this run should query. `since`: skip a tile last pulled on or after that date.
 * @param {{ name: string, bbox: number[] }[]} all
 * @param {{ tiles?: string[]|null, since?: string|null }} opts
 * @param {Record<string, { pulled?: string, lastError?: string }>} [lastPulled]
 * @returns {{ name: string, bbox: number[] }[]}
 */
export function chooseTiles(all, { tiles, since }, lastPulled = {}) {
  let pick = all;
  if (tiles) {
    const unknown = tiles.filter((n) => !all.some((t) => t.name === n));
    if (unknown.length) throw new Error(`no such tile: ${unknown.join(", ")} (see --list-tiles)`);
    pick = all.filter((t) => tiles.includes(t.name));
  }
  if (since) pick = pick.filter((t) => !(lastPulled[t.name]?.pulled >= since));
  return pick;
}

// ── network ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One tile, at most MAX_TRIES requests. Returns { elements } or { error }. */
async function pullTile(tile) {
  let last = "";
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let res;
    try {
      res = await fetch(OVERPASS, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT },
        body: `data=${encodeURIComponent(buildQuery(tile.bbox))}`,
      });
    } catch (e) { last = `network: ${String(e.message || e)}`; res = null; }
    if (res?.ok) {
      const body = await res.json().catch(() => null);
      // Overpass answers 200 with a `remark` when the query ran out of time or memory: that is a failure, not "no shops".
      if (body && Array.isArray(body.elements) && !/error|timed out|out of memory/i.test(String(body.remark ?? ""))) return { elements: body.elements, tries: attempt };
      last = `200 but unusable: ${String(body?.remark ?? "not JSON").slice(0, 120)}`;
    } else if (res) {
      last = `HTTP ${res.status}`;
      if (![429, 502, 503, 504].includes(res.status)) return { error: last, tries: attempt };   // a refusal: do not ask again
    }
    if (attempt < MAX_TRIES) {
      const retryAfter = Number(res?.headers.get("retry-after")) || 0;
      const wait = Math.max(retryAfter * 1000, 30000 * attempt);
      console.log(`    ${tile.name}: ${last}; waiting ${Math.round(wait / 1000)} s (try ${attempt} of ${MAX_TRIES})`);
      await sleep(wait);
    }
  }
  return { error: last, tries: MAX_TRIES };
}

const USAGE = "usage: node scripts/osm/pull.mjs [--tiles r1c2,r2c3] [--since YYYY-MM-DD] [--out <file.json>] [--rebucket] [--no-pull] [--list-tiles]\n"
  + "Queries the public Overpass API one tile at a time, 8 s apart. A full sweep is 30 tiles (5 to 10 minutes).";

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); return; }
  if (opts.error) { console.error(`${opts.error}\n${USAGE}`); process.exit(2); }
  const all = tilesFor();
  if (opts.listTiles) { for (const t of all) console.log(`${t.name}  ${t.bbox.join(",")}`); console.log(`${all.length} tiles`); return; }

  const existing = existsSync(opts.out) ? JSON.parse(readFileSync(opts.out, "utf8")) : null;
  const shops = JSON.parse(readFileSync("data/shops.json", "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  let todo;
  try { todo = opts.noPull ? [] : chooseTiles(all, opts, existing?.tiles ?? {}); } catch (e) { console.error(String(e.message)); process.exit(2); }
  if (opts.noPull && !existing) { console.error(`--no-pull needs an existing leads file at ${opts.out}`); process.exit(2); }
  console.log(opts.noPull ? "no requests: re-reading the leads against data/shops.json" : `${todo.length} of ${all.length} tiles to pull${opts.since ? ` (skipping tiles pulled since ${opts.since})` : ""}`);

  const elements = [], pulled = [], tiles = { ...(existing?.tiles ?? {}) }, failed = [];
  let inARow = 0;
  for (const [i, tile] of todo.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    const r = await pullTile(tile);
    if (r.error) {
      failed.push(tile.name); inARow++;
      tiles[tile.name] = { ...(tiles[tile.name] ?? {}), bbox: tile.bbox, lastError: `${today}: ${r.error}` };
      console.log(`  ${tile.name}: FAILED after ${r.tries} tries (${r.error})`);
      if (inARow >= 3) { console.log("  three tiles in a row failed: stopping the run rather than keep asking."); break; }
      continue;
    }
    inARow = 0;
    elements.push(...r.elements); pulled.push(tile);
    tiles[tile.name] = { bbox: tile.bbox, pulled: today, hits: r.elements.length };
    console.log(`  ${tile.name}: ${r.elements.length} hits${r.tries > 1 ? ` (try ${r.tries})` : ""}`);
  }

  const { leads, alreadyKnown, stats } = mergeLeads({ existing, elements, pulled, shops, today, rebucket: opts.rebucket });
  const never = all.filter((t) => !tiles[t.name]?.pulled).map((t) => t.name);
  // Top-level fields this script does not manage (a hand-written note, the first run's tile list) are carried over.
  const payload = {
    ...(existing ?? {}),
    source: "openstreetmap-overpass", license: "ODbL (c) OpenStreetMap contributors", pulled: pulled.length ? today : existing?.pulled ?? null,
    region: { ...DEFAULT_REGION }, grid: GRID, tiles,
    gaps: never.length ? `Grid tiles never pulled successfully: ${never.join(", ")}. Their area is NOT covered by this file's grid runs.` : "none: every grid tile has been pulled at least once",
    counts: {
      newTotal: Object.values(leads).flat().length, newLikely: leads.likely.length, newUnlikely: leads.unlikely.length, newChain: leads.chain.length,
      alreadyKnown: alreadyKnown.length, osmGone: Object.values(leads).flat().filter((l) => l.osmGone).length,
      triaged: Object.values(leads).flat().filter((l) => l.triage).length,
      newLikelyPossibleDuplicates: leads.likely.filter((l) => l.possibleDuplicateOf).length,
      newLikelyWithin60mi: leads.likely.filter((l) => l.milesFromLaCenter <= 60).length,
    },
    leads, alreadyKnown,
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\n${pulled.length} tiles pulled, ${failed.length} failed${failed.length ? ` (${failed.join(", ")}; re-run with --tiles ${failed.join(",")})` : ""}.`);
  console.log(`leads: ${payload.counts.newLikely} likely, ${payload.counts.newUnlikely} unlikely, ${payload.counts.newChain} chain; ${alreadyKnown.length} already on the map.`);
  console.log(`this run: ${stats.new} new, ${stats.updated} refreshed, ${stats.gone} no longer in OSM (kept, marked osmGone), ${stats.kept} not looked at, ${stats.nowKnown} now known -> ${opts.out}`);
  if (failed.length) process.exit(1);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(String(e.stack || e)); process.exit(1); });
}
