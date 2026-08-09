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

test("planFor prefers an exact tag, then a nearby hour", () => {
  const plans = [
    { id: 1, tag: "a", action: "step outside" },
    { id: 2, hour: 21, action: "phone in the kitchen" },
  ];
  assert.equal(core.planFor(plans, "a", 9).id, 1);          // tag wins
  assert.equal(core.planFor(plans, "zz", 21).id, 2);        // no tag match → hour
  assert.equal(core.planFor(plans, "zz", 20).id, 2);        // within an hour
  assert.equal(core.planFor(plans, "zz", 18), null);        // too far off
  assert.equal(core.planFor(plans, null, null), null);
  assert.equal(core.planFor([], "a", 9), null);
  assert.equal(core.planFor(null, "a", 9), null);
  // a plan with no action written yet is not a plan
  assert.equal(core.planFor([{ tag: "a", action: "  " }], "a", 9), null);
});

test("upsertDay corrects, inserts in order, and marks backfills", () => {
  const hist = [
    { date: "2026-07-01", total: 3, taps: 6 },
    { date: "2026-07-03", total: 1, taps: 2 },
  ];
  // correcting an existing day keeps its other fields and is not a backfill
  const fixed = core.upsertDay(hist, "2026-07-01", 5);
  assert.equal(fixed[0].total, 5);
  assert.equal(fixed[0].taps, 6);
  assert.equal(fixed[0].backfilled, undefined);
  // a missing day is inserted in date order and flagged
  const filled = core.upsertDay(hist, "2026-07-02", 2);
  assert.deepEqual(filled.map((d) => d.date), ["2026-07-01", "2026-07-02", "2026-07-03"]);
  assert.equal(filled[1].backfilled, true);
  assert.equal(filled[1].total, 2);
  // a label is required — the day editor titles itself with it
  assert.equal(filled[1].label, core.dayLabel(new Date(2026, 6, 2, 12)));
  // null removes the day
  assert.deepEqual(core.upsertDay(hist, "2026-07-03", null).map((d) => d.date), ["2026-07-01"]);
  // totals are rounded like every other number in the app
  assert.equal(core.upsertDay([], "2026-07-01", 0.1 + 0.2)[0].total, 0.3);
  // the input is never mutated
  assert.equal(hist[0].total, 3);
  assert.equal(hist.length, 2);
  // empty history is fine
  assert.equal(core.upsertDay([], "2026-07-01", 1).length, 1);
});

test("isFutureDate / futureDays catch days that cannot exist yet", () => {
  assert.equal(core.isFutureDate("2026-08-31", "2026-08-08"), true);
  assert.equal(core.isFutureDate("2026-08-08", "2026-08-08"), false);   // today is fine
  assert.equal(core.isFutureDate("2026-08-07", "2026-08-08"), false);
  // year and month boundaries compare correctly as strings
  assert.equal(core.isFutureDate("2027-01-01", "2026-12-31"), true);
  assert.equal(core.isFutureDate("2026-09-01", "2026-10-01"), false);
  assert.equal(core.isFutureDate(null, "2026-08-08"), false);
  assert.equal(core.isFutureDate("2026-08-31", null), false);

  const hist = [{ date: "2026-08-01" }, { date: "2026-08-31" }, { date: "2026-12-25" }];
  assert.deepEqual(core.futureDays(hist, "2026-08-08").map((d) => d.date), ["2026-08-31", "2026-12-25"]);
  assert.deepEqual(core.futureDays([], "2026-08-08"), []);
  assert.deepEqual(core.futureDays(null, "2026-08-08"), []);
});

test("dateTaken spots a clash without counting the entry against itself", () => {
  const a = { date: "2026-08-01", total: 3 }, b = { date: "2026-08-02", total: 5 };
  const hist = [a, b];
  assert.equal(core.dateTaken(hist, "2026-08-02", a), true);    // moving a onto b's day
  assert.equal(core.dateTaken(hist, "2026-08-01", a), false);   // a keeping its own day
  assert.equal(core.dateTaken(hist, "2026-08-03", a), false);   // a free day
  assert.equal(core.dateTaken(hist, "2026-08-02", undefined), true);
  assert.equal(core.dateTaken([], "2026-08-02", a), false);
  assert.equal(core.dateTaken(null, "2026-08-02", a), false);
});

