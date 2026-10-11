/**
 * Mark's follow-up page (scripts/needs_mark.mjs), on made-up queue rows.
 */
import { describe, it, expect } from "vitest";
import { handleFor, needsMarkDoc, parseArgs, RECHECK_DAYS, recheckRows } from "../scripts/needs_mark.mjs";

const q = (over: Record<string, unknown> = {}) => ({
  shopId: "aki", name: "Aki Collectibles", city: "San Gabriel", website: null, socials: {}, sourceUrl: null,
  status: "blocked", added: "2026-10-10", addedBy: "riftbound-locator", notes: "", ...over,
});
const shops = [
  { id: "aki", name: "Aki Collectibles", city: "San Gabriel", phone: "(626) 555-0101" },
  { id: "zed", name: "Zed Games", city: "Azusa" },
  { id: "turn", name: "Turn Zero Games", city: "Los Angeles", phone: "(213) 384-0000" },
  { id: "blue", name: "Blue Penguin Gaming", city: "Whittier", phone: "(562) 555-0199" },
];
const events = [{ shopId: "aki" }, { shopId: "aki" }, { shopId: "turn" }];
const queue = [
  q({ shopId: "zed", name: "Zed Games", city: "Azusa", needsMark: "discord", notes: "Schedule in Discord (https://discord.gg/ZedInvite). Not opened." }),
  q({ needsMark: "discord", socials: { discord: "https://discord.gg/NeWkG2A4bb" }, notes: "Discord only | not opened\nper Mark." }),
  q({ shopId: "turn", name: "Turn Zero Games", city: "Los Angeles", needsMark: "phone", website: "https://turnzerogames.com", notes: "Fri Pokémon confirmed, no time." }),
  q({ shopId: "blue", name: "Blue Penguin Gaming", city: "Whittier", notes: "No website or socials; web search found nothing." }),
  q({ shopId: "buddies", name: "buddies Collectibles", city: "Covina", socials: { instagram: "" }, notes: "Nothing found." }),      // an empty social is no handle
  q({ shopId: "site", name: "Has A Site", status: "blocked", website: "https://example.test", notes: "Site has no events page." }),   // has a handle: not listed
  q({ shopId: "todo", name: "Not Looked At", status: "todo" }),
  q({ shopId: "done", name: "Finished Shop", status: "done", needsMark: undefined }),
];

