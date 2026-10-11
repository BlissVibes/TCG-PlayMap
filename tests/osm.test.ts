/**
 * OpenStreetMap discovery (scripts/osm/pull.mjs), on made-up rows - never the
 * network. The script is imported, which is safe: it runs only when executed
 * directly, and nothing here calls its main().
 */
import { describe, it, expect } from "vitest";
import {
  againstShops, bucketOf, buildQuery, chooseTiles, leadFromElement, MAX_TRIES, mergeLeads, parseArgs, PAUSE_MS, tilesFor,
} from "../scripts/osm/pull.mjs";
import { DEFAULT_REGION, miles } from "../scripts/candidates/merge.mjs";

const TODAY = "2026-10-11";
const node = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: "node", id, lat, lon, tags });
const shop = (over: Record<string, unknown> = {}) => ({
  id: "mega-city-one", name: "Mega City One", address: "7301 Melrose Ave", city: "Los Angeles", lat: 34.0837114, lon: -118.3488182, active: true, ...over,
});
/** A tile around central LA and one around Ventura, for "was this lead's tile pulled?". */
const LA = { name: "la", bbox: [33.7, -118.94, 34.4, -118.24] }, VENTURA = { name: "ventura", bbox: [33.7, -119.64, 34.4, -118.94] };

describe("osm pull: staying polite", () => {
  it("paces tiles, limits tries, and sends a request only for real arguments", () => {
    expect(PAUSE_MS).toBeGreaterThanOrEqual(6000);
    expect(MAX_TRIES).toBeLessThanOrEqual(3);
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(parseArgs(["--apply"]).error).toMatch(/--apply/);
    expect(parseArgs(["--tiles", "downtown"]).error).toMatch(/--tiles/);
    expect(parseArgs(["--since", "last week"]).error).toMatch(/--since/);
    expect(parseArgs(["--tiles", "r2c0,r3c0", "--since", "2026-10-01", "--rebucket"])).toMatchObject({ tiles: ["r2c0", "r3c0"], since: "2026-10-01", rebucket: true });
    expect(parseArgs(["--no-pull"])).toMatchObject({ noPull: true, tiles: null });
  });
});

describe("osm tiles", () => {
  const tiles = tilesFor();
  it("covers the whole region with stable names, without overlap", () => {
    expect(new Set(tiles.map((t) => t.name)).size).toBe(tiles.length);
    expect(tiles.find((t) => t.name === "r0c0")).toBeTruthy();
    // Any point inside the circle lies in exactly one tile.
    for (const [lat, lon] of [[34.0522, -118.2437], [34.42, -119.7], [32.72, -117.16], [35.37, -119.02], [33.72, -116.37], [34.2011, -118.5981]]) {
      expect(miles(DEFAULT_REGION.lat, DEFAULT_REGION.lon, lat, lon)).toBeLessThan(DEFAULT_REGION.miles);
      const hit = tiles.filter((t) => lat >= t.bbox[0] && lat < t.bbox[2] && lon >= t.bbox[1] && lon < t.bbox[3]);
      expect(hit, `${lat},${lon}`).toHaveLength(1);
    }
    // The same grid every time: names must not move between runs.
    expect(tilesFor().map((t) => `${t.name}:${t.bbox}`)).toEqual(tiles.map((t) => `${t.name}:${t.bbox}`));
  });

  it("drops tiles wholly outside the circle on a finer grid", () => {
    const fine = tilesFor(DEFAULT_REGION, { rows: 10, cols: 12 });
    expect(fine.length).toBeLessThan(120);
    expect(fine.find((t) => t.name === "r0c0")).toBeUndefined();
  });

  it("--tiles picks a subset and refuses an unknown name; --since skips tiles already pulled", () => {
    expect(chooseTiles(tiles, { tiles: ["r2c0"], since: null }).map((t) => t.name)).toEqual(["r2c0"]);
    expect(() => chooseTiles(tiles, { tiles: ["r9c9"], since: null })).toThrow(/no such tile: r9c9/);
    const last = { r2c0: { pulled: "2026-10-10" }, r2c1: { pulled: "2026-09-01" }, r2c2: { lastError: "2026-10-10: HTTP 504" } };
    const todo = chooseTiles(tiles, { tiles: ["r2c0", "r2c1", "r2c2"], since: "2026-10-01" }, last).map((t) => t.name);
    expect(todo).toEqual(["r2c1", "r2c2"]);   // pulled before the date, and never pulled at all
  });

  it("asks for the five shop types and for named shops and amenities, inside the tile only", () => {
    const q = buildQuery([33.7, -120.34, 34.4, -119.64]);
    expect(q).toContain('nwr["shop"~"^(games|hobby|toys|collector|trading_cards)$"](33.7,-120.34,34.4,-119.64);');
    expect(q).toContain('nwr["shop"]["name"~"card|tcg|game|comic|hobby|collectib",i]');
    expect(q).toContain('nwr["amenity"]["name"~"card|tcg|game|comic|hobby|collectib",i]');
    expect(q).toMatch(/^\[out:json\]\[timeout:180\];/);
    expect(q).toMatch(/out center tags;$/);
  });
});

