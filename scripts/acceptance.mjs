#!/usr/bin/env node
/**
 * BROWSER ACCEPTANCE - drive the real page and assert on what a visitor sees.
 *
 *   node scripts/acceptance.mjs                         # local: serves out/ on :4173
 *   node scripts/acceptance.mjs https://blissvibes.github.io/TCG-PlayMap/
 *
 * Unit tests cannot catch the class of bug this exists for: on 2026-09-30 every
 * test passed, the build was green, the deploy succeeded, and the live map drew
 * ZERO pins on a fresh visit (a stale closure drew an empty shop list once and
 * never redrew). Only opening the deployed page found it. So this runs a FRESH
 * profile - no localStorage, no interaction before the map - and checks the
 * things a first-time visitor would see.
 *
 * Needs `playwright-core` (devDependency) and a Chromium: set CHROME_PATH, or
 * rely on Playwright's default install. Map tiles are stubbed with a blank PNG
 * so the check does not depend on openstreetmap.org.
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const target = process.argv[2] ?? "http://localhost:4173/";
let server = null;
if (!process.argv[2]) {
  server = spawn("python3", ["-m", "http.server", "4173", "-d", "out"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
}

// 1x1 transparent PNG, enough for Leaflet to consider a tile loaded.
const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: TILE }));
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(target, { waitUntil: "load" });
  await page.waitForSelector(".block", { timeout: 30000 });

  // Calendar, fresh visit: this week, no filters.
  const blocks = await page.locator(".block").count();
  check("week view renders event blocks", blocks > 0, `${blocks} blocks`);
  check("some blocks are tournaments (trophy)", (await page.locator(".block .trophy").count()) > 0);

  // Every block offers a call link (when the shop has a phone) and directions.
  const firstBlock = page.locator(".block").first();
  const dirHref = await firstBlock.locator('a[aria-label^="Directions to"]').getAttribute("href").catch(() => null);
  check("blocks link to directions", !!dirHref && dirHref.includes("google.com/maps/dir/"), dirHref ?? "none");
  const phoneBlocks = await page.locator('.block a[href^="tel:"]').count();
  check("blocks show the shop's phone as a call link", phoneBlocks > 0, `${phoneBlocks} call links`);

  // Month view must draw EVERY event the week view shows, date for date.
  // (2026-10-03: month cells stopped at 4 chips and drew none on phones.)
  const weekCounts = await page.$$eval(".block", (els) => {
    const m = {}; for (const e of els) m[e.dataset.date] = (m[e.dataset.date] || 0) + 1; return m;
  });
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.waitForSelector(".cell");
  const monthCounts = await page.$$eval(".cell", (els) =>
    Object.fromEntries(els.map((e) => [e.getAttribute("aria-label").slice(0, 10), e.querySelectorAll(".mini").length])));
  const mismatched = Object.entries(weekCounts).filter(([d, n]) => d in monthCounts && monthCounts[d] !== n);
  check("month view draws every event the week view does", mismatched.length === 0,
    mismatched.map(([d, n]) => `${d}: week ${n}, month ${monthCounts[d]}`).join("; "));
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.waitForSelector(".block");

  // Map, fresh visit, BEFORE any interaction: every active shop must be a pin.
  await page.getByRole("tab", { name: "Map" }).click();
  await page.waitForSelector(".leaflet-container", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll(".pin").length > 0, null, { timeout: 15000 }).catch(() => {});
  const pins = await page.locator(".pin").count();
  const footer = await page.locator("footer").innerText();
  const shopCount = Number(/(\d+) shops/.exec(footer)?.[1] ?? 0);
  check("map draws a pin per shop on a fresh visit", pins > 0 && pins === shopCount, `${pins} pins, ${shopCount} shops`);

  // Block -> map jump opens that shop's popup.
  await page.getByRole("tab", { name: "Calendar" }).click();
  const shopName = (await page.locator(".block .shop").first().innerText()).split(" · ")[0];
  await page.locator(".block .body").first().click();
  await page.waitForSelector(".leaflet-popup h3", { timeout: 15000 }).catch(() => {});
  const popup = await page.locator(".leaflet-popup h3").first().innerText().catch(() => "");
  check("clicking a block opens that shop on the map", popup === shopName, `${popup || "no popup"} vs ${shopName}`);

  // Theme toggle.
  const before = await page.locator("main").getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to .* theme/ }).click();
  const after = await page.locator("main").getAttribute("data-theme");
  check("header toggle flips the theme", before !== after, `${before} -> ${after}`);

  // Log tab has content.
  await page.getByRole("tab", { name: "Log" }).click();
  check("log tab lists calendar log lines", (await page.locator(".logline").count()) > 0);

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
