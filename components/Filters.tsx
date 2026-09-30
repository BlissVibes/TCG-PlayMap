"use client";

/**
 * THE FILTER BAR, rendered once above both the map and the calendar over ONE
 * piece of state (the page's prefs). Collectify learned this the hard way:
 * two tabs with their own copy of the ZIP field answered "near me"
 * differently. One person, one location, one radius.
 */

import { GAME_IDS, GAMES, type GameId } from "@/lib/games";
import { RADIUS_CHOICES, type GeoOrigin } from "@/lib/geo";
import type { EventKind } from "@/lib/schedule";

export interface FiltersProps {
  zip: string;
  setZip: (v: string) => void;
  origin: GeoOrigin | null;
  applyZip: () => void;
  clearZip: () => void;
  busy: boolean;
  err: string | null;
  radiusMi: number;
  setRadiusMi: (mi: number) => void;
  games: ReadonlySet<GameId>;
  toggleGame: (g: GameId) => void;
  clearGames: () => void;
  kind: EventKind | null;
  setKind: (k: EventKind | null) => void;
  myOnly: boolean;
  setMyOnly: (v: boolean) => void;
  myCount: number;
  /** Only offer games that appear somewhere in the data, so the bar stays short. */
  availableGames: ReadonlySet<GameId>;
}

export function Filters(p: FiltersProps) {
  const games = GAME_IDS.filter((g) => p.availableGames.has(g));
  return (
    <div className="filters" role="search" aria-label="Filters">
      <div className="row">
        <label className="label" htmlFor="zip">Near ZIP</label>
        <input id="zip" className="field zip" value={p.zip} inputMode="numeric" placeholder="90064"
          onChange={(e) => p.setZip(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") p.applyZip(); }} />
        <button className="chip" onClick={p.applyZip}>{p.busy ? "…" : "Set"}</button>
        <label className="label" htmlFor="radius">within</label>
        <select id="radius" className="field" value={p.radiusMi} onChange={(e) => p.setRadiusMi(Number(e.target.value))}
          aria-label="Distance in miles">
          {RADIUS_CHOICES.map((mi) => <option key={mi} value={mi}>{mi} miles</option>)}
        </select>
        {p.origin
          ? <button className="chip" onClick={p.clearZip} title="Stop filtering by distance">✕ {p.origin.label}</button>
          : <span className="hint">Set a ZIP to filter by distance.</span>}
        {p.err && <p className="err">{p.err}</p>}
      </div>

      <div className="row">
        <div className="seg" role="group" aria-label="Event type">
          <button aria-pressed={p.kind === null} onClick={() => p.setKind(null)}>All</button>
          <button aria-pressed={p.kind === "play"} onClick={() => p.setKind("play")}>Casual play</button>
          <button aria-pressed={p.kind === "tournament"} onClick={() => p.setKind("tournament")}>🏆 Tournaments</button>
        </div>
        <button className="chip" aria-pressed={p.myOnly} onClick={() => p.setMyOnly(!p.myOnly)}
          title="Grey out everything not in my calendar">
          ★ My calendar{p.myCount ? ` (${p.myCount})` : ""}
        </button>
      </div>

      <div className="row" role="group" aria-label="Games">
        <button className="chip" aria-pressed={p.games.size === 0} onClick={p.clearGames}>All games</button>
        {games.map((g) => (
          <button key={g} className="chip game" aria-pressed={p.games.has(g)} onClick={() => p.toggleGame(g)}
            style={{ ["--chip" as any]: GAMES[g].color }} title={GAMES[g].label}>
            <span className="dot" style={{ background: p.games.has(g) ? "#fff" : GAMES[g].color }} />{GAMES[g].short}
          </button>
        ))}
      </div>
    </div>
  );
}
