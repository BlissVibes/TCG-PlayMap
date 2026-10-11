/**
 * The run-directly guard. Tested on the helper alone, with made-up paths:
 * importing a script to test its guard would run the script.
 *
 * Found 2026-10-10: `node scripts/candidates/merge.mjs ...` from a checkout
 * under "_Vibe Coding Projects" exited 0 with no output, because the old guard
 * compared a %20-encoded URL with a path holding a real space.
 */
import { describe, it, expect } from "vitest";
import { pathToFileURL } from "node:url";
import { isMain } from "../scripts/lib/isMain.mjs";

describe("isMain", () => {
  it("is true for a path with a space in it", () => {
    const p = "/Users/mark/_Vibe Coding Projects/TCG-PlayMap/scripts/candidates/merge.mjs";
    const url = pathToFileURL(p).href;
    expect(url).toContain("%20");                       // the shape that broke
    expect(url === `file://${p}`).toBe(false);          // the old guard, failing
    expect(isMain(url, p)).toBe(true);
  });

  it("is true for a plain path", () => {
    const p = "/opt/tcg/scripts/riftbound/pull.mjs";
    expect(isMain(pathToFileURL(p).href, p)).toBe(true);
  });

  it("is false when another file was run, or nothing was", () => {
    const url = pathToFileURL("/opt/tcg/scripts/bump_version.mjs").href;
    expect(isMain(url, "/opt/tcg/scripts/candidates/merge.mjs")).toBe(false);
    expect(isMain(url, "/opt/tcg/node_modules/vitest/vitest.mjs")).toBe(false);
    expect(isMain(url, "")).toBe(false);
  });
});
