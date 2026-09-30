/** @type {import('next').NextConfig} */
// STATIC EXPORT: the site is a GitHub Page for now. `output: "export"` writes
// plain HTML/JS to out/, so there are no server routes - ZIP geocoding happens
// in the browser and the version lives in a static version.json.
//
// NEXT_PUBLIC_BASE_PATH is "/TCG-PlayMap" on GitHub project pages (set by the
// Pages workflow) and unset everywhere else. Moving to Vercel later means
// deleting `output` and this variable, nothing more.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};
module.exports = nextConfig;
