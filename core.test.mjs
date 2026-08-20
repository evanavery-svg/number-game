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

// Build `n` day entries ending today, from a totals array (oldest first).
const days = (totals, now) => totals.map((t, i) => ({
  total: t,
  endedAt: new Date((now || Date.now()) - (totals.length - 1 - i) * core.DAY).toISOString(),
}));

test("levelMetOn picks a rung the given share of days already clears", () => {
  const totals = [0, 0, 1, 1, 1, 2, 2, 2, 3, 4];
  // 70% of 10 days -> the 7th smallest value = 2
  assert.equal(core.levelMetOn(totals, 0.7, 0.5), 2);
  // gentler pace -> a higher, easier rung
  assert.ok(core.levelMetOn(totals, 0.85, 0.5) >= core.levelMetOn(totals, 0.7, 0.5));
  // more ambitious -> lower
  assert.ok(core.levelMetOn(totals, 0.55, 0.5) <= core.levelMetOn(totals, 0.7, 0.5));
  // snapped up to the tap step, so the "met on pct of days" claim stays true
  assert.equal(core.levelMetOn([0.3, 0.3, 0.3, 0.3], 0.7, 0.5), 0.5);
  assert.equal(core.levelMetOn([1.2, 1.2, 1.2], 0.7, 1), 2);
  assert.equal(core.levelMetOn([], 0.7, 0.5), null);
  // an all-zero history proposes zero
  assert.equal(core.levelMetOn([0, 0, 0, 0], 0.7, 0.5), 0);
});

test("trendFlat refuses a window that's getting worse", () => {
  assert.equal(core.trendFlat([1, 1, 1, 1, 1, 1]), true);
  assert.equal(core.trendFlat([3, 3, 3, 1, 1, 1]), true);        // improving
  assert.equal(core.trendFlat([1, 1, 1, 3, 3, 3]), false);       // deteriorating
  assert.equal(core.trendFlat([0, 0, 0, 0, 0, 0]), true);
  assert.equal(core.trendFlat([0, 0, 0, 1, 1, 1]), false);       // off zero is still worse
  assert.equal(core.trendFlat([1, 1]), false);                   // too short to judge
});

test("medianRungDays paces from how long past rungs held", () => {
  const at = (d) => new Date(2026, 0, d).toISOString();
  assert.equal(core.medianRungDays([{ at: at(1) }, { at: at(21) }, { at: at(41) }]), 20);
  assert.equal(core.medianRungDays([{ at: at(1) }]), 21);        // not enough history
  assert.equal(core.medianRungDays([]), 21);
  assert.equal(core.medianRungDays(null), 21);
  // clamped both ways so a freak gap can't set the pace
  assert.equal(core.medianRungDays([{ at: at(1) }, { at: at(3) }]), 14);
  assert.equal(core.medianRungDays([{ at: new Date(2026, 0, 1).toISOString() }, { at: new Date(2026, 6, 1).toISOString() }]), 60);
});

test("suggestTaper only fires when a drop is genuinely earned", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  const opts = (o) => Object.assign({ now, pct: 0.7, roundTo: 0.5, days: 30 }, o);
  // 20 steady days well under a goal of 4 -> a real suggestion
  const steady = days(Array(20).fill(0).map((_, i) => (i % 4 === 0 ? 2 : 1)), now);
  const s = core.suggestTaper(steady, 4, opts());
  assert.ok(s, "expected a suggestion");
  assert.ok(s.next < 4 && s.next >= 0);
  assert.equal(s.drop, core.round2(4 - s.next));
  assert.equal(s.n, 20);
  assert.equal(s.metDays, steady.filter((d) => d.total <= s.next).length);
  assert.ok(s.pct >= 0.7);

  // too little data
  assert.equal(core.suggestTaper(days([1, 1, 1, 1, 1], now), 4, opts()), null);
  // not holding the current limit
  assert.equal(core.suggestTaper(days(Array(20).fill(9), now), 4, opts()), null);
  // deteriorating, even though the window still averages under the goal
  assert.equal(core.suggestTaper(days([0,0,0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,2,2], now), 4, opts()), null);
  // no honest room below the goal — must be null, never a zero drop
  assert.equal(core.suggestTaper(days(Array(20).fill(1), now), 1, opts()), null);
  // already at zero
  assert.equal(core.suggestTaper(steady, 0, opts()), null);
  // an all-zero history proposes zero itself
  const z = core.suggestTaper(days(Array(20).fill(0), now), 1, opts());
  assert.equal(z && z.next, 0);
});

