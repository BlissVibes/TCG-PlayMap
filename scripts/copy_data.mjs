#!/usr/bin/env node
/**
 * COPY THE DATA TO WHERE THE SITE SERVES IT.
 *
 *   node scripts/copy_data.mjs        (next.config.js runs this on every build and dev start)
 *
 * The three data files live in data/ and stay there: that is where people and
 * importers edit them. The site no longer bundles them into its JavaScript
 * (at 184 shops the page script was 837 KB, 112 KB gzipped, most of it data).
 * It fetches them at runtime from /data/*.json, so this copies them into
 * public/data/, which Next serves as-is and the static export writes to
 * out/data/. public/data/ is generated and git-ignored.
 *
 * It prints a STAMP: a short hash of the three files. The build bakes it into
 * the page, which asks for /data/shops.json?v=<stamp>, so a browser or CDN can
 * never pair a new page with yesterday's cached data.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./lib/isMain.mjs";

export const DATA_FILES = ["shops.json", "events.json", "calendar_log.json"];

/** @returns {string} the stamp */
export function copyData(root = join(dirname(fileURLToPath(import.meta.url)), "..")) {
  const hash = createHash("sha1");
  const out = join(root, "public", "data");
  mkdirSync(out, { recursive: true });
  for (const f of DATA_FILES) {
    const text = readFileSync(join(root, "data", f), "utf8");
    // Parse and re-serialise: refuses a broken file at build time, and ships it
    // without the hand-aligned whitespace (about a fifth smaller).
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error(`data/${f} is not a JSON array`);
    const compact = JSON.stringify(rows);
    writeFileSync(join(out, f), compact);
    hash.update(f).update(compact);
  }
  return hash.digest("hex").slice(0, 12);
}

if (isMain(import.meta.url)) process.stdout.write(copyData());
