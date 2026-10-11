/**
 * What the map popup says about a shop whose schedule we only partly know.
 * 2026-10-10: 103 imported shops showed one or two Riftbound nights and nothing
 * else, and the note saying "other games not researched" was only printed for
 * shops with NO events - exactly the shops that did not need it.
 */
import { describe, it, expect } from "vitest";
import { popupHtml } from "../components/PlayMap";
import { scheduleIncomplete, type Occurrence, type PlayEvent, type Shop } from "../lib/schedule";

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
  it("is true only for an importer-made shop still on its one imported game", () => {
    expect(scheduleIncomplete({ origin: "riftbound-locator", games: ["riftbound"] })).toBe(true);
    expect(scheduleIncomplete({ origin: "riftbound-locator", games: ["riftbound", "mtg"] })).toBe(false);   // researched
    expect(scheduleIncomplete({ games: ["riftbound"] })).toBe(false);                                        // hand-entered
    expect(scheduleIncomplete({ origin: "riftbound-locator" })).toBe(true);
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

  it("says the schedule is partial for an importer-only shop, and not for a researched or hand-entered one", () => {
    const s = shop({ origin: "riftbound-locator" });
    expect(popupHtml(s, [occ(s)], new Set())).toMatch(/Only Riftbound is listed here so far/);
    const researched = shop({ games: ["riftbound", "mtg"], origin: "riftbound-locator" });
    expect(popupHtml(shop({ origin: "riftbound-locator" }), [], new Set())).toMatch(/Only Riftbound is listed/);
    expect(popupHtml(researched, [occ(researched)], new Set())).not.toMatch(/listed here so far/);
    expect(popupHtml(shop({ origin: undefined }), [], new Set())).not.toMatch(/listed here so far/);
  });

  it("still says so when a shop has neither events nor notes", () => {
    expect(popupHtml(shop({ notes: undefined, origin: undefined }), [], new Set())).toContain("No events on the calendar yet.");
  });
});