test("suggestTaper never fires on someone who is struggling", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  // every shape of history that backslideReady flags must produce no suggestion
  [
    Array(20).fill(9),
    [1,1,1,1,1,1,1,1,1,1,8,8,8,8,8,8,8,8,8,8],
    Array(20).fill(0).map((_, i) => (i % 2 ? 7 : 6)),
  ].forEach((totals, i) => {
    const entries = days(totals, now);
    const perf = core.goalPerformance(entries, 4, 30, now);
    if (!core.backslideReady(perf, 4)) return;   // only assert where it applies
    assert.equal(core.suggestTaper(entries, 4, { now, pct: 0.7, roundTo: 0.5, days: 30 }), null,
      `case ${i} suggested a drop to someone who is over their limit`);
  });
});

test("suggestTaper walks a ladder down to zero without oscillating", () => {
  // replay 120 days, applying each accepted drop, and watch the ladder
  const now = new Date(2026, 6, 30, 12).getTime();
  let goal = 6;
  const seen = [goal];
  const entries = [];
  for (let d = 0; d < 120; d++) {
    // someone genuinely improving: their daily total drifts down over time
    const base = Math.max(0, 4 - Math.floor(d / 30));
    entries.push({ total: d % 5 === 0 ? base : Math.max(0, base - 1),
      endedAt: new Date(now - (120 - d) * core.DAY).toISOString() });
    const s = core.suggestTaper(entries, goal, { now: now - (120 - d) * core.DAY, pct: 0.7, roundTo: 0.5, days: 30 });
    if (s) { goal = s.next; seen.push(goal); }
  }
  // monotonically down, never negative, and it settles rather than flapping
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] < seen[i - 1], `ladder went up: ${seen}`);
  assert.ok(seen.every((g) => g >= 0), `negative goal: ${seen}`);
  assert.ok(goal < 6, `ladder never moved: ${seen}`);
});

// day entries ending at `now`, one per day, oldest first
const hist = (totals, now, extra) => totals.map((t, i) => {
  const d = new Date(now - (totals.length - 1 - i) * core.DAY);
  return Object.assign({
    total: t,
    date: core.sessionDate(d),
    endedAt: d.toISOString(),
  }, extra ? extra(i, t, d) : null);
});

test("dayRisk stays quiet unless at least two signals line up", () => {
  // a Saturday at noon, so "today" has a stable weekday
  const now = new Date(2026, 7, 1, 12).getTime();
  assert.equal(new Date(now).getDay(), 6);

  // 28 calm days, everything under a goal of 4 → nothing to say
  const calm = hist(Array(28).fill(1), now);
  assert.equal(core.dayRisk(calm, {}, 4, now), null);

  // too little data, even if it looks bad
  assert.equal(core.dayRisk(hist(Array(8).fill(9), now), {}, 4, now), null);

  // all zeros — nothing to warn about, and no divide-by-zero
  assert.equal(core.dayRisk(hist(Array(28).fill(0), now), {}, 4, now), null);

  // one signal only (Saturdays run high) → still null
  const satHigh = hist(Array(28).fill(0).map((_, i) => {
    const d = new Date(now - (27 - i) * core.DAY);
    return d.getDay() === 6 ? 6 : 1;
  }), now);
  const one = core.dayRisk(satHigh, {}, 4, now);
  assert.equal(one, null, "a single signal should not produce a warning");

  // two signals: the weekday effect plus a low mood on a history where low-mood
  // days really do run higher
  const withMood = hist(Array(28).fill(0).map((_, i) => {
    const d = new Date(now - (27 - i) * core.DAY);
    return d.getDay() === 6 ? 6 : 1;
  }), now, (i) => ({ mood: i % 3 === 0 ? 1 : 5, total: i % 3 === 0 ? 7 : 1 }));
  const moods = { [core.sessionDate(new Date(now))]: 1 };
  const two = core.dayRisk(withMood, moods, 4, now);
  assert.ok(two, "expected a reading when two signals line up");
  assert.equal(two.level, "elevated");
  assert.ok(two.reasons.length >= 2);
  assert.equal(two.basis.days, 28);
});

