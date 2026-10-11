/**
 * The Lorcana pull (Ravensburger Play), against FIXTURES - never the network.
 * The script is imported, which is safe: it only runs when executed directly
 * (scripts/lib/isMain.mjs), and nothing here calls its main().
 */
import { describe, it, expect } from "vitest";
import { CASUAL, GAME, isLorcanaEvent, MAX_REQUESTS, parseArgs, PAUSE_MS, SPECIAL, storeRow } from "../scripts/lorcana/pull.mjs";
import { buildSlots } from "../scripts/riftbound/pull.mjs";
import { cleanWeeklyTitle, merge } from "../scripts/candidates/merge.mjs";
import { validateData } from "../lib/data";

const TODAY = "2026-10-10";
const ev = (over: Record<string, unknown> = {}) => ({
  id: 1, name: "Tuesday Evening Weekly Play (Constructed)", start_datetime: "2026-09-30T01:00:00+00:00", timezone: "America/Los_Angeles",
  cost_in_cents: 800, game_type: "LORCANA", game: 1, event_type: "LOCALS", event_status: "SCHEDULED", description: "",
  gameplay_format: { name: "Core Constructed" }, store: { id: 7 }, ...over,
});
const LOR = { locator: "https://tcg.ravensburgerplay.com", special: SPECIAL, casual: CASUAL, tz: "America/Los_Angeles", withFormat: true };

describe("lorcana pull: staying light", () => {
  it("keeps the pacing Mark's 2026-10-10 decision depends on", () => {
    // Not a style check: the decision was "pull anyway, LIGHTLY". Loosening
    // either number changes what was agreed to.
    expect(PAUSE_MS).toBeGreaterThanOrEqual(1500);
    expect(MAX_REQUESTS).toBeLessThanOrEqual(60);
  });
});

describe("lorcana pull: arguments are read before any request", () => {
  it("--help and anything unrecognised never start a pull", () => {
    // 2026-10-10: `pull.mjs --help` was ignored and a second full pull went out.
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(parseArgs(["-h"])).toEqual({ help: true });
    expect(parseArgs(["--dry-run"]).error).toMatch(/--dry-run/);
    expect(parseArgs(["extra.json"]).error).toMatch(/extra\.json/);
    expect(parseArgs(["--out"]).error).toMatch(/--out/);
    expect(parseArgs(["--back", "soon"]).error).toMatch(/--back/);
  });

  it("accepts the three real options", () => {
    expect(parseArgs([])).toEqual({ out: "data/candidates/lorcana-ravensburger.json", back: 35, ahead: 56 });
    expect(parseArgs(["--out", "x.json", "--back", "14", "--ahead", "28"])).toEqual({ out: "x.json", back: 14, ahead: 28 });
  });
});

