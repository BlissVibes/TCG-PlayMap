"use client";

/**
 * THE MAP: one pin per shop that passes the distance filter, a trophy badge
 * on any shop running a tournament in the visible week, and a popup that
 * lists that week's events.
 *
 * Built on Collectify-Wrapper's PinMap pattern (vendored Leaflet, one
 * memoised loader, divIcon pins).
 *
 * CLUSTERING (0.1.3.0). The Riftbound import took the map from 7 shops to 127.
 * Measured that day at ZIP 90012 / 250 miles: every pin touched another and
 * 115 of 127 were more than two-thirds covered. Pins now go through
 * Leaflet.markercluster: below CLUSTER_BELOW_ZOOM nearby shops merge into one
 * bubble carrying their count (and a trophy if any of them runs a tournament
 * this week); from that zoom in, every shop is its own pin.
 *
 * The map never filters on its own. It draws exactly the shops and the
 * occurrences the page hands it, so the calendar and the map can never
 * disagree about what "within 25 miles of 91303" means.
 */

import { useEffect, useRef, useState } from "react";
import { loadLeaflet, TILE_ATTRIBUTION, TILE_URL } from "@/lib/leafletCdn";
import { GAMES } from "@/lib/games";
import { feeLabel, formatTime, scheduleIncomplete, WEEKDAY_SHORT, weekdayOf, type Occurrence, type Shop } from "@/lib/schedule";
import type { GeoOrigin } from "@/lib/geo";
import { appleDirectionsUrl, directionsUrl, telHref } from "@/lib/shopLinks";

export interface FocusRequest { shopId: string; nonce: number }

export interface PlayMapProps {
  shops: Shop[];
  /** This week's filtered occurrences; drives the trophy badge and the popup. */
  occurrences: Occurrence[];
  origin: GeoOrigin | null;
  radiusMi: number;
  focus: FocusRequest | null;
  /** Ids in the visitor's own calendar, to mark them in the popup. */
  myEvents: ReadonlySet<string>;
  /**
   * Whether the map tab is showing. The map stays mounted while hidden (so
   * Leaflet is not rebuilt on every tab switch), but a hidden container has
   * no size, and fitting bounds to a 0x0 box gives Leaflet a NaN view that
   * breaks every later flyTo. So: never fit while hidden, and refit the
   * moment the tab appears.
   */
  visible: boolean;
}

const LA_CENTER: [number, number] = [34.07, -118.35];
/** Shops cluster at zoom levels below this; at it and beyond every shop is its own pin. */
const CLUSTER_BELOW_ZOOM = 12;
/** A popup never takes more than this share of the map's height; the rest scrolls. */
const POPUP_MAX_SHARE = 0.6;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function popupHtml(shop: Shop, occs: Occurrence[], myEvents: ReadonlySet<string>): string {
  const byDay = new Map<number, Occurrence[]>();
  for (const o of occs) {
    const wd = weekdayOf(o.date);
    (byDay.get(wd) ?? byDay.set(wd, []).get(wd)!).push(o);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([wd, list]) => {
    const items = list.map((o) => {
      const g = GAMES[o.event.game];
      const t = o.event.kind === "tournament" ? " 🏆" : "";
      const mine = myEvents.has(o.event.id) ? " ✓" : "";
      const extra = [o.event.title, o.event.format].filter(Boolean).join(" · ");
      // Cost is always shown (rule 9).
      return `<li>${esc(formatTime(o.event.start))} <span class="gchip" style="--chip:${g.color}">${esc(g.short)}</span>${t}${mine} <b class="pfee">${esc(feeLabel(o.event.fee))}</b>${extra ? ` <span style="color:var(--muted)">${esc(extra)}</span>` : ""}</li>`;
    }).join("");
    return `<li><b>${WEEKDAY_SHORT[wd]}</b><ul>${items}</ul></li>`;
  }).join("");
  const tel = telHref(shop.phone);
  const site = shop.website ?? shop.socials?.instagram ?? null;
  const links = [
    `<a href="${esc(directionsUrl(shop))}" target="_blank" rel="noopener">↗ Directions</a>`,
    `<a href="${esc(appleDirectionsUrl(shop))}" target="_blank" rel="noopener">Apple Maps</a>`,
    site ? `<a href="${esc(site)}" target="_blank" rel="noopener">${shop.website ? "Website" : "Instagram"}</a>` : "",
  ].filter(Boolean).join("");
  return `<div class="popup">
    <h3>${esc(shop.name)}</h3>
    <div class="addr">${esc(shop.address)}, ${esc(shop.city)} ${esc(shop.zip)}${shop.hours ? `<br>${esc(shop.hours)}` : ""}</div>
    ${tel ? `<div class="phone"><a href="${tel}">📞 ${esc(shop.phone!)}</a></div>` : ""}
    ${days ? `<ul>${days}</ul>` : (shop.notes ? "" : `<div class="addr">No events on the calendar yet.</div>`)}
    ${scheduleIncomplete(shop) ? `<div class="partial">Only ${esc(GAMES[shop.games?.[0] ?? "other"]?.label ?? "one game")} is listed here so far. This shop may run other games.</div>` : ""}
    ${/* Always, not only when there are no events: the notes are where "schedule not
         researched yet" and "events are posted on Instagram" live. */ shop.notes ? `<div class="notes">${esc(shop.notes)}</div>` : ""}
    <div class="links" style="margin-top:8px">${links}</div>
  </div>`;
}

