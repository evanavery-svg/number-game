// The service worker's push handler, run in a sandbox: feed it a push, check
// what it shows. The browser smoke test can't reach this (service workers are
// blocked there), and it's what turns a bare "evening" push into words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadSW(state, seen) {
  const listeners = {};
  const shown = [];
  const ctx = {
    console, Date, Math, JSON, Promise, Set, Map, Intl, Number, String, Object, Array, RegExp, isNaN,
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], match: async () => null },
    clients: { matchAll: async () => [], openWindow: async () => {}, claim: () => {} },
    fetch: async () => ({}),
  };
  ctx.self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: ctx.clients,
    registration: { showNotification: async (title, opts) => { shown.push({ title, body: opts.body, tag: opts.tag }); } },
  };
  ctx.importScripts = (name) => vm.runInContext(readFileSync(new URL("./" + name, import.meta.url), "utf8"), ctx);
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./sw.js", import.meta.url), "utf8"), ctx);
  // the IndexedDB reads, stood in for: the app's mirror, and the worker's own "seen" list
  const store = { seen: seen || [] };
  ctx.readState = async () => state;
  ctx.idbGetKey = async (db, st, key) => (key === "seen" ? store.seen : null);
  ctx.idbPutKey = async (db, st, key, val) => { if (key === "seen") store.seen = val; };
  const push = async (msg) => {
    let done;
    listeners.push({ data: msg == null ? null : { json: () => msg }, waitUntil: (p) => { done = p; } });
    await done;
  };
  return { push, shown, store };
}

const today = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

test("an evening push shows where today stands", async () => {
  const sw = loadSW({ "count.today": 2, "count.actDate": today, "count.goal": 4, "count.goalOn": true, "count.label": "coffees" });
  await sw.push({ kind: "evening" });
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, "Evening check-in");
  assert.match(sw.shown[0].body, /^Today: 2 of 4\b.*Tap to end the day\.$/);
  assert.ok(!/coffee/.test(sw.shown[0].body));
});

test("good news comes with it, once", async () => {
  const state = { "count.goal": 0, "count.goalOn": true, "count.history": Array.from({ length: 8 }, (_, i) => ({ date: `2026-01-0${i + 1}`, total: 0 })) };
  const sw = loadSW(state);
  await sw.push({ kind: "evening" });
  assert.deepEqual(sw.shown.map((n) => n.title), ["Good news", "Evening check-in"]);
  assert.match(sw.shown[0].body, /^A week at zero/);
  assert.deepEqual(sw.store.seen, ["zero:7"]);
  sw.shown.length = 0;
  await sw.push({ kind: "evening" });
  assert.deepEqual(sw.shown.map((n) => n.title), ["Evening check-in"], "not twice");
  const off = loadSW({ ...state, "count.pushNews": false });
  await off.push({ kind: "evening" });
  assert.deepEqual(off.shown.map((n) => n.title), ["Evening check-in"], "switched off");
});

test("bedtime, test and anything else always show something", async () => {
  const sw = loadSW({ "count.bedTime": "22:30" });
  await sw.push({ kind: "bed" });
  await sw.push({ kind: "test" });
  await sw.push(null);
  assert.deepEqual(sw.shown.map((n) => n.title), ["Bedtime", "Push is working", "Tracker"]);
  assert.equal(sw.shown[0].body, "It's 10:30 PM. Time to wind down.");
});

test("a broken mirror still shows a notification (iPhone revokes push that shows nothing)", async () => {
  const sw = loadSW(null);
  await sw.push({ kind: "evening" });
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, "Evening check-in", "the real one, not the fallback");
});
