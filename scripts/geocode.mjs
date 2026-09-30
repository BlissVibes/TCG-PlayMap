#!/usr/bin/env node
/**
 * Geocode an address with Nominatim, for adding a shop to data/shops.json.
 *
 *   node scripts/geocode.mjs "770 S Arroyo Pkwy, Pasadena, CA 91105"
 *
 * Prints lat/lon and the matched display name. NEVER type a latitude by hand
 * (Collectify's data/manual_locations.json rule): a pin in the wrong parking
 * lot is worse than no pin. Check the display name says the street you meant.
 * Nominatim asks for one request per second and an identifying User-Agent.
 */
const q = process.argv.slice(2).join(" ").trim();
if (!q) { console.error("usage: node scripts/geocode.mjs <address>"); process.exit(2); }
const url = `https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(q)}`;
const r = await fetch(url, { headers: { "User-Agent": "tcg-playmap/0.1 (github.com/BlissVibes/TCG-PlayMap)", Accept: "application/json" } });
const hits = await r.json();
if (!Array.isArray(hits) || hits.length === 0) { console.error("no match"); process.exit(1); }
for (const h of hits) console.log(`${Number(h.lat).toFixed(7)} ${Number(h.lon).toFixed(7)}  ${h.display_name}`);
