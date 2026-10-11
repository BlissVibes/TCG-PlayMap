/**
 * The Riftbound import pipeline, run against FIXTURES (never the network).
 * Rule 16 from Collectify: assert on the resulting data, and mutation-check -
 * each ownership rule here was broken deliberately while writing this and the
 * matching test failed.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { buildSlots, feeText, parseArgs, splitAddress } from "../scripts/riftbound/pull.mjs";
import { cleanWeeklyTitle, DEFAULT_REGION, matchShop, merge, normPhone, outsideRegion, slug } from "../scripts/candidates/merge.mjs";
import { bumpVersion, nextVersion } from "../scripts/bump_version.mjs";
import { copyData, DATA_FILES } from "../scripts/copy_data.mjs";
import { validateData } from "../lib/data";

describe("riftbound pull: arguments are read before any request", () => {
  it("--help and anything unrecognised never start a pull", () => {
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(parseArgs(["-h"])).toEqual({ help: true });
    expect(parseArgs(["--apply"]).error).toMatch(/--apply/);
    expect(parseArgs(["data/candidates/riftbound-locator.json"]).error).toMatch(/riftbound-locator/);
    expect(parseArgs(["--out"]).error).toMatch(/--out/);
    expect(parseArgs(["--ahead", "-3"]).error).toMatch(/--ahead/);
  });

  it("accepts the three real options, and the workflow's bare call", () => {
    expect(parseArgs([])).toEqual({ out: "data/candidates/riftbound-locator.json", back: 35, ahead: 56 });
    expect(parseArgs(["--out", "x.json", "--back", "14", "--ahead", "28"])).toEqual({ out: "x.json", back: 14, ahead: 28 });
  });
});

describe("riftbound pull helpers", () => {
  it("splits every address format the locator returns", () => {
    expect(splitAddress("3505 E. Chapman Ave. Suite C, Orange, CA, 92869")).toEqual({ address: "3505 E. Chapman Ave. Suite C", city: "Orange", state: "CA", zip: "92869" });
    expect(splitAddress("4116 Burbank Blvd, Burbank, CA 91505, USA")).toEqual({ address: "4116 Burbank Blvd", city: "Burbank", state: "CA", zip: "91505" });
    expect(splitAddress("941 E Main St\nSANTA PAULA, CA 93060\nUNITED STATES")).toMatchObject({ address: "941 E Main St", zip: "93060" });
    expect(splitAddress("9036 Tampa Ave, Northridge 91324")).toEqual({ address: "9036 Tampa Ave", city: "Northridge", state: null, zip: "91324" });
  });

  it("turns cents into a fee players read", () => {
    expect([feeText(1000), feeText(1250), feeText(0), feeText(null)]).toEqual(["$10", "$12.50", "Free", null]);
  });

  it("finds weekly slots in LA local time and keeps one-offs apart", () => {
    const store = { id: 7 };
    // Tue 6:30 PM PDT = Wed 01:30 UTC; three weeks running, plus a skirmish.
    const evs = ["2026-09-23", "2026-09-30", "2026-10-07"].map((d, i) => ({
      id: i, store, name: "Tuesday Nexus Night", start_datetime: `${d}T01:30:00+00:00`, timezone: "America/Los_Angeles", cost_in_cents: 500, event_type: "LOCALS",
    }));
    evs.push({ id: 9, store, name: "Vendetta Summoner Skirmish", start_datetime: "2026-10-18T20:00:00+00:00", timezone: "America/Los_Angeles", cost_in_cents: 2000, event_type: "LOCALS" });
    const out = buildSlots(evs, "2026-10-09").get(7);
    expect(out.recurring).toHaveLength(1);
    expect(out.recurring[0]).toMatchObject({ weekday: 2, time: "18:30", seen: 3, fee: "$5", kind: "tournament" });
    expect(out.special).toEqual([expect.objectContaining({ date: "2026-10-18", time: "13:00", fee: "$20", title: "Vendetta Summoner Skirmish" })]);
  });

  it("drops a series that stopped more than three weeks ago", () => {
    const store = { id: 1 };
    const evs = ["2026-08-01", "2026-08-08"].map((d, i) => ({ id: i, store, name: "Sat", start_datetime: `${d}T19:00:00+00:00`, timezone: "America/Los_Angeles", cost_in_cents: 0 }));
    expect(buildSlots(evs, "2026-10-09").get(1).recurring).toEqual([]);
  });
});

// ── merge fixtures ───────────────────────────────────────────────────────────
const TODAY = "2026-10-09";
const handShop = () => ({
  id: "fire-and-dice", name: "Fire & Dice", address: "9036 Tampa Ave", city: "Northridge", state: "CA", zip: "91324",
  lat: 34.2345358, lon: -118.5534677, tz: "America/Los_Angeles", phone: "(818) 914-4538", games: ["riftbound"],
  active: true, source: { checked: "2026-09-30" },
});
const handEvent = () => ({ id: "fd-wed-riftbound", shopId: "fire-and-dice", game: "riftbound", kind: "play", weekday: 3, start: "19:15", confidence: "scraped" });
const slot = (weekday: number, time: string, fee: string | null, extra = {}) => ({
  weekday, time, seen: 4, dates: [], firstSeen: "2026-09-10", lastSeen: "2026-10-08", title: "Nexus Night", fee, kind: "tournament", eventUrl: "https://locator/e/1", ...extra,
});
const store = (over = {}) => ({
  sourceId: "uuid-new", name: "Tiny Card Cafe", address: "1 Elm St", city: "Glendale", state: "CA", zip: "91203",
  lat: 34.15, lng: -118.25, phone: "8185551234", website: null, socials: {}, sourceUrl: "https://locator/stores/uuid-new",
  game: "riftbound", recurring: [slot(1, "18:00", "$10")], special: [], ...over,
});
const cands = (stores: object[]) => ({ source: "riftbound-locator", pulled: TODAY, window: { from: "2026-09-04", to: "2026-12-04" }, stores });
const run = (stores: object[], data: { shops: any[]; events: any[] } = { shops: [handShop()], events: [handEvent()] }) => {
  const d = { shops: structuredClone(data.shops), events: structuredClone(data.events), log: [] as any[], queue: [] as any[] };
  const r = merge({ cands: cands(stores), ...d, today: TODAY });
  return { ...d, r };
};

describe("merge: new shops", () => {
  it("creates the shop, its weekly night with its fee, a log line and a research-queue entry", () => {
    const { shops, events, log, queue } = run([store()]);
    const s = shops.find((x: any) => x.id === "tiny-card-cafe")!;
    expect(s).toMatchObject({ origin: "riftbound-locator", sourceIds: { riftbound: "uuid-new" }, phone: "(818) 555-1234", zip: "91203" });
    expect(events.find((e: any) => e.shopId === "tiny-card-cafe")).toMatchObject({ weekday: 1, start: "18:00", fee: "$10", origin: "riftbound-locator", confidence: "scraped" });
    expect(log.filter((l: any) => l.shopId === "tiny-card-cafe").map((l: any) => l.action)).toEqual(["added", "added"]);
    expect(queue).toEqual([expect.objectContaining({ shopId: "tiny-card-cafe", status: "todo" })]);
  });

  it("produces data that passes the site's own validator", () => {
    const { shops, events, log } = run([store()]);
    expect(validateData({ shops, events, log } as any)).toEqual([]);
  });

  it("skips a store with no ZIP rather than inventing one", () => {
    const { r, shops } = run([store({ zip: null })]);
    expect(shops).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
  });

  it("is idempotent: a second identical run changes nothing", () => {
    const first = run([store()]);
    const second = run([store()], { shops: first.shops, events: first.events });
    expect(second.events).toEqual(first.events);
    expect(second.log).toEqual([]);
  });
});

describe("weekly titles", () => {
  it("drops the date a weekly title was copied from (the three seen on 2026-10-10)", () => {
    expect(cleanWeeklyTitle("9/30 Nexus Night")).toBe("Nexus Night");
    expect(cleanWeeklyTitle("10/10/26 Lake Forest Riftbound Vendetta Summoner Skirmish 2 Saturday 10 AM")).toBe("Lake Forest Riftbound Vendetta Summoner Skirmish 2");
    expect(cleanWeeklyTitle("9/06/26 Fountain Valley Riftbound Nexus Night Sunday 12 PM")).toBe("Fountain Valley Riftbound Nexus Night");
  });

  it("handles every other dated shape in the real pull", () => {
    expect(cleanWeeklyTitle("9/15/26 Lake Forest Riftbound Nexus Night Tuesday 630 PM")).toBe("Lake Forest Riftbound Nexus Night");
    expect(cleanWeeklyTitle("Boomloot Wednesday Nexus Nights 09/09")).toBe("Boomloot Wednesday Nexus Nights");
    expect(cleanWeeklyTitle("Sunday Nexus Night (09/13) @Main Street Cards")).toBe("Sunday Nexus Night @Main Street Cards");
    expect(cleanWeeklyTitle("AHF - 9/8 Tue Nexus Night BO1")).toBe("AHF - Tue Nexus Night BO1");
    expect(cleanWeeklyTitle("GXGAMERS Wed 09/17 RIFTBOUND Nexus Night 1v1")).toBe("GXGAMERS Wed RIFTBOUND Nexus Night 1v1");
    expect(cleanWeeklyTitle("September 08, 2026,Top Deck Keep,Constructed")).toBe("Top Deck Keep, Constructed");
  });

  it("falls back to the game's night name when nothing meaningful is left, keeping a short tag", () => {
    expect(cleanWeeklyTitle("9/30")).toBe("Riftbound Nexus Night");
    expect(cleanWeeklyTitle("10/7/26 Sat 6 PM")).toBe("Riftbound Nexus Night");
    expect(cleanWeeklyTitle("9/9 1v1")).toBe("Riftbound Nexus Night - 1v1");
  });

  it("leaves a clean title alone, and is idempotent", () => {
    for (const t of ["Friday Evening Nexus Nights - 1v1", "CBG Riftbound Nexus Night (Season 4.2 Week 1)", "NEXUS FRIDAY (But on a Tuesday)",
      "Nexus Tabletop Games Saturday Nexus 1v1 Bo3", "Drewbee's Nexus Night - Free Entry", "Monday Night Riftbound at DCG", "Nexus Night @ The Light"]) {
      expect(cleanWeeklyTitle(t)).toBe(t);
    }
    for (const t of ["9/30 Nexus Night", "September 08, 2026,Top Deck Keep,Constructed", "9/9 1v1", "Sunday Nexus Night (09/13) @Main Street Cards"]) {
      const once = cleanWeeklyTitle(t);
      expect(cleanWeeklyTitle(once)).toBe(once);
    }
  });

  it("merge writes the cleaned title, and fixes rows it already owns without touching anything else", () => {
    const first = run([store({ recurring: [slot(1, "18:00", "$10", { title: "9/30 Nexus Night" })] })]);
    expect(first.events.find((e: any) => e.shopId === "tiny-card-cafe")!.title).toBe("Nexus Night");
    // An older run left a dated title behind, on our row and on a hand-entered one.
    const stale = structuredClone(first.events);
    stale.find((e: any) => e.shopId === "tiny-card-cafe")!.title = "9/30 Nexus Night";
    stale.find((e: any) => e.id === "fd-wed-riftbound")!.title = "9/30 Hand Typed";
    const second = run([store({ recurring: [slot(1, "18:00", "$10", { title: "10/7 Nexus Night" })] })], { shops: first.shops, events: stale });
    expect(second.r.retitled).toHaveLength(1);
    expect(second.events.find((e: any) => e.shopId === "tiny-card-cafe")!.title).toBe("Nexus Night");
    expect(second.events.find((e: any) => e.id === "fd-wed-riftbound")!.title).toBe("9/30 Hand Typed");   // not ours
    expect(second.events).toHaveLength(first.events.length);
    expect(second.log).toEqual([]);
  });
});

describe("merge: only stores inside the region", () => {
  // 2026-10-10: a "within N miles of LA" locator search returned a store in
  // Roanoke, Virginia. It became an active shop the LA map could not pin.
  const roanoke = { name: "Star City Comics & Games", address: "5728 Williamson Rd", city: "Roanoke", state: "VA", zip: "24012", lat: 37.33, lng: -79.95 };
  const lancaster = { name: "High Desert Cards", address: "44000 10th St W", city: "Lancaster", state: "CA", zip: "93534", lat: 34.6868, lng: -118.1542 };

  it("rejects Roanoke VA and says why, accepts Lancaster CA", () => {
    expect(outsideRegion(roanoke)).toMatch(/state is VA.*21\d\d mi/);
    expect(outsideRegion(lancaster)).toBeNull();
  });

  it("checks distance on its own: far away with no state, or with a wrong 'CA'", () => {
    expect(outsideRegion({ ...roanoke, state: null })).toMatch(/21\d\d mi.*limit 120 mi/);
    expect(outsideRegion({ ...roanoke, state: "CA" })).toMatch(/limit 120 mi/);
    expect(outsideRegion({ ...lancaster, state: null })).toBeNull();
    expect(outsideRegion({ ...lancaster, state: " ca " })).toBeNull();
  });

  it("checks the state on its own: a nearby point labelled another state", () => {
    expect(outsideRegion({ ...lancaster, state: "NV" })).toMatch(/state is NV/);
  });

  it("draws the line at the region radius, and a candidate file can carry its own region", () => {
    const at = (mi: number) => ({ state: "CA", lat: DEFAULT_REGION.lat + mi / 69.09, lng: DEFAULT_REGION.lon });
    expect(outsideRegion(at(DEFAULT_REGION.miles - 3))).toBeNull();
    expect(outsideRegion(at(DEFAULT_REGION.miles + 3))).toMatch(/limit 120 mi/);
    expect(outsideRegion(roanoke, { name: "Roanoke", lat: 37.27, lon: -79.94, miles: 50, states: ["VA"] })).toBeNull();
  });

  it("merge creates nothing for an out-of-region store and reports it with the distance", () => {
    const { r, shops, events, log, queue } = run([store({ ...roanoke, sourceId: "store-15595" }), store()]);
    expect(shops.map((x: any) => x.id)).toEqual(["fire-and-dice", "tiny-card-cafe"]);
    expect(events.some((e: any) => /star-city/.test(e.shopId))).toBe(false);
    expect(log.some((l: any) => /star-city/.test(l.shopId))).toBe(false);
    expect(queue).toHaveLength(1);
    expect(r.outOfRegion).toEqual([expect.stringMatching(/^Star City Comics & Games \(5728 Williamson Rd, Roanoke\): state is VA.*mi/)]);
    expect(r.skipped).toEqual([]);
  });
});

describe("merge: hand-entered shops are not the importer's", () => {
  it("matches Fire & Dice by location, links it, and only FILLS its missing fee", () => {
    const fd = store({ sourceId: "uuid-fd", name: "Fire & Dice", lat: 34.2338064, lng: -118.5523942, recurring: [slot(3, "19:15", "$10"), slot(0, "15:00", "$10")] });
    const { shops, events, r } = run([fd]);
    expect(shops).toHaveLength(1);
    expect(shops[0].sourceIds).toEqual({ riftbound: "uuid-fd" });
    expect(events.find((e: any) => e.id === "fd-wed-riftbound")).toMatchObject({ fee: "$10", kind: "play" });  // kind untouched
    // The Sunday night is NOT added at a hand-entered shop - it is reported.
    expect(events).toHaveLength(1);
    expect(r.curatedDiffs).toHaveLength(1);
  });

  it("never overwrites a fee a human entered", () => {
    const e = { ...handEvent(), fee: "$8" };
    const { events } = run([store({ name: "Fire & Dice", lat: 34.2338, lng: -118.5524, recurring: [slot(3, "19:15", "$10")] })], { shops: [handShop()], events: [e] });
    expect(events[0].fee).toBe("$8");
  });

  it("does add dated special events at a hand-entered shop", () => {
    const fd = store({ name: "Fire & Dice", lat: 34.2338, lng: -118.5524, recurring: [], special: [{ date: "2026-10-18", time: "13:00", title: "Summoner Skirmish", fee: "$20", kind: "tournament", eventUrl: "u" }] });
    const { events } = run([fd]);
    expect(events.find((e: any) => e.date === "2026-10-18")).toMatchObject({ shopId: "fire-and-dice", fee: "$20", origin: "riftbound-locator" });
  });
});

describe("merge: the importer's own rows over time", () => {
  const base = () => run([store({ recurring: [slot(1, "18:00", "$10"), slot(4, "19:00", "$5")] })]);

  it("ends (never deletes) a night the source stops listing, with a log line", () => {
    const b = base();
    const next = run([store({ recurring: [slot(1, "18:00", "$10")] })], { shops: b.shops, events: b.events });
    const thu = next.events.find((e: any) => e.weekday === 4)!;
    expect(thu.validUntil).toBe("2026-10-08");
    expect(next.events).toHaveLength(b.events.length);
    expect(next.log).toEqual([expect.objectContaining({ action: "removed", game: "riftbound" })]);
  });

  it("on a fee change, ends the old row and starts a new one (rule 4)", () => {
    const b = base();
    const next = run([store({ recurring: [slot(1, "18:00", "$12"), slot(4, "19:00", "$5")] })], { shops: b.shops, events: b.events });
    const mon = next.events.filter((e: any) => e.weekday === 1);
    expect(mon).toHaveLength(2);
    expect(mon.find((e: any) => e.fee === "$10")!.validUntil).toBe("2026-10-08");
    expect(mon.find((e: any) => e.fee === "$12")!.validFrom).toBe(TODAY);
    expect(next.log).toEqual([expect.objectContaining({ action: "changed" })]);
  });

  it("refuses to end anything when the pull looks broken (an outage returns 'nothing')", () => {
    const many = Array.from({ length: 12 }, (_, i) => store({ sourceId: `u${i}`, name: `Shop ${i}`, lat: 34 + i / 100, zip: "91203" }));
    const b = run(many);
    expect(() => merge({ cands: cands(many.slice(0, 2)), shops: b.shops, events: b.events, log: [], queue: [], today: TODAY })).toThrow(/broken pull/);
  });
});

describe("copy_data: the files the site fetches", () => {
  it("copies the three data files, compacted, and stamps them by content", () => {
    const root = mkdtempSync(join(tmpdir(), "tcg-copy-"));
    try {
      mkdirSync(join(root, "data"));
      const write = (shops: object[]) => {
        writeFileSync(join(root, "data", "shops.json"), JSON.stringify(shops, null, 2));
        writeFileSync(join(root, "data", "events.json"), '[\n  { "id": "e1",   "shopId": "a" }\n]\n');
        writeFileSync(join(root, "data", "calendar_log.json"), "[]");
      };
      write([{ id: "a" }]);
      const first = copyData(root);
      expect(first).toMatch(/^[0-9a-f]{12}$/);
      for (const f of DATA_FILES) expect(() => JSON.parse(readFileSync(join(root, "public", "data", f), "utf8"))).not.toThrow();
      expect(readFileSync(join(root, "public", "data", "events.json"), "utf8")).toBe('[{"id":"e1","shopId":"a"}]');
      expect(copyData(root)).toBe(first);                  // same data, same stamp
      write([{ id: "a" }, { id: "b" }]);
      expect(copyData(root)).not.toBe(first);              // new data, new stamp: no stale cache
      // A broken file stops the build instead of shipping.
      writeFileSync(join(root, "data", "shops.json"), "[{ oops");
      expect(() => copyData(root)).toThrow();
      writeFileSync(join(root, "data", "shops.json"), '{"not":"an array"}');
      expect(() => copyData(root)).toThrow(/not a JSON array/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("small helpers", () => {
  it("slugs, phones, odometer", () => {
    expect(slug("Paper Hero's Games & More!")).toBe("paper-heros-games-and-more");
    expect([normPhone("+1 818 914 4512"), normPhone("6692326666"), normPhone("12345")]).toEqual(["(818) 914-4512", "(669) 232-6666", null]);
    expect([nextVersion("0.1.1.0"), nextVersion("0.1.1.9"), nextVersion("0.9.9.9")]).toEqual(["0.1.1.1", "0.1.2.0", "1.0.0.0"]);
  });
  it("writes the bump into a version file, with Mark's reason only when one is given", () => {
    const dir = mkdtempSync(join(tmpdir(), "tcg-bump-"));
    const file = join(dir, "version.ts");
    const start = 'export const VERSION = "0.1.6.9";\n\nexport const CHANGELOG: ChangeEntry[] = [\n  {\n    version: "0.1.6.9",\n    date: "2026-10-10",\n    changes: ["x"],\n  },\n];\n';
    try {
      writeFileSync(file, start);
      expect(bumpVersion("A site change.", "2026-10-11", file)).toBe("0.1.7.0");
      let src = readFileSync(file, "utf8");
      expect(src).toContain('export const VERSION = "0.1.7.0";');
      expect(src).toContain('    version: "0.1.7.0",\n    date: "2026-10-11",\n    changes: ["A site change."],\n  },');
      expect(src).not.toContain("dataBump");
      expect(bumpVersion("San Diego shops added.", "2026-10-12", file, "Mark 2026-10-12: wants this one visible as a release")).toBe("0.1.7.1");
      src = readFileSync(file, "utf8");
      expect(src).toContain('    changes: ["San Diego shops added."],\n    dataBump: "Mark 2026-10-12: wants this one visible as a release",\n  },');
      expect(src.indexOf("0.1.7.1")).toBeLessThan(src.indexOf('version: "0.1.7.0"'));   // newest first
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("matchShop prefers the stored locator id over distance", () => {
    const shops = [{ ...handShop(), sourceIds: { riftbound: "abc" } }];
    expect(matchShop(shops, { sourceId: "abc", name: "Different Name", lat: 0, lng: 0 }, "riftbound")?.id).toBe("fire-and-dice");
  });
});
