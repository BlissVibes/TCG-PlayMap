import { describe, it, expect } from "vitest";
import { appleDirectionsUrl, directionsUrl, shopDestination, telHref } from "../lib/shopLinks";
import { shortTime } from "../lib/schedule";
import { jsonDataSource } from "../lib/data";

const kf = { name: "King Fandom", address: "21425 Sherman Way", city: "Canoga Park", state: "CA", zip: "91303" };

describe("shop links", () => {
  it("names the shop and its street in the destination", () => {
    expect(shopDestination(kf)).toBe("King Fandom, 21425 Sherman Way, Canoga Park, CA 91303");
  });

  it("opens Google turn-by-turn directions, not a search", () => {
    const u = directionsUrl(kf);
    expect(u.startsWith("https://www.google.com/maps/dir/?api=1&destination=")).toBe(true);
    expect(decodeURIComponent(u.split("destination=")[1])).toBe(shopDestination(kf));
  });

  it("encodes characters that would break the URL (Fire & Dice)", () => {
    const u = directionsUrl({ ...kf, name: "Fire & Dice" });
    expect(u).not.toContain("Fire & Dice");
    expect(u).toContain("Fire%20%26%20Dice");
    expect(appleDirectionsUrl({ ...kf, name: "Fire & Dice" })).toContain("daddr=Fire%20%26%20Dice");
  });

  it("dials US numbers with +1 and refuses numbers with no digits", () => {
    expect(telHref("(818) 914-4512")).toBe("tel:+18189144512");
    expect(telHref("1-747-370-0182")).toBe("tel:+17473700182");
    expect(telHref("call us!")).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });

  it("every shop with a phone yields a dialable link", async () => {
    const { shops } = await jsonDataSource.load();
    for (const s of shops) if (s.phone) expect(telHref(s.phone), s.id).toMatch(/^tel:\+1\d{10}$/);
  });
});

describe("shortTime", () => {
  it("compacts times for month cells", () => {
    expect(shortTime("18:30")).toBe("6:30p");
    expect(shortTime("18:00")).toBe("6p");
    expect(shortTime("12:00")).toBe("12p");
    expect(shortTime("09:15")).toBe("9:15a");
  });
});