describe("needs_mark: the page", () => {
  const { markdown, counts } = needsMarkDoc({ queue, shops, events });

  it("has one section per needsMark value and one for blocked shops with nothing to follow", () => {
    expect(counts).toEqual({ discord: 2, phone: 1, blockedNoHandle: 2 });
    expect(markdown).toContain("## Discord: open the server and read its schedule channel (2)");
    expect(markdown).toContain("## Phone: call the shop for a time or a fee (1)");
    expect(markdown).toContain("## Blocked, no handle: no website and no socials (2)");
    expect(markdown).not.toContain("Has A Site");
    expect(markdown).not.toContain("Not Looked At");
    expect(markdown).not.toContain("Finished Shop");
  });

  it("gives each line the thing to act on, the event count, and the notes on one row", () => {
    expect(markdown).toContain("| Aki Collectibles | San Gabriel | https://discord.gg/NeWkG2A4bb | 2 | Discord only \\| not opened per Mark. |");
    expect(markdown).toContain("| Zed Games | Azusa | https://discord.gg/ZedInvite | 0 | Schedule in Discord");      // invite read out of the notes
    expect(markdown).toContain("| Turn Zero Games | Los Angeles | (213) 384-0000 | 1 | Fri Pokémon confirmed, no time. |");
    expect(markdown).toContain("| Blue Penguin Gaming | Whittier | (562) 555-0199 | 0 |");
    expect(markdown).toContain("| buddies Collectibles | Covina | none listed | 0 |");
    for (const line of markdown.split("\n").filter((l) => l.startsWith("| "))) expect(line.split(/(?<!\\)\|/).length, line).toBe(7);   // 5 cells
  });

  it("is sorted by name whatever order the queue is in, and identical on a second run", () => {
    const again = needsMarkDoc({ queue: [...queue].reverse(), shops: [...shops].reverse(), events: [...events].reverse() });
    expect(again.markdown).toBe(markdown);
    expect(markdown.indexOf("| Aki Collectibles")).toBeLessThan(markdown.indexOf("| Zed Games"));
    expect(markdown.indexOf("| Blue Penguin")).toBeLessThan(markdown.indexOf("| buddies Collectibles"));   // case does not split the order
    expect(markdown).not.toMatch(/20\d\d-\d\d-\d\d/);                                                       // no date of its own
  });

  it("lists an entry under every value it carries, knows 'image', and gives an unknown value its own section", () => {
    const d = needsMarkDoc({
      queue: [
        q({ needsMark: ["discord", "phone"], socials: { discord: "https://discord.gg/x" } }),
        q({ shopId: "img", name: "Image Shop", needsMark: "image", socials: { instagram: "https://www.instagram.com/imageshop/" }, notes: "Pinned schedule post too small to read." }),
        q({ shopId: "odd", name: "Odd Shop", needsMark: "Visit", notes: "Only a paper flyer in the window." }),
      ], shops, events,
    });
    expect(d.counts).toEqual({ discord: 1, phone: 1, image: 1, visit: 1, blockedNoHandle: 0 });
    expect(d.markdown).toContain("| Image Shop | San Gabriel | https://www.instagram.com/imageshop/ | 0 |");
    expect(d.markdown).toContain("## visit: (a value this script has no heading for) (1)");
    const order = ["## Discord", "## Phone", "## Image", "## visit", "## Blocked"].map((h) => d.markdown.indexOf(h));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("says so when nothing needs Mark, and still lists the blocked shops", () => {
    const d = needsMarkDoc({ queue: [queue[3]], shops, events });
    expect(d.markdown).toContain("No queue entry carries `needsMark` right now.");
    expect(d.counts).toEqual({ blockedNoHandle: 1 });
  });

  it("falls back plainly when there is nothing to hand over", () => {
    expect(handleFor("discord", q(), undefined)).toBe("no invite recorded");
    expect(handleFor("phone", q({ notes: "Directory lists 213-340-8930." }), undefined)).toBe("213-340-8930");
    expect(handleFor("phone", q(), { id: "zed" })).toBe("no phone recorded");
    expect(handleFor("image", q({ website: "https://shop.test" }), undefined)).toBe("https://shop.test");
    expect(handleFor("image", q(), undefined)).toBe("see notes");
  });
});

describe("needs_mark: re-check soon", () => {
  const TODAY = "2026-10-11";
  const wk = (id: string, shopId: string, weekday: number, start: string, validUntil: string | undefined, extra: Record<string, unknown> = {}) => ({
    id, shopId, game: "pokemon", kind: "tournament", weekday, start, ...(validUntil ? { validUntil } : {}), confidence: "scraped",
    source: { url: `https://example.test/${shopId}`, checked: "2026-10-10" }, ...extra,
  });
  const evs = [
    wk("z-thu", "zed", 4, "18:00", "2026-10-31", { title: "Pokémon League", notes: "Only October is published | recheck in November." }),
    wk("z-mon", "zed", 1, "19:30", "2026-10-31", { source: { url: "https://example.test/zed", checked: "2026-10-10", note: "October calendar" } }),
    wk("a-sat", "aki", 6, "13:00", "2026-11-01"),                       // exactly 21 days out: in
    wk("a-sun", "aki", 0, "13:00", "2026-11-02"),                       // 22 days out: not yet
    wk("a-today", "aki", 2, "17:00", "2026-10-11"),                     // ends today: still running, so in
    wk("a-gone", "aki", 3, "17:00", "2026-10-10"),                      // already ended: nothing to re-check
    wk("t-open", "turn", 5, "18:00", undefined),                        // open-ended
    { id: "t-dated", shopId: "turn", game: "mtg", kind: "tournament", date: "2026-10-20", start: "12:00", validUntil: "2026-10-20", confidence: "scraped" },   // not weekly
    wk("ghost", "not-in-shops", 1, "18:00", "2026-10-15", { source: undefined }),
  ];

  it("picks weekly rows ending from today to 21 days out, both ends included", () => {
    expect(RECHECK_DAYS).toBe(21);
    expect(recheckRows(evs, shops, TODAY).map((r: any) => r.event.id)).toEqual(["a-today", "a-sat", "ghost", "z-mon", "z-thu"]);   // by shop name, then weekday
    expect(recheckRows(evs, shops, "2026-10-12").map((r: any) => r.event.id)).toEqual(["a-sun", "a-sat", "ghost", "z-mon", "z-thu"]);   // Sunday first, like the calendar
    expect(recheckRows(evs, shops, "2027-01-01")).toEqual([]);
  });

  it("writes them grouped by shop with the night, end date, source and note, and says what date it ran for", () => {
    const { markdown, counts } = needsMarkDoc({ queue, shops, events: evs, today: TODAY });
    expect(counts).toMatchObject({ recheckRows: 5, recheckShops: 3 });
    expect(markdown).toContain("## Re-check soon: weekly nights that end by 2026-11-01 (5 at 3 shops)");
    expect(markdown).toContain("As of 2026-10-11, looking 21 days ahead.");
    expect(markdown).toContain("### Zed Games (Azusa)");
    expect(markdown).toContain("| Thu 6 PM Pokémon League | pokemon | 2026-10-31 | https://example.test/zed | Only October is published \\| recheck in November. |");
    expect(markdown).toContain("| Mon 7:30 PM | pokemon | 2026-10-31 | https://example.test/zed | October calendar |");       // falls back to the source note
    expect(markdown).toContain("### not-in-shops");
    expect(markdown).toContain("| Mon 6 PM | pokemon | 2026-10-15 | no source URL |  |");
    expect(markdown).not.toContain("a-gone");
    expect(markdown.match(/^### /gm)).toHaveLength(3);
    // Same data, same date: same bytes. A different date is a different page.
    expect(needsMarkDoc({ queue, shops, events: [...evs].reverse(), today: TODAY }).markdown).toBe(markdown);
    expect(needsMarkDoc({ queue, shops, events: evs, today: "2026-10-12" }).markdown).not.toBe(markdown);
  });

  it("says so when nothing ends in the window, and leaves the section out when no date is given", () => {
    const none = needsMarkDoc({ queue, shops, events: [evs[6]], today: TODAY });
    expect(none.markdown).toContain("(0 at 0 shops)");
    expect(none.markdown).toContain("Nothing ends in that window.");
    expect(needsMarkDoc({ queue, shops, events: evs }).markdown).not.toContain("Re-check soon");
  });
});

describe("needs_mark: arguments", () => {
  it("accepts --out and --check, refuses anything else", () => {
    expect(parseArgs([])).toEqual({ out: "docs/NEEDS_MARK.md", check: false, date: null });
    expect(parseArgs(["--check", "--out", "x.md"])).toEqual({ out: "x.md", check: true, date: null });
    expect(parseArgs(["--date", "2026-10-11"]).date).toBe("2026-10-11");
    expect(parseArgs(["--date", "tomorrow"]).error).toMatch(/--date/);
    expect(parseArgs(["--date"]).error).toMatch(/--date/);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--write"]).error).toMatch(/--write/);
    expect(parseArgs(["--out"]).error).toMatch(/--out/);
  });
});
