"use client";

/**
 * THE CALENDAR: a week by default, because the schedule is weekly and a month
 * of it is the same week four times; a month view for the one-off events
 * (pre-releases, regionals) and for looking ahead.
 *
 * Every event is a BLOCK. A block has a pick box - tapping it adds the event
 * to "My calendar" - and a body.
 *
 * BLOCKS ARE COMPACT (0.1.3.1). At 127 shops a week at 250 miles was 361
 * blocks of ~150 px each: 11.6 screens on a desktop, 39 on a phone. A block is
 * now one line - time, game, trophy, shop, cost - and tapping it opens the rest
 * (event name, phone, directions, "Show on map") in place. "Details" in the
 * bar opens every block at once, which is the old view. The cost stays on the
 * compact line: rule 9 says it is always shown.
 *
 * ON A PHONE the week's columns stack, so today comes first, then the days
 * after it, then the days already gone (CSS `order`, see globals.css). With "My calendar" on, every block not picked is greyed rather than
 * hidden, so the visitor sees their week against everything else that is
 * happening. That was the ask: "form their own calendar to visually
 * understand what dates of the week they will be playing what game".
 */

import { useMemo, useState } from "react";
import { GAMES } from "@/lib/games";
import {
  addDays, feeLabel, formatTime, groupByDate, MONTH_LABELS, monthGrid, parseDateStr, shortTime, weekDates,
  scheduleIncomplete, WEEKDAY_LABELS, WEEKDAY_SHORT, type Occurrence,
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
  /** Shops where a person has entered a night; other importer-made shops get the "partial" mark. */
  handShops: ReadonlySet<string>;
  myOnly: boolean;
  togglePick: (eventId: string) => void;
  showDistance: boolean;
  onShowShop: (shopId: string) => void;
}

function shortDate(d: string): string {
  const dt = parseDateStr(d);
  return `${MONTH_LABELS[dt.getMonth()].slice(0, 3)} ${dt.getDate()}`;
}

