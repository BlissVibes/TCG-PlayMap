/**
 * GET /version.json - which build is serving. Exported as a static file so a
 * deploy can be verified from a shell:
 *   curl -s https://blissvibes.github.io/TCG-PlayMap/version.json
 * `version` moves only for site changes (scripts/lib/versionRule.mjs). A data
 * push is verified by the other three fields instead: `dataUpdated` (newest
 * calendar-log date) and the shop and event counts, read from the same files
 * the page is built from.
 */
import LOG from "@/data/calendar_log.json";
import EVENTS from "@/data/events.json";
import SHOPS from "@/data/shops.json";
import { dataUpdated } from "@/lib/data";
import { VERSION } from "@/lib/version";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    version: VERSION,
    dataUpdated: dataUpdated(LOG as { date: string }[]),
    shops: (SHOPS as unknown[]).length,
    events: (EVENTS as unknown[]).length,
  });
}
