"use client";

/**
 * THE CALENDAR: a week by default, because the schedule is weekly and a month
 * of it is the same week four times; a month view for the one-off events
 * (pre-releases, regionals) and for looking ahead.
 *
 * Every event is a BLOCK. A block has a pick box - tapping it adds the event
 * to "My calendar" - and a body; tapping the body jumps to the shop on the
 * map. With "My calendar" on, every block not picked is greyed rather than
 * hidden, so the visitor sees their week against everything else that is
 * happening. That was the ask: "form their own calendar to visually
 * understand what dates of the week they will be playing what game".
 */

import { useMemo, useState } from "react";
import { GAMES } from "@/lib/games";
import {
  addDays, formatTime, groupByDate, MONTH_LABELS, monthGrid, parseDateStr, shortTime, weekDates,
  WEEKDAY_LABELS, WEEKDAY_SHORT, type Occurrence,
} from "@/lib/schedule";
import { directionsUrl, telHref } from "@/lib/shopLinks";

export type CalView = "week" | "month";

export interface CalendarProps {
  view: CalView;
  setView: (v: CalView) => void;
  /** Any date in the week / month being shown. */
  anchor: string;
  setAnchor: (d: string) => void;
  today: string;
  /** Already filtered by ZIP/radius/game/kind. */
  occurrences: Occurrence[];
  myEvents: ReadonlySet<string>;
  myOnly: boolean;
  togglePick: (eventId: string) => void;
  showDistance: boolean;
  onShowShop: (shopId: string) => void;
}

function shortDate(d: string): string {
  const dt = parseDateStr(d);
  return `${MONTH_LABELS[dt.getMonth()].slice(0, 3)} ${dt.getDate()}`;
}

function Block({ o, mine, greyed, showDistance, togglePick, onShowShop }: {
  o: Occurrence; mine: boolean; greyed: boolean; showDistance: boolean;
  togglePick: (id: string) => void; onShowShop: (shopId: string) => void;
}) {
  const g = GAMES[o.event.game];
  const extra = [o.event.title, o.event.format, o.event.fee].filter(Boolean).join(" · ");
  const dist = showDistance && o.distanceMi != null ? ` · ${o.distanceMi.toFixed(1)} mi` : "";
  const tel = telHref(o.shop.phone);
  return (
    <div className={`block${mine ? " mine" : ""}${greyed ? " greyed" : ""}`}
      style={{ ["--chip" as any]: g.color }} data-event={o.event.id} data-date={o.date}>
      <button className="pick" aria-pressed={mine} onClick={() => togglePick(o.event.id)}
        aria-label={mine ? `Remove ${g.label} at ${o.shop.name} from my calendar` : `Add ${g.label} at ${o.shop.name} to my calendar`}
        title={mine ? "In my calendar" : "Add to my calendar"}>{mine ? "✓" : "+"}</button>
      <button className="body" onClick={() => onShowShop(o.shop.id)} title={`Show ${o.shop.name} on the map`}>
        <div className="line1">
          <span className="time">{formatTime(o.event.start)}</span>
          <span className="gchip">{g.short}</span>
          {o.event.kind === "tournament" && <span className="trophy" title="Tournament">🏆</span>}
          {o.event.confidence !== "verified" && (
            <span className="conf" title={o.event.confidence === "scraped" ? "Read from the store's website" : "Unverified"}>
              {o.event.confidence === "scraped" ? "web" : "?"}
            </span>
          )}
        </div>
        <span className="shop">{o.shop.name}{dist}</span>
        {extra && <span className="meta">{extra}</span>}
      </button>
      {/* Outside the body button: a link cannot live inside a button. */}
      <div className="acts">
        {tel && (
          <a href={tel} aria-label={`Call ${o.shop.name}`} title={`Call ${o.shop.name}`}>📞 {o.shop.phone}</a>
        )}
        <a href={directionsUrl(o.shop)} target="_blank" rel="noopener"
          aria-label={`Directions to ${o.shop.name}`} title={`Directions to ${o.shop.name}`}>↗ Directions</a>
      </div>
    </div>
  );
}

