#!/usr/bin/env node
/**
 * MERGE A BULK-SOURCE CANDIDATE FILE INTO THE CALENDAR.
 *
 *   node scripts/candidates/merge.mjs data/candidates/riftbound-locator.json
 *        [--apply] [--today YYYY-MM-DD] [--report path.md] [--force]
 *
 * Dry-run by default: prints what it WOULD do. --apply writes data/*.json and
 * data/research_queue.json. It does NOT touch lib/version.ts: a data run does
 * not move the site version (Mark, 2026-10-10; scripts/lib/versionRule.mjs).
 * The old --bump flag is refused, so a stale command or workflow fails loudly
 * instead of producing a commit the version test rejects.
 *
 * Input: the format written by scripts/riftbound/pull.mjs and
 * scripts/lorcana/pull.mjs (one file per source) - a list of stores,
 * each with `recurring` weekly slots and upcoming `special` one-offs, all with
 * fees. (A Bandai TCG+ pull can be converted to the same shape later.)
 *
 * OWNERSHIP RULES - these are what make it safe to run every week:
 *   - Rows this script writes carry `origin` (the candidate file's `source`).
 *     It owns ONLY those: it ends a weekly night the source no longer lists
 *     (validUntil, never delete - rule 4) and, when a fee changes, ends the old
 *     row and starts a new one. Every such change gets a calendar-log line.
 *   - Hand-entered rows (no `origin`) are never edited, with ONE exception:
 *     a missing `fee` is filled in from the source, because cost must always
 *     be shown (rule 9). That is logged too.
 *   - At a hand-entered SHOP the script adds no weekly nights of its own;
 *     differences are only reported, for a human to decide. It may add dated
 *     special events there (regionals, skirmishes), which it then owns.
 *   - A shop ANOTHER importer created is not hand-entered: this script may add
 *     its own game's weekly nights there (a Riftbound-locator shop can get
 *     Lorcana nights from Ravensburger Play), UNLESS a person has already
 *     entered nights for that game at that shop - then it only reports.
 *   - A hand-entered night for the same shop, game and weekday within
 *     SAME_NIGHT_MINUTES of the source's time IS that night: nothing is added
 *     and its time and title are never changed; it is listed under "Time
 *     differs from locator". Like an exact match, a MISSING fee is filled, and
 *     the row's notes then say which time the locator listed it at.
 *   - New shops are created with `origin`, and a research-queue entry so a
 *     human or a cheaper model can fill in their OTHER games
 *     (docs/SHOP_RESEARCH.md).
 *   - TITLES: a weekly night's title is cleaned of the date it was copied
 *     from (scripts/lib/weeklyTitle.mjs) when the row is written, and again on
 *     every run for rows this script owns, so old rows are fixed by re-running.
 *   - REGION: a store outside the region (see outsideRegion) is never created,
 *     whatever the locator returned; it is listed under "Skipped (outside
 *     region)" with its distance.
 *   - SAFETY: if the pull holds far fewer weekly nights than are already
 *     loaded from this source, it is treated as a broken pull (an API outage
 *     returns "nothing", not an error) and nothing is ended. --force overrides.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isMain } from "../lib/isMain.mjs";
import { cleanWeeklyTitle } from "../lib/weeklyTitle.mjs";

export { cleanWeeklyTitle };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── small helpers (exported for tests) ───────────────────────────────────────
export const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function normPhone(p) {
  if (!p) return null;
  let d = String(p).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

export function miles(aLat, aLon, bLat, bLon) {
  const R = 3958.8, r = Math.PI / 180;
  const h = Math.sin((bLat - aLat) * r / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin((bLon - aLon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const STOP = new Set(["the", "and", "games", "game", "cards", "card", "tcg", "llc", "inc", "co", "collectibles", "comics", "shop", "store", "of"]);
const tokens = (n) => new Set(slug(n).split("-").filter((t) => t.length > 2 && !STOP.has(t)));

export function fmtTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}
const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const laToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

/** Find the existing shop a candidate store refers to, or null. */
export function matchShop(shops, cand, game) {
  const byId = shops.find((s) => s.sourceIds?.[game] === cand.sourceId);
  if (byId) return byId;
  if (Number.isFinite(cand.lat) && Number.isFinite(cand.lng)) {
    const ct = tokens(cand.name);
    let best = null;
    for (const s of shops) {
      const d = miles(s.lat, s.lon, cand.lat, cand.lng);
      const shared = [...tokens(s.name)].some((t) => ct.has(t));
      // Same building and a shared name word, or practically the same point.
      if ((d <= 0.15 && shared) || d <= 0.03) if (!best || d < best.d) best = { s, d };
    }
    if (best) return best.s;
  }
  return shops.find((s) => slug(s.name) === slug(cand.name)) ?? null;
}

