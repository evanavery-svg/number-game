// Tests for the push server. The phone's side is played here: decrypt what
// the server sends (RFC 8291) and check its VAPID signature (RFC 8292), so a
// mistake in the hand-written crypto fails here rather than silently on a phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { encryptPayload, vapidAuth, getVapid, runSchedule, due, b64uEnc, b64uDec } from "./worker.mjs";

const subtle = crypto.subtle;
const enc = new TextEncoder();
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach((x) => { o.set(x, i); i += x.length; }); return o; };
async function hmac(key, data) {
  const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data));
}

function memKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}

// A phone: its own push keys, and the receiving half of aes128gcm.
async function makePhone() {
  const kp = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    sub: { endpoint: "https://web.push.apple.com/QQ-test-token", keys: { p256dh: b64uEnc(pub), auth: b64uEnc(auth) } },
    async decrypt(body) {
      const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
      const asKey = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, kp.privateKey, 256));
      const prkKey = await hmac(auth, shared);
      const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), pub, asPub, new Uint8Array([1])));
      const prk = await hmac(salt, ikm);
      const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
      const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
      const aes = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, ct));
      assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
      return new TextDecoder().decode(plain.slice(0, -1));
    },
  };
}

test("a payload encrypted for a phone decrypts on that phone", async () => {
  const phone = await makePhone();
  const body = await encryptPayload(phone.sub.keys, JSON.stringify({ kind: "evening" }));
  assert.equal(new DataView(body.buffer).getUint32(16), 4096, "record size");
  assert.deepEqual(JSON.parse(await phone.decrypt(body)), { kind: "evening" });
});

test("the VAPID header is a valid ES256 signature for the push service", async () => {
  const env = { SUBS: memKV() };
  const v = await getVapid(env);
  assert.equal((await getVapid(env)).publicKey, v.publicKey, "made once and kept");
  const h = await vapidAuth("https://web.push.apple.com/abc", v, "mailto:a@b.c");
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h);
  assert.equal(k, v.publicKey);
  const [head, body, sig] = jwt.split(".");
  const claims = JSON.parse(new TextDecoder().decode(b64uDec(body)));
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, "mailto:a@b.c");
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
  const pub = await subtle.importKey("raw", b64uDec(v.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64uDec(sig), enc.encode(`${head}.${body}`)));
});

const call = (env, method, path, body) => worker.fetch(new Request("https://w.example" + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }), env);

test("subscribe checks what it's given, and only accepts real push services", async () => {
  const env = { SUBS: memKV() };
  const phone = await makePhone();
  assert.equal((await call(env, "POST", "/subscribe", { subscription: phone.sub, tz: "America/New_York", times: { evening: "21:00", bed: "23:30" } })).status, 200);
  assert.equal((await call(env, "POST", "/subscribe", { subscription: { ...phone.sub, endpoint: "https://evil.example/x" }, tz: "UTC", times: {} })).status, 400);
  assert.equal((await call(env, "POST", "/subscribe", { subscription: phone.sub, tz: "Not/AZone", times: {} })).status, 400);
  assert.equal((await call(env, "POST", "/subscribe", { subscription: phone.sub, tz: "UTC", times: { evening: "25:00" } })).status, 400);
  const saved = [...env.SUBS.m.entries()].filter(([k]) => k.startsWith("sub:"));
  assert.equal(saved.length, 1);
  const rec = JSON.parse(saved[0][1]);
  assert.deepEqual(rec.times, { evening: "21:00", bed: "23:30" });
  assert.deepEqual(Object.keys(rec).sort(), ["sent", "sub", "times", "tz"], "nothing beyond what it needs");
  assert.equal((await call(env, "POST", "/unsubscribe", { endpoint: phone.sub.endpoint })).status, 200);
  assert.equal([...env.SUBS.m.keys()].filter((k) => k.startsWith("sub:")).length, 0);
  const res = await call(env, "OPTIONS", "/subscribe");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});

test("due: inside the half hour after the slot, once a day, in the phone's own time zone", () => {
  const at = (iso) => new Date(iso);
  // 21:00 in New York is 01:00 UTC the next day (EDT)
  assert.equal(due("21:00", "America/New_York", at("2026-10-13T01:04:00Z")), true);
  assert.equal(due("21:00", "America/New_York", at("2026-10-13T00:59:00Z")), false);
  assert.equal(due("21:00", "America/New_York", at("2026-10-13T01:31:00Z")), false);
  assert.equal(due("21:00", "America/New_York", at("2026-10-13T01:04:00Z"), Date.parse("2026-10-13T01:00:00Z")), false, "already sent");
  assert.equal(due("21:00", "America/New_York", at("2026-10-14T01:04:00Z"), Date.parse("2026-10-13T01:00:00Z")), true, "next day");
  assert.equal(due("23:50", "UTC", at("2026-10-13T00:05:00Z")), true, "across midnight");
  assert.equal(due(null, "UTC", at("2026-10-13T00:05:00Z")), false);
});

test("the schedule sends what's due, once, and forgets phones that unsubscribed", async () => {
  const env = { SUBS: memKV() };
  const a = await makePhone(), b = await makePhone();
  b.sub.endpoint = "https://fcm.googleapis.com/fcm/send/gone";
  await call(env, "POST", "/subscribe", { subscription: a.sub, tz: "UTC", times: { evening: "21:00", bed: "23:00" } });
  await call(env, "POST", "/subscribe", { subscription: b.sub, tz: "UTC", times: { evening: "21:00" } });
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init });
    return new Response(null, { status: String(url).includes("gone") ? 410 : 201 });
  };
  try {
    await runSchedule(env, new Date("2026-10-12T21:02:00Z"));
    assert.equal(sent.length, 2, "both phones' evening slot");
    const toA = sent.find((s) => s.url === a.sub.endpoint);
    assert.equal(toA.init.headers["Content-Encoding"], "aes128gcm");
    assert.match(toA.init.headers.Authorization, /^vapid t=.+, k=.+$/);
    assert.deepEqual(JSON.parse(await a.decrypt(new Uint8Array(toA.init.body))), { kind: "evening" });
    assert.equal([...env.SUBS.m.keys()].filter((k) => k.startsWith("sub:")).length, 1, "the gone one is removed");
    sent.length = 0;
    await runSchedule(env, new Date("2026-10-12T21:07:00Z"));
    assert.equal(sent.length, 0, "not twice");
    await runSchedule(env, new Date("2026-10-12T23:01:00Z"));
    assert.equal(sent.length, 1, "bedtime later");
    assert.deepEqual(JSON.parse(await a.decrypt(new Uint8Array(sent[0].init.body))), { kind: "bed" });
  } finally {
    globalThis.fetch = realFetch;
  }
});
