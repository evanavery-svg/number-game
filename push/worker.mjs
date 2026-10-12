// Push server for the tracker — a single Cloudflare Worker, no dependencies,
// so it can be pasted straight into the Cloudflare dashboard.
//
// What it knows: each phone's push address, its time zone, and the times you
// asked to be notified (evening check-in, bedtime). What it doesn't: your
// counts, your notes, anything you've logged. A push carries only which
// notification is due; the phone works out what to say from its own data.
//
// Needs: a KV namespace bound as SUBS, and a cron trigger every 5 minutes.
// Optional: VAPID_SUBJECT (a mailto: or https: contact Apple and Google can
// reach; a default is used otherwise).
//
// Web Push is done by hand with WebCrypto: VAPID (RFC 8292) signs who's
// sending, aes128gcm (RFC 8291) encrypts the payload to the phone's key.

const enc = new TextEncoder();
const KINDS = ["evening", "bed"];
const WINDOW_MIN = 30;               // a cron that runs late still catches the slot
const RESEND_AFTER_MS = 20 * 3600e3; // once a day per kind
// Only real push services, so this can't be used to post to arbitrary URLs.
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.googleapis\.com$/,
  /\.mozilla\.com$/, /\.notify\.windows\.com$/];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });

// ---- bytes ----
function b64uEnc(buf) {
  let s = "";
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDec(str) {
  const s = atob(String(str).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(str).length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function concat(...parts) {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  arrs.forEach((a) => { out.set(a, o); o += a.length; });
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ---- VAPID: made on first use and kept, so there's nothing to paste ----
async function getVapid(env) {
  const have = await env.SUBS.get("vapid", "json");
  if (have) return have;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const v = {
    publicKey: b64uEnc(await crypto.subtle.exportKey("raw", kp.publicKey)),
    privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey),
  };
  await env.SUBS.put("vapid", JSON.stringify(v));
  return v;
}
async function vapidAuth(endpoint, vapid, subject) {
  const head = b64uEnc(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64uEnc(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64uEnc(sig)}, k=${vapid.publicKey}`;
}

// ---- RFC 8291 aes128gcm ----
async function encryptPayload(keys, payload) {
  const uaPub = b64uDec(keys.p256dh);
  const auth = b64uDec(keys.auth);
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPub, asPub, [1]));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), [1]))).slice(0, 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(enc.encode(payload), [2])));
  const header = new Uint8Array(21 + asPub.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  header.set(asPub, 21);
  return concat(header, ct);
}

async function sendPush(sub, message, env, vapid) {
  const body = await encryptPayload(sub.keys, JSON.stringify(message));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid, env.VAPID_SUBJECT || "https://github.com/evanavery-svg/habit-tracker"),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

// ---- subscriptions ----
async function idFor(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(endpoint)));
  return [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function validSub(s) {
  if (!s || typeof s.endpoint !== "string" || !s.keys || !s.keys.p256dh || !s.keys.auth) return false;
  let u;
  try { u = new URL(s.endpoint); } catch (e) { return false; }
  return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
}
function validTz(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
}
const validTime = (t) => t == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

// Minutes past midnight in the subscriber's own time zone.
function localMinutes(tz, now) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return (get("hour") % 24) * 60 + get("minute");
}
// Is a slot at "HH:MM" due now? Within the window after it, not sent today.
function due(time, tz, now, lastSent) {
  if (!time) return false;
  const [h, m] = time.split(":").map(Number);
  const since = (localMinutes(tz, now) - (h * 60 + m) + 1440) % 1440;
  return since < WINDOW_MIN && (!lastSent || now.getTime() - lastSent > RESEND_AFTER_MS);
}

async function runSchedule(env, now) {
  const vapid = await getVapid(env);
  let cursor;
  const report = [];
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const rec = await env.SUBS.get(k.name, "json");
      if (!rec) continue;
      let changed = false, gone = false;
      for (const kind of KINDS) {
        if (gone || !due(rec.times && rec.times[kind], rec.tz, now, rec.sent && rec.sent[kind])) continue;
        let status = 0;
        try { status = await sendPush(rec.sub, { kind }, env, vapid); } catch (e) { status = 0; }
        report.push({ id: k.name, kind, status });
        if (status === 404 || status === 410) { gone = true; break; }   // the phone unsubscribed
        if (status >= 200 && status < 300) { rec.sent = rec.sent || {}; rec.sent[kind] = now.getTime(); changed = true; }
      }
      if (gone) await env.SUBS.delete(k.name);
      else if (changed) await env.SUBS.put(k.name, JSON.stringify(rec));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return report;
}

async function readJson(req) {
  try { return await req.json(); } catch (e) { return null; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method === "GET" && url.pathname === "/vapid") return json({ publicKey: (await getVapid(env)).publicKey });
    if (req.method === "POST" && url.pathname === "/subscribe") {
      const b = await readJson(req);
      if (!b || !validSub(b.subscription)) return json({ error: "not a push subscription" }, 400);
      if (!validTz(b.tz)) return json({ error: "bad time zone" }, 400);
      const times = {};
      for (const kind of KINDS) {
        const t = b.times ? b.times[kind] : null;
        if (!validTime(t)) return json({ error: `bad ${kind} time` }, 400);
        times[kind] = t || null;
      }
      const key = "sub:" + (await idFor(b.subscription.endpoint));
      const prev = await env.SUBS.get(key, "json");
      const sub = { endpoint: b.subscription.endpoint, keys: { p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth } };
      await env.SUBS.put(key, JSON.stringify({ sub, tz: b.tz, times, sent: (prev && prev.sent) || {} }));
      return json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/unsubscribe") {
      const b = await readJson(req);
      if (!b || typeof b.endpoint !== "string") return json({ error: "endpoint needed" }, 400);
      await env.SUBS.delete("sub:" + (await idFor(b.endpoint)));
      return json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/test") {
      const b = await readJson(req);
      if (!b || typeof b.endpoint !== "string") return json({ error: "endpoint needed" }, 400);
      const rec = await env.SUBS.get("sub:" + (await idFor(b.endpoint)), "json");
      if (!rec) return json({ error: "not subscribed" }, 404);
      const status = await sendPush(rec.sub, { kind: "test" }, env, await getVapid(env));
      return json({ ok: status >= 200 && status < 300, status });
    }
    if (req.method === "GET" && url.pathname === "/") return new Response("Push server is running.", { headers: CORS });
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(env, new Date(event.scheduledTime || Date.now())));
  },
};

// for the tests
export { encryptPayload, vapidAuth, getVapid, runSchedule, due, localMinutes, validSub, b64uEnc, b64uDec };