/**
 * The region this calendar covers. A locator answers a "within N miles" search
 * with whatever it likes: the 2026-10-10 pull came back with a store in
 * Roanoke, Virginia (2,146 mi) which became an active shop the LA map could not
 * pin, and the browser acceptance check (a pin per shop) went red.
 * The furthest genuine store in that Riftbound pull was 68 mi from the centre
 * (Yucaipa), because that pull only swept LA, Orange, Ventura and the western
 * Inland Empire.
 *
 * WHAT 120 MILES ACTUALLY COVERS, measured on the 2026-10-10 Lorcana pull (one
 * search over this whole circle): San Diego CITY and county (San Diego,
 * National City, La Mesa, Poway, Escondido, Oceanside, Carlsbad, Vista),
 * the Bakersfield area (Bakersfield, Tehachapi) and up to Ridgecrest and
 * Kernville, Temecula and Murrieta, and the Coachella Valley / high desert
 * (Palm Desert, Yucca Valley). An earlier version of this comment said "San
 * Diego's north edge"; that was wrong. 25 of that pull's 56 new shops were
 * 70 to 118 miles out.
 * Mark's decision, 2026-10-10 (relayed by the planner window): keep those
 * shops. The site is LA-centred, not LA-only; a visitor's ZIP and radius
 * decide what they see. So a source that covers only part of this circle
 * (Riftbound today) leaves far shops showing fewer games than they run, which
 * is what the "partial" mark is for.
 * A candidate file may carry its own `region: { lat, lon, miles, states }`
 * when a pull covers somewhere else.
 */
export const DEFAULT_REGION = { name: "Greater Los Angeles", lat: 34.0522, lon: -118.2437, miles: 120, states: ["CA"] };

/**
 * Why a candidate store is outside the region, or null when it belongs.
 * Two independent checks: the state when the source gives one, and the distance.
 */
export function outsideRegion(cand, region = DEFAULT_REGION) {
  const st = String(cand.state ?? "").trim().toUpperCase();
  const d = miles(region.lat, region.lon, cand.lat, cand.lng);
  const far = Number.isFinite(d) ? `${Math.round(d)} mi from ${region.name ?? "the region centre"}` : "distance unknown";
  const states = (region.states ?? []).map((x) => String(x).toUpperCase());
  if (st && states.length && !states.includes(st)) return `state is ${st}, not ${states.join("/")} (${far})`;
  if (!Number.isFinite(d) || d > region.miles) return `${far}, limit ${region.miles} mi`;
  return null;
}

/** How each bulk source is named in shop notes, log lines and the changelog. */
const SOURCES = {
  "riftbound-locator": { locator: "official Riftbound store locator", short: "Riftbound locator" },
  "ravensburger-play": { locator: "Ravensburger Play store locator (Disney Lorcana)", short: "Ravensburger Play" },
};
const sourceOf = (origin) => SOURCES[origin] ?? { locator: `${origin} store locator`, short: origin };

/**
 * A hand-entered night this close to the source's start time is the same night.
 * Stores post a sign-in time in one place and a round-one time in another:
 * on 2026-10-10 the Lorcana run listed Collectors Lounge 7:10 PM against our
 * 7:00, Paper Hero's HB 6 PM against 7 PM, and Emerald Knights 5 PM against a
 * 4 PM sign-in, as nights "missing" from our calendar, and would have done so
 * on every run. Three hours apart is treated as a different night.
 */
