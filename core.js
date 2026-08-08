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

// Node test hook (no effect in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    planFor, upsertDay, isFutureDate, futureDays,
    round2, fmt, dayLabel, hourLabel, isoLocal, DAY_CUTOFF_HOUR, sessionDate, weekKey,
    partsMs, bigSince, durLabel, HR, DAY, YR, MILES, nextMile, prevMileMs, mileList,
    highestMile, mileLabelFor, savedText, csvField, resetPatterns, rollingAverage,
    goalPerformance, taperReady, projectZero, zeroStreak,
    backslideReady, ZERO_WINS, zeroWinReached, pickAffirmation,
  };
}
