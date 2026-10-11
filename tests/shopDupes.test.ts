/**
 * No store on the map twice. validateData only rejects a repeated id; the
 * shape that actually happens is one store under two ids (a hand-entered row
 * and an importer row). The rule is unit-tested on made-up rows - a rule that
 * passes on today's data and would pass on anything proves nothing.
 */
import { describe, it, expect } from "vitest";
import { jsonDataSource } from "../lib/data";
import { findDuplicateShops, normAddress, sameShopReason, SAME_POINT_MI } from "../scripts/lib/shopDupes.mjs";
import { miles } from "../scripts/candidates/merge.mjs";

const shop = (over: Record<string, unknown> = {}) => ({
  id: "a", name: "Paper Hero's Games", address: "14109 Burbank Blvd", lat: 34.1722037, lon: -118.440387, active: true, ...over,
});
/** Move a point north by a number of miles (1 degree of latitude is ~69.09 mi). */
const north = (lat: number, mi: number) => lat + mi / 69.09;

describe("committed shops", () => {
  it("has no two rows for one place", async () => {
    const { shops } = await jsonDataSource.load();
    expect(shops.length).toBeGreaterThan(0);
    expect(findDuplicateShops(shops)).toEqual([]);
  });
});

describe("findDuplicateShops", () => {
  it("catches the importer re-creating a hand-entered shop: different id, same point", () => {
    const hand = shop({ id: "paper-heros-games-sherman-oaks" });
    const imported = shop({ id: "paper-heros-games", name: "Paper Heroes", address: "14109 Burbank Boulevard, Van Nuys", lat: north(hand.lat, 0.01) });
    const found = findDuplicateShops([hand, imported]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("paper-heros-games-sherman-oaks");
    expect(found[0]).toContain("paper-heros-games ");
    expect(found[0]).toMatch(/ft apart/);
  });

  it("draws the line at the importer's own same-building distance", () => {
    const a = shop();
    const inside = shop({ id: "b", name: "Other", address: "1 Elsewhere St", lat: north(a.lat, SAME_POINT_MI * 0.9) });
    const outside = shop({ id: "c", name: "Other", address: "1 Elsewhere St", lat: north(a.lat, SAME_POINT_MI * 1.5) });
    expect(miles(a.lat, a.lon, inside.lat, inside.lon)).toBeLessThan(SAME_POINT_MI);
    expect(sameShopReason(a, inside)).toMatch(/ft apart/);
    expect(sameShopReason(a, outside)).toBeNull();
  });

  it("catches same name + same street address when two geocoders disagree on the point", () => {
    const a = shop({ id: "rwt-collective", name: "RWT Collective", address: "11301 W Olympic Blvd, Suite 201" });
    const b = shop({ id: "rwt-collective-2", name: "RWT Collective", address: "11301 West Olympic Boulevard #201", lat: north(a.lat, 0.4) });
    expect(findDuplicateShops([a, b])[0]).toMatch(/rwt-collective and rwt-collective-2 .*same name and street address/);
    // A second branch of the same store, or a neighbour at the same address, is not a duplicate.
    expect(sameShopReason(a, { ...b, address: "11304 Santa Monica Blvd" })).toBeNull();
    expect(sameShopReason(a, { ...b, name: "Fire & Dice" })).toBeNull();
    // Two rows with no address at all must not match each other on name alone.
    expect(sameShopReason({ ...a, address: "" }, { ...b, address: "" })).toBeNull();
  });

  it("catches one locator id on two rows, even far apart and even when one is inactive", () => {
    const a = shop({ sourceIds: { riftbound: "a13b676d" } });
    const b = shop({ id: "b", name: "Somewhere Else", address: "9 Other Rd", lat: 33.9, active: false, sourceIds: { riftbound: "a13b676d" } });
    expect(findDuplicateShops([a, b])[0]).toMatch(/shops a and b .*sourceIds\.riftbound = a13b676d/);
    expect(sameShopReason(a, { ...b, sourceIds: { riftbound: "67fb2d35" } })).toBeNull();
    expect(sameShopReason(a, { ...b, sourceIds: { bandai: "a13b676d" } })).toBeNull();   // another network's id space
  });

  it("ignores a closed shop that a new one replaced at the same address", () => {
    const closed = shop({ id: "old", active: false });
    expect(sameShopReason(closed, shop({ id: "new" }))).toBeNull();
  });

  it("normalises addresses the ways our sources write them", () => {
    expect(normAddress("11301 W. Olympic Boulevard, Suite 201")).toBe("11301 w olympic blvd");
    expect(normAddress("770 S Arroyo Pkwy #110")).toBe("770 s arroyo pkwy");
    expect(normAddress("9036 Tampa Avenue")).toBe(normAddress("9036 tampa ave."));
    expect(normAddress(undefined)).toBe("");
  });
});
