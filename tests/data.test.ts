/**
 * The committed data must be valid, and the validator must actually catch the
 * failure modes it claims to (a validator that passes everything tests
 * nothing - mutation-check it).
 */
import { describe, it, expect } from "vitest";
import { jsonDataSource, validateData, type PlayMapData } from "../lib/data";

describe("committed data", () => {
  it("passes validation", async () => {
    const data = await jsonDataSource.load();
    expect(validateData(data)).toEqual([]);
  });

  it("has at least one shop with events and every active shop on the map", async () => {
    const { shops, events } = await jsonDataSource.load();
    expect(shops.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
    for (const s of shops) expect(s.active).toBe(true);
  });

  it("gives every active shop a phone number", async () => {
    // Every calendar block offers "call the shop" since 0.1.0.7; CoreTCG
    // shipped without one and its blocks silently had no call link.
    // A shop may lack one only when that is SAID (the importer writes "No phone
    // listed" for stores whose locator entry has none) - never silently.
    const { shops } = await jsonDataSource.load();
    for (const s of shops.filter((x) => x.active)) {
      expect(s.phone || /no phone listed/i.test(s.notes ?? ""), `${s.id} has no phone and no note saying so`).toBeTruthy();
    }
  });

  it("logs every shop that has events", async () => {
    // A shop whose schedule was added silently is exactly what the calendar
    // log exists to prevent.
    const { events, log } = await jsonDataSource.load();
    const logged = new Set(log.map((l) => l.shopId));
    for (const e of events) expect(logged.has(e.shopId), `no log entry for ${e.shopId}`).toBe(true);
  });
});

describe("validateData", () => {
  const base = async (): Promise<PlayMapData> => {
    const d = await jsonDataSource.load();
    return { shops: structuredClone(d.shops), events: structuredClone(d.events), log: structuredClone(d.log) };
  };

  it("rejects an event pointing at an unknown shop", async () => {
    const d = await base();
    d.events[0].shopId = "nowhere";
    expect(validateData(d).some((e) => /unknown shopId/.test(e))).toBe(true);
  });

  it("rejects an unknown game id", async () => {
    const d = await base();
    (d.events[0] as any).game = "pokemans";
    expect(validateData(d).some((e) => /unknown game/.test(e))).toBe(true);
  });

  it("rejects an event with both a weekday and a date, or neither", async () => {
    const d = await base();
    d.events[0].date = "2026-10-01";
    expect(validateData(d).some((e) => /exactly one/.test(e))).toBe(true);
    delete d.events[0].date;
    delete d.events[0].weekday;
    expect(validateData(d).some((e) => /exactly one/.test(e))).toBe(true);
  });

  it("rejects a shop at (0,0) and a hand-typed out-of-range coordinate", async () => {
    const d = await base();
    d.shops[0].lat = 0; d.shops[0].lon = 0;
    expect(validateData(d).some((e) => /bad coordinates/.test(e))).toBe(true);
    d.shops[0].lat = 34; d.shops[0].lon = -1180;
    expect(validateData(d).some((e) => /bad coordinates/.test(e))).toBe(true);
  });

  it("rejects a time that is not HH:MM and a bad date", async () => {
    const d = await base();
    d.events[0].start = "6pm";
    expect(validateData(d).some((e) => /start must be/.test(e))).toBe(true);
    d.events[0].start = "18:00";
    d.events[0].skipDates = ["2026-02-30"];
    expect(validateData(d).some((e) => /skipDate/.test(e))).toBe(true);
  });

  it("rejects duplicate ids", async () => {
    const d = await base();
    d.events[1].id = d.events[0].id;
    expect(validateData(d).some((e) => /duplicate id/.test(e))).toBe(true);
  });
});