test("dayRisk never warns on a day that is going well", () => {
  const now = new Date(2026, 7, 1, 12).getTime();
  // flat, all under goal, good mood today and historically
  const good = hist(Array(30).fill(1), now, () => ({ mood: 5 }));
  const moods = { [core.sessionDate(new Date(now))]: 5 };
  assert.equal(core.dayRisk(good, moods, 4, now), null);
  // improving, and still nothing alarming to say
  const improving = hist([4,4,4,4,4,3,3,3,3,3,2,2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,1], now, () => ({ mood: 4 }));
  assert.equal(core.dayRisk(improving, moods, 4, now), null);
});

test("periodStats measures a bounded window", () => {
  const now = new Date(2026, 7, 1, 12).getTime();
  const h = hist([1, 5, 1, 1, 5, 1], now);            // 6 days ending today
  const s = core.periodStats(h, now - 6 * core.DAY, now + 1, 4);
  assert.equal(s.n, 6);
  assert.equal(s.total, 14);
  assert.equal(core.round2(s.avg), 2.33);
  assert.equal(s.under, 4);                            // the four 1s
  assert.equal(s.bestStreak, 2);                       // 1,1 in the middle
  // an empty window is zeroed, not NaN
  const empty = core.periodStats(h, now - 100 * core.DAY, now - 90 * core.DAY, 4);
  assert.deepEqual(empty, { n: 0, avg: 0, under: 0, underPct: 0, total: 0, bestStreak: 0 });
  // the upper bound is exclusive, so windows can't double-count a boundary day
  const a = core.periodStats(h, now - 6 * core.DAY, now - 3 * core.DAY, 4);
  const b = core.periodStats(h, now - 3 * core.DAY, now + 1, 4);
  assert.equal(a.n + b.n, 6);
});

test("comparePeriods puts one stretch beside the one before it", () => {
  const now = new Date(2026, 7, 1, 12).getTime();
  // 14 days: the older week ran over a goal of 4, the recent week well under
  const improving = hist([6,6,6,6,6,6,6, 1,1,1,1,1,1,1], now);
  const c = core.comparePeriods(improving, 7, 4, now);
  assert.ok(c);
  assert.equal(c.current.avg, 1);
  assert.equal(c.previous.avg, 6);
  assert.equal(c.delta.avg, -5);
  assert.equal(c.current.under, 7);
  assert.equal(c.previous.under, 0);
  assert.equal(c.delta.under, 7);                      // seven more days under goal
  assert.equal(c.delta.bestStreak, 7);
  // the reverse reads as a regression
  const worse = core.comparePeriods(hist([1,1,1,1,1,1,1, 6,6,6,6,6,6,6], now), 7, 4, now);
  assert.equal(worse.delta.avg, 5);
  assert.equal(worse.delta.under, -7);
  // flat is a legitimate answer, not a null
  const flat = core.comparePeriods(hist(Array(14).fill(2), now), 7, 4, now);
  assert.equal(flat.delta.avg, 0);
  // not enough previous data to be honest
  assert.equal(core.comparePeriods(hist([1,1,1,1], now), 7, 4, now), null);
  // "all time" has nothing to sit beside
  assert.equal(core.comparePeriods(improving, Infinity, 4, now), null);
});

