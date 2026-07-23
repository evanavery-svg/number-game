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

// Node test hook (no effect in the browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    round2, fmt, dayLabel, hourLabel, isoLocal, DAY_CUTOFF_HOUR, sessionDate, weekKey,
    partsMs, bigSince, durLabel, HR, DAY, YR, MILES, nextMile, prevMileMs, mileList,
    highestMile, mileLabelFor, savedText, csvField, resetPatterns, rollingAverage,
  };
}
