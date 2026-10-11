/**
 * The committed data must be valid, and the validator must actually catch the
 * failure modes it claims to (a validator that passes everything tests
 * nothing - mutation-check it).
 */
import { describe, it, expect } from "vitest";
import { checkLoaded, DataLoadError, dataUpdated, fetchDataSource, validateData, type PlayMapData } from "../lib/data";
import { jsonDataSource } from "../lib/dataCommitted";

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

describe("loading the data at runtime", () => {
  const good = async () => { const d = await jsonDataSource.load(); return { shops: d.shops, events: d.events, calendar_log: d.log } as Record<string, unknown>; };
  /** A stand-in for fetch: serves `files` by name, records what was asked for. */
  const fakeFetch = (files: Record<string, unknown>, asked: string[] = [], status = 200) => (async (url: string) => {
    asked.push(url);
    const name = /\/data\/([a-z_]+)\.json/.exec(url)?.[1] ?? "";
    const body = files[name];
    return { ok: status === 200 && body !== undefined, status: body === undefined ? 404 : status, json: async () => { if (body === "BROKEN") throw new SyntaxError("Unexpected token <"); return body; } } as Response;
  }) as unknown as typeof fetch;

  it("fetches the three files under the base path, stamped, and returns valid data", async () => {
    const asked: string[] = [];
    const data = await fetchDataSource("/TCG-PlayMap", "abc123", fakeFetch(await good(), asked)).load();
    expect(asked.sort()).toEqual(["/TCG-PlayMap/data/calendar_log.json?v=abc123", "/TCG-PlayMap/data/events.json?v=abc123", "/TCG-PlayMap/data/shops.json?v=abc123"]);
    expect(data.shops.length).toBeGreaterThan(0);
    expect(validateData(data)).toEqual([]);
    // No base path and no stamp (local dev before a build): plain URLs.
    const plain: string[] = [];
    await fetchDataSource("", "", fakeFetch(await good(), plain)).load();
    expect(plain).toContain("/data/shops.json");
  });

  it("THROWS, never returns an empty set, when a file is missing, unreachable or not JSON", async () => {
    const g = await good();
    await expect(fetchDataSource("", "s", fakeFetch({ ...g, events: undefined })).load()).rejects.toThrow(DataLoadError);
    await expect(fetchDataSource("", "s", fakeFetch(g, [], 503)).load()).rejects.toThrow(/Could not load/);
    await expect(fetchDataSource("", "s", fakeFetch({ ...g, shops: "BROKEN" })).load()).rejects.toThrow(/did not load properly/);
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(fetchDataSource("", "s", offline).load()).rejects.toThrow(/Check your connection/);
  });

  it("THROWS when the files arrive but are empty, the wrong shape, or fail validation", async () => {
    const g = await good();
    // "The request succeeded and the map is empty" is the failure this exists for.
    await expect(fetchDataSource("", "s", fakeFetch({ ...g, shops: [] })).load()).rejects.toThrow(/came back empty/);
    await expect(fetchDataSource("", "s", fakeFetch({ ...g, events: [] })).load()).rejects.toThrow(/came back empty/);
    await expect(fetchDataSource("", "s", fakeFetch({ ...g, shops: { error: "nope" } })).load()).rejects.toThrow(/did not load properly/);
    const bad = structuredClone(g) as any;
    bad.events[0].shopId = "nowhere";
    await expect(fetchDataSource("", "s", fakeFetch(bad)).load()).rejects.toThrow(/failed its checks/);
    expect(() => checkLoaded({ shops: g.shops, events: g.events, log: null })).toThrow(DataLoadError);
    // The detail (which row, which URL) is kept for the console, not shown to visitors.
    try { checkLoaded({ shops: bad.shops, events: bad.events, log: bad.calendar_log }); } catch (e) { expect((e as DataLoadError).detail).toMatch(/unknown shopId nowhere/); }
  });
});

describe("dataUpdated", () => {
  it("is the newest calendar-log date, whatever order the log is in", () => {
    expect(dataUpdated([{ date: "2026-10-03" }, { date: "2026-10-10" }, { date: "2026-09-30" }])).toBe("2026-10-10");
    expect(dataUpdated([{ date: "2026-10-10" }, { date: "not a date" }, { date: "2026-13-45" }])).toBe("2026-10-10");
    expect(dataUpdated([])).toBeNull();
  });

  it("reads a real date from the committed log", async () => {
    const { log } = await jsonDataSource.load();
    expect(dataUpdated(log)).toMatch(/^20\d\d-\d\d-\d\d$/);
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
