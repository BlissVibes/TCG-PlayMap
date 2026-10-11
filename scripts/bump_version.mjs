#!/usr/bin/env node
/**
 * Bump lib/version.ts by one build (odometer: 0.1.1.9 -> 0.1.2.0) AND add the
 * changelog entry in the same edit - CLAUDE.md rule 1.
 *
 *   node scripts/bump_version.mjs "What changed, written for players." [YYYY-MM-DD]
 *
 * For SITE changes. A data-only commit does not bump (Mark, 2026-10-10) unless
 * he asks for that one to carry a version; then add
 *   --data-bump "why Mark asked"
 * which records the reason on the entry (the version test requires it).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./lib/isMain.mjs";

export function nextVersion(v) {
  const p = v.split(".").map(Number);
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i] < 9 || i === 0) { p[i]++; break; }
    p[i] = 0;
  }
  return p.join(".");
}

/**
 * @param {string} line @param {string} date @param {string} [path]
 * @param {string|null} [dataBump] why Mark asked for a DATA update to carry a version; omit for a site change
 * @returns {string} the new version
 */
export function bumpVersion(line, date, path = "lib/version.ts", dataBump = null) {
  const src = readFileSync(path, "utf8");
  const m = /export const VERSION = "([\d.]+)";/.exec(src);
  if (!m) throw new Error("VERSION not found in lib/version.ts");
  const next = nextVersion(m[1]);
  const anchor = "export const CHANGELOG: ChangeEntry[] = [\n";
  if (!src.includes(anchor)) throw new Error("CHANGELOG anchor not found in lib/version.ts");
  const entry = `  {\n    version: ${JSON.stringify(next)},\n    date: ${JSON.stringify(date)},\n    changes: [${JSON.stringify(line)}],\n${dataBump ? `    dataBump: ${JSON.stringify(dataBump)},\n` : ""}  },\n`;
  writeFileSync(path, src.replace(m[0], `export const VERSION = "${next}";`).replace(anchor, anchor + entry));
  return next;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const usage = 'usage: bump_version.mjs "changelog line" [YYYY-MM-DD] [--data-bump "why Mark asked for a data update to carry a version"]';
  let dataBump = null;
  const i = argv.indexOf("--data-bump");
  if (i >= 0) {
    dataBump = argv[i + 1];
    if (!dataBump || dataBump.startsWith("--")) { console.error(`--data-bump needs the reason\n${usage}`); process.exit(2); }
    argv.splice(i, 2);
  }
  const [line, date] = argv;
  if (!line || line.startsWith("--") || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) || argv.length > 2) { console.error(usage); process.exit(2); }
  const today = date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  console.log(bumpVersion(line, today, "lib/version.ts", dataBump));
}