export const SAME_NIGHT_MINUTES = 120;
const minutes = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };

const isActive = (e, today) => !e.validUntil || e.validUntil >= today;

// ── the merge ────────────────────────────────────────────────────────────────
export function merge({ cands, shops, events, log, queue, today, force = false }) {
  const origin = cands.source;
  const src = sourceOf(origin);
  const yesterday = addDays(today, -1);
  const r = { newShops: [], newWeekly: [], newSpecial: [], filledFees: [], ended: [], replaced: [], curatedDiffs: [], timeDiffs: [], skipped: [], outOfRegion: [], linked: [], retitled: [] };
  const logLines = [];

  // Safety: a pull that suddenly has far fewer nights is a broken pull.
  const games = new Set(cands.stores.map((s) => s.game));
  const loadedWeekly = events.filter((e) => e.origin === origin && e.weekday != null && isActive(e, today));
  const pulledWeekly = cands.stores.reduce((n, s) => n + s.recurring.length, 0);
  const suspicious = loadedWeekly.length >= 10 && pulledWeekly < 0.6 * loadedWeekly.length;
  if (suspicious && !force) {
    throw new Error(`refusing: the pull has ${pulledWeekly} weekly nights but ${loadedWeekly.length} are loaded from ${origin}. `
      + `That looks like a broken pull, not ${loadedWeekly.length - pulledWeekly} shops dropping out. Re-run, or pass --force after checking.`);
  }

  // Weekly rows we own whose title still carries a date: fix in place. Wording
  // only - day, time and fee are untouched - so no calendar-log line (rule 4
  // is about what the schedule says, and it says the same thing).
  for (const e of events) {
    if (e.origin !== origin || e.weekday == null || !e.title) continue;
    const clean = cleanWeeklyTitle(e.title, e.game);
    if (clean !== e.title) { r.retitled.push(`${e.id}: "${e.title}" -> "${clean}"`); e.title = clean; }
  }

  const seenSlots = new Set();   // `${shopId}|${game}|${weekday}|${start}` present in this pull
  const shopsInPull = new Set();

  for (const c of cands.stores) {
    const game = c.game;
    if (!c.recurring.length && !c.special.length) continue;
    if (!c.name || !/^\d{5}$/.test(c.zip ?? "") || !Number.isFinite(c.lat) || !Number.isFinite(c.lng) || (c.lat === 0 && c.lng === 0)) {
      r.skipped.push(`${c.name || "?"}: missing ZIP or coordinates (${c.address ?? "no address"}, ${c.city ?? "?"})`);
      continue;
    }

    const away = outsideRegion(c, cands.region ?? DEFAULT_REGION);
    if (away) {
      r.outOfRegion.push(`${c.name} (${c.address ?? "no address"}, ${c.city ?? "?"}): ${away}`);
      continue;
    }

    let shop = matchShop(shops, c, game);
    const lines = [];
    if (!shop) {
      const base = slug(c.name);
      let id = base;
      if (shops.some((s) => s.id === id)) id = `${base}-${slug(c.city ?? "")}`;
      for (let n = 2; shops.some((s) => s.id === id); n++) id = `${base}-${n}`;
      const phone = normPhone(c.phone);
      shop = {
        id, name: c.name, address: c.address ?? "", city: c.city ?? "", state: c.state ?? "CA", zip: c.zip,
        lat: c.lat, lon: c.lng, tz: "America/Los_Angeles",
        ...(c.website ? { website: c.website } : {}),
        ...(phone ? { phone } : {}),
        ...(Object.keys(c.socials ?? {}).length ? { socials: c.socials } : {}),
        games: [game],
        notes: `Imported from the ${src.locator} on ${today}. Other games and store hours not yet researched.`
          + (phone ? "" : " No phone listed on the locator."),
        active: true,
        source: { url: c.sourceUrl ?? undefined, checked: today, note: `${origin} import` },
        origin, sourceIds: { [game]: c.sourceId },
      };
      shops.push(shop);
      r.newShops.push(`${shop.name} (${shop.city})`);
      logLines.push({ date: today, action: "added", game: null, shopId: shop.id, summary: `${shop.name} (${shop.city}) added to the map from the ${src.locator}.` });
      if (!queue.some((q) => q.shopId === shop.id)) {
        queue.push({ shopId: shop.id, name: shop.name, city: shop.city, website: shop.website ?? null, socials: shop.socials ?? {}, sourceUrl: c.sourceUrl ?? null, status: "todo", added: today, addedBy: origin, notes: "" });
      }
    } else {
      if (!shop.sourceIds?.[game]) { shop.sourceIds = { ...(shop.sourceIds ?? {}), [game]: c.sourceId }; r.linked.push(shop.name); }
      if (shop.origin === origin) {   // importer-made shop: fill gaps only
        if (!shop.phone && normPhone(c.phone)) shop.phone = normPhone(c.phone);
        if (!shop.website && c.website) shop.website = c.website;
      }
    }
    shopsInPull.add(shop.id);
    // "Curated" = a person owns this game's nights here: a hand-entered shop,
    // or another importer's shop where someone has typed in nights for this game.
    const curated = !shop.origin
      || (shop.origin !== origin && events.some((e) => e.shopId === shop.id && e.game === game && !e.origin && e.weekday != null && isActive(e, today)));
    if (!shop.games?.includes(game)) shop.games = [...(shop.games ?? []), game];

    // Weekly nights.
    for (const s of c.recurring) {
      const key = `${shop.id}|${game}|${s.weekday}|${s.time}`;
      seenSlots.add(key);
      const same = events.filter((e) => e.shopId === shop.id && e.game === game && e.weekday === s.weekday && e.start === s.time && isActive(e, today));
      const manual = same.find((e) => !e.origin);
      const owned = same.find((e) => e.origin === origin);
      if (manual) {
        if (manual.fee == null && s.fee) {
          manual.fee = s.fee;
          r.filledFees.push(`${shop.name} ${WD[s.weekday]} ${fmtTime(s.time)}: ${s.fee}`);
          lines.push(`cost for ${WD[s.weekday]} ${fmtTime(s.time)} is ${s.fee} (from the locator)`);
        }
        continue;
      }
      // The same night at a slightly different time, entered by a person: leave it.
      const near = events
        .filter((e) => e.shopId === shop.id && e.game === game && e.weekday === s.weekday && !e.origin && isActive(e, today)
          && Math.abs(minutes(e.start) - minutes(s.time)) <= SAME_NIGHT_MINUTES)
        .sort((a, b) => Math.abs(minutes(a.start) - minutes(s.time)) - Math.abs(minutes(b.start) - minutes(s.time)))[0];
      if (near) {
        if (near.fee == null && s.fee) {
          near.fee = s.fee;
          const said = `Fee from the ${label(game)} locator, which lists this night at ${fmtTime(s.time)}.`;
          near.notes = near.notes ? `${near.notes} ${said}` : said;
          r.filledFees.push(`${shop.name} ${WD[s.weekday]} ${fmtTime(near.start)}: ${s.fee} (locator lists it at ${fmtTime(s.time)})`);
          lines.push(`cost for ${WD[s.weekday]} ${fmtTime(near.start)} is ${s.fee} (from the locator)`);
        }
        r.timeDiffs.push(`${shop.name} ${WD[s.weekday]}: locator ${fmtTime(s.time)}${s.fee ? ` ${s.fee}` : ""} "${s.title}", our calendar ${fmtTime(near.start)}${near.fee ? ` ${near.fee}` : ""}`);
        continue;
      }
      if (curated) { r.curatedDiffs.push(`${shop.name}: locator lists ${WD[s.weekday]} ${fmtTime(s.time)} ${s.fee ?? "(no fee)"} "${s.title}" (seen ${s.seen}x, last ${s.lastSeen}) - not on our calendar`); continue; }
      if (owned) {
        if ((owned.fee ?? null) !== (s.fee ?? null)) {
          owned.validUntil = yesterday;
          const ev = weeklyRow(shop, game, s, origin, today, `-${today}`, cands);
          ev.validFrom = today;
          events.push(ev);
          r.replaced.push(`${shop.name} ${WD[s.weekday]} ${fmtTime(s.time)}: ${owned.fee ?? "no fee"} -> ${s.fee ?? "no fee"}`);
          logLines.push({ date: today, action: "changed", game, shopId: shop.id, summary: `${label(game)}: ${WD[s.weekday]} ${fmtTime(s.time)} now costs ${s.fee ?? "an unlisted amount"} (was ${owned.fee ?? "unlisted"}).` });
        }
        continue;
      }
      const ev = weeklyRow(shop, game, s, origin, today, "", cands);
      if (events.some((e) => e.id === ev.id)) ev.id = `${ev.id}-${today}`;
      events.push(ev);
      r.newWeekly.push(`${shop.name} ${WD[s.weekday]} ${fmtTime(s.time)} ${s.fee ?? "(no fee)"}`);
      lines.push(`${WD[s.weekday]} ${fmtTime(s.time)} (${s.fee ?? "cost not listed"})`);
    }

    // Upcoming special events (dated one-offs).
    const specials = [];
    for (const x of c.special) {
      if (x.date < today) continue;
      const id = `${shop.id}-${game.slice(0, 2)}-${x.date}-${x.time.replace(":", "")}`;
      if (events.some((e) => e.id === id)) continue;
      if (events.some((e) => e.shopId === shop.id && e.game === game && e.date === x.date && e.start === x.time)) continue;
      events.push({
        id, shopId: shop.id, game, kind: x.kind, title: x.title, date: x.date, start: x.time,
        ...(x.fee ? { fee: x.fee } : {}), confidence: "scraped", origin,
        ...(x.format ? { format: x.format } : {}),
        source: { url: x.eventUrl, checked: today, note: src.short },
      });
      r.newSpecial.push(`${shop.name} ${x.date} ${fmtTime(x.time)} ${x.fee ?? "(no fee)"} ${x.title}`);
      specials.push(`${fmtDate(x.date)} ${x.title} (${x.fee ?? "cost not listed"})`);
    }
    if (lines.length || specials.length) {
      const parts = [];
      if (lines.length) parts.push(`weekly ${lines.join(", ")}`);
      if (specials.length) parts.push(`upcoming: ${specials.slice(0, 4).join("; ")}${specials.length > 4 ? `; +${specials.length - 4} more` : ""}`);
      logLines.push({ date: today, action: "added", game, shopId: shop.id, summary: `${label(game)} from the official locator: ${parts.join(". ")}.` });
    }
  }

  // End weekly nights we own that the source no longer lists.
  for (const e of events) {
    if (e.origin !== origin || e.weekday == null || !isActive(e, today) || !games.has(e.game)) continue;
    if (e.validFrom && e.validFrom > today) continue;
    const key = `${e.shopId}|${e.game}|${e.weekday}|${e.start}`;
    if (seenSlots.has(key)) continue;
    if (r.replaced.length && events.some((x) => x !== e && x.origin === origin && `${x.shopId}|${x.game}|${x.weekday}|${x.start}` === key && x.validFrom === today)) continue;
    e.validUntil = yesterday;
    const shop = shops.find((s) => s.id === e.shopId);
    r.ended.push(`${shop?.name ?? e.shopId} ${WD[e.weekday]} ${fmtTime(e.start)}`);
    logLines.push({ date: today, action: "removed", game: e.game, shopId: e.shopId, summary: `${label(e.game)}: ${WD[e.weekday]} ${fmtTime(e.start)} is no longer listed on the official locator; taken off the calendar from ${fmtDate(today)}.` });
  }

  log.push(...logLines);
  return r;
}

