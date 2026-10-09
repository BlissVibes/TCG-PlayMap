import { describe, it, expect } from "vitest";
import {
  addDays, filterOccurrences, formatTime, groupByDate, monthGrid, occurrencesInRange, occursOn,
  startOfWeek, weekDates, weekdayOf, type PlayEvent, type ScheduleFilter, type Shop,
} from "../lib/schedule";

const shop = (id: string, lat: number, lon: number, active = true): Shop => ({
  id, name: id, address: "1 Main St", city: "LA", state: "CA", zip: "90001", lat, lon,
  tz: "America/Los_Angeles", active, source: { checked: "2026-09-30" },
});

const weekly = (id: string, shopId: string, weekday: number, extra: Partial<PlayEvent> = {}): PlayEvent => ({
  id, shopId, game: "pokemon", kind: "tournament", weekday: weekday as PlayEvent["weekday"],
  start: "18:00", confidence: "verified", ...extra,
});

describe("dates", () => {
  it("knows weekdays and week starts (Sunday first)", () => {
    // 2026-09-30 is a Wednesday.
    expect(weekdayOf("2026-09-30")).toBe(3);
    expect(startOfWeek("2026-09-30")).toBe("2026-09-27");
    expect(weekDates("2026-09-30")).toEqual([
      "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03",
    ]);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("builds a month grid of whole weeks", () => {
    const g = monthGrid(2026, 10);   // October 2026 starts on a Thursday
    expect(g[0][0].date).toBe("2026-09-27");
    expect(g[0][0].inMonth).toBe(false);
    expect(g[0][4].date).toBe("2026-10-01");
    expect(g[0][4].inMonth).toBe(true);
    expect(g[g.length - 1][6].date).toBe("2026-10-31");
    for (const row of g) expect(row).toHaveLength(7);
  });

  it("formats 24h times for people", () => {
    expect(formatTime("18:00")).toBe("6:00 PM");
    expect(formatTime("00:30")).toBe("12:30 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("7pm")).toBe("7pm");
  });
});

describe("occursOn", () => {
  it("matches weekday, honours bounds and skips", () => {
    const ev = weekly("e", "s", 4, { validFrom: "2026-10-01", validUntil: "2026-10-31", skipDates: ["2026-10-15"] });
    expect(occursOn(ev, "2026-10-08")).toBe(true);   // a Thursday inside the window
    expect(occursOn(ev, "2026-10-09")).toBe(false);  // Friday
    expect(occursOn(ev, "2026-10-15")).toBe(false);  // skipped
    expect(occursOn(ev, "2026-09-24")).toBe(false);  // before validFrom
    expect(occursOn(ev, "2026-11-05")).toBe(false);  // after validUntil
  });

  it("matches a one-off on its date only", () => {
    const ev: PlayEvent = { id: "o", shopId: "s", game: "mtg", kind: "tournament", date: "2026-11-07", start: "12:00", confidence: "verified" };
    expect(occursOn(ev, "2026-11-07")).toBe(true);
    expect(occursOn(ev, "2026-11-14")).toBe(false);
  });
});

describe("occurrencesInRange", () => {
  const shops = [shop("near", 34.0, -118.4), shop("far", 34.2, -118.6), shop("closed", 34.0, -118.4, false)];
  const events = [
    weekly("near-thu", "near", 4),
    weekly("far-thu", "far", 4, { game: "mtg", kind: "play", start: "12:00" }),
    weekly("closed-thu", "closed", 4),
    weekly("orphan", "gone", 4),
  ];

  it("expands a week, drops closed and unknown shops, sorts by date then time", () => {
    const occs = occurrencesInRange(events, shops, "2026-09-27", "2026-10-03");
    expect(occs.map((o) => `${o.date} ${o.event.id}`)).toEqual([
      "2026-10-01 far-thu", "2026-10-01 near-thu",
    ]);
  });

  it("repeats weekly across a month", () => {
    const occs = occurrencesInRange([events[0]], shops, "2026-10-01", "2026-10-31");
    expect(occs.map((o) => o.date)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]);
  });

  it("carries distance from the origin", () => {
    const occs = occurrencesInRange([events[0]], shops, "2026-10-01", "2026-10-01", { lat: 34.0, lon: -118.4, label: "x" });
    expect(occs[0].distanceMi).toBeCloseTo(0, 5);
  });

  it("filters by radius, game and kind, and no origin means no distance filter", () => {
    const occs = occurrencesInRange(events, shops, "2026-10-01", "2026-10-01", { lat: 34.0, lon: -118.4, label: "x" });
    const f = (p: Partial<ScheduleFilter>): ScheduleFilter => ({ origin: null, radiusMi: 25, games: null, kind: null, ...p });
    expect(filterOccurrences(occs, f({})).length).toBe(2);
    expect(filterOccurrences(occs, f({ origin: { lat: 34.0, lon: -118.4, label: "x" }, radiusMi: 5 })).map((o) => o.shop.id)).toEqual(["near"]);
    expect(filterOccurrences(occs, f({ games: new Set(["mtg"]) })).map((o) => o.shop.id)).toEqual(["far"]);
    expect(filterOccurrences(occs, f({ kind: "tournament" })).map((o) => o.shop.id)).toEqual(["near"]);
    const grouped = groupByDate(occs);
    expect([...grouped.keys()]).toEqual(["2026-10-01"]);
  });
});
