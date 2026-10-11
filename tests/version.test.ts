/**
 * VERSION must equal the newest CHANGELOG entry. Carried over from Collectify,
 * where the two drifted for seven releases and the version endpoint - the only
 * way to see what is deployed - lied about it.
 *
 * And the version moves for SITE changes only (scripts/lib/versionRule.mjs).
 * The rule is tested on made-up path lists; one test then applies it to the
 * real repository state, read once.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { CHANGELOG, VERSION } from "../lib/version";
import { isDataPath, pathsFromPorcelain, versionIn, versionRuleProblem, VERSION_FILE } from "../scripts/lib/versionRule.mjs";

describe("version", () => {
  it("matches the newest changelog entry", () => {
    expect(CHANGELOG[0].version).toBe(VERSION);
  });

  it("is four odometer segments, each 0-9", () => {
    const parts = VERSION.split(".");
    expect(parts).toHaveLength(4);
    for (const p of parts) expect(Number(p)).toBeLessThanOrEqual(9);
  });

  it("has a strictly descending changelog", () => {
    const rank = (v: string) => v.split(".").reduce((acc, n) => acc * 10 + Number(n), 0);
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(rank(CHANGELOG[i - 1].version)).toBeGreaterThan(rank(CHANGELOG[i].version));
    }
  });
});

describe("version rule: site changes bump, shop updates do not", () => {
  it("knows which paths are data", () => {
    for (const p of ["data/events.json", "data/candidates/lorcana-ravensburger.json", "docs/SOURCES.md", "README.md", "./data/shops.json"]) expect(isDataPath(p), p).toBe(true);
    for (const p of ["lib/games.ts", "components/Calendar.tsx", "scripts/candidates/merge.mjs", "tests/data.test.ts", "CLAUDE.md", ".github/workflows/pages.yml", "database/x.json", "docs.md"]) expect(isDataPath(p), p).toBe(false);
  });

  it("a research batch (data only) must NOT bump", () => {
    const batch = ["data/events.json", "data/shops.json", "data/calendar_log.json", "data/research_queue.json"];
    expect(versionRuleProblem(batch, false)).toBeNull();
    expect(versionRuleProblem([...batch, VERSION_FILE], true)).toMatch(/data-only change .* bumped the version/);
    expect(versionRuleProblem(["docs/SOURCES.md", "README.md"], false)).toBeNull();
    expect(versionRuleProblem(["docs/SOURCES.md", VERSION_FILE], true)).toMatch(/data-only/);
  });

  it("a site change must bump, alone or alongside data", () => {
    expect(versionRuleProblem(["components/Calendar.tsx"], false)).toMatch(/site files changed without a version bump: components\/Calendar\.tsx/);
    expect(versionRuleProblem(["components/Calendar.tsx", VERSION_FILE], true)).toBeNull();
    expect(versionRuleProblem(["data/events.json", "lib/games.ts"], false)).toMatch(/lib\/games\.ts/);    // a new game is a site change
    expect(versionRuleProblem(["data/events.json", "lib/games.ts", VERSION_FILE], true)).toBeNull();
    expect(versionRuleProblem(["scripts/candidates/merge.mjs", "tests/import.test.ts"], false)).toMatch(/without a version bump/);
  });

  it("nothing changed, or only a changelog wording fix, is fine", () => {
    expect(versionRuleProblem([], false)).toBeNull();
    expect(versionRuleProblem([VERSION_FILE], false)).toBeNull();
    expect(versionRuleProblem([VERSION_FILE], true)).toBeNull();
  });

  it("reads paths out of git status, including untracked files and renames", () => {
    expect(pathsFromPorcelain(" M data/events.json\nM  lib/version.ts\n?? scripts/lorcana/\nR  docs/A.md -> docs/B.md\n")).toEqual(
      ["data/events.json", "lib/version.ts", "scripts/lorcana/", "docs/A.md", "docs/B.md"]);
    expect(versionIn('export const VERSION = "0.1.6.1";\n')).toBe("0.1.6.1");
    expect(versionIn("nothing here")).toBeNull();
  });

  it("holds for this checkout: the uncommitted work if there is any, otherwise the last commit", () => {
    // Everything git says is read ONCE, here, before any judgement (a check that
    // re-reads a moving HEAD flips under a concurrent commit).
    const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    let subject: string, paths: string[], before: string | null;
    try {
      const dirty = pathsFromPorcelain(git("status", "--porcelain", "--untracked-files=all"));
      if (dirty.length) {
        subject = "uncommitted work"; paths = dirty; before = versionIn(git("show", `HEAD:${VERSION_FILE}`));
      } else {
        subject = "the last commit"; paths = git("diff", "--name-only", "HEAD~1", "HEAD").split("\n").filter(Boolean);
        before = versionIn(git("show", `HEAD~1:${VERSION_FILE}`));
      }
    } catch {
      // No git, no history (an exported tarball, a depth-1 clone): nothing to compare
      // against. Say so rather than pass silently. pages.yml fetches depth 2 for this.
      console.warn("version rule: no git history to compare against - NOT CHECKED in this run");
      return;
    }
    const now = versionIn(readFileSync(VERSION_FILE, "utf8"));
    const problem = versionRuleProblem(paths, before !== now);
    expect(problem, `${subject}: ${problem}`).toBeNull();
  });
});