describe("osm leads: one element", () => {
  it("reads a node, and a way through its centre; no name or no position is no lead", () => {
    expect(leadFromElement(node(5577573995, 33.925324, -117.922693, {
      name: "Shuffle and Cut Games", shop: "toys", "addr:housenumber": "2121", "addr:street": "E Lambert Rd", "addr:unit": "305",
      "addr:city": "La Habra", "addr:postcode": "90631-1234", "contact:website": "https://shuffleandcut.com", phone: "+1-562-694-9500", opening_hours: "Mo-Su 12:00-22:00",
    }))).toEqual({
      name: "Shuffle and Cut Games", address: "2121 E Lambert Rd #305", city: "La Habra", zip: "90631", lat: 33.925324, lon: -117.922693,
      website: "https://shuffleandcut.com", phone: "+1-562-694-9500", hours: "Mo-Su 12:00-22:00", osmId: "node/5577573995", osmShop: "toys", osmAmenity: null,
    });
    expect(leadFromElement({ type: "way", id: 7, center: { lat: 34.1, lon: -118.2 }, tags: { name: "Card Cave", shop: "collector" } }))
      .toMatchObject({ osmId: "way/7", lat: 34.1, lon: -118.2, address: null, city: null, zip: null });
    expect(leadFromElement(node(1, 34, -118, { shop: "games" }))).toBeNull();
    expect(leadFromElement({ type: "way", id: 2, tags: { name: "No Centre", shop: "games" } })).toBeNull();
  });

  it("buckets by chain name first, then shop type, then a telling name", () => {
    const b = (name: string, osmShop: string | null = null, osmAmenity: string | null = null) => bucketOf({ name, osmShop, osmAmenity });
    for (const n of ["GameStop", "Hobby Lobby", "Barnes & Noble", "Target", "Five Below", "Big 5 Sporting Goods", "Michaels", "Walmart Supercenter", "Build-A-Bear Workshop", "LEGO Store"]) {
      expect(b(n, "toys"), n).toBe("chain");
    }
    expect(b("Targeted Games", "games")).toBe("likely");            // "target" inside a word is not the chain
    expect(b("Mega City One", "collector")).toBe("likely");         // the tag is enough
    expect(b("Frank & Son", "trading_cards")).toBe("likely");
    expect(b("Uncle Don's Hobbies", "toys")).toBe("likely");        // a toy shop with a telling name
    expect(b("Pooh Corner", "toys")).toBe("unlikely");              // a toy shop without one
    expect(b("Game Day Grill", null, "restaurant")).toBe("unlikely");
    expect(b("Card Kingdom Cafe TCG", null, "cafe")).toBe("likely");
    expect(b("Ralphs Gift Card Kiosk", "supermarket")).toBe("unlikely");
    expect(b("Lucky Poker Card Room", "games")).toBe("likely");     // tagged shop=games: a person triages it
    expect(b("Gameplay Arcade", "video_games")).toBe("unlikely");
  });

  it("recognises a shop we already have, and a same-name shop too far away to be sure", () => {
    const here = { ...leadFromElement(node(1, 34.08372, -118.34880, { name: "Mega City One Comics", shop: "collector" }))! };
    const near = againstShops(here, [shop()]);
    expect(near.known).toEqual({ knownAs: "mega-city-one", why: expect.stringMatching(/ft apart/) });
    expect(near.fields).toMatchObject({ nearestKnownCity: "Los Angeles", nearestKnownMi: 0, milesFromLaCenter: 6 });
    const far = { ...leadFromElement(node(2, 34.2, -118.6, { name: "Mega City One", shop: "collector" }))! };
    const twin = againstShops(far, [shop()]);
    expect(twin.known).toBeNull();
    expect(twin.fields.possibleDuplicateOf).toMatchObject({ id: "mega-city-one", why: "same name, different coordinates" });
    expect(againstShops({ ...far, name: "Somewhere Else" }, [shop()]).fields.possibleDuplicateOf).toBeUndefined();
    // A differently named shop 200 ft from one of ours: not the same shop by the data test's rule, but worth a look.
    const nextDoor = { ...leadFromElement(node(3, 34.0837114 + 0.00055, -118.3488182, { name: "Melrose Music", shop: "games" }))! };
    const nd = againstShops(nextDoor, [shop()]);
    expect(nd.known).toBeNull();
    expect(nd.fields.possibleDuplicateOf).toEqual({ id: "mega-city-one", miles: 0.04, why: "another known shop within 300 ft" });
  });
});

