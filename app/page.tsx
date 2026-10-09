"use client";

/**
 * THE PAGE: one client shell, three tabs (Map, Calendar, Log), one filter bar
 * and one set of preferences shared by all of them.
 *
 * State lives here and flows down. The map and the calendar are both handed
 * the SAME filtered occurrence list for the visible week, so a shop that
 * shows a trophy on the map is a shop with a tournament block on the calendar
 * and never anything else.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, type CalView } from "@/components/Calendar";
import { Filters } from "@/components/Filters";
import { LogTab } from "@/components/LogTab";
import { PlayMap, type FocusRequest } from "@/components/PlayMap";
import { Setup } from "@/components/Setup";
import { getDataSource, type PlayMapData } from "@/lib/data";
import { geocodeZip, normalizeZip } from "@/lib/geo";
import { GAME_IDS, GAMES, type GameId } from "@/lib/games";
import { DEFAULT_PREFS, effectiveGames, gameMode, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import {
  addDays, filterOccurrences, occurrencesInRange, shopPassesFilter, startOfWeek, toDateStr,
  type EventKind, type ScheduleFilter,
} from "@/lib/schedule";
import { VERSION } from "@/lib/version";

type Tab = "map" | "calendar" | "log";

export default function Page() {
  const [data, setData] = useState<PlayMapData | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");
  const [view, setView] = useState<CalView>("week");
  const [today, setToday] = useState<string>("2026-01-01");
  const [anchor, setAnchor] = useState<string>("2026-01-01");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load prefs and data after mount (localStorage is browser-only).
  useEffect(() => {
    const t = toDateStr(new Date());
    setToday(t); setAnchor(t);
    setPrefs(loadPrefs());
    setMounted(true);
    getDataSource().load().then(setData);
  }, []);
  useEffect(() => { if (mounted) savePrefs(prefs); }, [prefs, mounted]);

  const update = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);

  // ── Location ────────────────────────────────────────────────────────────
  const applyZip = useCallback(async () => {
    setErr(null);
    if (prefs.zip.trim() === "") { update({ origin: null }); return; }
    const z = normalizeZip(prefs.zip);
    if (!z) { setErr("Enter a 5-digit ZIP."); return; }
    setBusy(true);
    try {
      const hit = await geocodeZip(z);
      if (!hit) setErr(`ZIP ${z} not found.`);
      else update({ origin: hit, zip: z });
    } catch {
      setErr("Could not look up that ZIP right now.");
    } finally { setBusy(false); }
  }, [prefs.zip, update]);

  // ── Derived data ────────────────────────────────────────────────────────
  const shops = data?.shops ?? [];
  const events = data?.events ?? [];
  const availableGames = useMemo(() => new Set<GameId>(events.map((e) => e.game)), [events]);
  const gameSet = useMemo(() => new Set<GameId>(prefs.games), [prefs.games]);
  const hiddenSet = useMemo(() => new Set<GameId>(prefs.hiddenGames), [prefs.hiddenGames]);
  /** The games actually shown: picked chips, else My TCGs, else all - never hidden ones. */
  const visibleGames = useMemo(() => effectiveGames(prefs, availableGames),
    [prefs.games, prefs.myGames, prefs.hiddenGames, prefs.showAll, availableGames]); // eslint-disable-line react-hooks/exhaustive-deps
  const mySet = useMemo(() => new Set(prefs.myEvents), [prefs.myEvents]);
  const filter: ScheduleFilter = useMemo(() => ({
    origin: prefs.origin, radiusMi: prefs.radiusMi, games: visibleGames, kind: prefs.kind,
  }), [prefs.origin, prefs.radiusMi, visibleGames, prefs.kind]);

  /** The window the calendar is showing (a week, or a month padded to whole weeks). */
  const range = useMemo(() => {
    if (view === "week") { const s = startOfWeek(anchor); return { from: s, to: addDays(s, 6) }; }
    const d = new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1, 1);
    const first = toDateStr(d);
    const last = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { from: startOfWeek(first), to: addDays(startOfWeek(last), 6) };
  }, [anchor, view]);

  const calendarOccs = useMemo(
    () => filterOccurrences(occurrencesInRange(events, shops, range.from, range.to, prefs.origin), filter),
    [events, shops, range, prefs.origin, filter],
  );
  /** The map always shows the CURRENT week, whatever the calendar is paging through. */
  const weekOccs = useMemo(() => {
    const s = startOfWeek(today);
    return filterOccurrences(occurrencesInRange(events, shops, s, addDays(s, 6), prefs.origin), filter);
  }, [events, shops, today, prefs.origin, filter]);
  /** Shops in range that run at least one visible game (a Riftbound-only shop is not a pin for a Pokémon player). */
  const mapShops = useMemo(() => {
    const running = new Set(events.filter((e) => visibleGames.has(e.game) && (!filter.kind || e.kind === filter.kind)).map((e) => e.shopId));
    return shops.filter((s) => s.active && running.has(s.id) && shopPassesFilter(s, filter));
  }, [shops, events, visibleGames, filter]);
  /** Every game worth a row in Settings: in the data, or chosen/hidden before. */
  const settingsGames = useMemo(() => GAME_IDS.filter((g) => availableGames.has(g) || prefs.myGames.includes(g) || prefs.hiddenGames.includes(g)),
    [availableGames, prefs.myGames, prefs.hiddenGames]);
  const toggleIn = (key: "myGames" | "hiddenGames", g: GameId) => setPrefs((p) => {
    const has = p[key].includes(g);
    const next = { ...p, [key]: has ? p[key].filter((x) => x !== g) : [...p[key], g] };
    // A game cannot be both yours and hidden: choosing one clears the other.
    if (!has) { const other = key === "myGames" ? "hiddenGames" : "myGames"; next[other] = p[other].filter((x) => x !== g); next.games = next.games.filter((x) => !next.hiddenGames.includes(x)); }
    return next;
  });

  const showShop = useCallback((shopId: string) => {
    setTab("map");
    setFocus({ shopId, nonce: Date.now() });
  }, []);

  const togglePick = useCallback((id: string) => setPrefs((p) => ({
    ...p, myEvents: p.myEvents.includes(id) ? p.myEvents.filter((x) => x !== id) : [...p.myEvents, id],
  })), []);

  return (
    <main className="app" data-theme={prefs.theme}>
      <header className="hdr">
        <h1>TCG PlayMap <span>· Los Angeles</span></h1>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {(["map", "calendar", "log"] as Tab[]).map((t) => (
            <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "map" ? "Map" : t === "calendar" ? "Calendar" : "Log"}
            </button>
          ))}
        </nav>
        <button className="iconbtn" aria-label={prefs.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-pressed={prefs.theme === "dark"} title="Light / dark"
          onClick={() => update({ theme: prefs.theme === "dark" ? "light" : "dark" })}>
          {prefs.theme === "dark" ? "☀" : "☾"}
        </button>
        <button className="iconbtn" aria-label="Settings" aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}>⚙</button>
        {settingsOpen && (
          <div className="settings" role="dialog" aria-label="Settings">
            <h2>Settings</h2>
            <label>
              <input type="checkbox" checked={prefs.theme === "dark"}
                onChange={(e) => update({ theme: e.target.checked ? "dark" : "light" })} />
              Dark theme
            </label>
            <label>
              <input type="checkbox" checked={prefs.showDistance}
                onChange={(e) => update({ showDistance: e.target.checked })} />
              Show distance from my ZIP on calendar blocks
            </label>
            <label>
              <input type="checkbox" checked={prefs.myOnly} onChange={(e) => update({ myOnly: e.target.checked })} />
              Grey out events not in my calendar
            </label>
            <h3>TCGs</h3>
            <div className="tcglist" role="group" aria-label="My TCGs and hidden TCGs">
              <span className="hdrrow">Game</span><span className="hdrrow">Mine</span><span className="hdrrow">Hide</span>
              {settingsGames.map((g) => (
                <div key={g} style={{ display: "contents" }}>
                  <span><span className="gchip" style={{ ["--chip" as any]: GAMES[g].color }}>{GAMES[g].short}</span> {GAMES[g].label}</span>
                  <label><input type="checkbox" checked={prefs.myGames.includes(g)} aria-label={`${GAMES[g].label} is one of my TCGs`}
                    onChange={() => toggleIn("myGames", g)} /></label>
                  <label><input type="checkbox" checked={prefs.hiddenGames.includes(g)} aria-label={`Hide ${GAMES[g].label}`}
                    onChange={() => toggleIn("hiddenGames", g)} /></label>
                </div>
              ))}
            </div>
            <button className="chip" onClick={() => { update({ setupDone: false }); setTab("calendar"); setSettingsOpen(false); }}>
              Run setup again
            </button>
            <h3>My calendar</h3>
            <button className="chip" disabled={prefs.myEvents.length === 0}
              onClick={() => { if (confirm("Remove every event from my calendar?")) update({ myEvents: [] }); }}>
              Clear my calendar ({prefs.myEvents.length})
            </button>
            <p className="small">
              Your setup, TCG choices and my calendar are saved in this browser only for now. Signing in to keep it across devices is planned.
            </p>
            <p className="small">Version {VERSION}</p>
          </div>
        )}
      </header>

      {tab !== "log" && !(tab === "calendar" && !prefs.setupDone) && (
        <Filters
          zip={prefs.zip} setZip={(zip) => update({ zip })} origin={prefs.origin}
          applyZip={applyZip} clearZip={() => { update({ origin: null, zip: "" }); setErr(null); }}
          busy={busy} err={err}
          radiusMi={prefs.radiusMi} setRadiusMi={(radiusMi) => update({ radiusMi })}
          games={gameSet}
          toggleGame={(g) => update({ games: gameSet.has(g) ? prefs.games.filter((x) => x !== g) : [...prefs.games, g] })}
          mode={gameMode(prefs)} myGames={prefs.myGames} hiddenGames={hiddenSet}
          showMine={() => update({ games: [], showAll: false })}
          showAll={() => update({ games: [], showAll: true })}
          kind={prefs.kind} setKind={(kind: EventKind | null) => update({ kind })}
          myOnly={prefs.myOnly} setMyOnly={(myOnly) => update({ myOnly })} myCount={prefs.myEvents.length}
          availableGames={availableGames}
        />
      )}

      {/* The map stays mounted while hidden so Leaflet is not rebuilt on every tab switch. */}
      <div style={{ display: tab === "map" ? "contents" : "none" }}>
        {mounted && (
          <PlayMap shops={mapShops} occurrences={weekOccs} origin={prefs.origin}
            radiusMi={prefs.radiusMi} focus={focus} myEvents={mySet} visible={tab === "map"} />
        )}
      </div>

      {tab === "calendar" && mounted && !prefs.setupDone && (
        <Setup
          initial={{ zip: prefs.zip, origin: prefs.origin, radiusMi: prefs.radiusMi, myGames: prefs.myGames, hiddenGames: prefs.hiddenGames }}
          availableGames={availableGames}
          onDone={(r) => update({ ...r, setupDone: true, games: [], showAll: false })}
        />
      )}

      {tab === "calendar" && prefs.setupDone && (
        <Calendar view={view} setView={setView} anchor={anchor} setAnchor={setAnchor} today={today}
          occurrences={calendarOccs} myEvents={mySet} myOnly={prefs.myOnly} togglePick={togglePick}
          showDistance={prefs.showDistance && !!prefs.origin} onShowShop={showShop} />
      )}

      {tab === "log" && data && <LogTab log={data.log} shops={shops} onShowShop={showShop} />}

      <footer>
        TCG PlayMap v{VERSION} · {shops.length} shops · {events.length} events ·
        {" "}Schedules read from each store&apos;s own site; always check with the store before driving.
      </footer>
    </main>
  );
}