export function PlayMap({ shops, occurrences, origin, radiusMi, focus, myEvents, visible }: PlayMapProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const originLayer = useRef<any>(null);
  const lastFocusNonce = useRef<number>(0);
  /** A fit was wanted while the container had no size; do it when it does. */
  const pendingFit = useRef(false);
  /**
   * Flips once Leaflet has loaded and the map object exists. The redraw
   * effect depends on it, which is what makes the FIRST draw use current
   * props: the map is created inside a run-once effect, and that effect's
   * closure holds the props from the first render - an empty shop list,
   * because the data had not loaded yet. Calling draw() from there painted
   * nothing and nothing ever repainted; the live site shipped with zero pins
   * on 2026-09-30 until this was found by driving the deployed page.
   */
  const [ready, setReady] = useState(false);

  const hasSize = () => !!el.current && el.current.clientWidth > 0 && el.current.clientHeight > 0;

  /**
   * Popups scroll instead of outgrowing the map. A shop with 14 nights made a
   * 732 px popup in a 660 px map (506 px on a phone) with its top cut off.
   * The limit is a CSS variable on the map element (see .leaflet-popup-content
   * in globals.css) so it follows the map's real height on rotate / resize.
   */
  const sizePopups = () => {
    if (!el.current || !hasSize()) return;
    el.current.style.setProperty("--popup-max", `${Math.round(el.current.clientHeight * POPUP_MAX_SHARE)}px`);
  };
  const popupWidth = () => Math.max(200, Math.min(320, (el.current?.clientWidth || window.innerWidth) - 110));

  /**
   * Frame the SHOPS in view (plus the visitor's ZIP point, so they can see
   * where they are). Until 0.1.3.0 a set ZIP framed the radius circle instead:
   * at 250 miles that is zoom 6, with every LA shop in one blob in the middle.
   * The circle is still drawn; it is just not what the camera is aimed at.
   * With no shops in range the circle is all there is to show, so frame that.
   */
  const fit = () => {
    if (!map.current) return;
    if (!hasSize()) { pendingFit.current = true; return; }
    pendingFit.current = false;
    map.current.invalidateSize();
    sizePopups();
    if (shops.length > 0) {
      const pts: [number, number][] = shops.map((s) => [s.lat, s.lon]);
      if (origin) pts.push([origin.lat, origin.lon]);
      map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
    } else if (origin && originLayer.current) {
      map.current.fitBounds(originLayer.current.getBounds(), { padding: [20, 20] });
    }
  };

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await loadLeaflet(); } catch { return; }
      if (cancelled || !el.current || map.current) return;
      const L = (window as any).L;
      map.current = L.map(el.current, { zoomControl: true, attributionControl: true })
        .setView(LA_CENTER, 10);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map.current);
      // Cluster layer when the plugin loaded, a plain layer when it did not.
      map.current._pins = (L.markerClusterGroup
        ? L.markerClusterGroup({
          disableClusteringAtZoom: CLUSTER_BELOW_ZOOM, maxClusterRadius: 44,
          showCoverageOnHover: false, spiderfyOnMaxZoom: false, chunkedLoading: false,
          iconCreateFunction: (cluster: any) => {
            const kids = cluster.getAllChildMarkers();
            const trophy = kids.some((k: any) => k.options.trophy);
            const names = kids.slice(0, 6).map((k: any) => k.options.shopName).join(", ") + (kids.length > 6 ? ", …" : "");
            return L.divIcon({
              html: `<div class="pin cluster" data-count="${kids.length}" title="${esc(`${kids.length} shops: ${names}`)}">${kids.length}${trophy ? '<span class="badge">🏆</span>' : ""}</div>`,
              className: "", iconSize: [38, 38], iconAnchor: [19, 19],
            });
          },
        })
        : L.layerGroup()).addTo(map.current);
      map.current._origin = L.layerGroup().addTo(map.current);
      setTimeout(() => map.current?.invalidateSize(), 0);
      // Do NOT call draw() here - this closure's props are stale (see `ready`).
      setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  // Keep the popup height limit in step with the map's real size.
  useEffect(() => {
    if (!el.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sizePopups());
    ro.observe(el.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = () => {
    if (!map.current) return;
    const L = (window as any).L;
    map.current._pins.clearLayers();
    markers.current.clear();
    const byShop = new Map<string, Occurrence[]>();
    for (const o of occurrences) (byShop.get(o.shop.id) ?? byShop.set(o.shop.id, []).get(o.shop.id)!).push(o);

    const maxWidth = popupWidth();
    const made: any[] = [];
    for (const s of shops) {
      const occs = byShop.get(s.id) ?? [];
      const trophy = occs.some((o) => o.event.kind === "tournament");
      const dim = occs.length === 0;
      const html = `<div class="pin${dim ? " dim" : ""}" title="${esc(s.name)}">${esc(initials(s.name))}${trophy ? '<span class="badge">🏆</span>' : ""}</div>`;
      // `trophy` and `shopName` ride on the marker so a cluster can show them.
      const m = L.marker([s.lat, s.lon], {
        icon: L.divIcon({ html, className: "", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] }),
        trophy, shopName: s.name,
      });
      // Built when opened, not for every shop on every redraw.
      m.bindPopup(() => popupHtml(s, occs, myEvents), { maxWidth, minWidth: Math.min(220, maxWidth) });
      markers.current.set(s.id, m);
      made.push(m);
    }
    if (map.current._pins.addLayers) map.current._pins.addLayers(made);
    else for (const m of made) m.addTo(map.current._pins);
    // What the layer actually holds, for the acceptance check: with clustering a
    // shop is often not a DOM pin, so "count the pins" no longer proves anything.
    if (el.current) el.current.dataset.markers = String(map.current._pins.getLayers().length);

    map.current._origin.clearLayers();
    originLayer.current = null;
    if (origin) {
      originLayer.current = L.circle([origin.lat, origin.lon], {
        radius: radiusMi * 1609.344, color: "var(--accent)", weight: 1, fillOpacity: 0.05,
      }).addTo(map.current._origin);
      L.circleMarker([origin.lat, origin.lon], { radius: 5, color: "#2f6fed", fillOpacity: 1 })
        .bindTooltip(`ZIP ${origin.label}`).addTo(map.current._origin);
    }

    fit();
  };

  // Draw once the map exists, and redraw whenever the inputs change.
  useEffect(() => { if (ready) draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready, shops, occurrences, origin, radiusMi, myEvents]);

  // The tab just appeared: the container has a size for the first time, or a
  // new one. Fit if a fit was deferred, otherwise just re-measure.
  useEffect(() => {
    if (!visible || !ready || !map.current) return;
    const t = setTimeout(() => {
      if (!map.current) return;
      if (pendingFit.current) fit(); else map.current.invalidateSize();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready]);

  // Jump to a shop when the calendar or the log asks. Runs after the tab
  // switch has laid out (the timeout), sets the view without animation and
  // THEN opens the popup - a popup opened mid-flyTo can be dropped by the
  // zoom animation.
  useEffect(() => {
    if (!focus || !visible || !ready || !map.current || focus.nonce === lastFocusNonce.current) return;
    const m = markers.current.get(focus.shopId);
    if (!m) return;
    lastFocusNonce.current = focus.nonce;
    // A jump beats a deferred "frame everything": when the map is first shown
    // BY a jump, the tab-appeared effect above would start an animated fit at
    // 0 ms and this jump would land in the middle of it. Cancel it now, before
    // its timer fires. (Found by the phone acceptance pass, where the first
    // look at the map is a block's "Show on map".)
    pendingFit.current = false;
    const t = setTimeout(() => {
      if (!map.current) return;
      pendingFit.current = false;
      map.current.invalidateSize();
      sizePopups();
      map.current.setView(m.getLatLng(), 15, { animate: false });
      // Zoom 15 is past clustering, but let the cluster layer confirm the pin
      // is really on the map before opening its popup.
      // Zoom 15 is past clustering, so the pin is normally on the map already.
      // If the cluster layer has not placed it yet, ask it to, and do not rely
      // on its callback alone: it waits for an animation that may never run.
      const pins = map.current._pins;
      const open = () => { if (map.current && m._map && !m.isPopupOpen()) m.openPopup(); };
      if (m._map) open();
      else if (pins.zoomToShowLayer) { pins.zoomToShowLayer(m, open); setTimeout(open, 450); }
      else open();
    }, 60);
    return () => clearTimeout(t);
  }, [focus, visible, ready, shops]);

  return <div className="mapwrap"><div ref={el} className="map" role="region" aria-label="Map of card shops" /></div>;
}
