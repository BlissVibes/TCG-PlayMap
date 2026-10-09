/**
 * The Bandai pull runs on Mark's Mac against a response shape nobody here has
 * seen, so the parts that can be wrong without a network are pinned down:
 * reading DevTools' "Copy as cURL", finding events wherever they sit, and
 * turning start times into store-local weekdays (the 2026-09-30 King Fandom
 * mix-up was exactly a weekday read wrong).
 */
import { describe, it, expect } from "vitest";
import { findEventArray, localSlot, parseCurl, shellWords, summarise } from "../scripts/bandai/pull.mjs";

describe("Copy as cURL parsing", () => {
  it("reads Chrome-on-macOS output: $'…' quoting, line continuations, cookies", () => {
    const text = `curl 'https://api.bandai-tcg-plus.com/api/user/event/list?game_title_id=16&order=1' \\
  -H 'accept: application/json' \\
  -H $'x-authentication: abc\\'123' \\
  -b 'session=s1; x=2' \\
  --compressed`;
    const { url, headers } = parseCurl(text);
    expect(url.hostname).toBe("api.bandai-tcg-plus.com");
    expect(url.searchParams.get("order")).toBe("1");
    expect(headers["x-authentication"]).toBe("abc'123");
    expect(headers["cookie"]).toBe("session=s1; x=2");
  });

  it("refuses something that is not a curl command", () => {
    expect(() => parseCurl("fetch('https://x')")).toThrow(/curl/);
  });

  it("splits words like a shell", () => {
    expect(shellWords(`a 'b c' "d\\"e" f\\ g`)).toEqual(["a", "b c", 'd"e', "f g"]);
  });
});

describe("finding events in an unknown response shape", () => {
  it("finds the array however deep it is", () => {
    const evs = [{ event_title: "x", start_datetime: "2026-10-13T18:00:00" }];
    expect(findEventArray({ success: { eventList: evs, meta: [{ a: 1 }] } })).toEqual(evs);
    expect(findEventArray({ data: [] })).toEqual([]);
  });
});

describe("local weekday and time", () => {
  it("converts UTC to Los Angeles time, across midnight", () => {
    // 2026-10-14 01:30 UTC is Tue 2026-10-13 6:30 PM in Los Angeles.
    expect(localSlot("2026-10-14T01:30:00Z")).toEqual({ date: "2026-10-13", weekday: 2, time: "18:30" });
  });
  it("keeps an offset-less time as store-local", () => {
    expect(localSlot("2026-10-13 18:30:00")).toEqual({ date: "2026-10-13", weekday: 2, time: "18:30" });
  });
});

describe("summarise", () => {
  it("separates recurring nights from special events", () => {
    const base = { store: "Shop", address: "1 Main", game: "gundam", tz: "America/Los_Angeles" };
    const s = summarise([
      { ...base, title: "Weekly", start: "2026-10-13T18:30:00-07:00" },
      { ...base, title: "Weekly", start: "2026-10-20T18:30:00-07:00" },
      { ...base, title: "Store Championship", start: "2026-10-24T13:00:00-07:00" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].games.gundam[0]).toMatchObject({ weekday: "Tue", time: "18:30", seen: 2, recurring: true });
    expect(s[0].special.map((x: { title: string }) => x.title)).toEqual(["Store Championship"]);
  });
});
