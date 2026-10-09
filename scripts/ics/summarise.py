"""Summarise what is CURRENT in a Google Calendar .ics export (stdlib only).

usage: python3 scripts/ics/summarise.py <file.ics> [window_start YYYY-MM-DD] [weeks]

Prints, for the window [start, start+weeks):
  - WEEKLY series with at least one occurrence in the window (after EXDATEs
    and cancelled overrides), with weekday, local time, interval, until;
  - non-weekly recurring series that touch the window (raw RRULE, for a human);
  - one-off events in the window (and up to 12 weeks out, flagged).
All times are converted to America/Los_Angeles.
"""
import re, sys
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

LA = ZoneInfo("America/Los_Angeles")
path = sys.argv[1]
start = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today()
weeks = int(sys.argv[3]) if len(sys.argv) > 3 else 4
end = start + timedelta(weeks=weeks)
far = start + timedelta(weeks=12)

raw = open(path, encoding="utf-8").read().replace("\r\n", "\n")
raw = re.sub(r"\n[ \t]", "", raw)  # unfold
events = re.findall(r"BEGIN:VEVENT\n(.*?)\nEND:VEVENT", raw, re.S)

def props(block):
    out = {}
    for line in block.split("\n"):
        if ":" not in line: continue
        k, v = line.split(":", 1)
        name, _, params = k.partition(";")
        out.setdefault(name, []).append((params, v))
    return out

def parse_dt(params, v):
    if "VALUE=DATE" in params or re.fullmatch(r"\d{8}", v):
        return datetime.strptime(v[:8], "%Y%m%d").replace(tzinfo=LA), True
    tz = re.search(r"TZID=([^;]+)", params)
    if v.endswith("Z"):
        d = datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).astimezone(LA)
    else:
        d = datetime.strptime(v, "%Y%m%dT%H%M%S").replace(tzinfo=ZoneInfo(tz.group(1)) if tz else LA).astimezone(LA)
    return d, False

def text(v): return v.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").strip()

DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

overrides = {}  # (uid, original local date) -> status
parsed = []
for b in events:
    p = props(b)
    uid = p.get("UID", [("", "")])[0][1]
    dt, allday = parse_dt(*p["DTSTART"][0]) if "DTSTART" in p else (None, False)
    summ = text(p.get("SUMMARY", [("", "(no title)")])[0][1])
    status = p.get("STATUS", [("", "")])[0][1]
    desc = text(p.get("DESCRIPTION", [("", "")])[0][1])[:140]
    if "RECURRENCE-ID" in p:
        rid, _ = parse_dt(*p["RECURRENCE-ID"][0])
        overrides[(uid, rid.date())] = (status, summ, dt)
        continue
    parsed.append(dict(uid=uid, dt=dt, allday=allday, summ=summ, status=status, desc=desc,
                       rrule=p.get("RRULE", [("", "")])[0][1],
                       exdates={parse_dt(pp, x)[0].date() for pp, v in p.get("EXDATE", []) for x in v.split(",")}))

weekly, other, oneoff = [], [], []
for e in parsed:
    if e["dt"] is None or e["status"] == "CANCELLED": continue
    if not e["rrule"]:
        if start <= e["dt"].date() < far: oneoff.append(e)
        continue
    r = dict(kv.split("=", 1) for kv in e["rrule"].split(";"))
    until = None
    if "UNTIL" in r:
        u = r["UNTIL"]; until = parse_dt("", u)[0].date() if "T" in u or len(u) == 8 else None
    if r.get("FREQ") != "WEEKLY":
        if until is None or until >= start: other.append((e, r))
        continue
    interval = int(r.get("INTERVAL", "1"))
    bydays = [DAYS.index(d[-2:]) for d in r.get("BYDAY", DAYS[e["dt"].weekday()]).split(",")]
    count = int(r["COUNT"]) if "COUNT" in r else None
    occ, n = [], 0
    week0 = e["dt"].date() - timedelta(days=e["dt"].weekday())
    w = 0
    while True:
        wk = week0 + timedelta(weeks=w * interval)
        if wk > end or (until and wk > until): break
        for d in sorted(bydays):
            day = wk + timedelta(days=d)
            if day < e["dt"].date() or (until and day > until): continue
            n += 1
            if count and n > count: break
            if start <= day < end and day not in e["exdates"]:
                ov = overrides.get((e["uid"], day))
                if ov and ov[0] == "CANCELLED": continue
                occ.append(day)
        if count and n >= count: break
        w += 1
    if occ:
        weekly.append((e, bydays, interval, until, occ))

print(f"== {path.split('/')[-1]}  window {start}..{end - timedelta(days=1)}")
print(f"-- WEEKLY series active in window: {len(weekly)}")
for e, bydays, interval, until, occ in sorted(weekly, key=lambda x: (min(x[1]), x[0]['dt'].time())):
    t = "all-day" if e["allday"] else e["dt"].strftime("%-I:%M %p")
    miss = [d for d in (start + timedelta(days=i) for i in range((end - start).days))
            if d.weekday() in bydays and d not in occ and ((d - e['dt'].date()).days // 7) % interval == 0 and d >= e['dt'].date()]
    print(f"  {'/'.join(NAMES[d] for d in sorted(bydays)):<8} {t:<9} every {interval}w  since {e['dt'].date()}  until {str(until) if until else '-':<10} | {e['summ']}"
          + (f"  [skips {', '.join(map(str, miss))}]" if miss else "") + (f"  || {e['desc']}" if e['desc'] else ""))
print(f"-- OTHER recurring series still running: {len(other)}")
for e, r in other:
    print(f"  {e['dt'].strftime('%Y-%m-%d %a %-I:%M %p')} RRULE={e['rrule']} | {e['summ']}")
print(f"-- ONE-OFF events {start}..{far}: {len(oneoff)}")
for e in sorted(oneoff, key=lambda x: x["dt"]):
    t = "all-day" if e["allday"] else e["dt"].strftime("%-I:%M %p")
    print(f"  {e['dt'].strftime('%Y-%m-%d %a')} {t:<9} | {e['summ']}" + (f"  || {e['desc']}" if e['desc'] else ""))
print(f"-- edited/moved single occurrences in window:")
for (uid, d), (st, summ, dt) in sorted(overrides.items(), key=lambda x: x[0][1]):
    if start <= d < end:
        print(f"  {d} {st or 'MOVED/EDITED'} -> {dt.strftime('%Y-%m-%d %a %-I:%M %p') if dt else '?'} | {summ}")
