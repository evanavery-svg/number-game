// Unit tests for the pure helpers in core.js — run with `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const core = createRequire(import.meta.url)("./core.js");

test("round2 / fmt", () => {
  assert.equal(core.round2(0.1 + 0.2), 0.3);
  assert.equal(core.fmt(12.50), "12.5");
  assert.equal(core.fmt(13.0), "13");
  assert.equal(core.fmt("0.25"), "0.25");
});

test("isoLocal formats local dates", () => {
  assert.equal(core.isoLocal(new Date(2026, 6, 14)), "2026-07-14");
  assert.equal(core.isoLocal(new Date(2026, 0, 3)), "2026-01-03");
});

test("sessionDate rolls back before the 4am cutoff", () => {
  assert.equal(core.sessionDate(new Date(2026, 6, 14, 3, 59)), "2026-07-13"); // 3:59am -> prior day
  assert.equal(core.sessionDate(new Date(2026, 6, 14, 4, 0)), "2026-07-14");  // 4:00am -> same day
  assert.equal(core.sessionDate(new Date(2026, 6, 14, 23, 0)), "2026-07-14");
});

test("weekKey is the containing Sunday", () => {
  assert.equal(core.weekKey(new Date(2026, 6, 14)), "2026-07-12"); // Tue -> that week's Sunday
  assert.equal(core.weekKey(new Date(2026, 6, 12)), "2026-07-12"); // Sunday maps to itself
});

test("partsMs / durLabel", () => {
  assert.deepEqual(core.partsMs(-5), { d: 0, h: 0, m: 0, s: 0 });
  assert.equal(core.durLabel(core.DAY + core.HR * 2), "1d 2h");
  assert.equal(core.durLabel(core.HR * 5 + 12 * 60000), "5h 12m");
  assert.equal(core.durLabel(90 * 1000), "1m 30s");
  assert.equal(core.durLabel(9 * 1000), "9s");
});

test("milestone math", () => {
  assert.equal(core.nextMile(0).label, "1 hour");
  assert.equal(core.nextMile(core.DAY * 2).label, "3 days");
  assert.equal(core.nextMile(core.YR * 1.5).label, "2 years");
  assert.equal(core.prevMileMs(core.DAY * 2), core.DAY);
  assert.equal(core.highestMile(core.DAY * 8), core.DAY * 7);
  assert.equal(core.highestMile(core.YR * 2.5), core.YR * 2);
  assert.equal(core.mileLabelFor(core.DAY * 7), "1 week");
  assert.equal(core.mileLabelFor(core.YR * 3), "3 years");
  const list = core.mileList(core.YR * 2 + 1);
  assert.equal(list[list.length - 1].short, "3y");
});

test("savedText symbol vs word units", () => {
  assert.equal(core.savedText(8, "$", core.DAY), "$8");
  assert.equal(core.savedText(2, "walks", core.DAY * 3), "6 walks");
});

test("csvField quotes when needed", () => {
  assert.equal(core.csvField("plain"), "plain");
  assert.equal(core.csvField('a "b", c'), '"a ""b"", c"');
  assert.equal(core.csvField(null), "");
});

test("resetPatterns finds top tag, cluster and trend", () => {
  const DAY = core.DAY;
  const at = (daysAgo, hour) => { const d = new Date(2026, 5, 30 - daysAgo, hour, 0, 0); return d.toISOString(); };
  const item = { log: [
    { at: new Date(2026, 5, 2, 21).toISOString(), ran: 1 * DAY, tags: ["a"] },
    { at: new Date(2026, 5, 8, 21).toISOString(), ran: 2 * DAY, tags: ["b"] },
    { at: new Date(2026, 5, 16, 21).toISOString(), ran: 4 * DAY, tags: ["b"] },
    { at: new Date(2026, 5, 25, 21).toISOString(), ran: 5 * DAY, tags: ["b"] },
  ] };
  const p = core.resetPatterns(item);
  assert.equal(p.topTag, "b");
  assert.equal(p.topN, 3);
  assert.equal(p.peakH, 21);
  assert.equal(p.trend, "up");
  assert.equal(core.resetPatterns({ log: [{ at: "x" }] }), null); // too few
});

