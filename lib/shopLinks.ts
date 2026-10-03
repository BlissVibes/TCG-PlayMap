/**
 * THE LINKS THAT REACH A SHOP: call it, or get directions to it.
 *
 * One module so the calendar blocks and the map popup cannot drift apart -
 * the same lesson as Collectify-Wrapper's lib/mapLinks.ts, where a URL built
 * inline in a component could not be asserted by a test.
 *
 * DIRECTIONS, NOT A LISTING. Collectify deliberately opens a store's listing
 * (someone reading a stock report wants hours and a phone number first).
 * Here the phone number is already on the block, and the question someone
 * looking at Thursday's Pokémon night is asking is "how do I get there", so
 * the button opens turn-by-turn directions. The destination is the shop's
 * name AND street address: name alone is ambiguous for chains, and an address
 * alone drops the pin on the building without saying which shop.
 */

import type { Shop } from "./schedule";

type ShopAddress = Pick<Shop, "name" | "address" | "city" | "state" | "zip">;

/** "King Fandom, 21425 Sherman Way, Canoga Park, CA 91303" */
export function shopDestination(s: ShopAddress): string {
  return `${s.name}, ${s.address}, ${s.city}, ${s.state} ${s.zip}`;
}

/** Google Maps turn-by-turn directions from wherever the visitor is. */
export function directionsUrl(s: ShopAddress): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(shopDestination(s))}`;
}

/** Apple Maps directions (daddr = destination address). */
export function appleDirectionsUrl(s: ShopAddress): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(shopDestination(s))}`;
}

/**
 * A tel: link for a phone number as the store publishes it ("(818) 914-4512").
 * Ten digits are US numbers and get +1 so the link dials correctly from a
 * phone set to another country; anything else keeps its own digits. Null when
 * there are no digits at all, so a junk value renders no link instead of a
 * link that dials nothing.
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:${digits}`;
}