test("milestoneToday marks only the days worth marking", () => {
  const now = new Date(2026, 7, 10, 12).getTime();
  const zeros = (n) => Array(n).fill(0);

  // exactly at a zero-day milestone
  [7, 30, 100, 365].forEach((w) => {
    const m = core.milestoneToday(zeros(w), [], now);
    assert.ok(m, `streak of ${w} should be a milestone`);
    assert.equal(m.kind, "zero");
    assert.ok(m.label.includes(String(w)));
  });
  // a day past it is ordinary again — this is what keeps it meaningful
  assert.equal(core.milestoneToday(zeros(8), [], now), null);
  assert.equal(core.milestoneToday(zeros(31), [], now), null);
  // and an ordinary run of good days is not a milestone
  assert.equal(core.milestoneToday([1, 1, 1, 0, 0, 0], [], now), null);
  assert.equal(core.milestoneToday([], [], now), null);
  assert.equal(core.milestoneToday(null, null, now), null);

  // a Time Since run that crossed a milestone today
  const crossedToday = { name: "Clear", start: new Date(now - 7 * core.DAY - 3600e3).getTime() };
  const t = core.milestoneToday([], [crossedToday], now);
  assert.ok(t, "a run crossing 1 week today should be a milestone");
  assert.equal(t.kind, "since");
  assert.ok(t.label.includes("1 week"));

  // the same milestone crossed yesterday is not today's news
  const crossedYesterday = { name: "Clear", start: new Date(now - 7 * core.DAY - 30 * 3600e3).getTime() };
  assert.equal(core.milestoneToday([], [crossedYesterday], now), null);

  // a run too young to have reached anything
  assert.equal(core.milestoneToday([], [{ name: "x", start: now - 60e3 }], now), null);
  // a start in the future can't crash or qualify
  assert.equal(core.milestoneToday([], [{ name: "x", start: now + core.DAY }], now), null);

  // zero-day wins when both land on the same day
  const both = core.milestoneToday(zeros(30), [crossedToday], now);
  assert.equal(both.kind, "zero");
});

test("variantForDay cycles a pool by day, like the theme rotation", () => {
  const pool = ["a", "b", "c"];
  assert.equal(core.variantForDay(0, pool), "a");
  assert.equal(core.variantForDay(1, pool), "b");
  assert.equal(core.variantForDay(2, pool), "c");
  assert.equal(core.variantForDay(3, pool), "a");        // wraps
  assert.equal(core.variantForDay(-1, pool), "c");       // negative index behaves
  assert.equal(core.variantForDay(0, ["only"]), "only"); // single-entry pool
  assert.equal(core.variantForDay(99, ["only"]), "only");
  assert.equal(core.variantForDay(0, []), null);
  assert.equal(core.variantForDay(0, null), null);
  // stable for a given day, and every entry is reachable across one cycle
  assert.equal(core.variantForDay(7, pool), core.variantForDay(7, pool));
  const seen = new Set([0, 1, 2].map((i) => core.variantForDay(i, pool)));
  assert.equal(seen.size, pool.length);
});

test("dayShape reads the timestamps nothing else has used", () => {
  const at = (h, m) => new Date(2026, 7, 12, h, m || 0).getTime();
  const now = at(23, 30);
  const taps = [at(20, 0), at(21, 0), at(21, 30), at(22, 0)].map((t) => ({ t, amt: 0.5, total: 1 }));
  const s = core.dayShape(taps, now);
  assert.equal(s.n, 4);
  assert.equal(s.firstAt, at(20, 0));
  assert.equal(s.lastAt, at(22, 0));
  assert.equal(s.longestGapMs, core.HR);              // 20:00 → 21:00
  assert.equal(s.sinceLast, 90 * 60e3);               // 22:00 → 23:30
  assert.ok(s.peakHour >= 20 && s.peakHour <= 22);

  // a single tap has no gap to measure and must not produce NaN
  const one = core.dayShape([{ t: at(9, 0) }], at(10, 0));
  assert.equal(one.n, 1);
  assert.equal(one.longestGapMs, 0);
  assert.equal(one.sinceLast, core.HR);
  // an evening that runs past midnight keeps its real clock hours
  const late = core.dayShape([{ t: at(23, 0) }, { t: new Date(2026, 7, 13, 1, 0).getTime() }], new Date(2026, 7, 13, 2, 0).getTime());
  assert.equal(late.n, 2);
  assert.equal(late.longestGapMs, 2 * core.HR);
  // nothing logged
  assert.equal(core.dayShape([], now), null);
  assert.equal(core.dayShape(null, now), null);
  // junk entries are ignored rather than crashing
  assert.equal(core.dayShape([{ t: NaN }, { t: at(9, 0) }], at(10, 0)).n, 1);
});