test("calendarCells lays out a month and tags each day", () => {
  // July 2026: the 1st is a Wednesday, so 3 leading blanks, 31 days
  const totals = { "2026-07-02": 2, "2026-07-03": 9 };
  const cells = core.calendarCells(2026, 6, totals, "2026-07-02", 4, true);
  assert.equal(cells.filter((c) => c.blank).length, 3);
  assert.equal(cells.filter((c) => !c.blank).length, 31);
  const byDs = (ds) => cells.find((c) => c.ds === ds);
  assert.equal(byDs("2026-07-01").state, "empty");
  assert.equal(byDs("2026-07-02").state, "under");     // 2 <= goal 4
  assert.equal(byDs("2026-07-03").state, "over");      // 9 > goal 4
  assert.equal(byDs("2026-07-02").isToday, true);
  assert.equal(byDs("2026-07-03").isToday, false);
  assert.equal(byDs("2026-07-02").total, 2);
  assert.equal(byDs("2026-07-01").total, null);
  // with no goal set, a logged day is just "logged"
  assert.equal(core.calendarCells(2026, 6, totals, "x", 0, false).find((c) => c.ds === "2026-07-03").state, "logged");
  // a total of 0 is a real total, not a missing day
  assert.equal(core.calendarCells(2026, 6, { "2026-07-05": 0 }, "x", 4, true).find((c) => c.ds === "2026-07-05").state, "under");
  // the session day is what counts as today — the regression from v9.5
  assert.equal(core.calendarCells(2026, 6, {}, "2026-07-08", 4, true).filter((c) => c.isToday).length, 1);
  // February in a leap year
  assert.equal(core.calendarCells(2028, 1, {}, "x", 4, true).filter((c) => !c.blank).length, 29);
});

test("sinceCardModel is the one source for the Time Since numbers", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  const m = core.sinceCardModel({ start: new Date(now - 2 * core.DAY).getTime() }, now);
  assert.equal(m.elapsed, 2 * core.DAY);
  assert.deepEqual(m.big, { n: 2, u: "days" });
  assert.equal(m.parts.d, 2);
  assert.equal(m.next.label, "3 days");
  assert.equal(m.remaining, core.DAY);
  assert.ok(m.frac > 0 && m.frac < 1);
  // a start in the future can't produce a negative run
  assert.equal(core.sinceCardModel({ start: new Date(now + core.DAY).getTime() }, now).elapsed, 0);
  // frac stays inside 0..1 at a milestone boundary
  const at = core.sinceCardModel({ start: new Date(now - core.DAY).getTime() }, now);
  assert.ok(at.frac >= 0 && at.frac <= 1);
});

test("dayStamp refuses a future date and always labels the day", () => {
  const now = new Date(2026, 6, 30, 21, 15, 30);   // 30 Jul 2026, 9:15:30pm
  // an explicit past date keeps the current time of day
  const past = core.dayStamp("2026-07-28", now);
  assert.equal(past.date, "2026-07-28");
  assert.equal(new Date(past.endedAt).getHours(), 21);
  assert.equal(past.label, core.dayLabel(new Date(2026, 6, 28)));
  // a future date is refused and falls back to now — the v9.4 regression
  const future = core.dayStamp("2026-08-31", now);
  assert.equal(future.date, "2026-07-30");
  // today itself is fine
  assert.equal(core.dayStamp("2026-07-30", now).date, "2026-07-30");
  // no date given, or a malformed one, falls back to now
  assert.equal(core.dayStamp(null, now).date, "2026-07-30");
  assert.equal(core.dayStamp("", now).date, "2026-07-30");
  assert.equal(core.dayStamp("nonsense", now).date, "2026-07-30");
  // a label is always present — the v9.3 regression
  ["2026-07-28", null, "2026-08-31"].forEach((d) => assert.ok(core.dayStamp(d, now).label.length > 0));
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
