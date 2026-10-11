/**
 * WHEN THE SITE VERSION MOVES.
 *
 * Mark, 2026-10-10: "we dont need to update the version for every single shop
 * update. its to be saved for feature updates and changes." That day the
 * version went from 0.1.1.1 to 0.1.6.0 in 49 commits, 19 of them batches of
 * shop research that changed nothing about the site.
 *
 * The rule, per commit:
 *   - touches ANYTHING outside the data paths  -> VERSION must change (with
 *     its CHANGELOG line, which tests/version.test.ts checks separately);
 *   - touches ONLY the data paths              -> VERSION must NOT change,
 *     UNLESS Mark asked for that data update to carry a version because it is
 *     different somehow (his words, 2026-10-10). Then the new CHANGELOG entry
 *     says so in its `dataBump` field, written by
 *     `node scripts/bump_version.mjs "<line>" --data-bump "<why Mark asked>"`.
 *     Nobody else sets that field.
 * Data paths: data/**, docs/**, README.md. lib/version.ts is the bump itself
 * and counts on neither side. Adding a game to lib/games.ts is a site change
 * (a new chip, a new colour) and bumps.
 *
 * Pure on purpose: it takes the list of changed paths and whether VERSION
 * changed. Where those come from (the working tree before a commit, the last
 * commit in CI) is tests/version.test.ts's business, so this can be tested
 * without a repository.
 */
export const VERSION_FILE = "lib/version.ts";

/** Is this path data, which never moves the site version? */
export function isDataPath(path) {
  const p = String(path).replace(/\\/g, "/").replace(/^\.\//, "");
  return p === "README.md" || p.startsWith("data/") || p.startsWith("docs/");
}

/**
 * @param {string[]} changedPaths every path the commit (or the working tree) touches
 * @param {boolean} versionChanged did the VERSION constant change?
 * @param {string|null|undefined} [dataBump] the new top CHANGELOG entry's `dataBump` reason, if it has one
 * @returns {string|null} what is wrong, in words a person can act on; null when fine
 */
export function versionRuleProblem(changedPaths, versionChanged, dataBump = null) {
  const paths = [...new Set(changedPaths.map((p) => String(p).replace(/\\/g, "/")))].filter((p) => p && p !== VERSION_FILE);
  const site = paths.filter((p) => !isDataPath(p));
  if (site.length && !versionChanged) {
    return `site files changed without a version bump: ${site.slice(0, 5).join(", ")}${site.length > 5 ? `, +${site.length - 5} more` : ""}. `
      + `Run: node scripts/bump_version.mjs "<what changed, for the person using the site>"`;
  }
  if (!site.length && versionChanged && paths.length && !String(dataBump ?? "").trim()) {
    return `data-only change (${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ", ..." : ""}) bumped the version. `
      + "Shop and schedule updates do not move the site version (Mark, 2026-10-10): restore lib/version.ts and name the shops in the commit subject instead. "
      + 'If Mark asked for this one to carry a version, bump with: node scripts/bump_version.mjs "<line>" --data-bump "<why he asked>"';
  }
  return null;
}

/** Paths from `git status --porcelain` output (staged, unstaged and untracked; a rename counts both names). */
export function pathsFromPorcelain(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (line.length < 4) continue;
    const rest = line.slice(3);
    for (const part of rest.split(" -> ")) out.push(part.replace(/^"|"$/g, ""));
  }
  return out;
}

/** The VERSION constant in a copy of lib/version.ts, or null. */
export function versionIn(source) {
  return /export const VERSION = "([\d.]+)";/.exec(String(source ?? ""))?.[1] ?? null;
}