function weeklyRow(shop, game, s, origin, today, suffix, cands) {
  const windowFrom = cands.window?.from;
  // Only claim a start date when the series demonstrably began inside the window.
  const startedInWindow = windowFrom && s.firstSeen > addDays(windowFrom, 7);
  return {
    id: `${shop.id}-${game.slice(0, 2)}-${WD[s.weekday].toLowerCase()}-${s.time.replace(":", "")}${suffix}`,
    shopId: shop.id, game, kind: s.kind, title: cleanWeeklyTitle(s.title, game), weekday: s.weekday, start: s.time,
    ...(s.fee ? { fee: s.fee } : {}),
    ...(s.format ? { format: s.format } : {}),
    ...(startedInWindow ? { validFrom: s.firstSeen } : {}),
    confidence: "scraped", origin,
    source: { url: s.eventUrl, checked: today, note: `${sourceOf(origin).short}, seen ${s.seen}x ${s.firstSeen}..${s.lastSeen}` },
  };
}

const label = (g) => ({ riftbound: "Riftbound", lorcana: "Lorcana" }[g] ?? g);

// ── file I/O, keeping the repo's one-row-per-line style ──────────────────────
const rowsFile = (rows) => `[\n${rows.map((r) => `  ${JSON.stringify(r)}`).join(",\n")}\n]\n`;
const prettyFile = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--today" && argv[argv.indexOf(a) - 1] !== "--report");
  if (!file) { console.error("usage: merge.mjs <candidates.json> [--apply] [--today YYYY-MM-DD] [--report out.md] [--force]"); process.exit(2); }
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
  const has = (n) => argv.includes(`--${n}`);
  if (has("bump")) {
    console.error("--bump is gone: a data run does not move the site version (Mark, 2026-10-10). Run without it; name the source and counts in the commit subject.");
    process.exit(2);
  }
  const today = opt("today") ?? laToday();

  const cands = JSON.parse(readFileSync(file, "utf8"));
  const shops = JSON.parse(readFileSync("data/shops.json", "utf8"));
  const events = JSON.parse(readFileSync("data/events.json", "utf8"));
  const log = JSON.parse(readFileSync("data/calendar_log.json", "utf8"));
  const queuePath = "data/research_queue.json";
  const queue = existsSync(queuePath) ? JSON.parse(readFileSync(queuePath, "utf8")) : [];

  let r;
  try { r = merge({ cands, shops, events, log, queue, today, force: has("force") }); }
  catch (e) { console.error(String(e.message)); process.exit(3); }

  const sec = (t, xs) => `\n### ${t} (${xs.length})\n${xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- none"}`;
  const report = `## ${cands.source} merge, ${today}${has("apply") ? "" : " (DRY RUN)"}\n`
    + `Pull of ${cands.pulled}: ${cands.storeCount} stores, ${cands.storesWithWeekly} with weekly nights.`
    + sec("New shops", r.newShops) + sec("New weekly nights", r.newWeekly) + sec("New special events", r.newSpecial)
    + sec("Fees filled on hand-entered rows", r.filledFees) + sec("Fee changes (old row ended, new row added)", r.replaced)
    + sec("Weekly nights ended (no longer listed)", r.ended)
    + sec("NEEDS A HUMAN: locator nights missing at hand-entered shops", r.curatedDiffs)
    + sec("Time differs from locator (time not changed)", r.timeDiffs)
    + sec("Weekly titles cleaned of a date", r.retitled)
    + sec("Skipped (bad address data)", r.skipped) + sec("Skipped (outside region)", r.outOfRegion) + sec("Existing shops linked to the locator", r.linked) + "\n";
  console.log(report);
  if (opt("report")) writeFileSync(opt("report"), report);

  if (!has("apply")) { console.log("Dry run - nothing written. Re-run with --apply."); return; }
  const changed = r.newShops.length + r.newWeekly.length + r.newSpecial.length + r.filledFees.length + r.replaced.length + r.ended.length + r.linked.length + r.retitled.length;
  if (!changed) { console.log("No changes."); return; }
  writeFileSync("data/shops.json", prettyFile(shops));
  writeFileSync("data/events.json", rowsFile(events));
  writeFileSync("data/calendar_log.json", rowsFile(log));
  writeFileSync(queuePath, prettyFile(queue));
  console.log("Written: data/shops.json, data/events.json, data/calendar_log.json, data/research_queue.json");
}

if (isMain(import.meta.url)) main();
