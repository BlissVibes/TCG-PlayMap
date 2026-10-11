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
  // The main button steers towards picking games; it must not skip the step.
  await page.getByRole("button", { name: "Pick my games" }).click();
  check("setup's main button nudges a TCG pick instead of showing everything",
    (await page.locator('.setup [aria-label="Your TCGs"]').count()) === 1 && (await page.getByRole("button", { name: "Show everything" }).count()) === 1);
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

  // Blocks are compact until tapped (0.1.3.1): one or two lines, details closed.
  const compact = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".block")].map((x) => x.getBoundingClientRect().height);
    return { open: document.querySelectorAll(".block .more").length, avg: Math.round(b.reduce((a, c) => a + c, 0) / b.length), max: Math.round(Math.max(...b)), page: document.documentElement.scrollHeight };
  });
  check("blocks are compact until tapped", compact.open === 0 && compact.max <= 48, `avg ${compact.avg}px, tallest ${compact.max}px, page ${compact.page}px`);
  await page.locator(".block .body").first().click();
  check("tapping a block opens its details in place",
    (await page.locator(".block").first().locator('a[aria-label^="Directions to"]').count()) === 1 && (await page.locator(".block .more").count()) === 1);
  await page.locator(".block .body").first().click();
  // "Details" opens every block: the checks below look at all of them.
  await page.getByRole("button", { name: "Details" }).click();
  check("'Details' opens every block", (await page.locator(".block .more").count()) === blocks, `${await page.locator(".block .more").count()}/${blocks}`);

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
  // Data updates no longer move the version (2026-10-10), so the footer says when the data last changed.
  check("footer says when the data was last updated", /data updated [A-Z][a-z]{2} \d{1,2}, 20\d\d/.test(footer), /data updated[^·]*/.exec(footer)?.[0]?.trim() ?? footer.slice(0, 80));
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
  // The calendar remounts on a tab switch, so blocks are compact again: open one first.
  await page.locator(".block .body").first().click();
  await page.locator(".block .tomap").first().click();
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
  await ctx.close();

  // ── The same visit on a phone (390 wide). The week's columns stack, so the
  // order of days, the length of the page and the popup's fit are all
  // different problems from the desktop ones above. ──
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, hasTouch: true, isMobile: true });
  const ph = await pctx.newPage();
  await ph.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: TILE }));
  const phErrors = [];
  ph.on("pageerror", (e) => phErrors.push(e.message));
  await ph.goto(target, { waitUntil: "load" });
  await ph.waitForSelector(".setup", { timeout: 30000 });
  await ph.fill("#setup-zip", "91303");
  await ph.selectOption("#setup-radius", "250");
  await ph.getByRole("button", { name: "Next" }).click();
  await ph.waitForSelector('.setup [aria-label="Your TCGs"]', { timeout: 15000 });
  await ph.getByRole("button", { name: "Show everything" }).click();
  await ph.getByRole("button", { name: /^Done/ }).click();
  await ph.waitForSelector(".block", { timeout: 15000 });
  const pw = await ph.evaluate(() => {
    const days = [...document.querySelectorAll(".week .day")].map((d) => ({ today: d.classList.contains("today"), top: d.getBoundingClientRect().top }));
    const first = days.slice().sort((a, b) => a.top - b.top)[0];
    return { hasToday: days.some((d) => d.today), todayFirst: !!first?.today, blocks: document.querySelectorAll(".block").length,
      fees: document.querySelectorAll(".block .fee").length, page: document.documentElement.scrollHeight, wide: document.documentElement.scrollWidth };
  });
  check("phone: today is the first day in the stacked week", pw.hasToday && pw.todayFirst);
  check("phone: every block shows its cost", pw.blocks > 0 && pw.fees === pw.blocks, `${pw.fees}/${pw.blocks}`);
  check("phone: the page does not scroll sideways", pw.wide <= 390, `${pw.wide}px wide; ${pw.blocks} blocks in ${pw.page}px = ${(pw.page / 844).toFixed(1)} screens`);
  const pName = await ph.locator(".block .shop").first().innerText();
  await ph.locator(".block .body").first().click();
  await ph.locator(".block .tomap").first().click();
  await ph.waitForSelector(".leaflet-popup h3", { timeout: 15000 }).catch(() => {});
  await ph.waitForTimeout(500);
  const pPop = await ph.evaluate(() => {
    const p = document.querySelector(".leaflet-popup")?.getBoundingClientRect(), m = document.querySelector(".map").getBoundingClientRect();
    return p ? { name: document.querySelector(".leaflet-popup h3").textContent, ok: p.top >= m.top - 1 && p.bottom <= m.bottom + 1 && p.left >= m.left - 1 && p.right <= m.right + 1,
      d: `popup ${Math.round(p.width)}x${Math.round(p.height)} in map ${Math.round(m.width)}x${Math.round(m.height)}` } : { name: "", ok: false, d: "no popup" };
  });
  check("phone: a block's 'Show on map' opens that shop", pName.startsWith(pPop.name) && pPop.name !== "", `${pPop.name || "no popup"} vs ${pName}`);
  check("phone: the popup fits inside the map", pPop.ok, pPop.d);
  const pHeld = Number(await ph.locator(".map").getAttribute("data-markers"));
  check("phone: map holds a marker per shop", pHeld === shopCount, `${pHeld} markers, ${shopCount} shops`);
  check("phone: no uncaught page errors", phErrors.length === 0, phErrors.join(" | "));
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