export function Calendar(p: CalendarProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const byDate = useMemo(() => groupByDate(p.occurrences), [p.occurrences]);
  const anchorDt = parseDateStr(p.anchor);

  const isMine = (o: Occurrence) => p.myEvents.has(o.event.id);
  const isGreyed = (o: Occurrence) => p.myOnly && !isMine(o);

  const step = (dir: -1 | 1) => {
    if (p.view === "week") p.setAnchor(addDays(p.anchor, 7 * dir));
    else {
      const d = new Date(anchorDt.getFullYear(), anchorDt.getMonth() + dir, 1);
      p.setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
    }
  };

  const week = weekDates(p.anchor);
  // In month view, the day whose full blocks (times, phone, directions) are
  // listed under the grid: the one tapped, else today when today is in the
  // month on screen. On a phone the grid cells are colour bars, so this list
  // is where the details live.
  const monthKey = p.anchor.slice(0, 7);
  const daySel = selectedDay && selectedDay.slice(0, 7) === monthKey
    ? selectedDay
    : (p.today.slice(0, 7) === monthKey ? p.today : null);
  const title = p.view === "week"
    ? `${shortDate(week[0])} – ${shortDate(week[6])}, ${parseDateStr(week[6]).getFullYear()}`
    : `${MONTH_LABELS[anchorDt.getMonth()]} ${anchorDt.getFullYear()}`;

  const renderList = (list: Occurrence[]) => list.map((o) => (
    <Block key={`${o.event.id}@${o.date}`} o={o} mine={isMine(o)} greyed={isGreyed(o)}
      showDistance={p.showDistance} togglePick={p.togglePick} onShowShop={p.onShowShop} />
  ));

  return (
    <section className="cal" aria-label="Calendar">
      <div className="calnav">
        <button className="iconbtn" onClick={() => step(-1)} aria-label={p.view === "week" ? "Previous week" : "Previous month"}>‹</button>
        <button className="iconbtn" onClick={() => { p.setAnchor(p.today); setSelectedDay(null); }}>Today</button>
        <button className="iconbtn" onClick={() => step(1)} aria-label={p.view === "week" ? "Next week" : "Next month"}>›</button>
        <h2>{title}</h2>
        <div className="seg" role="group" aria-label="Calendar view" style={{ marginLeft: "auto" }}>
          <button aria-pressed={p.view === "week"} onClick={() => p.setView("week")}>Week</button>
          <button aria-pressed={p.view === "month"} onClick={() => p.setView("month")}>Month</button>
        </div>
      </div>

      {p.view === "week" ? (
        <div className="week">
          {week.map((d, i) => {
            const list = byDate.get(d) ?? [];
            return (
              <div key={d} className={`day${d === p.today ? " today" : ""}`}>
                <div className="dayhdr"><b>{WEEKDAY_LABELS[i]}</b>{shortDate(d)}</div>
                <div className="daybody">
                  {list.length === 0 ? <div className="empty">Nothing listed.</div> : renderList(list)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="month">
            {WEEKDAY_SHORT.map((w) => <div key={w} className="wd">{w}</div>)}
            {monthGrid(anchorDt.getFullYear(), anchorDt.getMonth() + 1).flat().map(({ date, inMonth }) => {
              // EVERY event, never a "+N more". The month must show what the
              // week shows; until 0.1.0.7 it stopped at four and drew none on
              // phones, and the missing ones read as missing data.
              const list = byDate.get(date) ?? [];
              return (
                <button key={date} onClick={() => setSelectedDay(date)}
                  className={`cell${inMonth ? "" : " out"}${date === p.today ? " today" : ""}${date === daySel ? " sel" : ""}`}
                  aria-label={`${date}, ${list.length} events`}>
                  <span className="num">{parseDateStr(date).getDate()}</span>
                  {list.map((o) => {
                    const g = GAMES[o.event.game];
                    const trophy = o.event.kind === "tournament";
                    return (
                      <span key={`${o.event.id}@${o.date}`} className={`mini${isGreyed(o) ? " greyed" : ""}`}
                        style={{ ["--chip" as any]: g.color }}
                        title={`${formatTime(o.event.start)} ${g.label} at ${o.shop.name}${trophy ? " (tournament)" : ""}`}>
                        <b>{shortTime(o.event.start)}</b> {g.short}{trophy ? " 🏆" : ""} <span className="mshop">{o.shop.name}</span>
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
          {daySel && (
            <div className="daylist">
              <h3>{WEEKDAY_LABELS[parseDateStr(daySel).getDay()]}, {shortDate(daySel)}</h3>
              <div className="daybody">
                {(byDate.get(daySel) ?? []).length === 0
                  ? <div className="empty">Nothing listed.</div>
                  : renderList(byDate.get(daySel)!)}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
