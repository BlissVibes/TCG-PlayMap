"use client";

/**
 * THE MAP: one pin per shop that passes the distance filter, a trophy badge
 * on any shop running a tournament in the visible week, and a popup that
 * lists that week's events.
 *
 * Built on Collectify-Wrapper's PinMap pattern (Leaflet from the CDN, one
 * memoised loader, divIcon pins) rather than its 9,000-line main map: this map
 * has no live data and no clustering to do yet. If shop count grows past a
 * few hundred, Leaflet.markercluster is the next step (docs/ROADMAP.md).
 *
 * The map never filters on its own. It draws exactly the shops and the
 * occurrences the page hands it, so the calendar and the map can never
 * disagree about what "within 25 miles of 91303" means.
 */

import { useEffect, useRef, useState } from "react";
import { loadLeaflet, TILE_ATTRIBUTION, TILE_URL } from "@/lib/leafletCdn";
import { GAMES } from "@/lib/games";
import { feeLabel, formatTime, WEEKDAY_SHORT, weekdayOf, type Occurrence, type Shop } from "@/lib/schedule";
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

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

function popupHtml(shop: Shop, occs: Occurrence[], myEvents: ReadonlySet<string>): string {
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
    ${days ? `<ul>${days}</ul>` : `<div class="addr">${esc(shop.notes ?? "No events on the calendar yet.")}</div>`}
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

  /** Frame the origin circle when there is one, otherwise all the shops. */
  const fit = () => {
    if (!map.current) return;
    if (!hasSize()) { pendingFit.current = true; return; }
    pendingFit.current = false;
    map.current.invalidateSize();
    if (origin && originLayer.current) {
      map.current.fitBounds(originLayer.current.getBounds(), { padding: [20, 20] });
    } else if (shops.length > 0) {
      map.current.fitBounds(shops.map((s) => [s.lat, s.lon]), { padding: [40, 40], maxZoom: 13 });
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
      map.current._pins = L.layerGroup().addTo(map.current);
      map.current._origin = L.layerGroup().addTo(map.current);
      setTimeout(() => map.current?.invalidateSize(), 0);
      // Do NOT call draw() here - this closure's props are stale (see `ready`).
      setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  const draw = () => {
    if (!map.current) return;
    const L = (window as any).L;
    map.current._pins.clearLayers();
    markers.current.clear();
    const byShop = new Map<string, Occurrence[]>();
    for (const o of occurrences) (byShop.get(o.shop.id) ?? byShop.set(o.shop.id, []).get(o.shop.id)!).push(o);

    for (const s of shops) {
      const occs = byShop.get(s.id) ?? [];
      const trophy = occs.some((o) => o.event.kind === "tournament");
      const dim = occs.length === 0;
      const html = `<div class="pin${dim ? " dim" : ""}" title="${esc(s.name)}">${esc(initials(s.name))}${trophy ? '<span class="badge">🏆</span>' : ""}</div>`;
      const m = L.marker([s.lat, s.lon], {
        icon: L.divIcon({ html, className: "", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] }),
      }).addTo(map.current._pins);
      m.bindPopup(popupHtml(s, occs, myEvents), { maxWidth: 320 });
      markers.current.set(s.id, m);
    }

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
    const t = setTimeout(() => {
      if (!map.current) return;
      pendingFit.current = false;
      map.current.invalidateSize();
      map.current.setView(m.getLatLng(), 15, { animate: false });
      m.openPopup();
    }, 60);
    return () => clearTimeout(t);
  }, [focus, visible, ready, shops]);

  return <div className="mapwrap"><div ref={el} className="map" role="region" aria-label="Map of card shops" /></div>;
}
