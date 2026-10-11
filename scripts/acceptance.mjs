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

  // ── First visit: setup, not the whole messy list (Mark, 2026-10-09) ──
  await page.waitForSelector(".setup", { timeout: 30000 });
  check("first visit opens on setup, with no events listed", (await page.locator(".block").count()) === 0);
  await page.fill("#setup-zip", "91303");     // in data/zips.json, so it resolves even offline
  await page.selectOption("#setup-radius", "250");
  await page.getByRole("button", { name: "Next" }).click();
  await page.waitForSelector('.setup [aria-label="Your TCGs"]', { timeout: 15000 });
  await page.locator('.setup .chip.game[title="Pokémon TCG"]').click();
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.locator('.setup .chip.hide[title="Hide Yu-Gi-Oh!"]').click();
  await page.getByRole("button", { name: /^Done/ }).click();
  await page.waitForSelector(".block", { timeout: 15000 });
  const chipText = async () => page.$$eval(".block .gchip", (els) => els.map((e) => e.textContent));
  const mine = await chipText();
  check("after setup, the calendar shows only MY TCGs", mine.length > 0 && mine.every((t) => t === "PKMN"), `${mine.length} blocks: ${[...new Set(mine)].join(",")}`);
  await page.getByRole("button", { name: "Show all TCGs" }).click();
  const all = await chipText();
  check("'Show all TCGs' shows more games, but never a hidden one", all.length > mine.length && !all.includes("YGO"),
    `${all.length} blocks, ${new Set(all).size} games, YGO ${all.includes("YGO") ? "SHOWN" : "hidden"}`);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".block", { timeout: 15000 });
  check("choices survive a reload (no setup again)", (await page.locator(".setup").count()) === 0);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Hide Yu-Gi-Oh!").uncheck();
  await page.getByRole("button", { name: "Settings" }).click();
  check("unhiding in Settings brings the game back", (await chipText()).includes("YGO"));

  // Calendar, after setup with everything shown: this week.
  const blocks = await page.locator(".block").count();
  const feeShown = await page.locator(".block .fee").count();
  check("every block shows its cost (or 'Cost not listed')", feeShown === blocks, `${feeShown}/${blocks}`);
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
  await page.waitForTimeout(600);   // cluster animation
  const footer = await page.locator("footer").innerText();
  const shopCount = Number(/(\d+) shops/.exec(footer)?.[1] ?? 0);
  // Since clustering (0.1.3.0) a shop is often not a DOM pin of its own, so two
  // checks replace "count the pins": what the marker layer HOLDS (PlayMap
  // writes getLayers().length to data-markers), and what is DRAWN - single
  // pins plus the count on each cluster bubble. Both must equal the shops.
  const held = Number(await page.locator(".map").getAttribute("data-markers"));
  const drawnInfo = await page.evaluate(() => {
    const pins = [...document.querySelectorAll(".pin")];
    const r = pins.map((p) => p.getBoundingClientRect());
    let covered = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      if (Math.abs(r[i].x - r[j].x) < 10 && Math.abs(r[i].y - r[j].y) < 10) { covered++; break; }
    }
    return {
      drawn: pins.reduce((n, p) => n + (p.classList.contains("cluster") ? Number(p.dataset.count) : 1), 0),
      bubbles: pins.length, clusters: pins.filter((p) => p.classList.contains("cluster")).length, covered,
      trophies: document.querySelectorAll(".pin .badge").length,
    };
  });
  check("map holds a marker per shop on a fresh visit", held > 0 && held === shopCount, `${held} markers, ${shopCount} shops`);
  check("every shop is drawn, as its own pin or inside a cluster", drawnInfo.drawn === shopCount,
    `${drawnInfo.drawn} of ${shopCount} in ${drawnInfo.bubbles} bubbles (${drawnInfo.clusters} clusters)`);
  check("no pin sits on top of another", drawnInfo.covered === 0, `${drawnInfo.covered} covered`);
  check("tournament trophies survive clustering", drawnInfo.trophies > 0, `${drawnInfo.trophies} badges`);

  // Block -> map jump opens that shop's popup.
  await page.getByRole("tab", { name: "Calendar" }).click();
  const shopName = (await page.locator(".block .shop").first().innerText()).split(" · ")[0];
  await page.locator(".block .body").first().click();
  await page.waitForSelector(".leaflet-popup h3", { timeout: 15000 }).catch(() => {});
  const popup = await page.locator(".leaflet-popup h3").first().innerText().catch(() => "");
  check("clicking a block opens that shop on the map", popup === shopName, `${popup || "no popup"} vs ${shopName}`);
  await page.waitForTimeout(400);
  const fitInfo = await page.evaluate(() => {
    const p = document.querySelector(".leaflet-popup")?.getBoundingClientRect(), m = document.querySelector(".map").getBoundingClientRect();
    return p ? { ok: p.top >= m.top - 1 && p.bottom <= m.bottom + 1 && p.left >= m.left - 1 && p.right <= m.right + 1, d: `popup ${Math.round(p.width)}x${Math.round(p.height)} in map ${Math.round(m.width)}x${Math.round(m.height)}` } : { ok: false, d: "no popup" };
  });
  check("the popup fits inside the map", fitInfo.ok, fitInfo.d);

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