test("consistency measures steadiness, not level", () => {
  // same average, very different experience
  assert.ok(core.consistency([2, 2, 2, 2, 2]) > core.consistency([0, 6, 0, 6, 0]));
  assert.equal(core.consistency([2, 2, 2, 2, 2]), 100);      // identical days
  assert.equal(core.consistency([0, 0, 0, 0]), 100);         // all zero — no divide by zero
  const swingy = core.consistency([0, 6, 0, 6]);
  assert.ok(swingy >= 0 && swingy <= 100);
  assert.equal(core.consistency([1, 2]), null);              // too little to judge
  assert.equal(core.consistency([]), null);
  assert.equal(core.consistency(null), null);
});

test("lifetime rolls up everything since day one", () => {
  const days = [
    { date: "2026-01-05", total: 3 }, { date: "2026-01-03", total: 0 }, { date: "2026-01-04", total: 2 },
  ];
  const l = core.lifetime(days);
  assert.equal(l.days, 3);
  assert.equal(l.total, 5);
  assert.equal(l.zeroDays, 1);
  assert.equal(l.best, 3);
  assert.equal(l.first, "2026-01-03");                       // earliest, not first in the array
  assert.deepEqual(core.lifetime([]), { days: 0, total: 0, zeroDays: 0, best: 0, first: null });
  assert.equal(core.lifetime(null).days, 0);
});

test("nextTarget points at the nearest thing still ahead", () => {
  // 3 days at zero, chasing 7
  const z = core.nextTarget([1, 0, 0, 0], 0, []);
  assert.equal(z.kind, "zeroWin");
  assert.equal(z.at, 7);
  assert.equal(z.need, 4);
  // one already celebrated is skipped
  assert.equal(core.nextTarget([1, 0, 0, 0], 0, [7]).at, 30);
  // with a goal above zero, chase the best under-goal streak
  const b = core.nextTarget([1, 1, 1, 1, 9, 1, 1], 4, []);
  assert.equal(b.kind, "bestStreak");
  assert.equal(b.at, 4);                                     // the earlier run of four
  assert.equal(b.need, 3);                                   // current run is 2, so 3 more
  // already on the best run — nothing to chase
  assert.equal(core.nextTarget([1, 1, 1], 4, []), null);
  assert.equal(core.nextTarget([], 4, []), null);
});

test("pulseLines phrases the numbers without contradicting them", () => {
  const lines = core.pulseLines({
    compare: { current: { avg: 1.8 }, previous: { avg: 2.4, n: 20 }, delta: { avg: -0.6 } },
    consistency: 80,
    shape: { n: 5, peakHour: 20, sinceLast: 2 * core.HR },
    next: { kind: "zeroWin", need: 4, at: 7 },
    life: { days: 412, zeroDays: 12 },
  });
  assert.ok(lines.some((l) => /Averaging 1.8, down from 2.4/.test(l)));
  assert.ok(lines.some((l) => /Very steady/.test(l)));
  assert.ok(lines.some((l) => /8 PM and 11 PM/.test(l)));
  assert.ok(lines.some((l) => /4 days to 7 at zero/.test(l)));
  assert.ok(lines.some((l) => /412 days logged/.test(l)));
  // the running streak has its own line and must not be duplicated here
  assert.ok(!lines.some((l) => /under goal/.test(l)));
  // nothing to say is an empty list, never a broken sentence
  assert.deepEqual(core.pulseLines({}), []);
  assert.deepEqual(core.pulseLines(null), []);
  // singular/plural
  assert.ok(core.pulseLines({ next: { kind: "zeroWin", need: 1, at: 7 } })[0].includes("1 day to"));
  assert.ok(core.pulseLines({ life: { days: 1, zeroDays: 0 } })[0].includes("1 day logged"));
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
