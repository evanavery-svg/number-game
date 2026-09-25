// ---- core.js ----
// Pure helpers: numbers, dates, durations, milestones, patterns.
// No DOM, no storage — loaded before app.js, and unit-testable in Node
// (see core.test.mjs; run with `node --test`).

function round2(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return String(round2(Number(n))); }   // trims trailing zeros: 12.5, 13, 0.25
// An average earns one decimal, not two: "3.9 a day" reads, "3.86 a day" is noise.
function fmtAvg(n) { return String(Math.round(Number(n) * 10) / 10); }
function dayLabel(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }

function hourLabel(h) {
  const ampm = h < 12 ? "AM" : "PM";
  let hr = h % 12; if (hr === 0) hr = 12;
  return `${hr} ${ampm}`;
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Taps made in the wee hours still belong to the day before, the way a late
// night out "counts" as last night even after midnight. Anything before this
// hour rolls back to the previous calendar day.
const DAY_CUTOFF_HOUR = 4;
function sessionDate(d) {
  d = d || new Date();
  const shifted = new Date(d);
  if (shifted.getHours() < DAY_CUTOFF_HOUR) shifted.setDate(shifted.getDate() - 1);
  return isoLocal(shifted);
}
// The local Sunday that starts the week containing `d` (defaults to now).
function weekKey(d) {
  const w = d ? new Date(d) : new Date();
  w.setHours(0, 0, 0, 0); w.setDate(w.getDate() - w.getDay());
  return isoLocal(w);
}

function partsMs(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000);
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
function bigSince(p) {
  if (p.d > 0) return { n: p.d, u: p.d === 1 ? "day" : "days" };
  if (p.h > 0) return { n: p.h, u: p.h === 1 ? "hour" : "hours" };
  if (p.m > 0) return { n: p.m, u: p.m === 1 ? "minute" : "minutes" };
  return { n: p.s, u: p.s === 1 ? "second" : "seconds" };
}
// A short label for a duration in ms, e.g. "12d 4h", "5h 12m", "2m".
function durLabel(ms) {
  const p = partsMs(ms);
  if (p.d > 0) return `${p.d}d ${p.h}h`;
  if (p.h > 0) return `${p.h}h ${p.m}m`;
  if (p.m > 0) return `${p.m}m ${p.s}s`;
  return `${p.s}s`;
}

// Milestones a "time since" run can reach. Past a year we roll over to whole years.
const HR = 3600e3, DAY = 86400e3, YR = 365 * DAY;
const MILES = [
  { ms: HR, label: "1 hour", short: "1h" }, { ms: 12 * HR, label: "12 hours", short: "12h" },
  { ms: DAY, label: "1 day", short: "1d" }, { ms: 3 * DAY, label: "3 days", short: "3d" },
  { ms: 7 * DAY, label: "1 week", short: "1w" }, { ms: 14 * DAY, label: "2 weeks", short: "2w" },
  { ms: 30 * DAY, label: "1 month", short: "1mo" }, { ms: 90 * DAY, label: "3 months", short: "3mo" },
  { ms: 180 * DAY, label: "6 months", short: "6mo" }, { ms: YR, label: "1 year", short: "1y" },
];
// The next milestone above the elapsed time, and the previous one reached.
function nextMile(ms) {
  for (const m of MILES) if (m.ms > ms) return m;
  const years = Math.floor(ms / YR) + 1;
  return { ms: years * YR, label: years + " years" };
}
function prevMileMs(ms) {
  let p = 0;
  for (const m of MILES) { if (m.ms <= ms) p = m.ms; else return p; }
  if (ms >= YR) p = Math.floor(ms / YR) * YR;
  return p;
}
// The milestones to show as chips — the fixed set, plus whole years once past one.
function mileList(elapsed) {
  const out = MILES.map((m) => ({ ms: m.ms, short: m.short }));
  if (elapsed >= YR) {
    const years = Math.floor(elapsed / YR) + 1;
    for (let y = 2; y <= years; y++) out.push({ ms: y * YR, short: y + "y" });
  }
  return out;
}
function highestMile(elapsed) {
  let m = 0;
  MILES.forEach((x) => { if (x.ms <= elapsed) m = x.ms; });
  if (elapsed >= YR) m = Math.floor(elapsed / YR) * YR;
  return m;
}
function mileLabelFor(ms) {
  const found = MILES.find((x) => x.ms === ms);
  if (found) return found.label;
  if (ms >= YR) { const y = Math.round(ms / YR); return y + (y === 1 ? " year" : " years"); }
  return "a milestone";
}

// Money/units accrued so far at a per-day rate. Symbols prefix, words suffix.
function savedText(rate, unit, ms) {
  const total = round2(rate * (ms / DAY));
  const u = (unit || "$").trim();
  const sym = u.length <= 1 || ["$", "£", "€", "¥", "₹"].includes(u);
  return sym ? `${u}${fmt(total)}` : `${fmt(total)} ${u}`;
}

// CSV field quoting (notes may contain commas/quotes/newlines).
function csvField(v) {
  v = String(v == null ? "" : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// Patterns across a tracker's slips: top trigger, when they cluster, whether
// runs are trending longer, and (given the daily moods) whether slips land on
// lower-mood days.
function resetPatterns(item, moods) {
  const log = item.log || [];
  if (log.length < 2) return null;
  const tagCount = {};
  log.forEach((e) => (e.tags || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  let topTag = null, topN = 0;
  Object.keys(tagCount).forEach((k) => { if (tagCount[k] > topN) { topN = tagCount[k]; topTag = k; } });
  const hours = new Array(24).fill(0), wdays = new Array(7).fill(0);
  log.forEach((e) => { const d = new Date(e.at); if (!isNaN(d.getTime())) { hours[d.getHours()]++; wdays[d.getDay()]++; } });
  let peakH = 0, peakHN = 0; hours.forEach((c, h) => { if (c > peakHN) { peakHN = c; peakH = h; } });
  let peakW = 0, peakWN = 0; wdays.forEach((c, w) => { if (c > peakWN) { peakWN = c; peakW = w; } });
  const runs = log.map((e) => e.ran || 0).filter((x) => x > 0);
  let trend = null;
  if (runs.length >= 4) {
    const mid = Math.floor(runs.length / 2);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const a = mean(runs.slice(0, mid)), b = mean(runs.slice(mid));
    if (b > a * 1.15) trend = "up"; else if (b < a * 0.85) trend = "down";
  }
  let moodGap = null;
  if (moods) {
    const slipMoods = log.map((e) => { const d = new Date(e.at); return isNaN(d.getTime()) ? null : moods[isoLocal(d)]; }).filter((m) => m != null);
    const all = Object.keys(moods).map((k) => moods[k]);
    if (slipMoods.length >= 2 && all.length >= 5) {
      const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      if (mean(all) - mean(slipMoods) >= 0.5) moodGap = "low";
    }
  }
  return { topTag, topN, peakH, peakHN, peakW, peakWN, trend, moodGap, count: log.length };
}

// Trailing-window average over a chronological array (nulls = no data that
// day). Returns an array the same length; each point is the mean of the
// available values in the trailing `window`, or null if none.
function rollingAverage(values, window) {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1).filter((v) => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

// ---- tapering to zero ----
// The app exists to walk a daily limit down to 0, so these helpers judge when a
// step down has been *earned* and where the ladder is heading.

// How a set of day entries performed against a goal over the trailing `days`.
function goalPerformance(entries, goal, days, now) {
  const cutoff = (now == null ? Date.now() : now) - days * DAY;
  const recent = entries.filter((d) => new Date(d.endedAt || d.date).getTime() >= cutoff);
  const n = recent.length;
  if (!n) return { n: 0, under: 0, underPct: 0, avg: 0 };
  const under = recent.filter((d) => d.total <= goal).length;
  const avg = recent.reduce((s, d) => s + d.total, 0) / n;
  return { n, under, underPct: under / n, avg };
}
// A step down is offered only once it's clearly earned: enough logged days,
// mostly under the goal, and an average with real headroom below it. Never
// suggested while struggling — that just makes people quit the app.
function taperReady(perf, goal, step) {
  if (goal <= 0 || step <= 0) return false;
  if (perf.n < 14) return false;              // not enough recent data
  if (perf.underPct < 0.8) return false;      // must be holding the current limit
  return perf.avg <= goal - step * 0.5;       // and already living below the next rung
}
// Extrapolate the goal ladder to zero from its recent descent.
// Returns { date, perDay } or null when it isn't descending.
function projectZero(goalLog, now) {
  const t = now == null ? Date.now() : now;
  const pts = (goalLog || [])
    .map((g) => ({ at: new Date(g.at).getTime(), goal: g.goal }))
    .filter((g) => !isNaN(g.at) && typeof g.goal === "number")
    .sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  if (last.goal <= 0) return { date: new Date(last.at), perDay: 0, done: true };
  const spanDays = (last.at - first.at) / DAY;
  const dropped = first.goal - last.goal;
  if (spanDays < 1 || dropped <= 0) return null;   // flat or going up — no ETA
  const perDay = dropped / spanDays;
  return { date: new Date(t + (last.goal / perDay) * DAY), perDay, done: false };
}
// Pick one of a pool by day, the way the theme rotation does — stable for the
// whole day, different tomorrow. Handles a negative day index the same way.
function variantForDay(dayIdx, pool) {
  const n = (pool || []).length;
  if (!n) return null;
  const i = Math.floor(dayIdx || 0);
  return pool[((i % n) + n) % n];
}

// Is today worth marking? Used to give the ring a distinct treatment on
// milestone days only — an ordinary good day should still look ordinary, or
// the special one stops meaning anything.
//
// "Exactly at" rather than "past", so the ring is special for the whole day
// you're on 7 / 30 / 100 / 365 and then goes back to normal.
function milestoneToday(totals, sinceItems, now) {
  const t = now == null ? Date.now() : now;
  const streak = zeroStreak(totals || []);
  if (ZERO_WINS.indexOf(streak) !== -1) {
    return { kind: "zero", label: `${streak} days at zero` };
  }
  // a Time Since run that crossed a milestone during today's session day
  const todayKey = sessionDate(new Date(t));
  for (const it of sinceItems || []) {
    if (!it || !it.start) continue;
    const started = new Date(it.start).getTime();
    if (isNaN(started)) continue;
    const elapsed = t - started;
    if (elapsed < 0) continue;
    const m = highestMile(elapsed);
    if (!m) continue;                                   // nothing reached yet
    if (sessionDate(new Date(started + m)) !== todayKey) continue;
    return { kind: "since", label: `${it.name || "your run"} · ${mileLabelFor(m)}` };
  }
  return null;
}

// ---- data health ----
// Every streak, average and taper decision is computed from history, and there
// has never been a way to ask whether it's sound. Each check below corresponds
// to a bug that actually shipped in this app, found by accident at the time.
//
// A false positive is worse than no tool at all — a check that complains about
// healthy data trains you to ignore it — so each rule flags only what is
// genuinely wrong, and backfilled days (a legitimate, deliberate shape) pass.
function auditHistory(history, todayStr) {
  const days = (history || []).filter(Boolean);
  const out = [];
  const add = (kind, severity, dates, detail) => out.push({ kind, severity, dates, detail });

  // two entries on one date: the calendar reaches only one, both count to averages
  const byDate = {};
  days.forEach((d) => { if (d.date) (byDate[d.date] = byDate[d.date] || []).push(d); });
  const dupes = Object.keys(byDate).filter((k) => byDate[k].length > 1).sort();
  if (dupes.length) add("duplicateDate", "error", dupes, "Two entries share this date");

  // dated after today — impossible, and it can't be reached from the calendar
  if (todayStr) {
    const future = days.filter((d) => d.date && String(d.date) > String(todayStr)).map((d) => d.date).sort();
    if (future.length) add("futureDate", "error", future, "This day hasn't happened yet");
  }

  // unparseable or missing dates break every chart that groups by day
  const bad = days.filter((d) => {
    if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) return true;
    const t = new Date(d.endedAt || d.date).getTime();
    return isNaN(t);
  }).map((d) => String(d.date || "(no date)"));
  if (bad.length) add("badDate", "error", bad.sort(), "The date on this entry can't be read");

  // a total that isn't a usable number poisons averages and streaks
  const badTotal = days.filter((d) => typeof d.total !== "number" || !isFinite(d.total) || d.total < 0)
    .map((d) => String(d.date || "(no date)"));
  if (badTotal.length) add("badTotal", "error", badTotal.sort(), "The total on this entry isn't a number");

  // no label — the day editor titles itself with it and would open blank
  const noLabel = days.filter((d) => !d.label && d.date).map((d) => d.date).sort();
  if (noLabel.length) add("missingLabel", "fixable", noLabel, "Missing its name — can be rebuilt from the date");

  // out of order: charts and streak counting both read history front to back
  const dated = days.filter((d) => d.date && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)));
  let disordered = false;
  for (let i = 1; i < dated.length; i++) if (dated[i].date < dated[i - 1].date) { disordered = true; break; }
  if (disordered) add("outOfOrder", "fixable", [], "Entries aren't in date order");

  // recorded tap times disagreeing with the tap count. Only flagged when times
  // exist — a backfilled day has none and that's correct, not broken.
  const mismatch = days.filter((d) => Array.isArray(d.tapTimes) && d.tapTimes.length > 0 &&
    typeof d.taps === "number" && d.taps !== d.tapTimes.length).map((d) => d.date).sort();
  if (mismatch.length) add("tapMismatch", "fixable", mismatch, "Tap count doesn't match the times recorded");

  return out;
}

// ---- vitamins ----
// The log is keyed by session day, so "today's counts" is just the entry
// for today's key — a new day is a new (empty) entry, which is what makes
// the daily reset automatic without any separate reset bookkeeping.
function vitaminsForDay(log, dayStr) {
  return (log && log[dayStr]) || {};
}

// Was a habit done on a given day? Backward-compatible with the old
// count-based entries (a number) as well as the current timestamp arrays.
function vitTakenOn(log, name, dayStr) {
  const day = log && log[dayStr];
  if (!day) return false;
  const v = day[name];
  return Array.isArray(v) ? v.length > 0 : !!v;
}
// The previous calendar day for a "YYYY-MM-DD" key. Noon avoids any DST edge.
function prevDayKey(dayStr) {
  const d = new Date(dayStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return isoLocal(d);
}
// Is a habit "due" on a given day? No schedule (or an empty one) means every
// day; otherwise only the listed weekdays (0=Sun … 6=Sat). sched is optional so
// every existing caller keeps its daily behaviour.
function habitDue(sched, name, dayStr) {
  const days = sched && sched[name];
  if (!Array.isArray(days) || !days.length) return true;
  return days.indexOf(new Date(dayStr + "T12:00:00").getDay()) !== -1;
}
// Current run of consecutive days a habit was done, counting back from today.
// Days the habit isn't scheduled are skipped (they never break a streak); a
// not-yet-done today keeps the run alive (it counts through yesterday).
function habitStreak(log, name, todayStr, sched) {
  let cur = todayStr;
  if (habitDue(sched, name, cur) && !vitTakenOn(log, name, cur)) cur = prevDayKey(cur);
  let n = 0, guard = 0;
  while (guard++ < 4000) {
    if (!habitDue(sched, name, cur)) { cur = prevDayKey(cur); continue; }   // rest day — skip
    if (vitTakenOn(log, name, cur)) { n++; cur = prevDayKey(cur); }
    else break;
  }
  return n;
}
// Booleans for the last n days, oldest → newest (today last) — for a dot row.
function habitLastNDays(log, name, todayStr, n) {
  const out = [];
  let cur = todayStr;
  for (let i = 0; i < n; i++) { out.push(vitTakenOn(log, name, cur)); cur = prevDayKey(cur); }
  return out.reverse();
}
// Fraction of the day's *due* habits that were done (0..1). Empty list → 0; a
// day with habits but none scheduled → 1 (a clear day counts as complete).
function habitDayRate(log, names, dayStr, sched) {
  if (!names || !names.length) return 0;
  const due = names.filter((nm) => habitDue(sched, nm, dayStr));
  if (!due.length) return 1;
  let done = 0;
  for (const nm of due) if (vitTakenOn(log, nm, dayStr)) done++;
  return done / due.length;
}
// Habit analytics over the last n days: a per-habit summary (done count of due
// days, rate, current streak), the daily completion-rate series, and the
// strongest weekday. Schedule-aware so off-days don't count against a habit.
function habitStats(log, names, todayStr, n, sched) {
  names = names || [];
  const days = [];
  let cur = todayStr;
  for (let i = 0; i < n; i++) { days.push(cur); cur = prevDayKey(cur); }
  days.reverse();   // oldest → newest
  const per = names.map((nm) => {
    let done = 0, due = 0;
    for (const d of days) if (habitDue(sched, nm, d)) { due++; if (vitTakenOn(log, nm, d)) done++; }
    return { name: nm, done, n: due, rate: due ? done / due : 0, streak: habitStreak(log, nm, todayStr, sched) };
  });
  const series = days.map((d) => {
    const due = names.filter((nm) => habitDue(sched, nm, d)).length;
    return { day: d, rate: habitDayRate(log, names, d, sched), due };
  });
  // Rest days (nothing scheduled) score a free 1.0, so they can't be a fair
  // basis for "your strongest weekday" — count only days something was due.
  const byDow = [0, 1, 2, 3, 4, 5, 6].map(() => ({ sum: 0, count: 0 }));
  for (const s of series) {
    if (!s.due) continue;
    const dow = new Date(s.day + "T12:00:00").getDay();
    byDow[dow].sum += s.rate; byDow[dow].count++;
  }
  let bestDow = -1, bestAvg = -1;
  byDow.forEach((b, i) => { if (b.count) { const a = b.sum / b.count; if (a > bestAvg) { bestAvg = a; bestDow = i; } } });
  return { per, series, bestDow, bestAvg };
}

// ---- deeper analysis ----
// Average daily total on days a habit was done vs not — which habits track
// with a lower (or higher) count. Needs a couple of days on each side to mean
// anything; sorted by the size of the gap.
function habitOutcomes(history, log, names) {
  const out = [];
  (names || []).forEach((name) => {
    let onSum = 0, onN = 0, offSum = 0, offN = 0;
    (history || []).forEach((d) => {
      if (!d || typeof d.total !== "number") return;
      if (vitTakenOn(log, name, d.date)) { onSum += d.total; onN++; }
      else { offSum += d.total; offN++; }
    });
    if (onN < 2 || offN < 2) return;
    const onAvg = onSum / onN, offAvg = offSum / offN;
    out.push({ name, onAvg: round2(onAvg), offAvg: round2(offAvg), onN, offN, delta: round2(onAvg - offAvg) });
  });
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}

// Least-squares fit over [x, y] points → { slope, intercept, n }.
function linFit(points) {
  const n = (points || []).length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  points.forEach((p) => { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / n, n };
}
// Project the fitted line to when y reaches target. `days` counts from the last
// x; null when the trend runs the wrong way (it never gets there).
function projectTrend(points, target) {
  const f = linFit(points);
  if (!f) return null;
  const lastX = points[points.length - 1][0];
  const yNow = f.slope * lastX + f.intercept;
  let days = null;
  if (f.slope !== 0) {
    const cross = (target - f.intercept) / f.slope - lastX;
    if (cross > 0 && ((f.slope < 0 && target <= yNow) || (f.slope > 0 && target >= yNow))) days = Math.round(cross);
  }
  return { slope: f.slope, yNow, days };
}

// Completed runs of consecutive at-or-under-goal days, the in-progress one, and
// the best ever — the raw material for "where your streaks usually break".
// A goal can be one number for every day, a list holding one per entry, or a
// function of the day's date. The last two let a weekly budget give each day its
// own allowance, while a daily goal keeps passing a plain number exactly as before.
function goalAt(goal, i, date) {
  if (typeof goal === "function") return goal(date);
  if (Array.isArray(goal)) return goal[i];
  return goal;
}

// A weekly budget, day by day. A day may use whatever the week still has once
// the days before it in the same Sunday–Saturday week are counted — so a big day
// with budget to spare is fine, and only the day that pushes the week past its
// budget counts as over. Looks back at most six days, so it's cheap enough to ask
// for every cell of a year grid.
function weekAllowance(budget, totals, ds) {
  const d = new Date(ds + "T12:00:00");
  let before = 0;
  for (let k = d.getDay(); k > 0; k--) {
    const p = new Date(d); p.setDate(d.getDate() - k);
    before += (totals && totals[isoLocal(p)]) || 0;
  }
  return round2(budget - before);
}

function underRuns(totals, goal) {
  const runs = []; let cur = 0;
  (totals || []).forEach((t, i) => {
    if (t <= goalAt(goal, i)) cur++;
    else { if (cur > 0) runs.push(cur); cur = 0; }
  });
  const best = Math.max(cur, runs.length ? Math.max.apply(null, runs) : 0);
  return { runs, current: cur, best };
}

// The current run of at-or-under-goal days, counting back from the most recent.
// Up to graceMax over-goal days may be "graced" — bridged so one slip doesn't
// reset the run. A graced day isn't counted (it wasn't under goal) but doesn't
// end the run. `totals` holds only logged days in chronological order, so gaps
// (unlogged days) never break a run — only an ungraced over-goal day does.
function streakWithGrace(totals, goal, graceMax) {
  const arr = totals || [];
  const cap = Math.max(0, graceMax | 0);
  let streak = 0, graced = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] <= goalAt(goal, i)) streak++;
    else if (graced < cap) graced++;   // bridge one slip; don't count it, don't reset
    else break;
  }
  return { streak, graced };
}

function median(arr) {
  const a = (arr || []).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// A 7 × 4 (weekday × daypart) grid of tap counts from ms timestamps — when in
// the week taps actually cluster.
const DAYPARTS = ["Night", "Morning", "Afternoon", "Evening"];
function weekHeat(times) {
  const grid = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  let max = 0, total = 0;
  (times || []).forEach((t) => {
    const d = new Date(t);
    if (isNaN(d.getTime())) return;
    const h = d.getHours();
    const part = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
    grid[d.getDay()][part]++; total++;
    if (grid[d.getDay()][part] > max) max = grid[d.getDay()][part];
  });
  return { grid, max, total };
}

// Taps bucketed by clock hour, across every day you've logged. Same contract as
// weekHeat: garbage in the list is skipped rather than throwing.
function hourHistogram(times) {
  const hours = new Array(24).fill(0);
  let total = 0;
  (times || []).forEach((t) => {
    if (t == null || t === "") return;   // new Date(null) is a valid 1970 date — drop it before it lands in hour 0
    const d = new Date(t);
    if (isNaN(d.getTime())) return;
    hours[d.getHours()]++; total++;
  });
  return { hours, total };
}

// Where today is heading. Anchors the *remainder* to your daily average rather
// than scaling today's own pace, which would turn one 8am tap into a projection
// of thirty — wrong exactly when being wrong does the most harm. The cost is
// under-reacting to a genuinely bad day, which is the safer direction to err.
// Returns null whenever there isn't an honest answer; the caller shows nothing.
function dayProjection(hours, hour, today, goal, avgDaily) {
  const list = hours || [];
  let sample = 0;
  for (let h = 0; h < 24; h++) sample += list[h] || 0;
  if (sample < 40) return null;
  if (!(avgDaily > 0) || !(today > 0) || !(goal > 0)) return null;
  if (!(hour >= 12)) return null;                 // before midday it's just the daily average
  let after = 0;
  for (let h = hour + 1; h < 24; h++) after += list[h] || 0;   // strictly after: don't double-count the hour in progress
  const share = after / sample;
  // A high share is not a reason to stay quiet: someone whose taps all land in
  // the evening is exactly who this line is for, and at midday their share is
  // near 1 legitimately. Only the spent day, with nothing left to expect, is
  // worth skipping — the midday floor already rules out the degenerate case.
  if (share < 0.05) return null;
  const remaining = avgDaily * share;
  const projected = round2(today + remaining);
  return { projected, remaining, share, sample, hour, over: projected > goal, headroom: round2(goal - today) };
}

// The wording, next to the numbers so the two can't drift apart. Three outcomes
// only. A day you'll comfortably clear says nothing. A day heading the wrong way
// gets what you don't already know — how much your own pattern still has coming —
// rather than the headroom, which the add button is already showing you, or a
// verdict on how the day will end.
function paceCopy(proj, today, goal) {
  if (!proj) return null;
  if (today >= goal) return null;                       // the day already went; a forecast now is just a kick
  if (proj.projected <= goal * 0.8) return null;        // comfortably under is noise
  if (!proj.over) return { text: `Today's pace lands around ${fmt(proj.projected)} — under your ${fmt(goal)}`, cls: "ok" };
  return { text: `You usually add about ${fmt(round2(proj.remaining))} more from here`, cls: "tight" };
}

// Pick the strongest of a set of { label, pct, ... } signals, by |pct|.
function strongestSignal(signals) {
  const list = (signals || []).filter((s) => s && isFinite(s.pct));
  if (!list.length) return null;
  return list.slice().sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
}

// ---- growth tree milestones ----
// A pop-up at 25/50/75% of the way to a prestige, not just on full-grown —
// a 30-day stretch is long enough that a quarter/half/three-quarters cue is
// worth celebrating too. 100% already gets its own "prestige" toast at the
// call site, so this only ever returns 25, 50 or 75.
const TREE_MILESTONE_PCTS = [25, 50, 75];
function treeMilestoneHit(prevProgress, newProgress, days) {
  for (const pct of TREE_MILESTONE_PCTS) {
    const at = Math.round((days * pct) / 100);
    if (prevProgress < at && newProgress >= at) return pct;
  }
  return null;
}

// ---- the shape of a day ----
// Every tap has carried a timestamp all along and nothing has ever read them
// for *when* in the day you log. Buckets by session hour so a late night after
// midnight belongs to the evening it came from, not to the next morning.
function dayShape(taps, now) {
  const list = (taps || []).filter((t) => t && isFinite(t.t)).sort((a, b) => a.t - b.t);
  const n = list.length;
  if (!n) return null;
  const hours = new Array(24).fill(0);
  list.forEach((t) => { hours[new Date(t.t).getHours()]++; });
  // the busiest 3-hour window reads better than a single spiky hour
  let peakHour = 0, peakN = -1;
  for (let h = 0; h < 24; h++) {
    const win = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
    if (win > peakN) { peakN = win; peakHour = h; }
  }
  let longestGapMs = 0;
  for (let i = 1; i < n; i++) longestGapMs = Math.max(longestGapMs, list[i].t - list[i - 1].t);
  // and the gap since the last one, which is the streak that's still running
  const sinceLast = Math.max(0, (now == null ? Date.now() : now) - list[n - 1].t);
  return { n, peakHour, peakN, firstAt: list[0].t, lastAt: list[n - 1].t, longestGapMs, sinceLast };
}

// How steady you are, not how low. Averaging 2 with days of 0 and 6 is a
// different place from a level 2. 100 = identical every day.
function consistency(totals) {
  const xs = (totals || []).filter((x) => typeof x === "number");
  if (xs.length < 3) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (mean === 0) return 100;                       // every day at zero is perfectly steady
  const variance = xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / xs.length;
  const cv = Math.sqrt(variance) / mean;            // coefficient of variation
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

// Everything since day one, for the "look how far you've come" view.
function lifetime(entries) {
  const days = (entries || []).filter((d) => d && typeof d.total === "number");
  if (!days.length) return { days: 0, total: 0, zeroDays: 0, best: 0, first: null };
  const totals = days.map((d) => d.total);
  return {
    days: days.length,
    total: round2(totals.reduce((s, x) => s + x, 0)),
    zeroDays: totals.filter((x) => x === 0).length,
    best: Math.max(...totals),
    first: days.map((d) => d.date).filter(Boolean).sort()[0] || null,
  };
}

// The nearest thing still ahead of you, so the records read forwards as well
// as backwards. Returns null once there's nothing left to chase.
function nextTarget(totals, goal, seenWins) {
  const xs = totals || [];
  const streak = zeroStreak(xs);
  const now = Array.isArray(goal) ? goal[goal.length - 1] : goal;   // today's limit
  // the next zero-day milestone, if zero is the target
  if (now === 0 || streak > 0) {
    const seen = seenWins || [];
    for (const w of ZERO_WINS) {
      if (streak < w && seen.indexOf(w) === -1) {
        return { kind: "zeroWin", need: w - streak, at: w };
      }
    }
  }
  // otherwise: beating the longest run of days at or under the goal
  if (!(now >= 0)) return null;
  let best = 0, run = 0, cur = 0;
  xs.forEach((x, i) => { if (x <= goalAt(goal, i)) { run++; if (run > best) best = run; } else run = 0; });
  for (let i = xs.length - 1; i >= 0 && xs[i] <= goalAt(goal, i); i--) cur++;
  if (best > 0 && cur < best) return { kind: "bestStreak", need: best - cur + 1, at: best };
  return null;
}

// The home strip's lines, built here rather than in the DOM code so the
// wording is testable and can't quietly disagree with the numbers behind it.
// The running streak is deliberately absent — it already has its own line.
function pulseLines(ctx) {
  const c = ctx || {};
  const out = [];

  if (c.compare && c.compare.previous && c.compare.previous.n >= 3) {
    const d = c.compare.delta.avg, cur = c.compare.current.avg, prev = c.compare.previous.avg;
    if (Math.abs(d) < 0.05) out.push(`Averaging ${fmt(cur)} — steady on the previous stretch`);
    else out.push(`Averaging ${fmt(cur)}, ${d < 0 ? "down" : "up"} from ${fmt(prev)}`);
  }

  if (c.consistency != null) {
    if (c.consistency >= 75) out.push(`Very steady lately — ${c.consistency}% consistent`);
    else if (c.consistency >= 45) out.push(`Fairly steady — ${c.consistency}% consistent`);
    else out.push(`Swingy lately — ${c.consistency}% consistent`);
  }

  if (c.shape && c.shape.n >= 3) {
    const a = c.shape.peakHour, b = (a + 3) % 24;
    out.push(`You mostly log between ${hourLabel(a)} and ${hourLabel(b)}`);
  }
  if (c.shape && c.shape.sinceLast > HR) {
    out.push(`${durLabel(c.shape.sinceLast)} since your last one`);
  }

  if (c.next) {
    out.push(c.next.kind === "zeroWin"
      ? `${c.next.need} day${c.next.need === 1 ? "" : "s"} to ${c.next.at} at zero`
      : `${c.next.need} day${c.next.need === 1 ? "" : "s"} to beat your best streak`);
  }

  if (c.life && c.life.days > 0) {
    out.push(`${c.life.days} day${c.life.days === 1 ? "" : "s"} logged since you started`);
    if (c.life.zeroDays > 0) out.push(`${c.life.zeroDays} day${c.life.zeroDays === 1 ? "" : "s"} at zero so far`);
  }

  return out;
}

// ---- looking forward instead of back ----
// Everything else here reports what already happened. This asks whether today
// resembles the days that have historically gone worse, and says why. It is a
// nudge built from your own counter, mood check-ins and goal — never a
// prediction, and never a percentage.
//
// Deliberately reads no private journal data, so nothing derived from behind
// that passcode can surface in a message shown outside it.
function dayRisk(entries, moods, goal, now) {
  const t = now == null ? Date.now() : now;
  const days = (entries || []).filter((d) => d && typeof d.total === "number");
  if (days.length < 14) return null;                 // too little to say anything honest
  const when = (d) => new Date(d.endedAt || d.date);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const all = mean(days.map((d) => d.total));
  if (!(all > 0)) return null;                       // nothing but zeros — nothing to warn about
  const reasons = [];
  const today = new Date(t);

  // 1. this weekday historically runs high
  const sameDay = days.filter((d) => when(d).getDay() === today.getDay());
  if (sameDay.length >= 3) {
    const wd = mean(sameDay.map((d) => d.total));
    if (wd >= all * 1.25) reasons.push({ key: "weekday", day: today.getDay(), avg: round2(wd) });
  }

  // 2. today's mood is low, and low-mood days have historically run higher
  const todayMood = moods ? moods[sessionDate(today)] : null;
  if (todayMood != null && todayMood <= 2) {
    const lows = days.filter((d) => d.mood != null && d.mood <= 2).map((d) => d.total);
    const highs = days.filter((d) => d.mood != null && d.mood >= 4).map((d) => d.total);
    if (lows.length >= 2 && highs.length >= 2 && mean(lows) >= mean(highs) * 1.2) {
      reasons.push({ key: "mood", mood: todayMood });
    }
  }

  // 3. the last week is drifting up on the week before
  const inWindow = (from, to) => days.filter((d) => { const x = when(d).getTime(); return x >= from && x < to; }).map((d) => d.total);
  const wk1 = inWindow(t - 7 * DAY, t), wk2 = inWindow(t - 14 * DAY, t - 7 * DAY);
  if (wk1.length >= 3 && wk2.length >= 3 && mean(wk1) >= mean(wk2) * 1.25) {
    reasons.push({ key: "drift", now: round2(mean(wk1)), before: round2(mean(wk2)) });
  }

  // 4. yesterday went over
  const yday = sessionDate(new Date(t - DAY));
  const yGoal = goalAt(goal, 0, yday);
  if (yGoal > 0) {
    const y = days.find((d) => d.date === yday);
    if (y && y.total > yGoal) reasons.push({ key: "yesterday", total: round2(y.total) });
  }

  if (reasons.length < 2) return null;               // one signal is noise — say nothing
  return { level: reasons.length >= 3 ? "high" : "elevated", reasons, basis: { days: days.length } };
}

// ---- period comparison ----
// goalPerformance only takes an open-ended trailing window, so this is the
// bounded version it lacks — needed to put one stretch beside another.
function periodStats(entries, from, to, goal) {
  const inRange = (entries || []).filter((d) => {
    if (!d || typeof d.total !== "number") return false;
    const t = new Date(d.endedAt || d.date).getTime();
    return t >= from && t < to;
  }).sort((a, b) => new Date(a.endedAt || a.date) - new Date(b.endedAt || b.date));
  const n = inRange.length;
  if (!n) return { n: 0, avg: 0, under: 0, underPct: 0, total: 0, bestStreak: 0 };
  const totals = inRange.map((d) => d.total);
  const has = typeof goal === "function" || goal > 0 || goal === 0;
  const ok = (d) => d.total <= goalAt(goal, 0, d.date);
  const under = has ? inRange.filter(ok).length : 0;
  let best = 0, run = 0;
  inRange.forEach((d) => { if (has && ok(d)) { run++; if (run > best) best = run; } else run = 0; });
  return {
    n,
    avg: round2(totals.reduce((s, x) => s + x, 0) / n),
    under, underPct: under / n,
    total: round2(totals.reduce((s, x) => s + x, 0)),
    bestStreak: best,
  };
}

// ---- self-experiment ----
// One factor, two kinds of day, your own numbers either side. The log records
// what actually happened rather than whether you stuck to the plan, so a week
// you drifted still produces an honest comparison — just an uneven one.
//
// This is arithmetic over your own history, not a trial: no randomisation, no
// blinding, and everything else in your life moved too. So it reports both
// sample sizes, and it would rather say nothing than dress up a coin flip.
function experimentVerdict(log, entries, opts) {
  const minSide = (opts && opts.minSide) || 5;
  const pctFloor = (opts && opts.pctFloor) || 20;
  const totals = {};
  (entries || []).forEach((d) => {
    if (d && typeof d.total === "number" && d.date) totals[d.date] = d.total;
  });
  const on = [], off = [];
  Object.keys(log || {}).forEach((day) => {
    if (!(day in totals)) return;                    // answered, but that day never got logged
    (log[day] ? on : off).push(totals[day]);
  });
  const answered = Object.keys(log || {}).length;
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const res = {
    answered, matched: on.length + off.length,
    withN: on.length, withoutN: off.length,
    withAvg: round2(mean(on)), withoutAvg: round2(mean(off)),
    delta: 0, pct: null, verdict: "thin",
  };
  if (on.length < minSide || off.length < minSide) return res;
  res.delta = round2(res.withAvg - res.withoutAvg);
  // "half as much again" is the number worth reading, so keep reporting the gap
  // against the baseline — but only when there is a baseline to divide by.
  res.pct = res.withoutAvg > 0 ? Math.round((res.delta / res.withoutAvg) * 100) : null;
  // The verdict itself is judged against the two sides combined, not against the
  // baseline. Dividing by the baseline breaks exactly where the result matters
  // most: log nothing on the days you avoided it and the baseline is zero, which
  // made the largest possible effect come back as no effect at all.
  const pooled = (res.withAvg * on.length + res.withoutAvg * off.length) / (on.length + off.length);
  res.rel = pooled > 0 ? Math.round((Math.abs(res.delta) / pooled) * 100) : 0;
  // the same ±20% bar the rest of the app uses before it calls a pattern real
  if (res.rel < pctFloor) res.verdict = "tooClose";
  else res.verdict = res.delta < 0 ? "lower" : "higher";
  return res;
}

// Which half of the experiment a given day falls in. Blocks alternate from the
// start date, so the schedule is a pure function of the calendar.
function experimentPhase(startDay, blockDays, blocks, avoidFirst, day) {
  const i = Math.floor((Date.parse(day + "T12:00:00") - Date.parse(startDay + "T12:00:00")) / DAY);
  if (!isFinite(i) || i < 0) return null;
  const total = blockDays * blocks;
  if (i >= total) return "done";
  const block = Math.floor(i / blockDays);
  const avoiding = block % 2 === 0 ? !!avoidFirst : !avoidFirst;
  return avoiding ? "avoid" : "allow";
}

// ---- reviews ----
// A stretch in the round: periodStats plus the things a look-back wants and a
// trailing window doesn't — the quiet days, the extremes, how steady it was.
function reviewSummary(entries, from, to, goal) {
  const base = periodStats(entries, from, to, goal);
  if (!base.n) return base;
  const totals = (entries || [])
    .filter((d) => {
      if (!d || typeof d.total !== "number") return false;
      const t = new Date(d.endedAt || d.date).getTime();
      return t >= from && t < to;
    })
    .map((d) => d.total);
  return Object.assign({}, base, {
    zeroDays: totals.filter((x) => x === 0).length,
    lowest: Math.min.apply(null, totals),
    highest: Math.max.apply(null, totals),
    median: median(totals),
    consistency: consistency(totals),
  });
}

// One bucket per calendar month of a year. Months you logged nothing in come
// back with n = 0 rather than being dropped, so a year reads as twelve slots.
function monthBuckets(entries, year, goal) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    const from = new Date(year, m, 1).getTime();
    const to = new Date(year, m + 1, 1).getTime();
    const s = periodStats(entries, from, to, goal);
    out.push({ month: m, n: s.n, total: s.total, avg: s.avg, under: s.under });
  }
  return out;
}

// Did the stretch improve across itself? Splits the window down the middle and
// puts the halves side by side. Null when either half is too thin to be honest,
// on the same footing as comparePeriods.
function halvesCompare(entries, from, to, goal) {
  const mid = from + Math.floor((to - from) / 2);
  const first = periodStats(entries, from, mid, goal);
  const second = periodStats(entries, mid, to, goal);
  if (first.n < 3 || second.n < 3) return null;
  return { first, second, deltaAvg: round2(second.avg - first.avg) };
}

// This window against the one immediately before it. Returns null when there
// isn't enough of a previous stretch to make an honest comparison.
function comparePeriods(entries, days, goal, now) {
  const t = now == null ? Date.now() : now;
  if (!isFinite(days)) return null;                  // "all time" has nothing to sit beside
  const span = days * DAY;
  // half-open on the left so today's entry lands in the current window and the
  // boundary day can't be counted in both
  const current = periodStats(entries, t - span + 1, t + 1, goal);
  const previous = periodStats(entries, t - 2 * span + 1, t - span + 1, goal);
  if (current.n < 3 || previous.n < 3) return null;
  return {
    current, previous,
    delta: {
      avg: round2(current.avg - previous.avg),
      under: current.under - previous.under,
      underPct: round2(current.underPct - previous.underPct),
      total: round2(current.total - previous.total),
      bestStreak: current.bestStreak - previous.bestStreak,
    },
  };
}

// ---- data-driven taper suggestions ----
// The manual taper drops by a number you typed, on a fixed clock, neither of
// which comes from how you actually log. These size the next rung from levels
// you already reach, and pace it by how long your previous rungs held.
// It's percentiles and a trend check over your own history — arithmetic, not a
// clinical protocol — so every suggestion is shown with what it's based on.

// Recent daily totals, oldest first.
function dailyTotals(entries, days, now) {
  const cutoff = (now == null ? Date.now() : now) - days * DAY;
  return (entries || [])
    .filter((d) => d && new Date(d.endedAt || d.date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.endedAt || a.date) - new Date(b.endedAt || b.date))
    .map((d) => d.total);
}

// The lowest level at least `pct` of these days already sit at or under,
// snapped to `roundTo` (the user's tap step) so the goal is a number they can
// actually land on. Snapping up keeps the "met on pct of days" promise true.
function levelMetOn(totals, pct, roundTo) {
  if (!totals || !totals.length) return null;
  const sorted = totals.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(pct * sorted.length) - 1));
  const raw = sorted[idx];
  const step = roundTo > 0 ? roundTo : 1;
  return round2(Math.ceil(raw / step) * step);
}