test("hourLabel formats 12-hour clock", () => {
  assert.equal(core.hourLabel(0), "12 AM");
  assert.equal(core.hourLabel(9), "9 AM");
  assert.equal(core.hourLabel(12), "12 PM");
  assert.equal(core.hourLabel(21), "9 PM");
});

test("bigSince picks the largest meaningful unit", () => {
  assert.deepEqual(core.bigSince({ d: 3, h: 5, m: 0, s: 0 }), { n: 3, u: "days" });
  assert.deepEqual(core.bigSince({ d: 0, h: 1, m: 2, s: 0 }), { n: 1, u: "hour" });
  assert.deepEqual(core.bigSince({ d: 0, h: 0, m: 0, s: 1 }), { n: 1, u: "second" });
});

test("rollingAverage smooths over a trailing window, ignoring gaps", () => {
  assert.deepEqual(core.rollingAverage([1, 2, 3], 3), [1, 1.5, 2]);
  // nulls are skipped; window looks back 3
  assert.deepEqual(core.rollingAverage([2, null, 4], 3), [2, 2, 3]);
  // all-null window yields null
  assert.deepEqual(core.rollingAverage([null, null], 2), [null, null]);
  // window of 2 on a longer series
  assert.deepEqual(core.rollingAverage([4, 6, 8, 10], 2), [4, 5, 7, 9]);
});

test("goalPerformance measures the trailing window only", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  const mk = (daysAgo, total) => ({ endedAt: new Date(now - daysAgo * core.DAY).toISOString(), total });
  const entries = [mk(60, 9), mk(5, 2), mk(4, 3), mk(3, 6), mk(2, 2)];   // 60d one is outside
  const p = core.goalPerformance(entries, 4, 30, now);
  assert.equal(p.n, 4);
  assert.equal(p.under, 3);           // 2, 3, 2 are <= 4; 6 is not
  assert.equal(p.underPct, 0.75);
  assert.equal(core.round2(p.avg), 3.25);
});

test("taperReady only when the drop is earned", () => {
  // holding the limit with real headroom → ready
  assert.equal(core.taperReady({ n: 20, underPct: 0.9, avg: 2.4 }, 4, 1), true);
  // too few days logged
  assert.equal(core.taperReady({ n: 8, underPct: 1, avg: 1 }, 4, 1), false);
  // going over the current limit too often
  assert.equal(core.taperReady({ n: 20, underPct: 0.6, avg: 2 }, 4, 1), false);
  // riding right at the limit — no headroom for the next rung
  assert.equal(core.taperReady({ n: 20, underPct: 0.9, avg: 3.9 }, 4, 1), false);
  // no goal / no step
  assert.equal(core.taperReady({ n: 30, underPct: 1, avg: 0 }, 0, 1), false);
  assert.equal(core.taperReady({ n: 30, underPct: 1, avg: 0 }, 4, 0), false);
});

test("projectZero extrapolates the ladder's descent", () => {
  const now = new Date(2026, 6, 30).getTime();
  // 8 → 4 over 100 days = 0.04/day; 4 left ⇒ ~100 more days
  const log = [
    { at: new Date(now - 100 * core.DAY).toISOString(), goal: 8 },
    { at: new Date(now).toISOString(), goal: 4 },
  ];
  const p = core.projectZero(log, now);
  assert.equal(core.round2(p.perDay), 0.04);
  const daysOut = Math.round((p.date.getTime() - now) / core.DAY);
  assert.equal(daysOut, 100);
  assert.equal(p.done, false);
  // already at zero
  assert.equal(core.projectZero([{ at: new Date(now - core.DAY).toISOString(), goal: 2 }, { at: new Date(now).toISOString(), goal: 0 }], now).done, true);
  // flat or rising → no estimate
  assert.equal(core.projectZero([{ at: new Date(now - 10 * core.DAY).toISOString(), goal: 4 }, { at: new Date(now).toISOString(), goal: 4 }], now), null);
  assert.equal(core.projectZero([{ at: new Date(now - 10 * core.DAY).toISOString(), goal: 2 }, { at: new Date(now).toISOString(), goal: 5 }], now), null);
  assert.equal(core.projectZero([], now), null);
});

