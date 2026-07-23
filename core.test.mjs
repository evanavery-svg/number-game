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

test("rollingAverage smooths over a trailing window, ignoring gaps", () => {
  assert.deepEqual(core.rollingAverage([1, 2, 3], 3), [1, 1.5, 2]);
  // nulls are skipped; window looks back 3
  assert.deepEqual(core.rollingAverage([2, null, 4], 3), [2, 2, 3]);
  // all-null window yields null
  assert.deepEqual(core.rollingAverage([null, null], 2), [null, null]);
  // window of 2 on a longer series
  assert.deepEqual(core.rollingAverage([4, 6, 8, 10], 2), [4, 5, 7, 9]);
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