// Is the recent window flat or falling? A drop should never be suggested while
// things are getting worse, however good the older half of the window looks.
function trendFlat(totals) {
  if (!totals || totals.length < 6) return false;
  const mid = Math.floor(totals.length / 2);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const first = mean(totals.slice(0, mid)), second = mean(totals.slice(mid));
  if (first === 0) return second === 0;
  return second <= first * 1.1;
}

// How long your rungs actually hold, as the pacing for the next suggestion —
// in place of a fixed "every 30 days". Clamped so it stays sane either way.
function medianRungDays(goalLog) {
  const pts = (goalLog || [])
    .map((g) => new Date(g.at).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
  if (pts.length < 2) return 21;
  const gaps = [];
  for (let i = 1; i < pts.length; i++) gaps.push((pts[i] - pts[i - 1]) / DAY);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const med = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.round(Math.min(60, Math.max(14, med)));
}

// The whole recommendation, or null when a drop shouldn't be offered at all.
// `pct` is the pace: gentler = a rung you already clear more often.
function suggestTaper(entries, goal, opts) {
  const o = opts || {};
  const days = o.days || 30, pct = o.pct || 0.7, roundTo = o.roundTo || 0.5;
  if (!(goal > 0)) return null;                       // already at zero, or no goal
  const totals = dailyTotals(entries, days, o.now);
  if (totals.length < 14) return null;                // not enough to reason from
  const perf = goalPerformance(entries, goal, days, o.now);
  if (perf.underPct < 0.8) return null;               // not holding the current limit yet
  if (!trendFlat(totals)) return null;                // going the wrong way — leave them alone
  const next = levelMetOn(totals, pct, roundTo);
  if (next == null || next >= goal) return null;      // no honest room below the current goal
  const metDays = totals.filter((t) => t <= next).length;
  return {
    next,
    drop: round2(goal - next),
    metDays,
    n: totals.length,
    pct: metDays / totals.length,
    avg: round2(perf.avg),
    everyDays: medianRungDays(o.goalLog),
  };
}

// The mirror of taperReady: the current limit has become too tight to hold.
// Going back up a rung is a legitimate move, not a failure — noticing it early
// beats letting someone rack up red days until they abandon the app.
function backslideReady(perf, goal) {
  if (goal < 0) return false;
  if (perf.n < 10) return false;              // not enough recent data
  if (perf.underPct > 0.5) return false;      // still holding it more often than not
  return perf.avg > goal;                     // and genuinely living above the limit
}
// Zero-day milestones worth a real celebration — the app's whole point.
const ZERO_WINS = [7, 30, 100, 365];
function zeroWinReached(streak, alreadySeen) {
  const seen = alreadySeen || [];
  for (let i = ZERO_WINS.length - 1; i >= 0; i--) {
    const w = ZERO_WINS[i];
    if (streak >= w && !seen.includes(w)) return w;
  }
  return null;
}

// Consecutive zero days counted back from the end of a chronological list.
function zeroStreak(totals) {
  let n = 0;
  for (let i = totals.length - 1; i >= 0; i--) {
    if (totals[i] === 0) n++; else break;
  }
  return n;
}

// Pick the day's affirmation. The user's own lines win when they've written
// any; otherwise the built-in set. Seeded by day so the same day always shows
// the same line (same wrap idiom as quoteOfTheDay).
function pickAffirmation(userList, builtins, dayIndex) {
  const own = (userList || []).map((s) => String(s == null ? "" : s).trim()).filter(Boolean);
  const pool = own.length ? own : (builtins || []);
  if (!pool.length) return "";
  const i = Math.floor(dayIndex || 0);
  return pool[((i % pool.length) + pool.length) % pool.length];
}

// Pick the plan that fits the moment. An exact tag match always wins; failing
// that, a plan whose cue hour is within an hour of now. Returns null when
// nothing fits, so callers can stay quiet rather than show a generic line.
function planFor(plans, tag, hour) {
  const list = (plans || []).filter((p) => p && String(p.action || "").trim());
  if (!list.length) return null;
  if (tag) {
    const exact = list.find((p) => p.tag === tag);
    if (exact) return exact;
  }
  if (hour != null) {
    const near = list.find((p) => p.hour != null && Math.abs(p.hour - hour) <= 1);
    if (near) return near;
  }
  return null;
}

// Write a day's total into history, correcting an existing entry or inserting
// a reconstructed one in date order. Backfilled days are marked so exports
// stay honest about which numbers were entered after the fact. A null total
// removes the day. Returns a new array — never mutates the input.
function upsertDay(history, date, total) {
  const out = (history || []).filter((d) => d && d.date !== date);
  if (total != null) {
    const prev = (history || []).find((d) => d && d.date === date);
    const when = new Date(date + "T12:00:00");
    out.push(prev
      ? Object.assign({}, prev, { total: round2(total) })
      // label matters: the day editor and the history list both title themselves with it
      : { date, label: dayLabel(when), total: round2(total), taps: 0, endedAt: when.toISOString(), backfilled: true });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// Is this YYYY-MM-DD after today? An <input type="date"> max attribute is
// only advisory — it styles the field but does not stop the value being read
// — so every date that gets written has to be checked here as well.
function isFutureDate(ds, todayStr) {
  if (!ds || !todayStr) return false;
  return String(ds) > String(todayStr);   // ISO dates compare correctly as strings
}

// Days sitting in the future, which should not exist. Used to let the
// calendar reach them so a bad entry can actually be corrected.
function futureDays(history, todayStr) {
  return (history || []).filter((d) => d && isFutureDate(d.date, todayStr));
}

// Does another entry already hold this date? `except` is the entry being
// edited, which must not count as a clash with itself. Two rows sharing a date
// break the calendar (only one is reachable) while both still count toward
// averages and streaks, so a move onto an occupied day has to be refused.
function dateTaken(history, date, except) {
  return (history || []).some((d) => d && d !== except && d.date === date);
}

// The calendar month as data: leading blanks, then one descriptor per day.
// This mapping is where the wrong-day and off-by-one bugs lived, so it's kept
// out of the DOM code where it can be tested directly. `totals` is keyed by
// YYYY-MM-DD; `todayStr` is the session day, not the wall-clock one.
// `goal` may be a number, or a function (ds) => number so each day can be judged
// against the goal that was in effect that day (the taper ladder), not today's.
function calendarCells(year, month, totals, todayStr, goal, hasGoalFlag) {
  const goalOf = typeof goal === "function" ? goal : () => goal;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0, lead = new Date(year, month, 1).getDay(); i < lead; i++) cells.push({ blank: true });
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const has = Object.prototype.hasOwnProperty.call(totals || {}, ds);
    const total = has ? totals[ds] : null;
    cells.push({
      blank: false, day, ds, total, isToday: ds === todayStr,
      state: !has ? "empty" : !hasGoalFlag ? "logged" : (total <= goalOf(ds) ? "under" : "over"),
    });
  }
  return cells;
}

// The per-card numbers on the Time Since page. Shared by the full render and
// the once-a-second retime so the two can't drift apart.
function sinceCardModel(item, now) {
  const t = now == null ? Date.now() : now;
  const elapsed = Math.max(0, t - new Date(item.start).getTime());
  const next = nextMile(elapsed), prev = prevMileMs(elapsed);
  const span = next.ms - prev;
  return {
    elapsed,
    parts: partsMs(elapsed),
    big: bigSince(partsMs(elapsed)),
    next,
    remaining: Math.max(0, next.ms - elapsed),
    frac: span > 0 ? Math.min(1, Math.max(0, (elapsed - prev) / span)) : 0,
  };
}

// The date half of logging a day: which day it belongs to, and how it's
// labelled. A date picker's max attribute is advisory, so a future date is
// refused here and falls back to now. Both the future-date and missing-label
// bugs lived in this handful of lines, so they're testable on their own.
function dayStamp(dateStr, now) {
  const t = now || new Date();
  let when = t;
  if (dateStr && !isFutureDate(dateStr, isoLocal(t))) {
    const [y, mo, d] = String(dateStr).split("-").map(Number);
    if (y && mo && d) when = new Date(y, mo - 1, d, t.getHours(), t.getMinutes(), t.getSeconds());
  }
  return { date: isoLocal(when), label: dayLabel(when), endedAt: when.toISOString() };
}

// ---- spacing: stretching the time between them ----
// Taps a few minutes apart are one occasion (a double tap, a half step logged
// twice), so they never count as a gap and never count as early.
const OCCASION_MS = 5 * 60000;
const FIVE_MIN = 5 * 60000;
// Gaps between one occasion and the next, within each day. `days` is a list of
// timestamp arrays, one per day; the first tap of a day has no gap, because
// overnight isn't spacing anything out.
function dayGaps(days) {
  const out = [];
  (days || []).forEach((ts) => {
    const s = (ts || []).filter((t) => typeof t === "number" && isFinite(t)).sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
      const g = s[i] - s[i - 1];
      if (g >= OCCASION_MS) out.push(g);
    }
  });
  return out;
}
// Where to start: your usual gap, rounded down to five minutes so the first
// target is one you already keep about half the time. Null on thin data.
function gapTarget(days) {
  const g = dayGaps(days);
  if (g.length < 15) return null;
  return Math.max(15 * 60000, Math.floor(median(g) / FIVE_MIN) * FIVE_MIN);
}
// Has the target been held? Offer the next one once three in four gaps clear it.
function gapHeld(days, target) {
  const g = dayGaps(days);
  const held = g.filter((x) => x >= target).length;
  return { n: g.length, held, ready: g.length >= 10 && held / g.length >= 0.75 };
}
// The next target: a quarter hour, or a tenth of the gap once that's bigger.
function nextGap(target) {
  return target + Math.max(15 * 60000, Math.round((target * 0.1) / FIVE_MIN) * FIVE_MIN);
}
// "1h 30m", "45m" — a gap reads in hours and minutes, never seconds.
function gapLabel(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ---- the easiest one to drop ----
// The two-hour block you tap in on the fewest days, among the blocks that are a
// real part of the routine (a quarter of days or more) but not a fixture of it
// (70% or less). The least fixed habit is usually the least needed one.
function easiestSlot(days) {
  const n = (days || []).length;
  if (n < 14) return null;
  const hit = new Array(12).fill(0);
  days.forEach((ts) => {
    const seen = new Set();
    (ts || []).forEach((t) => { const h = new Date(t).getHours(); if (!isNaN(h)) seen.add(Math.floor(h / 2)); });
    seen.forEach((b) => hit[b]++);
  });
  let best = null;
  for (let b = 0; b < 12; b++) {
    const share = hit[b] / n;
    if (share < 0.25 || share > 0.7) continue;
    if (!best || hit[b] < best.days) best = { start: b * 2, end: b * 2 + 2, days: hit[b], n };
  }
  return best;
}
// "2–4 pm", "11 am–1 pm", "midnight–2 am"
function slotLabel(start) {
  const part = (h) => { h %= 24; if (h === 0) return ["midnight", ""]; if (h === 12) return ["noon", ""]; return [String(h % 12), h < 12 ? "am" : "pm"]; };
  const [a, am] = part(start), [b, bm] = part(start + 2);
  const left = am && am !== bm ? `${a} ${am}` : a;
  return `${left}–${bm ? `${b} ${bm}` : b}`;
}

// ---- the last stretch: from about one a day to none ----
// One a day to zero is the hardest drop there is, so near the bottom the taper
// moves in weeks — a few zero days a week, then most, then all.
const ENDGAME_RUNGS = [5, 3, 1];
// The next rung below a weekly budget; 0 once there's none left.
function endgameNext(weekBudget) {
  const r = ENDGAME_RUNGS.find((x) => x < weekBudget);
  return r == null ? 0 : r;
}
// Totals of the last `k` complete Sunday–Saturday weeks before the week that
// holds `ds`, oldest first. `totals` maps day key → total.
function lastWeeks(totals, ds, k) {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() - d.getDay() - 7);   // the Sunday of last week
  const out = [];
  for (let w = 0; w < k; w++) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const x = new Date(d); x.setDate(d.getDate() + i);
      sum += Number(totals[isoLocal(x)]) || 0;
    }
    out.unshift(round2(sum));
    d.setDate(d.getDate() - 7);
  }
  return out;
}
// A rung down is earned the same way as everywhere else in the taper: the
// current one held, and already living halfway to the next.
function endgameReady(weeks, budget, next) {
  if (!weeks || weeks.length < 2) return false;
  if (weeks.some((w) => w > budget)) return false;
  const avg = weeks.reduce((s, w) => s + w, 0) / weeks.length;
  return avg <= (budget + next) / 2;
}
// And the way back up: every recent week over.
function endgameSlipping(weeks, budget) {
  return !!weeks && weeks.length >= 2 && weeks.every((w) => w > budget);
}