describe("osm leads: re-runs keep people's work", () => {
  const A = node(101, 34.05, -118.30, { name: "Alpha Cards", shop: "collector", "addr:city": "Los Angeles" });
  const B = node(102, 34.10, -118.40, { name: "Beta Toys", shop: "toys" });
  const V = node(103, 34.28, -119.29, { name: "Ventura Comics", shop: "collector" });
  const first = () => mergeLeads({ existing: null, elements: [A, B, V, A], pulled: [LA, VENTURA], shops: [shop()], today: "2026-10-10" });

  it("first run: buckets every lead once, sorted by distance, and skips what is outside the region", () => {
    const far = node(999, 37.33, -79.95, { name: "Star City Comics & Games", shop: "collector" });   // Roanoke
    const r = mergeLeads({ existing: null, elements: [A, B, V, A, far], pulled: [LA, VENTURA], shops: [shop()], today: "2026-10-10" });
    expect(r.leads.likely.map((l: any) => l.name)).toEqual(["Alpha Cards", "Ventura Comics"]);
    expect(r.leads.unlikely.map((l: any) => l.name)).toEqual(["Beta Toys"]);
    expect(r.stats).toMatchObject({ new: 3, gone: 0 });
  });

  it("keeps triage, evidence and a hand-corrected bucket, and refreshes only its own fields", () => {
    const f = first();
    const alpha = f.leads.likely.find((l: any) => l.osmId === "node/101");
    alpha.triage = { status: "runs-tcg", by: "sonnet 1", checked: "2026-10-10" };
    alpha.evidence = "Instagram pinned post: Pokemon Thu 6 PM";
    const beta = f.leads.unlikely.find((l: any) => l.osmId === "node/102");
    beta.bucket = "likely";                                   // a person moved it
    const moved = { ...beta }; f.leads.unlikely = []; f.leads.likely.push(moved);
    // OSM now has a phone for Alpha and a new name for Beta.
    const A2 = node(101, 34.05, -118.30, { name: "Alpha Cards", shop: "collector", "addr:city": "Los Angeles", phone: "+1-213-555-0100" });
    const B2 = node(102, 34.10, -118.40, { name: "Beta Toys & More", shop: "toys" });
    const r = mergeLeads({ existing: { leads: f.leads, alreadyKnown: f.alreadyKnown }, elements: [A2, B2, V], pulled: [LA, VENTURA], shops: [shop()], today: TODAY });
    const a = r.leads.likely.find((l: any) => l.osmId === "node/101");
    expect(a).toMatchObject({ phone: "+1-213-555-0100", triage: { status: "runs-tcg", by: "sonnet 1", checked: "2026-10-10" }, evidence: "Instagram pinned post: Pokemon Thu 6 PM" });
    const b = r.leads.likely.find((l: any) => l.osmId === "node/102");
    expect(b).toMatchObject({ name: "Beta Toys & More", bucket: "likely" });      // bucketOf would say "unlikely"; the person's call stands
    expect(r.stats).toMatchObject({ new: 0, updated: 3, gone: 0 });
  });

  it("keeps EVERY field it does not own, whatever it is called, and a person's duplicate ruling beats its guess", () => {
    const twin = node(104, 34.2, -118.6, { name: "Mega City One", shop: "collector" });        // same name as our shop, 16 mi away
    const nextDoor = node(105, 34.0837114 + 0.00055, -118.3488182, { name: "Melrose Music", shop: "games" });
    const f = mergeLeads({ existing: null, elements: [A, twin, nextDoor], pulled: [LA], shops: [shop()], today: "2026-10-10" });
    const all = () => [...f.leads.likely, ...f.leads.unlikely, ...f.leads.chain];
    expect(all().find((l: any) => l.osmId === "node/104").possibleDuplicateOf).toMatchObject({ id: "mega-city-one" });
    expect(all().find((l: any) => l.osmId === "node/105").possibleDuplicateOf).toMatchObject({ why: "another known shop within 300 ft" });
    // People work on the file: fields this script has never heard of.
    Object.assign(all().find((l: any) => l.osmId === "node/101"), {
      triage: "unknown", triageEvidence: "site has no events page", triageDate: "2026-10-10", triageUrl: "https://example.test/alpha",
      triageScore: 7, triageOrder: 3, triageOwner: "sonnet 2", triagedBy: "sonnet 2", triagedOn: "2026-10-10", pending: true,
      evidenceUrl: "https://example.test/e", somethingNobodyPlanned: { nested: ["a", 1, null] },
    });
    const t = all().find((l: any) => l.osmId === "node/104");
    delete t.possibleDuplicateOf; t.duplicateOf = { id: "mega-city-one", confirmed: true, evidence: "OSM node is the old address" };
    const n = all().find((l: any) => l.osmId === "node/105");
    delete n.possibleDuplicateOf; n.distinctFromKnown = "A separate shop next door.";
    const before = structuredClone(all());

    const r = mergeLeads({ existing: { leads: f.leads, alreadyKnown: f.alreadyKnown }, elements: [A, twin, nextDoor], pulled: [LA], shops: [shop()], today: TODAY });
    const after = [...r.leads.likely, ...r.leads.unlikely, ...r.leads.chain];
    // Nothing OSM changed, so every row must come back identical, key for key.
    for (const b of before) expect(after.find((l: any) => l.osmId === b.osmId), b.osmId).toEqual(b);
    expect(after.find((l: any) => l.osmId === "node/104").possibleDuplicateOf).toBeUndefined();
    expect(after.find((l: any) => l.osmId === "node/105").possibleDuplicateOf).toBeUndefined();
  });

  it("--rebucket recomputes a bucket, but never for a triaged lead", () => {
    const f = first();
    for (const l of [...f.leads.likely, ...f.leads.unlikely]) l.bucket = "chain";    // all wrong
    const leads = { likely: [], unlikely: [], chain: [...f.leads.likely, ...f.leads.unlikely] };
    leads.chain.find((l: any) => l.osmId === "node/102").triage = { status: "not-a-card-shop" };
    const r = mergeLeads({ existing: { leads, alreadyKnown: [] }, elements: [A, B, V], pulled: [LA, VENTURA], shops: [shop()], today: TODAY, rebucket: true });
    expect(r.leads.likely.map((l: any) => l.osmId).sort()).toEqual(["node/101", "node/103"]);
    expect(r.leads.chain.map((l: any) => l.osmId)).toEqual(["node/102"]);            // triaged: left where the person put it
  });

  it("never drops a lead: gone from OSM is marked, and only when its tile was really read", () => {
    const f = first();
    f.leads.likely.find((l: any) => l.osmId === "node/103").triage = { status: "todo" };
    const existing = { leads: f.leads, alreadyKnown: f.alreadyKnown };
    // LA tile pulled, Alpha missing from it; Ventura tile NOT pulled this run.
    const r = mergeLeads({ existing, elements: [B], pulled: [LA], shops: [shop()], today: TODAY });
    const all = [...r.leads.likely, ...r.leads.unlikely, ...r.leads.chain];
    expect(all.map((l: any) => l.osmId).sort()).toEqual(["node/101", "node/102", "node/103"]);
    expect(all.find((l: any) => l.osmId === "node/101").osmGone).toBe(TODAY);
    expect(all.find((l: any) => l.osmId === "node/102").osmGone).toBeUndefined();
    const v = all.find((l: any) => l.osmId === "node/103");
    expect(v.osmGone).toBeUndefined();                       // not looked at: unknown, not absent
    expect(v.triage).toEqual({ status: "todo" });
    expect(r.stats).toMatchObject({ gone: 1, kept: 1, updated: 1 });
    // It comes back: the mark is removed. A second miss does not move the date.
    const again = mergeLeads({ existing: { leads: r.leads, alreadyKnown: [] }, elements: [B], pulled: [LA], shops: [shop()], today: "2026-11-01" });
    expect([...again.leads.likely, ...again.leads.unlikely].find((l: any) => l.osmId === "node/101").osmGone).toBe(TODAY);
    const back = mergeLeads({ existing: { leads: r.leads, alreadyKnown: [] }, elements: [A, B], pulled: [LA], shops: [shop()], today: "2026-11-01" });
    expect(back.leads.likely.find((l: any) => l.osmId === "node/101").osmGone).toBeUndefined();
  });

  it("a lead that became one of our shops moves to alreadyKnown, whole; old stubs there are kept", () => {
    const f = first();
    f.leads.likely.find((l: any) => l.osmId === "node/101").triage = { status: "runs-tcg" };
    const stub = { osmId: "node/3137961991", name: "The Comic Bug / Game Hub", knownAs: "the-game-hub-and-comic-bug", why: "27 ft apart (limit 158 ft)" };
    const nowOurs = shop({ id: "alpha-cards", name: "Alpha Cards", address: "1 Elm St", lat: 34.05001, lon: -118.30001 });
    const r = mergeLeads({ existing: { leads: f.leads, alreadyKnown: [stub] }, elements: [A, B, V], pulled: [LA, VENTURA], shops: [shop(), nowOurs], today: TODAY });
    expect(r.leads.likely.map((l: any) => l.osmId)).toEqual(["node/103"]);
    const known = r.alreadyKnown.find((l: any) => l.osmId === "node/101");
    expect(known).toMatchObject({ knownAs: "alpha-cards", name: "Alpha Cards", triage: { status: "runs-tcg" }, lat: 34.05 });
    expect(r.alreadyKnown.find((l: any) => l.osmId === "node/3137961991")).toEqual(stub);
    expect(r.stats.nowKnown).toBe(1);
    // Every osmId that went in is still somewhere in the file.
    const out = new Set([...Object.values(r.leads).flat(), ...r.alreadyKnown].map((l: any) => l.osmId));
    for (const id of ["node/101", "node/102", "node/103", "node/3137961991"]) expect(out.has(id), id).toBe(true);
  });
});
