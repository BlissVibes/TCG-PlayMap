#!/usr/bin/env node
/**
 * Bump lib/version.ts by one build (odometer: 0.1.1.9 -> 0.1.2.0) AND add the
 * changelog entry in the same edit - CLAUDE.md rule 1. For unattended jobs
 * (the weekly Riftbound refresh) that must commit without a human.
 *
 *   node scripts/bump_version.mjs "What changed, written for players." [YYYY-MM-DD]
 */
import { readFileSync, writeFileSync } from "node:fs";

export function nextVersion(v) {
  const p = v.split(".").map(Number);
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i] < 9 || i === 0) { p[i]++; break; }
    p[i] = 0;
  }
  return p.join(".");
}

export function bumpVersion(line, date, path = "lib/version.ts") {
  const src = readFileSync(path, "utf8");
  const m = /export const VERSION = "([\d.]+)";/.exec(src);
  if (!m) throw new Error("VERSION not found in lib/version.ts");
  const next = nextVersion(m[1]);
  const anchor = "export const CHANGELOG: ChangeEntry[] = [\n";
  if (!src.includes(anchor)) throw new Error("CHANGELOG anchor not found in lib/version.ts");
  const entry = `  {\n    version: ${JSON.stringify(next)},\n    date: ${JSON.stringify(date)},\n    changes: [${JSON.stringify(line)}],\n  },\n`;
  writeFileSync(path, src.replace(m[0], `export const VERSION = "${next}";`).replace(anchor, anchor + entry));
  return next;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [line, date] = process.argv.slice(2);
  if (!line) { console.error('usage: bump_version.mjs "changelog line" [YYYY-MM-DD]'); process.exit(2); }
  const today = date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  console.log(bumpVersion(line, today));
}
