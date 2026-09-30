/**
 * GET /version.json - which build is serving. Exported as a static file so a
 * deploy can be verified from a shell:
 *   curl -s https://blissvibes.github.io/TCG-PlayMap/version.json
 * The constant bumps every commit, so this equals "is my commit live yet".
 */
import { VERSION } from "@/lib/version";

export const dynamic = "force-static";

export function GET() {
  return Response.json({ version: VERSION });
}
