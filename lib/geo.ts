/**
 * Distance + ZIP geocoding, shared by the map and the calendar.
 *
 * Carried over from Collectify-Wrapper's web/lib/geo.ts, where the lesson was
 * learned once already: the map and the list MUST agree on what "within 15
 * miles" means, so the miles formula, the ZIP shape check and the geocoder
 * call live here once and both surfaces import them.
 *
 * Differences from the Collectify copy:
 *  - The radius ladder runs to 250 miles. Weekly play is worth a longer drive
 *    than a stock sighting, and a regional tournament is worth a very long
 *    one.
 *  - `geocodeZip` falls back to a small committed table (data/zips.json) when
 *    Nominatim is unreachable, because this site is a static page with no
 *    server of its own to proxy through.
 */

import ZIPS from "@/data/zips.json";

/** A resolved search origin: a ZIP centroid, plus what to call it. */
export interface GeoOrigin {
  lat: number;
  lon: number;
  label: string;
}

/** Great-circle miles between two points (haversine). */
export function haversineMi(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;                                   // mean Earth radius, miles
  const p1 = (aLat * Math.PI) / 180, p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180, dl = ((bLon - aLon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * A US ZIP the geocoder will accept, or null. Trims first so a pasted " 90210"
 * still works, and rejects ZIP+4 / 4-digit typos BEFORE spending a network
 * round trip on them.
 */
export function normalizeZip(raw: string): string | null {
  const z = raw.trim();
  return /^\d{5}$/.test(z) ? z : null;
}

/** Radius choices offered in the filter, in miles: 5 to 250 as Mark asked. */
export const RADIUS_CHOICES = [5, 10, 15, 25, 50, 100, 250] as const;
export const DEFAULT_RADIUS_MI = 25;

/**
 * Only accept a radius we actually offer. A persisted pref is user-editable
 * (it is localStorage), and a junk value would otherwise silently hide the
 * whole calendar - fall back to the default instead.
 */
export function normalizeRadius(raw: unknown): number {
  const n = Number(raw);
  return (RADIUS_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_RADIUS_MI;
}

/**
 * Miles from the origin to a point, or null when there is no origin. Kept as a
 * function so the calendar's "12.4 mi" and the map's radius filter can never
 * disagree.
 */
export function distanceMi(origin: GeoOrigin | null, lat: number, lon: number): number | null {
  if (!origin) return null;
  const d = haversineMi(origin.lat, origin.lon, lat, lon);
  return Number.isFinite(d) ? d : null;
}

/**
 * Does a shop fall inside the radius? No origin = no filtering: the distance
 * filter is opt-in and an unset ZIP must never empty the calendar.
 */
export function withinRadius(origin: GeoOrigin | null, lat: number, lon: number, radiusMi: number): boolean {
  const d = distanceMi(origin, lat, lon);
  return d == null ? true : d <= radiusMi;
}

/** The committed fallback table: ZIP -> centroid. Small, LA-area, grows by hand. */
const ZIP_TABLE = ZIPS as unknown as Record<string, { lat: number; lon: number }>;

export function zipFromTable(zip: string): GeoOrigin | null {
  const hit = ZIP_TABLE[zip];
  return hit ? { lat: hit.lat, lon: hit.lon, label: zip } : null;
}

/**
 * ZIP -> centroid. Nominatim first (any US ZIP), the committed table second
 * (works offline / when Nominatim rate-limits, for the ZIPs we ship).
 *
 * Returns null for "no such ZIP" and throws only when BOTH fail on transport,
 * so callers can tell "not found" (a typo, keep the field) from "lookup
 * failed" (offline, worth retrying) in their error copy.
 */
export async function geocodeZip(zip: string): Promise<GeoOrigin | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zip}&countrycodes=us&format=json&limit=1`,
      { headers: { Accept: "application/json" } },
    );
    const hits = await r.json();
    if (Array.isArray(hits) && hits[0]) {
      return { lat: Number(hits[0].lat), lon: Number(hits[0].lon), label: zip };
    }
    // Nominatim answered and knows no such ZIP. The table is the second
    // opinion, not a guess: it only holds ZIPs we have placed ourselves.
    return zipFromTable(zip);
  } catch (e) {
    const local = zipFromTable(zip);
    if (local) return local;
    throw e;
  }
}
