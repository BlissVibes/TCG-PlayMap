/**
 * What the map popup says about a shop whose schedule we only partly know.
 * 2026-10-10: 103 imported shops showed one or two Riftbound nights and nothing
 * else, and the note saying "other games not researched" was only printed for
 * shops with NO events - exactly the shops that did not need it.
 */
import { describe, it, expect } from "vitest";
import { popupHtml } from "../components/PlayMap";
import { scheduleIncomplete, shopsWithHandRows, shopsWithoutSchedule, type Occurrence, type PlayEvent, type Shop } from "../lib/schedule";

const shop = (over: Partial<Shop> = {}): Shop => ({
  id: "tiny", name: "Tiny Card Cafe", address: "1 Elm St", city: "Glendale", state: "CA", zip: "91203", lat: 34.15, lon: -118.25,
  tz: "America/Los_Angeles", active: true, source: { checked: "2026-10-10" }, games: ["riftbound"],
  notes: "Imported from the official Riftbound store locator. Game nights are posted on Instagram <not readable here>.", ...over,
});
const occ = (s: Shop): Occurrence => ({
  shop: s, date: "2026-10-12", distanceMi: null,
  event: { id: "e1", shopId: s.id, game: "riftbound", kind: "tournament", weekday: 1, start: "18:00", fee: "$10", confidence: "scraped" } as PlayEvent,
});

describe("scheduleIncomplete", () => {
  const rift = { id: "e1", shopId: "tiny", origin: "riftbound-locator" };
  const lor = { id: "e2", shopId: "tiny", origin: "ravensburger-play" };
  const hand = { id: "e3", shopId: "tiny" };

  it("is true for an importer-made shop where every night came from an importer", () => {
    expect(scheduleIncomplete({ id: "tiny", origin: "riftbound-locator" }, shopsWithHandRows([rift]))).toBe(true);
    expect(scheduleIncomplete({ id: "tiny", origin: "riftbound-locator" }, shopsWithHandRows([]))).toBe(true);   // no nights at all
  });

  it("STAYS true when a second importer adds a game (the 0.1.2.9 rule went false here)", () => {
    expect(scheduleIncomplete({ id: "tiny", origin: "riftbound-locator" }, shopsWithHandRows([rift, lor]))).toBe(true);
  });

  it("goes false once a person has entered one night there", () => {
    expect(scheduleIncomplete({ id: "tiny", origin: "riftbound-locator" }, shopsWithHandRows([rift, lor, hand]))).toBe(false);
    // ...at THAT shop: a hand row somewhere else changes nothing.
    expect(scheduleIncomplete({ id: "tiny", origin: "riftbound-locator" }, shopsWithHandRows([rift, { ...hand, shopId: "other" }]))).toBe(true);
  });

  it("is never true for a hand-entered shop", () => {
    expect(scheduleIncomplete({ id: "tiny" }, shopsWithHandRows([]))).toBe(false);
    expect(scheduleIncomplete({ id: "tiny" }, shopsWithHandRows([rift]))).toBe(false);
  });
});

describe("shops with no schedule", () => {
  it("are the shops with no event row at all, whatever kind of row the others have", () => {
    const shops = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const events = [{ shopId: "a" }, { shopId: "a" }, { shopId: "c", validUntil: "2020-01-01" }];
    expect([...shopsWithoutSchedule(shops, events)]).toEqual(["b"]);       // an ended row still means we once had a schedule
    expect([...shopsWithoutSchedule(shops, [])].sort()).toEqual(["a", "b", "c"]);
    expect(shopsWithoutSchedule([], events).size).toBe(0);
  });

  it("get a popup that says to call the store, above the notes, with phone and directions", () => {
    const s = shop({ id: "insomniac-collectibles", name: "Insomniac Collectibles", phone: "(310) 555-0100", notes: "Found on OpenStreetMap; sells Pokémon and One Piece singles.", origin: undefined });
    const html = popupHtml(s, [], new Set(), false, true);
    expect(html).toContain("No schedule published yet — call the store.");
    expect(html.indexOf("No schedule published yet")).toBeLessThan(html.indexOf('class="notes"'));
    expect(html).toContain("tel:");
    expect(html).toContain("Directions");
    expect(html).not.toContain("No events on the calendar yet.");
    // No notes either: the line still stands on its own.
    expect(popupHtml(shop({ notes: undefined }), [], new Set(), false, true)).toContain("No schedule published yet — call the store.");
  });

  it("does not claim 'locator-listed nights' for an imported shop that has no nights at all", () => {
    const html = popupHtml(shop({ origin: "ravensburger-play" }), [], new Set(), true, true);
    expect(html).toContain("No schedule published yet");
    expect(html).not.toMatch(/locator-listed/);
  });

  it("a shop WITH a schedule but nothing this week does not get the call-the-store line", () => {
    expect(popupHtml(shop(), [], new Set(), false, false)).not.toContain("No schedule published yet");
    const s = shop();
    expect(popupHtml(s, [occ(s)], new Set(), false, true)).not.toContain("No schedule published yet");   // events shown win
  });
});

describe("map popup", () => {
  it("prints the shop's notes even when it has events, escaped, after the events", () => {
    const s = shop();
    const html = popupHtml(s, [occ(s)], new Set());
    expect(html).toContain("posted on Instagram &lt;not readable here&gt;");
    expect(html.indexOf('class="notes"')).toBeGreaterThan(html.indexOf("<ul>"));
    expect(html).toContain("$10");
  });

  it("says which games the locators cover when the schedule is incomplete, and nothing when it is not", () => {
    const s = shop({ origin: "riftbound-locator", games: ["riftbound", "lorcana"] });
    expect(popupHtml(s, [occ(s)], new Set(), true)).toContain("Only locator-listed nights so far (Riftbound, Disney Lorcana) - other games not checked yet.");
    expect(popupHtml(shop({ origin: "riftbound-locator", games: undefined }), [], new Set(), true)).toContain("Only locator-listed nights so far - other games not checked yet.");
    expect(popupHtml(s, [occ(s)], new Set(), false)).not.toMatch(/locator-listed/);
    expect(popupHtml(s, [occ(s)], new Set())).not.toMatch(/locator-listed/);
  });

  it("still says so when a shop has neither events nor notes", () => {
    expect(popupHtml(shop({ notes: undefined, origin: undefined }), [], new Set())).toContain("No events on the calendar yet.");
  });
});
