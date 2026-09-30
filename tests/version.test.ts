/**
 * VERSION must equal the newest CHANGELOG entry. Carried over from Collectify,
 * where the two drifted for seven releases and the version endpoint - the only
 * way to see what is deployed - lied about it.
 */
import { describe, it, expect } from "vitest";
import { CHANGELOG, VERSION } from "../lib/version";

describe("version", () => {
  it("matches the newest changelog entry", () => {
    expect(CHANGELOG[0].version).toBe(VERSION);
  });

  it("is four odometer segments, each 0-9", () => {
    const parts = VERSION.split(".");
    expect(parts).toHaveLength(4);
    for (const p of parts) expect(Number(p)).toBeLessThanOrEqual(9);
  });

  it("has a strictly descending changelog", () => {
    const rank = (v: string) => v.split(".").reduce((acc, n) => acc * 10 + Number(n), 0);
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(rank(CHANGELOG[i - 1].version)).toBeGreaterThan(rank(CHANGELOG[i].version));
    }
  });
});
