import { describe, it, expect } from "vitest";
import { haversineMi, normalizeRadius, normalizeZip, RADIUS_CHOICES, withinRadius, zipFromTable } from "../lib/geo";
import { sanitizePrefs, DEFAULT_PREFS } from "../lib/prefs";

describe("geo", () => {
  it("measures King Fandom to RWT Collective at roughly 14 miles", () => {
    expect(haversineMi(34.2011, -118.5981, 34.0380, -118.4419)).toBeCloseTo(14.4, 0);
  });

  it("accepts only 5-digit ZIPs", () => {
    expect(normalizeZip(" 90064 ")).toBe("90064");
    expect(normalizeZip("90064-1234")).toBeNull();
    expect(normalizeZip("9006")).toBeNull();
  });

  it("offers 5 to 250 miles and falls back to the default for junk", () => {
    expect(RADIUS_CHOICES[0]).toBe(5);
    expect(RADIUS_CHOICES[RADIUS_CHOICES.length - 1]).toBe(250);
    expect(normalizeRadius("250")).toBe(250);
    expect(normalizeRadius(7)).toBe(25);
    expect(normalizeRadius(undefined)).toBe(25);
  });

  it("does not filter without an origin", () => {
    expect(withinRadius(null, 0, 0, 5)).toBe(true);
  });

  it("knows the shipped ZIPs offline", () => {
    expect(zipFromTable("91303")).not.toBeNull();
    expect(zipFromTable("00000")).toBeNull();
  });
});

describe("prefs", () => {
  it("sanitises junk from storage", () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    const p = sanitizePrefs({ zip: 5, radiusMi: 999, games: ["pokemon", "nope"], kind: "x", myEvents: ["a", 1], theme: "dark", origin: { lat: "x" } });
    expect(p.zip).toBe("");
    expect(p.radiusMi).toBe(25);
    expect(p.games).toEqual(["pokemon"]);
    expect(p.kind).toBeNull();
    expect(p.myEvents).toEqual(["a"]);
    expect(p.theme).toBe("dark");
    expect(p.origin).toBeNull();
    expect(p.showDistance).toBe(true);
  });
});
