#!/usr/bin/env node
/**
 * WRITE docs/NEEDS_MARK.md: MARK'S FOLLOW-UP LIST, FROM THE RESEARCH QUEUE.
 *
 *   node scripts/needs_mark.mjs [--out docs/NEEDS_MARK.md] [--check] [--date YYYY-MM-DD]
 *
 * Research sessions leave a `needsMark` value on a queue entry when only a
 * person can finish the shop: "discord" (sessions never open Discord), "phone"
 * (a time or a fee nobody publishes), "image" (a schedule graphic that could
 * not be read). Those entries were scattered through data/research_queue.json.
 * This collects them into one page, one section per value, plus the blocked
 * shops that have no website and no socials at all, for Mark to call or drop.
 *
 * It also lists what to RE-CHECK SOON: weekly nights whose `validUntil` falls
 * within the next RECHECK_DAYS days. A store that publishes one month at a time
 * gets its rows capped at the end of that month ("only October is published,
 * recheck in November"); without this list, those nights would simply vanish
 * from the calendar on the 1st with nobody told to look again.
 *
 * The page is GENERATED. Edit the data, not the page, then re-run this.
 * Same data and same date in, same bytes out: rows are sorted. The re-check
 * section depends on the run date (Los Angeles), which the page states;
 * --date fixes it, for tests and for looking ahead.
 * --check writes nothing and exits 1 when the page is out of date.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./lib/isMain.mjs";

/** Sections in this order; any other needsMark value follows, alphabetically. */
export const KNOWN = {
  discord: { title: "Discord: open the server and read its schedule channel", link: "Invite" },
  phone: { title: "Phone: call the shop for a time or a fee", link: "Phone" },
  image: { title: "Image: a schedule graphic nobody could read", link: "Where" },
};

/** How far ahead the re-check section looks. */
export const RECHECK_DAYS = 21;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const clock = (t) => { const [h, m] = String(t).split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`; };

/**
 * Weekly rows ending within `days` of `today`, both ends included. A row that
 * already ended is not here (nothing to re-check; the calendar log has it).
 * Sorted by shop name, then weekday, then start.
 */
export function recheckRows(events, shops, today, days = RECHECK_DAYS) {
  const until = addDays(today, days);
  const shopById = new Map(shops.map((s) => [s.id, s]));
  return events
    .filter((e) => e.weekday != null && e.validUntil && e.validUntil >= today && e.validUntil <= until)
    .map((e) => ({ event: e, shop: shopById.get(e.shopId) ?? { id: e.shopId, name: e.shopId } }))
    .sort((a, b) => String(a.shop.name).localeCompare(String(b.shop.name), "en", { sensitivity: "base" }) || String(a.shop.id).localeCompare(String(b.shop.id))
      || a.event.weekday - b.event.weekday || String(a.event.start).localeCompare(String(b.event.start)) || String(a.event.id).localeCompare(String(b.event.id)));
}

const cell = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const byName = (a, b) => String(a.name).localeCompare(String(b.name), "en", { sensitivity: "base" }) || String(a.shopId).localeCompare(String(b.shopId));
const firstUrl = (text, re) => re.exec(String(text ?? ""))?.[0]?.replace(/[).,;]+$/, "") ?? null;

/** What Mark needs in hand for one entry: the invite, the number, or where the image is. */
export function handleFor(kind, entry, shop) {
  if (kind === "discord") {
    return entry.socials?.discord ?? shop?.socials?.discord ?? firstUrl(entry.notes, /https?:\/\/(?:www\.)?discord(?:\.gg|(?:app)?\.com\/invite)\/[^\s)]+/i) ?? "no invite recorded";
  }
  if (kind === "phone") return shop?.phone ?? firstUrl(entry.notes, /\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}/) ?? "no phone recorded";
  // image, and any value we do not know: the best pointer we have.
  return entry.socials?.instagram ?? entry.socials?.facebook ?? entry.website ?? shop?.website ?? firstUrl(entry.notes, /https?:\/\/[^\s)]+/) ?? "see notes";
}

/**
 * @param {{ queue: any[], shops: any[], events: any[], today?: string }} data  today: YYYY-MM-DD; without it the re-check section is left out
 * @returns {{ markdown: string, counts: Record<string, number> }}
 */
export function needsMarkDoc({ queue, shops, events, today }) {
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const eventCount = new Map();
  for (const e of events) eventCount.set(e.shopId, (eventCount.get(e.shopId) ?? 0) + 1);
  const row = (kind, q) => {
    const shop = shopById.get(q.shopId);
    return `| ${cell(q.name)} | ${cell(q.city ?? shop?.city)} | ${cell(handleFor(kind, q, shop))} | ${eventCount.get(q.shopId) ?? 0} | ${cell(q.notes)} |`;
  };

  // needsMark may be one value or a list; an entry appears in each section it names.
  const kindsOf = (q) => (Array.isArray(q.needsMark) ? q.needsMark : q.needsMark ? [q.needsMark] : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  const byKind = new Map();
  for (const q of queue) for (const k of kindsOf(q)) (byKind.get(k) ?? byKind.set(k, []).get(k)).push(q);
  const order = [...Object.keys(KNOWN).filter((k) => byKind.has(k)), ...[...byKind.keys()].filter((k) => !(k in KNOWN)).sort()];

  const counts = {};
  const out = [
    "# Needs Mark: shops only a person can finish",
    "",
    "GENERATED by `node scripts/needs_mark.mjs` from `data/research_queue.json`. Do not edit this page:",
    "change the queue entry (set or clear `needsMark`, fix its notes) and run the script again.",
    "What the values mean and who sets them: `docs/SHOP_RESEARCH.md`, \"The `needsMark` field\".",
    "",
    "\"Events\" is the number of event rows the shop has on the calendar today. 0 means the shop is a",
    "pin with no schedule; more than 0 usually means only an importer's nights are listed.",
    "",
  ];
  for (const kind of order) {
    const list = byKind.get(kind).slice().sort(byName);
    counts[kind] = list.length;
    const meta = KNOWN[kind] ?? { title: `${kind}: (a value this script has no heading for)`, link: "Where" };
    out.push(`## ${meta.title} (${list.length})`, "", `| Shop | City | ${meta.link} | Events | Notes |`, "|---|---|---|---|---|", ...list.map((q) => row(kind, q)), "");
  }
  if (!order.length) out.push("No queue entry carries `needsMark` right now.", "");

  // Blocked, nothing to follow: no website, no socials, and not already listed above.
  const noHandle = queue
    .filter((q) => q.status === "blocked" && !kindsOf(q).length && !q.website && !Object.values(q.socials ?? {}).some(Boolean))
    .sort(byName);
  counts.blockedNoHandle = noHandle.length;
  out.push(`## Blocked, no handle: no website and no socials (${noHandle.length})`, "",
    "Research found nothing to read and nothing to follow. Call the shop, or decide it is not worth chasing.", "",
    "| Shop | City | Phone | Events | Notes |", "|---|---|---|---|---|",
    ...noHandle.map((q) => { const shop = shopById.get(q.shopId); return `| ${cell(q.name)} | ${cell(q.city ?? shop?.city)} | ${cell(shop?.phone ?? "none listed")} | ${eventCount.get(q.shopId) ?? 0} | ${cell(q.notes)} |`; }),
    "");
  if (today) {
    const rows = recheckRows(events, shops, today);
    counts.recheckRows = rows.length;
    counts.recheckShops = new Set(rows.map((r) => r.shop.id)).size;
    out.push(`${RECHECK_HEADING}: weekly nights that end by ${addDays(today, RECHECK_DAYS)} (${rows.length} at ${counts.recheckShops} shops)`, "",
      `As of ${today}, looking ${RECHECK_DAYS} days ahead. Each of these nights has an end date on its row and leaves the calendar after`,
      "it. Open the source, see whether the store has published the next month, and extend the row or let it end.", "");
    if (!rows.length) out.push("Nothing ends in that window.", "");
    let last = null;
    for (const { event: e, shop } of rows) {
      if (shop.id !== last) {
        if (last !== null) out.push("");
        out.push(`### ${cell(shop.name)}${shop.city ? ` (${cell(shop.city)})` : ""}`, "", "| Night | Game | Ends | Source | Note |", "|---|---|---|---|---|");
        last = shop.id;
      }
      out.push(`| ${WD[e.weekday]} ${clock(e.start)}${e.title ? ` ${cell(e.title)}` : ""} | ${cell(e.game)} | ${e.validUntil} | ${cell(e.source?.url ?? "no source URL")} | ${cell(e.notes ?? e.source?.note ?? "")} |`);
    }
    if (rows.length) out.push("");
  }
  return { markdown: out.join("\n"), counts };
}