function Block({ o, mine, greyed, open, partial, showDistance, togglePick, toggleOpen, onShowShop }: {
  o: Occurrence; mine: boolean; greyed: boolean; open: boolean; partial: boolean; showDistance: boolean;
  togglePick: (id: string) => void; toggleOpen: () => void; onShowShop: (shopId: string) => void;
}) {
  const g = GAMES[o.event.game];
  const extra = [o.event.title, o.event.format].filter(Boolean).join(" · ");
  const dist = showDistance && o.distanceMi != null ? ` · ${o.distanceMi.toFixed(1)} mi` : "";
  const tel = telHref(o.shop.phone);
  return (
    <div className={`block${open ? " open" : ""}${mine ? " mine" : ""}${greyed ? " greyed" : ""}`}
      style={{ ["--chip" as any]: g.color }} data-event={o.event.id} data-date={o.date}>
      <button className="pick" aria-pressed={mine} onClick={() => togglePick(o.event.id)}
        aria-label={mine ? `Remove ${g.label} at ${o.shop.name} from my calendar` : `Add ${g.label} at ${o.shop.name} to my calendar`}
        title={mine ? "In my calendar" : "Add to my calendar"}>{mine ? "✓" : "+"}</button>
      <button className="body" aria-expanded={open} onClick={toggleOpen}
        title={`${g.label} at ${o.shop.name}${extra ? ` - ${extra}` : ""}. ${open ? "Hide" : "Show"} details`}>
        {/* One unbreakable unit, so a narrow column wraps as [when] / [shop, cost] and never three ways. */}
        <span className="when">
          <span className="time">{formatTime(o.event.start)}</span>
          <span className="gchip">{g.short}</span>
          {o.event.kind === "tournament" && <span className="trophy" title="Tournament">🏆</span>}
        </span>
        <span className="shop">{o.shop.name}{dist}</span>
        {/* Cost is always shown (rule 9); "Cost not listed" rather than a blank. */}
        <span className={`fee${o.event.fee ? "" : " unknown"}`} title="Cost to play">{feeLabel(o.event.fee)}</span>
      </button>
      {open && (
        <div className="more">
          {extra && <span className="meta">{extra}</span>}
          {(partial || o.event.confidence !== "verified") && (
            <span className="tags">
              {o.event.confidence !== "verified" && (
                <span className="conf" title={o.event.confidence === "scraped" ? "Read from the store's website" : "Unverified"}>
                  {o.event.confidence === "scraped" ? "from the store's website" : "unverified"}
                </span>
              )}
              {partial && (
                <span className="partial" title="Only nights from a publisher's store locator are listed for this shop so far - it may run other games. See the shop on the map for what we know.">partial schedule</span>
              )}
            </span>
          )}
          {/* Links, not inside the body button: a link cannot live inside a button. */}
          <div className="acts">
            <button className="tomap" onClick={() => onShowShop(o.shop.id)} title={`Show ${o.shop.name} on the map`}>◎ Show on map</button>
            {tel && (
              <a href={tel} aria-label={`Call ${o.shop.name}`} title={`Call ${o.shop.name}`}>📞 {o.shop.phone}</a>
            )}
            <a href={directionsUrl(o.shop)} target="_blank" rel="noopener"
              aria-label={`Directions to ${o.shop.name}`} title={`Directions to ${o.shop.name}`}>↗ Directions</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Calendar(p: CalendarProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  /** Blocks whose state differs from the default (closed in the week, open in a day list). */
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  /** "Details": every block open, the pre-0.1.3.1 view. */
  const [allOpen, setAllOpen] = useState(false);
  const flip = (key: string) => setFlipped((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
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

  // A month's day list is one day the visitor asked for, so it opens with details.
  const renderList = (list: Occurrence[], openByDefault = false) => list.map((o) => {
    const key = `${o.event.id}@${o.date}`;
    return (
      <Block key={key} o={o} mine={isMine(o)} greyed={isGreyed(o)}
        open={(allOpen || openByDefault) !== flipped.has(key)} toggleOpen={() => flip(key)}
        partial={scheduleIncomplete(o.shop, p.handShops)}
        showDistance={p.showDistance} togglePick={p.togglePick} onShowShop={p.onShowShop} />
    );
  });
  // Phone order for the stacked week: today, the days after it, then the days gone by.
  const todayIdx = week.indexOf(p.today);

  return (
    <section className="cal" aria-label="Calendar">
      <div className="calnav">
        <button className="iconbtn" onClick={() => step(-1)} aria-label={p.view === "week" ? "Previous week" : "Previous month"}>‹</button>
        <button className="iconbtn" onClick={() => { p.setAnchor(p.today); setSelectedDay(null); }}>Today</button>
        <button className="iconbtn" onClick={() => step(1)} aria-label={p.view === "week" ? "Next week" : "Next month"}>›</button>
        <h2>{title}</h2>
        {p.view === "week" && (
          <button className="iconbtn details" aria-pressed={allOpen} style={{ marginLeft: "auto" }}
            title="Show every event's name, phone and directions"
            onClick={() => { setAllOpen((v) => !v); setFlipped(new Set()); }}>Details</button>
        )}
        <div className="seg" role="group" aria-label="Calendar view" style={p.view === "week" ? undefined : { marginLeft: "auto" }}>
          <button aria-pressed={p.view === "week"} onClick={() => p.setView("week")}>Week</button>
          <button aria-pressed={p.view === "month"} onClick={() => p.setView("month")}>Month</button>
        </div>
      </div>

      {p.view === "week" ? (
        <div className="week">
          {week.map((d, i) => {
            const list = byDate.get(d) ?? [];
            return (
              <div key={d} className={`day${d === p.today ? " today" : ""}${todayIdx >= 0 && i < todayIdx ? " past" : ""}`}
                style={{ ["--ord" as any]: todayIdx >= 0 ? (i - todayIdx + 7) % 7 : i }}>
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
                        title={`${formatTime(o.event.start)} ${g.label} at ${o.shop.name}${trophy ? " (tournament)" : ""} - ${feeLabel(o.event.fee)}`}>
                        <b>{shortTime(o.event.start)}</b> {g.short}{trophy ? " 🏆" : ""} <span className="mfee">{o.event.fee ?? "?"}</span> <span className="mshop">{o.shop.name}</span>
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
                  : renderList(byDate.get(daySel)!, true)}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
