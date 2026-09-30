/**
 * LOADING LEAFLET, ONCE, ON DEMAND.
 *
 * Carried over from Collectify-Wrapper's web/lib/leafletCdn.ts. Leaflet is
 * loaded as a plain <script> when the map first mounts rather than bundled, so
 * the calendar and log tabs never pay for a mapping library; the promise is
 * memoised at module scope so several components asking for it in the same
 * tick share one <script> tag instead of racing to define `L`.
 *
 * VENDORED, NOT CDN (differs from Collectify). The files live in
 * public/vendor/leaflet (1.9.4, BSD-2, LICENSE alongside). A static GitHub
 * Page has exactly one origin it can rely on - its own - and the first
 * acceptance run here failed because a third-party script host was blocked
 * on the client side. Same-origin cannot be blocked without blocking the
 * page. The path is prefixed with the Pages basePath so it resolves under
 * /TCG-PlayMap/ too.
 *
 * TILES: plain OpenStreetMap. Collectify used CARTO basemaps, which now need
 * an API key and print "API KEY REQUIRED" across every tile without one. This
 * site has no secrets at all, so it uses the OSM standard tiles, whose only
 * condition is the attribution below staying visible. The dark theme is a
 * CSS filter on the tile pane (see globals.css) rather than a second tile set.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const LEAFLET_JS = `${BASE}/vendor/leaflet/leaflet.js`;
export const LEAFLET_CSS = `${BASE}/vendor/leaflet/leaflet.css`;

let leafletPromise: Promise<void> | null = null;

/** Resolve once Leaflet's global `L` exists. Safe to call any number of times. */
export function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") {
    // Server render / static export. Nothing to draw yet; never an error.
    return new Promise(() => {});
  }
  if ((window as any).L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = LEAFLET_JS;
    js.onload = () => resolve();
    js.onerror = () => reject(new Error("failed to load Leaflet"));
    document.body.appendChild(js);
  });
  return leafletPromise;
}

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