/** The heading the date-dependent section starts with. Everything before it comes from the data alone. */
export const RECHECK_HEADING = "## Re-check soon";

/**
 * The part of the page that depends only on the data: everything before the
 * "Re-check soon" section. tests/needsMark.test.ts compares this part of the
 * committed page with a fresh build, so a queue change that forgot to re-run
 * the script fails the gates; the dated section is left out of that
 * comparison, or the test would go red every morning.
 */
export function queueSections(markdown) {
  const i = String(markdown).indexOf(`\n${RECHECK_HEADING}`);
  return (i < 0 ? String(markdown) : String(markdown).slice(0, i)).trimEnd();
}

/** Arguments are read first; anything unrecognised stops the run. */
export function parseArgs(argv) {
  /** @type {{ out: string, check: boolean, date: string|null, help?: boolean, error?: string }} */
  const opts = { out: "docs/NEEDS_MARK.md", check: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { ...opts, help: true };
    if (a === "--check") opts.check = true;
    else if (a === "--out" && argv[i + 1] && !argv[i + 1].startsWith("--")) opts.out = argv[++i];
    else if (a === "--date" && /^\d{4}-\d{2}-\d{2}$/.test(argv[i + 1] ?? "") && !Number.isNaN(Date.parse(`${argv[i + 1]}T12:00:00Z`))) opts.date = argv[++i];
    else return { ...opts, error: `unrecognised or incomplete argument: ${a}` };
  }
  return opts;
}

function main() {
  const usage = "usage: node scripts/needs_mark.mjs [--out docs/NEEDS_MARK.md] [--check] [--date YYYY-MM-DD]";
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(usage); return; }
  if (opts.error) { console.error(`${opts.error}\n${usage}`); process.exit(2); }
  const read = (f) => JSON.parse(readFileSync(f, "utf8"));
  const today = opts.date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const { markdown, counts } = needsMarkDoc({ queue: read("data/research_queue.json"), shops: read("data/shops.json"), events: read("data/events.json"), today });
  const summary = Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ");
  const current = existsSync(opts.out) ? readFileSync(opts.out, "utf8") : null;
  if (opts.check) {
    if (current === markdown) { console.log(`${opts.out} is up to date (${summary})`); return; }
    console.error(`${opts.out} is out of date (${summary}). Run: node scripts/needs_mark.mjs`);
    process.exit(1);
  }
  if (current === markdown) { console.log(`${opts.out} unchanged (${summary})`); return; }
  writeFileSync(opts.out, markdown);
  console.log(`${opts.out} written (${summary})`);
}

if (isMain(import.meta.url)) main();
