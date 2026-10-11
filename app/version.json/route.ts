/**
 * GET /version.json - which build is serving. Exported as a static file so a
 * deploy can be verified from a shell:
 *   curl -s https://blissvibes.github.io/TCG-PlayMap/version.json
 * `version` moves only for site changes (scripts/lib/versionRule.mjs). A data
 * push is verified by the other three fields instead: `dataUpdated` (newest
 * calendar-log date) and the shop and event counts, read from the same files
 * the page is built from.
 */
import { dataUpdated } from "@/lib/data";
import { jsonDataSource } from "@/lib/dataCommitted";
import { VERSION } from "@/lib/version";

export const dynamic = "force-static";

export async function GET() {
  // Build time only (force-static): the committed files, read directly.
  const { shops, events, log } = await jsonDataSource.load();
  return Response.json({ version: VERSION, dataUpdated: dataUpdated(log), shops: shops.length, events: events.length });
}
