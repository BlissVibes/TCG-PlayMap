/**
 * The Riftbound import pipeline, run against FIXTURES (never the network).
 * Rule 16 from Collectify: assert on the resulting data, and mutation-check -
 * each ownership rule here was broken deliberately while writing this and the
 * matching test failed.
 */
import { describe, it, expect } from "vitest";
import { buildSlots, feeText, splitAddress } from "../scripts/riftbound/pull.mjs";
import { matchShop, merge, normPhone, slug } from "../scripts/candidates/merge.mjs";
import { nextVersion } from "../scripts/bump_version.mjs";
import { validateData } from "../lib/data";

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

describe("small helpers", () => {
  it("slugs, phones, odometer", () => {
    expect(slug("Paper Hero's Games & More!")).toBe("paper-heros-games-and-more");
    expect([normPhone("+1 818 914 4512"), normPhone("6692326666"), normPhone("12345")]).toEqual(["(818) 914-4512", "(669) 232-6666", null]);
    expect([nextVersion("0.1.1.0"), nextVersion("0.1.1.9"), nextVersion("0.9.9.9")]).toEqual(["0.1.1.1", "0.1.2.0", "1.0.0.0"]);
  });
  it("matchShop prefers the stored locator id over distance", () => {
    const shops = [{ ...handShop(), sourceIds: { riftbound: "abc" } }];
    expect(matchShop(shops, { sourceId: "abc", name: "Different Name", lat: 0, lng: 0 }, "riftbound")?.id).toBe("fire-and-dice");
  });
});
