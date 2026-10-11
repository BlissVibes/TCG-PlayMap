/** @type {import('next').NextConfig} */
// STATIC EXPORT: the site is a GitHub Page for now. `output: "export"` writes
// plain HTML/JS to out/, so there are no server routes - ZIP geocoding happens
// in the browser and the version lives in a static version.json.
//
// NEXT_PUBLIC_BASE_PATH is "/TCG-PlayMap" on GitHub project pages (set by the
// Pages workflow) and unset everywhere else. Moving to Vercel later means
// deleting `output` and this variable, nothing more.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// The data is not bundled: scripts/copy_data.mjs copies data/*.json into
// public/data/ (served as /data/*.json, exported to out/data/) and prints a
// hash of it. The page fetches the files with that hash as ?v=, so a new page
// never reads an older cached copy. Runs on every build and every dev start.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const dataStamp = execFileSync(process.execPath, [path.join(__dirname, "scripts", "copy_data.mjs")], { encoding: "utf8" }).trim();
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_DATA_STAMP: dataStamp },
};
module.exports = nextConfig;
