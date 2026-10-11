/**
 * TWO SHOP ROWS FOR ONE PLACE.
 *
 * validateData rejects two shops with the same id. It cannot see the same
 * store entered twice under different ids, which is what happens when a
 * hand-entered shop and an importer run meet (2026-10-10: Paper Hero's was
 * typed in one checkout while the Riftbound import ran in another; had they
 * landed in the wrong order the map would have drawn each store twice).
 *
 * Three independent signs, any one is a duplicate:
 *   - both active and within SAME_POINT_MI of each other. This is the same
 *     0.03 mi the importer's matchShop already treats as "the same building",
 *     and the same distance function, so the test and the importer agree.
 *   - both active, same slug(name) and the same street address once
 *     abbreviations, punctuation and the suite are normalised away. Catches a
 *     pair whose coordinates came from two geocoders and disagree.
 *   - the same play-network id (sourceIds.<game>) on two rows, active or not.
 *
 * NOTE for reuse from merge.mjs: this file imports merge.mjs, so that would be
 * a cycle. It is safe (both sides only call each other's functions later, not
 * at load), but moving slug/miles here would be the cleaner end state.
 */
import { miles, slug } from "../candidates/merge.mjs";

export const SAME_POINT_MI = 0.03;

const ABBR = {
  boulevard: "blvd", street: "st", avenue: "ave", road: "rd", drive: "dr", parkway: "pkwy", highway: "hwy",
  place: "pl", lane: "ln", court: "ct", north: "n", south: "s", east: "e", west: "w",
};

/** "11301 W. Olympic Boulevard, Suite 201" -> "11301 w olympic blvd". "" when there is no address. */
export function normAddress(address) {
  return String(address ?? "").toLowerCase()
    .replace(/[,;]?\s*(?:suite|ste\.?|unit|apt\.?|#)\s*[a-z0-9-]+\s*$/i, "")   // trailing suite / unit
    .replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").map((w) => ABBR[w] ?? w).join(" ");
}

/**
 * Why two shop rows are the same place, or null.
 * @param {{id:string,name:string,address?:string,lat:number,lon:number,active?:boolean,sourceIds?:Record<string,string>}} a
 * @param {typeof a} b
 * @returns {string|null}
 */
export function sameShopReason(a, b) {
  for (const [game, id] of Object.entries(a.sourceIds ?? {})) {
    if (id && b.sourceIds?.[game] === id) return `both carry sourceIds.${game} = ${id}`;
  }
  if (a.active === false || b.active === false) return null;
  const d = miles(a.lat, a.lon, b.lat, b.lon);
  if (Number.isFinite(d) && d <= SAME_POINT_MI) return `${Math.round(d * 5280)} ft apart (limit ${Math.round(SAME_POINT_MI * 5280)} ft)`;
  const addr = normAddress(a.address);
  if (addr && addr === normAddress(b.address) && slug(a.name) === slug(b.name)) return `same name and street address ("${a.name}", ${addr})`;
  return null;
}

/**
 * Every duplicated pair, as one readable line each naming BOTH ids.
 * @param {Parameters<typeof sameShopReason>[0][]} shops
 * @returns {string[]}
 */
export function findDuplicateShops(shops) {
  const out = [];
  for (let i = 0; i < shops.length; i++) {
    for (let j = i + 1; j < shops.length; j++) {
      const why = sameShopReason(shops[i], shops[j]);
      if (why) out.push(`shops ${shops[i].id} and ${shops[j].id} look like one place: ${why}`);
    }
  }
  return out;
}
