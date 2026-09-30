"use client";

/**
 * THE LOG TAB: the calendar log first (what changed on the calendar, per game
 * and shop - the history Mark asked for), then the site's own changelog.
 * Two logs because they answer two different questions: "did Pokémon night
 * move?" and "did the site change?".
 */

import { GAMES, isGameId } from "@/lib/games";
import type { CalendarLogEntry } from "@/lib/data";
import type { Shop } from "@/lib/schedule";
import { CHANGELOG, VERSION } from "@/lib/version";

export function LogTab({ log, shops, onShowShop }: {
  log: CalendarLogEntry[];
  shops: Shop[];
  onShowShop: (shopId: string) => void;
}) {
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const byDate = new Map<string, CalendarLogEntry[]>();
  for (const e of [...log].sort((a, b) => b.date.localeCompare(a.date))) {
    (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
  }
  return (
    <section className="log" aria-label="Logs">
      <h2>Calendar log</h2>
      <p className="hint">Every addition, removal and change to what is on the calendar, by game and shop.</p>
      {[...byDate.entries()].map(([date, entries]) => (
        <div key={date}>
          <h3>{date}</h3>
          {entries.map((e, i) => (
            <div key={i} className="logline">
              <span className={`act ${e.action}`}>{e.action}</span>
              {e.game && isGameId(e.game) && (
                <span className="gchip" style={{ ["--chip" as any]: GAMES[e.game].color }}>{GAMES[e.game].short}</span>
              )}
              <button className="shoplink" onClick={() => onShowShop(e.shopId)}>{shopName.get(e.shopId) ?? e.shopId}</button>
              <span>{e.summary}</span>
            </div>
          ))}
        </div>
      ))}

      <h2>Site changelog <span className="ver">v{VERSION}</span></h2>
      {CHANGELOG.map((c) => (
        <div key={c.version}>
          <h3>{c.version} · {c.date}</h3>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 13 }}>
            {c.changes.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      ))}
    </section>
  );
}