describe("lorcana pull helpers", () => {
  it("keeps only Lorcana rows: the shared API returns every game unless filtered", () => {
    expect(isLorcanaEvent(ev())).toBe(true);
    expect(isLorcanaEvent(ev({ game_type: "RIFTBOUND", game: 3 }))).toBe(false);
    expect(isLorcanaEvent(ev({ game_type: "MTG", game: 9 }))).toBe(false);
    expect(GAME).toMatchObject({ id: 1, slug: "disney-lorcana" });
  });

  it("turns a store record into a candidate row, with handles as links", () => {
    const row = storeRow({
      id: 19427, uuid: "0f5ef98b", name: " Mega City One ", full_address: "7301 Melrose Ave, Los Angeles, CA 90046, USA",
      latitude: 34.0837114, longitude: -118.3488182, phone_number: "(323) 934-3373", website: null,
      instagram_handle: "@megacityone", twitter_handle: "megacity", discord_url: "https://discord.gg/x",
    });
    expect(row).toMatchObject({
      sourceId: "0f5ef98b", storeNumber: 19427, name: "Mega City One", address: "7301 Melrose Ave", city: "Los Angeles", state: "CA", zip: "90046",
      lat: 34.0837114, lng: -118.3488182, game: "lorcana", sourceUrl: "https://tcg.ravensburgerplay.com/stores/0f5ef98b",
      socials: { instagram: "https://www.instagram.com/megacityone", x: "https://x.com/megacity", discord: "https://discord.gg/x" },
    });
  });

  it("falls back to the store's own city / state / zip fields when the address line has none", () => {
    expect(storeRow({ id: 1, name: "X", full_address: "1 Elm St", city: "Glendale", administrative_area_level_1_short: "CA", zipcode: "91203-1234" }))
      .toMatchObject({ city: "Glendale", state: "CA", zip: "91203", sourceId: "store-1", sourceUrl: null });
  });

  it("cuts street from city when the address line has no comma between them", () => {
    expect(storeRow({ id: 2, name: "PB", full_address: "3030 Plaza Bonita Rd Suite 1256 National City, CA 91950, USA", city: "National City" }))
      .toMatchObject({ address: "3030 Plaza Bonita Rd Suite 1256", city: "National City", state: "CA", zip: "91950" });
    // A normal line is left exactly as parsed, even if the store's city field differs in case.
    expect(storeRow({ id: 3, name: "X", full_address: "7301 Melrose Ave, Los Angeles, CA 90046, USA", city: "LOS ANGELES" }))
      .toMatchObject({ address: "7301 Melrose Ave", city: "Los Angeles" });
  });

  it("treats championships and prereleases as one-offs, but weekly draft and sealed as weekly", () => {
    for (const t of ["Sunday Afternoon Attack of the Vine! Set Championship", "Hyperia City Prerelease (Sealed)", "Hyperia City Pre-Release Event", "Weekly Play Special Event (Sealed)", "Lorcana Challenge Qualifier"]) {
      expect(SPECIAL.test(t), t).toBe(true);
    }
    for (const t of ["Tuesday Evening Weekly Play (Constructed)", "Lorcana DRAFT at The Game Hub Thursday", "Collectors Lounge Saturday Lorcana League", "Sunday Lorcana weekly"]) {
      expect(SPECIAL.test(t), t).toBe(false);
    }
    expect(CASUAL.test("Friday Night Lorcana Casual Play!")).toBe(true);
    expect(CASUAL.test("Collectors Lounge Saturday Lorcana League")).toBe(true);
  });

  it("builds a weekly slot with its fee and format, in the STORE's time zone", () => {
    // 01:00 UTC Wednesday = 6 PM Tuesday in Los Angeles. One row is mislabelled
    // America/New_York (seen in the real feed); it must still land on Tue 18:00.
    const rows = [
      ev({ id: 1, start_datetime: "2026-09-23T01:00:00+00:00" }),
      ev({ id: 2, start_datetime: "2026-09-30T01:00:00+00:00", timezone: "America/New_York" }),
      ev({ id: 3, start_datetime: "2026-10-07T01:00:00+00:00", gameplay_format: { name: "[Core Constructed]" } }),
    ];
    const s = buildSlots(rows, TODAY, LOR).get(7);
    expect(s.recurring).toHaveLength(1);
    expect(s.recurring[0]).toMatchObject({ weekday: 2, time: "18:00", seen: 3, fee: "$8", format: "Core Constructed", kind: "tournament", eventUrl: "https://tcg.ravensburgerplay.com/events/3" });
    expect(s.special).toEqual([]);
  });

  it("keeps an upcoming championship as a dated one-off and leaves Riftbound's defaults alone", () => {
    const rows = [ev({ id: 9, name: "Attack of the Vine! Set Championship", start_datetime: "2026-10-18T20:00:00+00:00", cost_in_cents: 2500 })];
    const s = buildSlots(rows, TODAY, LOR).get(7);
    expect(s.special).toEqual([expect.objectContaining({ date: "2026-10-18", time: "13:00", fee: "$25", special: true })]);
    // Without options (the Riftbound call) nothing changes: no format field, Riftbound's locator in the link.
    const rift = buildSlots([ev({ id: 1, start_datetime: "2026-09-30T01:00:00+00:00" }), ev({ id: 2, start_datetime: "2026-10-07T01:00:00+00:00" })], TODAY).get(7);
    expect(rift.recurring[0].format).toBeUndefined();
    expect(rift.recurring[0].eventUrl).toMatch(/^https:\/\/locator\.riftbound\.uvsgames\.com\/events\//);
  });

  it("drops a stale week counter from a weekly title, but not a bracketed season label", () => {
    expect(cleanWeeklyTitle("Weekly Lorcana League - Week 11", "lorcana")).toBe("Weekly Lorcana League");
    expect(cleanWeeklyTitle("Weekly Play Week 3", "lorcana")).toBe("Weekly Play");
    expect(cleanWeeklyTitle("CBG Riftbound Nexus Night (Season 4.2 Week 1)")).toBe("CBG Riftbound Nexus Night (Season 4.2 Week 1)");
    expect(cleanWeeklyTitle("10/7 Week 4", "lorcana")).toBe("Lorcana Weekly Play");
    expect(cleanWeeklyTitle("9/30 1v1", "lorcana")).toBe("Lorcana Weekly Play - 1v1");
  });
});

// ── merge: a second importer meeting the first one's shops ───────────────────
const shop = (over: Record<string, unknown> = {}) => ({
  id: "tiny-card-cafe", name: "Tiny Card Cafe", address: "1 Elm St", city: "Glendale", state: "CA", zip: "91203", lat: 34.15, lon: -118.25,
  tz: "America/Los_Angeles", phone: "(818) 555-1234", games: ["riftbound"], active: true, source: { checked: TODAY },
  origin: "riftbound-locator", sourceIds: { riftbound: "rift-uuid" }, notes: "Imported.", ...over,
});
const riftRow = { id: "tiny-card-cafe-ri-mon-1800", shopId: "tiny-card-cafe", game: "riftbound", kind: "tournament", weekday: 1, start: "18:00", fee: "$10", confidence: "scraped", origin: "riftbound-locator" };
const slot = (weekday: number, time: string, fee: string | null, extra = {}) => ({
  weekday, time, seen: 4, dates: [], firstSeen: "2026-09-10", lastSeen: "2026-10-08", title: "Weekly Play", fee, format: "Core Constructed", kind: "tournament", eventUrl: "https://tcg.ravensburgerplay.com/events/1", ...extra,
});
const store = (over = {}) => ({
  sourceId: "lor-uuid", name: "Tiny Card Cafe", address: "1 Elm St", city: "Glendale", state: "CA", zip: "91203", lat: 34.15001, lng: -118.25001,
  phone: "8185551234", website: null, socials: {}, sourceUrl: "https://tcg.ravensburgerplay.com/stores/lor-uuid", game: "lorcana",
  recurring: [slot(2, "18:00", "$8")], special: [], ...over,
});
const run = (stores: object[], data: { shops: any[]; events: any[] }) => {
  const d = { shops: structuredClone(data.shops), events: structuredClone(data.events), log: [] as any[], queue: [] as any[] };
  const r = merge({ cands: { source: "ravensburger-play", pulled: TODAY, window: { from: "2026-09-05", to: "2026-12-05" }, stores }, ...d, today: TODAY });
  return { ...d, r };
};

describe("merge: Lorcana from Ravensburger Play", () => {
  it("adds Lorcana nights at a shop the Riftbound importer created, and leaves Riftbound's rows alone", () => {
    const { shops, events, r, queue, log } = run([store()], { shops: [shop()], events: [riftRow] });
    expect(shops).toHaveLength(1);                                  // linked by location, not created again
    expect(shops[0].sourceIds).toEqual({ riftbound: "rift-uuid", lorcana: "lor-uuid" });
    expect(shops[0].games).toEqual(["riftbound", "lorcana"]);
    const lor = events.find((e: any) => e.game === "lorcana")!;
    expect(lor).toMatchObject({ id: "tiny-card-cafe-lo-tue-1800", weekday: 2, start: "18:00", fee: "$8", format: "Core Constructed", origin: "ravensburger-play", confidence: "scraped" });
    expect(lor.source.note).toMatch(/^Ravensburger Play, seen 4x/);
    expect(events.find((e: any) => e.game === "riftbound")).toEqual(riftRow);   // untouched, and NOT ended
    expect(r.ended).toEqual([]);
    expect(queue).toEqual([]);                                      // an existing shop is not re-queued
    expect(log).toEqual([expect.objectContaining({ action: "added", game: "lorcana", summary: expect.stringMatching(/^Lorcana from the official locator: weekly Tue 6 PM \(\$8\)/) })]);
    expect(validateData({ shops, events, log } as any)).toEqual([]);
  });

  it("only REPORTS when a person already entered Lorcana nights at that shop", () => {
    const hand = { id: "tiny-thu-lorcana", shopId: "tiny-card-cafe", game: "lorcana", kind: "tournament", weekday: 4, start: "17:00", fee: "$10", confidence: "scraped" };
    const { events, r } = run([store()], { shops: [shop({ games: ["riftbound", "lorcana"] })], events: [riftRow, hand] });
    expect(events.filter((e: any) => e.game === "lorcana")).toEqual([hand]);
    expect(r.newWeekly).toEqual([]);
    expect(r.curatedDiffs).toEqual([expect.stringMatching(/Tiny Card Cafe: locator lists Tue 6 PM \$8/)]);
  });

  it("fills a missing fee on a hand-entered Lorcana row in the same slot, and never overwrites one", () => {
    const hand = { id: "tiny-tue-lorcana", shopId: "tiny-card-cafe", game: "lorcana", kind: "play", weekday: 2, start: "18:00", confidence: "scraped" };
    const a = run([store()], { shops: [shop()], events: [hand] });
    expect(a.events).toEqual([{ ...hand, fee: "$8" }]);
    const b = run([store()], { shops: [shop()], events: [{ ...hand, fee: "$5" }] });
    expect(b.events[0].fee).toBe("$5");
  });

  it("creates a new shop named for its real source, and is idempotent", () => {
    const first = run([store({ name: "Lorcana Only Shop", lat: 34.3, lng: -118.4, zip: "91340" })], { shops: [shop()], events: [riftRow] });
    const s = first.shops.find((x: any) => x.id === "lorcana-only-shop")!;
    expect(s).toMatchObject({ origin: "ravensburger-play", games: ["lorcana"], sourceIds: { lorcana: "lor-uuid" } });
    expect(s.notes).toMatch(/^Imported from the Ravensburger Play store locator \(Disney Lorcana\) on 2026-10-10\./);
    expect(first.queue).toEqual([expect.objectContaining({ shopId: "lorcana-only-shop", addedBy: "ravensburger-play", status: "todo" })]);
    const second = run([store({ name: "Lorcana Only Shop", lat: 34.3, lng: -118.4, zip: "91340" })], { shops: first.shops, events: first.events });
    expect(second.events).toEqual(first.events);
    expect(second.log).toEqual([]);
  });

  it("a Lorcana pull never ends Riftbound nights, and a Riftbound pull never ends Lorcana nights", () => {
    const withBoth = run([store()], { shops: [shop()], events: [riftRow] });
    // Lorcana pull with the night gone: ends ONLY the Lorcana row.
    const lorGone = run([store({ recurring: [], special: [{ date: "2026-11-01", time: "13:00", title: "Set Championship", fee: "$25", kind: "tournament", eventUrl: "u" }] })], { shops: withBoth.shops, events: withBoth.events });
    expect(lorGone.events.find((e: any) => e.game === "lorcana" && e.weekday != null)!.validUntil).toBe("2026-10-09");
    expect(lorGone.events.find((e: any) => e.game === "riftbound")!.validUntil).toBeUndefined();
    // Riftbound pull with ITS night gone: the Lorcana row is not its to end.
    const d = { shops: structuredClone(withBoth.shops), events: structuredClone(withBoth.events), log: [] as any[], queue: [] as any[] };
    merge({ cands: { source: "riftbound-locator", pulled: TODAY, window: { from: "2026-09-05", to: "2026-12-05" },
      stores: [{ ...store({ sourceId: "rift-uuid", game: "riftbound", recurring: [], special: [{ date: "2026-11-02", time: "13:00", title: "Skirmish", fee: "$20", kind: "tournament", eventUrl: "u" }] }) }] }, ...d, today: TODAY });
    expect(d.events.find((e: any) => e.game === "riftbound" && e.weekday != null)!.validUntil).toBe("2026-10-09");
    expect(d.events.find((e: any) => e.game === "lorcana" && e.weekday != null)!.validUntil).toBeUndefined();
  });
});
