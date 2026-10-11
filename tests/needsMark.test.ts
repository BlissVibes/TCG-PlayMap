/**
 * Mark's follow-up page (scripts/needs_mark.mjs), on made-up queue rows.
 */
import { describe, it, expect } from "vitest";
import { handleFor, needsMarkDoc, parseArgs } from "../scripts/needs_mark.mjs";

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

describe("needs_mark: arguments", () => {
  it("accepts --out and --check, refuses anything else", () => {
    expect(parseArgs([])).toEqual({ out: "docs/NEEDS_MARK.md", check: false });
    expect(parseArgs(["--check", "--out", "x.md"])).toEqual({ out: "x.md", check: true });
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["--write"]).error).toMatch(/--write/);
    expect(parseArgs(["--out"]).error).toMatch(/--out/);
  });
});
