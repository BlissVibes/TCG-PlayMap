/**
 * THE TITLE OF A WEEKLY NIGHT, WITHOUT THE ONE DATE IT WAS COPIED FROM.
 *
 * A play-network locator has no "series": a weekly night is a run of separate
 * events, and the row's title is whichever event name came up most. Stores
 * often put the date in the name, so "9/30 Nexus Night" was printed on every
 * Wednesday for months and read as a stale listing (seen 2026-10-10).
 *
 *  - Dates are removed wherever they sit: 9/30, 10/10/26, (09/13),
 *    "September 08, 2026".
 *  - A trailing start time, with the weekday in front of it, is removed
 *    ("... Sunday 12 PM"): the block already shows both, and the title's copy
 *    goes wrong the day the store moves the night.
 *  - A trailing week counter is removed ("Weekly Play Week 11"), but not one
 *    inside brackets ("(Season 4.2 Week 1)" is the store's own label).
 *  - A weekday on its own stays: "Friday Nexus Nights" is a name.
 *  - When no real word is left, the game's generic night name is used, keeping
 *    any short tag that survived ("1v1").
 *
 * Idempotent: cleaning a clean title returns it unchanged, which is what lets
 * the importer run it over its own rows on every run.
 */
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAYS = "sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?";

const DATE_RE = new RegExp([
  String.raw`\(\s*\d{1,2}/\d{1,2}(?:/\d{2,4})?\s*\)`,                               // (09/13)
  String.raw`\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b`,                                      // 9/30, 10/10/26
  String.raw`\b(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b`,         // September 08, 2026
].join("|"), "gi");

const TAIL_TIME_RE = new RegExp(
  String.raw`[\s,@-]*(?:\b(?:${WEEKDAYS})\b\.?\s*)?(?:@\s*)?\b\d{1,2}(?::?\d{2})?\s*[ap]\.?m\.?\s*$`, "i");

const NIGHT_NAME = { riftbound: "Riftbound Nexus Night", lorcana: "Lorcana Weekly Play" };
// "Weekly Play Week 11", "Lorcana League - Week 3": a counter that is stale a week later.
const TAIL_WEEK_RE = /[\s,:-]*\bweek\s*#?\d+\s*$/i;

/** @param {string|null|undefined} title @param {string} [game] @returns {string|null|undefined} */
export function cleanWeeklyTitle(title, game = "riftbound") {
  if (title == null) return title;
  const fallback = NIGHT_NAME[game] ?? "Weekly play";
  let t = String(title).replace(DATE_RE, " ");
  for (let prev = null; prev !== t;) { prev = t; t = t.replace(TAIL_TIME_RE, "").replace(TAIL_WEEK_RE, ""); }
  t = t.replace(/\(\s*\)/g, " ")                    // brackets the date left empty
    .replace(/\s*,\s*/g, ", ")                      // "2026,Top Deck Keep,Constructed"
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:@|/-]+|[\s,;:@|/-]+$/g, "");   // separators stranded at either end
  if (/[a-z]{3,}/i.test(t)) return t;
  return t ? `${fallback} - ${t}` : fallback;
}