test("backslideReady spots a limit that's become too tight", () => {
  // mostly over the limit and averaging above it → offer to step back up
  assert.equal(core.backslideReady({ n: 14, underPct: 0.3, avg: 5.2 }, 4), true);
  // still holding it more often than not → leave them alone
  assert.equal(core.backslideReady({ n: 14, underPct: 0.7, avg: 3.5 }, 4), false);
  // over often but averaging at/below the limit → not a real backslide
  assert.equal(core.backslideReady({ n: 14, underPct: 0.4, avg: 4 }, 4), false);
  // too little data
  assert.equal(core.backslideReady({ n: 6, underPct: 0, avg: 9 }, 4), false);
  // never mutually true with taperReady
  const perf = { n: 20, underPct: 0.9, avg: 2.4 };
  assert.equal(core.taperReady(perf, 4, 1) && core.backslideReady(perf, 4), false);
});

test("zeroWinReached fires the biggest unseen milestone once", () => {
  assert.equal(core.zeroWinReached(7, []), 7);
  assert.equal(core.zeroWinReached(6, []), null);
  assert.equal(core.zeroWinReached(30, [7]), 30);
  assert.equal(core.zeroWinReached(30, [7, 30]), null);   // already celebrated
  // a long streak with nothing seen reports the highest reached
  assert.equal(core.zeroWinReached(400, []), 365);
});

test("pickAffirmation prefers your own lines and is stable per day", () => {
  const built = ["a", "b", "c"];
  const own = ["mine one", "mine two"];
  // your own lines win when present
  assert.equal(core.pickAffirmation(own, built, 0), "mine one");
  assert.equal(core.pickAffirmation(own, built, 1), "mine two");
  // falls back to builtins when the list is empty or only whitespace
  assert.equal(core.pickAffirmation([], built, 1), "b");
  assert.equal(core.pickAffirmation(["  ", ""], built, 2), "c");
  // stable for a given day, and wraps (including negatives)
  assert.equal(core.pickAffirmation(own, built, 4), core.pickAffirmation(own, built, 4));
  assert.equal(core.pickAffirmation(built, [], 3), "a");     // 3 % 3 = 0
  assert.equal(core.pickAffirmation(built, [], -1), "c");
  // a single line always wins
  assert.equal(core.pickAffirmation(["only"], built, 99), "only");
  // nothing anywhere → empty string, never undefined
  assert.equal(core.pickAffirmation([], [], 5), "");
});

test("zeroStreak counts trailing zeros", () => {
  assert.equal(core.zeroStreak([3, 1, 0, 0, 0]), 3);
  assert.equal(core.zeroStreak([0, 0, 1]), 0);
  assert.equal(core.zeroStreak([]), 0);
  assert.equal(core.zeroStreak([0]), 1);
});

test("resetPatterns links slips to lower-mood days when given moods", () => {
  const mk = (y, mo, d) => new Date(y, mo, d, 12).toISOString();
  const item = { log: [ { at: mk(2026, 5, 3), ran: 1 }, { at: mk(2026, 5, 10), ran: 1 } ] };
  const moods = {
    "2026-06-03": 1, "2026-06-10": 2,           // slip days: low
    "2026-06-04": 4, "2026-06-05": 5, "2026-06-06": 4, "2026-06-07": 4, // other days: good
  };
  assert.equal(core.resetPatterns(item, moods).moodGap, "low");
});
