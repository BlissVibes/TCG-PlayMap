"use client";

/**
 * FIRST-VISIT SETUP, shown on the calendar until it is finished.
 *
 * Mark, 2026-10-09: the calendar must not open on "the entire messy list of
 * all the tcg events". It asks, in order:
 *   1. ZIP + distance - required; it is what makes a national data set usable.
 *   2. Which TCGs are you interested in? - becomes the default view ("My TCGs").
 *      Choosing none is allowed and means "show me everything".
 *   3. Any TCGs to hide? - never shown until unhidden in Settings.
 * Everything chosen here is saved with the rest of the visitor's preferences
 * and can be changed later in Settings (or by running setup again).
 */

import type React from "react";
import { useState } from "react";
import { GAMES, GAME_IDS, chipVars, type GameId } from "@/lib/games";
import { RADIUS_CHOICES, geocodeZip, normalizeZip, type GeoOrigin } from "@/lib/geo";

export interface SetupResult {
  zip: string;
  origin: GeoOrigin;
  radiusMi: number;
  myGames: GameId[];
  hiddenGames: GameId[];
}

export function Setup({ initial, availableGames, onDone }: {
  initial: { zip: string; origin: GeoOrigin | null; radiusMi: number; myGames: GameId[]; hiddenGames: GameId[] };
  /** Games that have at least one event, offered first; the rest follow. */
  availableGames: ReadonlySet<GameId>;
  onDone: (r: SetupResult) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [zip, setZip] = useState(initial.zip);
  const [origin, setOrigin] = useState<GeoOrigin | null>(initial.origin);
  const [radiusMi, setRadiusMi] = useState(initial.radiusMi);
  const [myGames, setMyGames] = useState<GameId[]>(initial.myGames);
  const [hidden, setHidden] = useState<GameId[]>(initial.hiddenGames);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** "Pick my games" pressed with nothing picked: point at the chips. */
  const [nudge, setNudge] = useState(false);

  const games = [
    ...GAME_IDS.filter((g) => availableGames.has(g)),
    ...GAME_IDS.filter((g) => !availableGames.has(g) && g !== "other"),
  ];
  const toggle = (list: GameId[], set: (v: GameId[]) => void, g: GameId) =>
    set(list.includes(g) ? list.filter((x) => x !== g) : [...list, g]);

  const nextFromZip = async () => {
    setErr(null);
    const z = normalizeZip(zip);
    if (!z) { setErr("Enter a 5-digit US ZIP code."); return; }
    if (origin && origin.label === z) { setStep(2); return; }
    setBusy(true);
    try {
      const hit = await geocodeZip(z);
      if (!hit) { setErr(`We couldn't find ZIP ${z}.`); return; }
      setOrigin(hit); setZip(z); setStep(2);
    } catch {
      setErr("Couldn't look up that ZIP right now - check your connection and try again.");
    } finally { setBusy(false); }
  };

  const finish = () => {
    if (!origin) { setStep(1); return; }
    onDone({ zip, origin, radiusMi, myGames, hiddenGames: hidden.filter((g) => !myGames.includes(g)) });
  };

  return (
    <section className="setup" aria-label="Set up your calendar">
      <p className="steps" aria-hidden>Step {step} of 3</p>
      {step === 1 && (
        <>
          <h2>Where do you play?</h2>
          <p className="hint">Your ZIP code and how far you&apos;ll travel. Only shops in that range show up.</p>
          <div className="row">
            <label className="label" htmlFor="setup-zip">ZIP code</label>
            <input id="setup-zip" className="field zip" value={zip} inputMode="numeric" autoComplete="postal-code"
              placeholder="90064" onChange={(e) => setZip(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void nextFromZip(); }} />
            <label className="label" htmlFor="setup-radius">within</label>
            <select id="setup-radius" className="field" value={radiusMi} onChange={(e) => setRadiusMi(Number(e.target.value))}>
              {RADIUS_CHOICES.map((mi) => <option key={mi} value={mi}>{mi} miles</option>)}
            </select>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="actions">
            <button className="primary" onClick={() => void nextFromZip()} disabled={busy}>{busy ? "Looking up…" : "Next"}</button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h2>Which TCGs do you play?</h2>
          <p className="hint">Tap the games you play and the calendar opens on just those. With every game on, a week is hundreds of events. You can change this any time.</p>
          <div className={`row${nudge && !myGames.length ? " nudge" : ""}`} role="group" aria-label="Your TCGs">
            {games.map((g) => (
              <button key={g} className="chip game" aria-pressed={myGames.includes(g)} title={GAMES[g].label}
                style={chipVars(g) as React.CSSProperties} onClick={() => toggle(myGames, setMyGames, g)}>
                <span className="dot" />{GAMES[g].label}
              </button>
            ))}
          </div>
          {nudge && !myGames.length && <p className="hint" role="status">Tap one or more games above, then Next.</p>}
          <div className="actions">
            <button className="ghost" onClick={() => setStep(1)}>Back</button>
            {/* The main button steers towards picking (Mark, 2026-10-10); everything-at-once is still one tap away. */}
            {myGames.length
              ? <button className="primary" onClick={() => setStep(3)}>{`Next (${myGames.length} picked)`}</button>
              : <>
                <button className="primary" onClick={() => setNudge(true)}>Pick my games</button>
                <button className="ghost" onClick={() => setStep(3)}>Show everything</button>
              </>}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <h2>Hide any TCGs?</h2>
          <p className="hint">Hidden games never show on the calendar or map. Unhide them any time in Settings.</p>
          <div className="row" role="group" aria-label="TCGs to hide">
            {games.filter((g) => !myGames.includes(g)).map((g) => (
              <button key={g} className="chip hide" aria-pressed={hidden.includes(g)} title={`Hide ${GAMES[g].label}`}
                onClick={() => toggle(hidden, setHidden, g)}>
                {hidden.includes(g) ? "🚫 " : ""}{GAMES[g].label}
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => setStep(2)}>Back</button>
            <button className="primary" onClick={finish}>{hidden.length ? `Done (hide ${hidden.length})` : "Done"}</button>
          </div>
        </>
      )}
    </section>
  );
}
