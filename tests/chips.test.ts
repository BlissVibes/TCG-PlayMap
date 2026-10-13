/**
 * Game colours (Mark, 2026-10-13: Riftbound purple, Magic white) and the
 * helper that keeps a light colour readable. White text on a white chip, or
 * a white accent bar on the white light theme, is the failure this guards.
 */
import { describe, it, expect } from "vitest";
import { GAMES, GAME_IDS, chipVars, chipVarsCss, luminance } from "../lib/games";

describe("game colours", () => {
  it("Magic is white and Riftbound is purple", () => {
    expect(GAMES.mtg.color.toLowerCase()).toBe("#ffffff");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(GAMES.riftbound.color.slice(i, i + 2), 16));
    expect(b > g && r > g).toBe(true);           // purple: red and blue over green
  });

  it("no two games share a colour", () => {
    const colours = GAME_IDS.map((g) => GAMES[g].color.toLowerCase());
    expect(new Set(colours).size).toBe(colours.length);
  });
});

describe("chipVars", () => {
  it("gives a near-white chip dark text and a visible grey edge", () => {
    const v = chipVars("mtg");
    expect(v["--chip-ink"]).toBe("#1a1d23");
    expect(v["--chip-edge"]).not.toBe(GAMES.mtg.color);
    expect(luminance(v["--chip-edge"])).toBeLessThan(0.6);
  });

  it("leaves every other game looking as it did: white text, its own colour as the edge", () => {
    for (const g of GAME_IDS) {
      if (luminance(GAMES[g].color) > 0.6) continue;
      expect(chipVars(g), g).toEqual({ "--chip": GAMES[g].color, "--chip-ink": "#fff", "--chip-edge": GAMES[g].color });
    }
  });

  it("renders the same variables as a style string for the map popup", () => {
    expect(chipVarsCss("riftbound")).toBe(`--chip:${GAMES.riftbound.color};--chip-ink:#fff;--chip-edge:${GAMES.riftbound.color}`);
  });

  it("measures luminance at the ends of the scale", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });
});