// ---- how far you've come ----
// Your first two logged weeks against your last two, and how many fewer you've
// logged since than your starting pace would have. Null until there are two
// separate fortnights to compare, or when there was nothing to come down from.
function sinceStart(entries) {
  const days = (entries || []).filter((d) => d && typeof d.total === "number" && d.date)
    .slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (days.length < 28) return null;
  const mean = (a) => a.reduce((s, d) => s + d.total, 0) / a.length;
  const baseline = mean(days.slice(0, 14));
  if (!(baseline > 0)) return null;
  const recent = mean(days.slice(-14));
  const after = days.slice(14);
  const fewer = after.reduce((s, d) => s + (baseline - d.total), 0);
  return {
    baseline: round2(baseline), recent: round2(recent),
    pct: 1 - recent / baseline,
    fewer: Math.round(fewer), days: after.length,
  };
}

// Node test hook (no effect in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    planFor, upsertDay, isFutureDate, futureDays, dateTaken, calendarCells, sinceCardModel, dayStamp,
    dailyTotals, levelMetOn, trendFlat, medianRungDays, suggestTaper,
    dayRisk, periodStats, comparePeriods, milestoneToday, variantForDay,
    dayShape, consistency, lifetime, nextTarget, pulseLines, auditHistory, vitaminsForDay,
    vitTakenOn, prevDayKey, habitDue, habitStreak, habitLastNDays, habitDayRate, habitStats,
    habitOutcomes, linFit, projectTrend, underRuns, streakWithGrace, median, DAYPARTS, weekHeat, strongestSignal,
    hourHistogram, dayProjection, paceCopy,
    reviewSummary, monthBuckets, halvesCompare,
    experimentVerdict, experimentPhase,
    TREE_MILESTONE_PCTS, treeMilestoneHit,
    round2, fmt, fmtAvg, goalAt, weekAllowance, dayLabel, hourLabel, isoLocal, DAY_CUTOFF_HOUR, sessionDate, weekKey,
    partsMs, bigSince, durLabel, HR, DAY, YR, MILES, nextMile, prevMileMs, mileList,
    highestMile, mileLabelFor, savedText, csvField, resetPatterns, rollingAverage,
    goalPerformance, taperReady, projectZero, zeroStreak,
    backslideReady, ZERO_WINS, zeroWinReached, pickAffirmation,
    OCCASION_MS, dayGaps, gapTarget, gapHeld, nextGap, gapLabel, easiestSlot, slotLabel,
    ENDGAME_RUNGS, endgameNext, lastWeeks, endgameReady, endgameSlipping, sinceStart,
  };
}
