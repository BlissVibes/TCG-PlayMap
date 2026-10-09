import { describe, it, expect } from "vitest";
import { effectiveGames, gameMode, sanitizePrefs } from "../lib/prefs";
import { occursOn, type PlayEvent } from "../lib/schedule";
import { jsonDataSource, validateData } from "../lib/data";
import type { GameId } from "../lib/games";

const ALL: GameId[] = ["pokemon", "mtg", "riftbound", "gundam"];
const p = (x: Partial<{ games: GameId[]; myGames: GameId[]; hiddenGames: GameId[]; showAll: boolean }>) =>
  ({ games: [], myGames: [], hiddenGames: [], showAll: false, ...x });

describe("which games show (Mark, 2026-10-09)", () => {
  it("no chips picked shows MY TCGs, not every game", () => {
    expect([...effectiveGames(p({ myGames: ["riftbound", "gundam"] }), ALL)].sort()).toEqual(["gundam", "riftbound"]);
    expect(gameMode(p({ myGames: ["riftbound"] }))).toBe("mine");
  });
  it("only 'Show all TCGs' shows everything", () => {
    expect(effectiveGames(p({ myGames: ["riftbound"], showAll: true }), ALL).size).toBe(4);
    expect(gameMode(p({ myGames: ["riftbound"], showAll: true }))).toBe("all");
  });
  it("picked chips win over both defaults", () => {
    expect([...effectiveGames(p({ games: ["mtg"], myGames: ["riftbound"], showAll: true }), ALL)]).toEqual(["mtg"]);
  });
  it("no TCGs chosen in setup means all of them", () => {
    expect(effectiveGames(p({}), ALL).size).toBe(4);
  });
  it("hidden games never show - not under Show all, not when picked", () => {
    expect(effectiveGames(p({ hiddenGames: ["pokemon"], showAll: true }), ALL).has("pokemon")).toBe(false);
    expect(effectiveGames(p({ hiddenGames: ["pokemon"], games: ["pokemon"] }), ALL).size).toBe(0);
  });
  it("prefs from before setup existed come back as 'setup not done'", () => {
    const old = sanitizePrefs({ zip: "91303", radiusMi: 25, theme: "dark" });
    expect(old.setupDone).toBe(false);
    expect(old.myGames).toEqual([]);
    expect(sanitizePrefs({ setupDone: true, myGames: ["riftbound", "nope"], hiddenGames: ["mtg"], showAll: true }))
      .toMatchObject({ setupDone: true, myGames: ["riftbound"], hiddenGames: ["mtg"], showAll: true });
  });
});

describe("everyWeeks (biweekly nights)", () => {
  const ev: PlayEvent = { id: "cube", shopId: "s", game: "mtg", kind: "tournament", weekday: 4, start: "18:30", validFrom: "2026-10-08", everyWeeks: 2, confidence: "verified" };
  it("runs on the anchor week and every second week after", () => {
    expect(occursOn(ev, "2026-10-08")).toBe(true);
    expect(occursOn(ev, "2026-10-15")).toBe(false);
    expect(occursOn(ev, "2026-10-22")).toBe(true);
    expect(occursOn(ev, "2026-11-05")).toBe(true);    // across the DST change
    expect(occursOn(ev, "2026-11-12")).toBe(false);
  });
  it("is rejected without a validFrom to count from", async () => {
    const d = await jsonDataSource.load();
    const bad = { ...d, events: [...d.events, { ...ev, shopId: d.shops[0].id, validFrom: undefined }] };
    expect(validateData(bad).some((e) => /everyWeeks needs/.test(e))).toBe(true);
  });
});
