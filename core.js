// ---- core.js ----
// Pure helpers: numbers, dates, durations, milestones, patterns.
// No DOM, no storage — loaded before app.js, and unit-testable in Node
// (see core.test.mjs; run with `node --test`).

function round2(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return String(round2(Number(n))); }   // trims trailing zeros: 12.5, 13, 0.25
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
  if (goal > 0) {
    const yday = sessionDate(new Date(t - DAY));
    const y = days.find((d) => d.date === yday);
    if (y && y.total > goal) reasons.push({ key: "yesterday", total: round2(y.total) });
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
  const under = goal > 0 || goal === 0 ? totals.filter((x) => x <= goal).length : 0;
  let best = 0, run = 0;
  totals.forEach((x) => { if (x <= goal) { run++; if (run > best) best = run; } else run = 0; });
  return {
    n,
    avg: round2(totals.reduce((s, x) => s + x, 0) / n),
    under, underPct: under / n,
    total: round2(totals.reduce((s, x) => s + x, 0)),
    bestStreak: best,
  };
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
function calendarCells(year, month, totals, todayStr, goal, hasGoalFlag) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0, lead = new Date(year, month, 1).getDay(); i < lead; i++) cells.push({ blank: true });
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const has = Object.prototype.hasOwnProperty.call(totals || {}, ds);
    const total = has ? totals[ds] : null;
    cells.push({
      blank: false, day, ds, total, isToday: ds === todayStr,
      state: !has ? "empty" : !hasGoalFlag ? "logged" : (total <= goal ? "under" : "over"),
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

// Node test hook (no effect in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    planFor, upsertDay, isFutureDate, futureDays, dateTaken, calendarCells, sinceCardModel, dayStamp,
    dailyTotals, levelMetOn, trendFlat, medianRungDays, suggestTaper,
    dayRisk, periodStats, comparePeriods,
    round2, fmt, dayLabel, hourLabel, isoLocal, DAY_CUTOFF_HOUR, sessionDate, weekKey,
    partsMs, bigSince, durLabel, HR, DAY, YR, MILES, nextMile, prevMileMs, mileList,
    highestMile, mileLabelFor, savedText, csvField, resetPatterns, rollingAverage,
    goalPerformance, taperReady, projectZero, zeroStreak,
    backslideReady, ZERO_WINS, zeroWinReached, pickAffirmation,
  };
}
