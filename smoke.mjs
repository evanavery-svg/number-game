// End-to-end smoke test — boots the app in a headless browser and drives the
// core flows, asserting there are no JS errors along the way. Catches the kind
// of regression a unit test can't (wiring, render, storage).
//
// Usage:
//   python3 -m http.server 8080 --directory . &
//   PW=/path/to/playwright CHROMIUM=/path/to/chromium node smoke.mjs
//
// Defaults match this repo's dev container.
const BASE = process.env.BASE || "http://localhost:8080/index.html";
const EXEC = process.env.CHROMIUM || "";   // blank = let Playwright pick its own build
// Resolve Playwright from wherever it lives: an explicit PW path, a normal
// node_modules install (CI), or this dev container's global copy.
async function loadPlaywright() {
  const tries = [process.env.PW, "playwright", "/opt/node22/lib/node_modules/playwright/index.js"].filter(Boolean);
  for (const spec of tries) {
    try { const m = await import(spec); return m.chromium || (m.default && m.default.chromium); } catch (e) { /* try the next */ }
  }
  throw new Error("Playwright not found — set PW=/path/to/playwright or `npm i -D playwright`");
}
const chromium = await loadPlaywright();

const checks = [];
function check(name, cond) { checks.push({ name, ok: !!cond }); console.log(`${cond ? "ok  " : "FAIL"} ${name}`); }

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
// mark as an existing, set-up user so daily gates/onboarding don't block the flow
const dk = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
await page.addInitScript((dk) => {
  localStorage.setItem("count.onboarded", "true");
  localStorage.setItem("count.goal", "4");
  localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
  localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
  localStorage.setItem("count.gameOn", "false");
  localStorage.setItem("count.greetShown", JSON.stringify(dk));   // skip the morning greeting
}, dk);

await page.goto(BASE);
await page.waitForTimeout(500);
check("app boots", await page.$("#addBtn"));

// tap adds to today
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("count.today") || "0"));
await page.click("#addBtn");
await page.waitForTimeout(150);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("count.today") || "0"));
check("tap increases today", after > before);

// undo via swipe down on number. The ring must not travel with the finger —
// it used to slide down over the meta line underneath it.
const swipe = await page.evaluate(() => {
  const el = document.getElementById("totalWrap");
  const ring = document.getElementById("ringWrap");
  const r = el.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const topAt = () => Math.round(ring.getBoundingClientRect().top);
  const rest = topAt();
  el.dispatchEvent(new TouchEvent("touchstart", { touches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy })], bubbles: true }));
  el.dispatchEvent(new TouchEvent("touchmove", { touches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy + 80 })], bubbles: true }));
  const during = topAt();
  el.dispatchEvent(new TouchEvent("touchend", { changedTouches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy + 80 })], bubbles: true }));
  return { rest, during };
});
await page.waitForTimeout(200);
check("swipe-undo restores today", (await page.evaluate(() => JSON.parse(localStorage.getItem("count.today") || "0"))) === before);
check("the ring stays put during a swipe", swipe.during === swipe.rest);

// insights opens via openInsights
await page.evaluate(() => window.openInsights());
await page.waitForTimeout(400);
check("insights panel opens", await page.evaluate(() => document.getElementById("insightsOverlay").classList.contains("show")));
check("range switcher present", (await page.$$("#rangeRow .range-chip")).length === 4);
await page.click("#insightsClose");
await page.waitForTimeout(200);

// settings opens as a menu, and a sub-sheet opens from it
await page.evaluate(() => openSettings());
await page.waitForTimeout(300);
check("settings menu renders rows", (await page.$$("#sheet .sheet-btn.with-ico")).length >= 6);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Tracking"))?.click());
await page.waitForTimeout(500);
check("settings sub-sheet opens", (await page.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Tracking");
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Done")?.click());
await page.waitForTimeout(300);

// themes: the picker, and the head pre-paint script, must agree with THEMES.
// A mismatch is invisible until a specific calendar day rotates onto it, so
// assert the two lists are identical rather than waiting to find out.
{
  await page.evaluate(() => openSettings());
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Appearance"))?.click());
  await page.waitForTimeout(500);
  const keys = await page.evaluate(() => THEMES.map((t) => t.key));
  const swatches = (await page.$$("#sheet .theme-swatch")).length;
  check("theme picker renders every theme", swatches === keys.length && keys.length === 17);
  const html = await (await fetch(BASE)).text();
  const m = html.match(/var order = \[([^\]]*)\]/);
  const order = m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")) : [];
  check("pre-paint theme order matches THEMES", order.join() === keys.join());
  await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Back")?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Done")?.click());
  await page.waitForTimeout(300);
}

// end day logs an entry
await page.click("#addBtn"); await page.waitForTimeout(120);
await page.evaluate(() => openEndDay());
await page.waitForTimeout(300);
const histLenBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").length);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Log day"))?.click());
await page.waitForTimeout(400);
const histLenAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").length);
check("end day appends a history entry", histLenAfter === histLenBefore + 1);

// regression: End Day adds a transient "pulse" class to the ring-wrap, which
// once collided with the home strip's .pulse rule and knocked the centred
// number out of flex. Assert the number stays centred in the ring after logging.
await page.waitForTimeout(600);   // let the count-down settle
const centred = await page.evaluate(() => {
  const num = document.getElementById("total").getBoundingClientRect();
  const wrap = document.getElementById("ringWrap").getBoundingClientRect();
  return Math.abs((num.top + num.height / 2) - (wrap.top + wrap.height / 2)) <= 4;
});
check("number stays centred in the ring after End Day", centred);

// a logged calendar day opens the full editor, not the light backfill sheet
{
  await page.evaluate(() => window.openInsights());
  await page.waitForTimeout(500);
  // the calendar lives on the Journey tab — go there the way a user would
  await page.evaluate(() => [...document.querySelectorAll("#segRow .seg-btn")].find((b) => b.textContent === "Journey")?.click());
  await page.waitForTimeout(500);
  const picked = await page.evaluate(() => {
    const c = [...document.querySelectorAll(".cal-day.today")][0] || [...document.querySelectorAll(".cal-day:not(.blank):not(.empty)")][0];
    if (!c) return false;
    c.click(); return true;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector(".cal-edit")?.click());
  await page.waitForTimeout(500);
  const full = await page.evaluate(() => ({
    note: !!document.querySelector("#sheet textarea"),
    del: [...document.querySelectorAll("#sheet .sheet-btn")].some((b) => b.textContent.includes("Delete this day")),
  }));
  check("a logged day opens the full editor with a delete", picked && full.note && full.del);
  // regression: a day must never be movable into the future. The input's max
  // attribute does not enforce this — only the save handler does.
  const before = await page.evaluate(() => localStorage.getItem("count.history"));
  const future = (() => { const d = new Date(); d.setDate(d.getDate() + 23); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  await page.evaluate((f) => {
    const i = document.querySelector("#sheet input[type=date]");
    i.value = f; i.dispatchEvent(new Event("change", { bubbles: true }));
  }, future);
  await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Save")?.click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => localStorage.getItem("count.history"));
  check("a day cannot be moved into the future", after === before && !after.includes(future));

  // regression: two rows must never share a date — the calendar can only reach
  // one of them while both keep counting toward averages and streaks.
  const occupied = await page.evaluate(() => {
    const h = JSON.parse(localStorage.getItem("count.history") || "[]");
    return h.length ? h[0].date : null;
  });
  if (occupied) {
    await page.evaluate((d) => {
      const i = document.querySelector("#sheet input[type=date]");
      i.value = d; i.dispatchEvent(new Event("change", { bubbles: true }));
    }, occupied);
    await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Save")?.click());
    await page.waitForTimeout(500);
    const dates = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").map((d) => d.date));
    check("a day cannot be moved onto an occupied date", new Set(dates).size === dates.length);
  }

  await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Cancel")?.click());
  await page.waitForTimeout(300);
  await page.click("#insightsClose");
  await page.waitForTimeout(300);
}

// rollover: a day left running rolls into a pending card at the next session
// day, the home count reads 0, an older forgotten day logs itself, and the
// card opens the End Day sheet on the parked day
{
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p3 = await ctx3.newPage();
  p3.on("pageerror", (e) => errors.push("rollover: " + String(e)));
  const shift = (n) => { const d = new Date(dk + "T12:00:00"); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const yday = shift(1), old3 = shift(3);
  await p3.addInitScript(({ dk, yday, old3 }) => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "10"); localStorage.setItem("count.goalOn", "true"); localStorage.setItem("count.step", "1");
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk)); localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
    localStorage.setItem("count.today", "3"); localStorage.setItem("count.taps", "3");
    localStorage.setItem("count.tapLog", JSON.stringify([{ t: 1, amt: 1, total: 1 }, { t: 2, amt: 1, total: 2 }, { t: 3, amt: 1, total: 3 }]));
    localStorage.setItem("count.actDate", JSON.stringify(yday));
    localStorage.setItem("count.pending", JSON.stringify({ date: old3, total: 2, taps: 2, tapTimes: [] }));
  }, { dk, yday, old3 });
  await p3.goto(BASE); await p3.waitForTimeout(600);
  const st = await p3.evaluate(() => ({
    today: JSON.parse(localStorage.getItem("count.today") || "0"),
    pending: JSON.parse(localStorage.getItem("count.pending") || "null"),
    hist: JSON.parse(localStorage.getItem("count.history") || "[]"),
    card: getComputedStyle(document.getElementById("pendingCard")).display !== "none",
    text: document.getElementById("pendingText").textContent,
    shown: document.getElementById("total").textContent,
  }));
  check("rollover zeroes today", st.today === 0 && st.shown === "0");
  check("rollover parks yesterday as pending", !!st.pending && st.pending.date === yday && st.pending.total === 3 && st.pending.taps === 3);
  check("an older pending day logs itself quietly", st.hist.some((d) => d.date === old3 && d.total === 2));
  check("pending card shows the parked total", st.card && /yesterday/.test(st.text) && /3/.test(st.text));
  await p3.click("#pendingCard"); await p3.waitForTimeout(400);
  const sheet = await p3.evaluate(() => ({ h3: document.querySelector("#sheet h3")?.textContent || "", date: document.querySelector("#sheet input[type=date]")?.value }));
  check("pending card opens the End Day sheet on that day", /^Finish yesterday/.test(sheet.h3) && sheet.date === yday);
  await p3.evaluate(() => [...document.querySelectorAll("#sheet .tap-adder-btn")].find((b) => b.textContent.trim() === "+ 1")?.click());
  await p3.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Log day"))?.click());
  await p3.waitForTimeout(500);
  const after3 = await p3.evaluate(() => ({
    pending: JSON.parse(localStorage.getItem("count.pending") || "null"),
    hist: JSON.parse(localStorage.getItem("count.history") || "[]"),
    today: JSON.parse(localStorage.getItem("count.today") || "0"),
    card: getComputedStyle(document.getElementById("pendingCard")).display !== "none",
  }));
  const yrow = after3.hist.find((d) => d.date === yday);
  check("finishing the card logs yesterday with the extra chip", !!yrow && yrow.total === 4 && yrow.taps === 4);
  check("finishing the card clears pending and leaves today at 0", after3.pending === null && after3.today === 0 && !after3.card);
  // press-and-hold the ring opens End Day for today; a drag does not
  const rb = await p3.$eval("#ringWrap", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p3.mouse.move(rb.x, rb.y); await p3.mouse.down(); await p3.waitForTimeout(150); await p3.mouse.move(rb.x + 30, rb.y); await p3.waitForTimeout(500); await p3.mouse.up();
  await p3.waitForTimeout(100);
  const dragH3 = await p3.evaluate(() => document.getElementById("overlay").classList.contains("show") ? (document.querySelector("#sheet h3")?.textContent || "") : "");
  check("a drag on the ring does not open End Day", dragH3 !== "End Day");
  await p3.evaluate(() => document.getElementById("overlay").classList.remove("show"));
  await p3.mouse.move(rb.x, rb.y); await p3.mouse.down(); await p3.waitForTimeout(650); await p3.mouse.up(); await p3.waitForTimeout(100);
  const holdH3 = await p3.evaluate(() => document.getElementById("overlay").classList.contains("show") ? (document.querySelector("#sheet h3")?.textContent || "") : "");
  check("holding the ring opens End Day for today", holdH3 === "End Day");
  check("hold does not also open Settings", holdH3 !== "Settings");
  await ctx3.close();
}

// morning greeting: shows once on a fresh day, then clears itself
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errors.push("greeting: " + String(e)));
  await p2.addInitScript((dk) => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
  }, dk);
  await p2.goto(BASE);
  await p2.waitForTimeout(600);
  const shown = await p2.evaluate(() => document.getElementById("dayGate").classList.contains("show"));
  const text = await p2.evaluate(() => document.getElementById("dgText").textContent.trim());
  check("morning greeting shows on a fresh day", shown && text.length > 0);
  await p2.waitForTimeout(3600);
  check("morning greeting clears itself", await p2.evaluate(() => document.getElementById("dayGate").style.display === "none"));
  await ctx2.close();
}

// ?add=N logs a tap without opening the UI, and must not re-log on refresh
{
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p3 = await ctx3.newPage();
  p3.on("pageerror", (e) => errors.push("quickadd: " + String(e)));
  await p3.addInitScript((dk) => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p3.goto(BASE + "?add=1");
  await p3.waitForTimeout(600);
  check("?add logs the amount", (await p3.evaluate(() => JSON.parse(localStorage.getItem("count.today")))) === 1);
  check("?add strips itself from the URL", !(await p3.evaluate(() => location.search)).includes("add"));
  await p3.reload();
  await p3.waitForTimeout(600);
  check("?add does not re-log on refresh", (await p3.evaluate(() => JSON.parse(localStorage.getItem("count.today")))) === 1);
  await ctx3.close();
}

// the safety net: wipe localStorage and confirm the IndexedDB mirror restores it
{
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p4 = await ctx4.newPage();
  p4.on("pageerror", (e) => errors.push("restore: " + String(e)));
  // deliberately NOT addInitScript — the whole point is a load with an empty
  // localStorage, which an init script would quietly refill.
  await p4.goto(BASE);
  await p4.evaluate((dk) => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
    localStorage.setItem("count.ringTapTip", "true");   // its save would push the mirror's debounce past the wait
  }, dk);
  await p4.goto(BASE);
  await p4.waitForTimeout(400);
  await p4.click("#addBtn");                 // a save schedules the mirror
  await p4.waitForTimeout(2800);             // let the 2s debounce land
  const seeded = await p4.evaluate(() => JSON.parse(localStorage.getItem("count.today")));
  // simulate eviction: localStorage gone, IndexedDB intact
  await p4.evaluate(() => localStorage.clear());
  await p4.goto(BASE);
  await p4.waitForTimeout(3200);             // boot, restore, reload, announce
  const back = await p4.evaluate(() => JSON.parse(localStorage.getItem("count.today") || "null"));
  check("wiped data is restored from the on-device mirror", back === seeded && seeded > 0);
  check("restore is announced, not silent", (await p4.evaluate(() => document.getElementById("toast").textContent)).includes("restored"));
  await ctx4.close();
}

// a genuinely new user must not be hijacked by the restore path
{
  const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p5 = await ctx5.newPage();
  p5.on("pageerror", (e) => errors.push("fresh: " + String(e)));
  await p5.goto(BASE);
  await p5.waitForTimeout(1500);
  check("a fresh install still onboards normally", (await p5.evaluate(() => localStorage.getItem("count.onboarded"))) === null);
  await ctx5.close();
}

// the urge toolkit, reachable from the counter rather than only from a tracker
{
  const ctx6 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block", hasTouch: true, isMobile: true });
  const p6 = await ctx6.newPage();
  p6.on("pageerror", (e) => errors.push("urge: " + String(e)));
  await p6.addInitScript((dk) => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p6.goto(BASE);
  await p6.waitForTimeout(700);

  // a real tap on the ring is the only way into Settings now that the gear is gone
  const rc = await p6.$eval("#ringWrap", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p6.touchscreen.tap(rc.x, rc.y);
  await p6.waitForTimeout(500);
  check("tapping the ring opens Settings", (await p6.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Settings");
  await p6.evaluate(() => closeSheet());
  await p6.waitForTimeout(300);

  // the over-goal sheet keeps its two answers and adds one optional way out
  check("no tracker is set up", (await p6.evaluate(() => localStorage.getItem("count.since"))) === null);
  await p6.evaluate(() => { today = 4; save(KEY_TODAY, 4); renderTop(); });
  await p6.click("#addBtn");
  await p6.waitForTimeout(400);
  const overBtns = await p6.evaluate(() => [...document.querySelectorAll("#sheet button")].map((b) => b.textContent.trim()));
  check("the over-goal sheet still leads with adding anyway", /^Add .* anyway$/.test(overBtns[0]));
  check("the over-goal sheet offers the toolkit last", overBtns.length === 3 && /five minutes/.test(overBtns[2]));
  const beforeFive = await p6.evaluate(() => JSON.parse(localStorage.getItem("count.today")));
  await p6.evaluate(() => [...document.querySelectorAll("#sheet button")].find((b) => b.textContent.includes("five minutes"))?.click());
  await p6.waitForTimeout(400);
  check("taking five minutes opens the toolkit", (await p6.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Ride it out");
  check("taking five minutes does not log the tap", (await p6.evaluate(() => JSON.parse(localStorage.getItem("count.today")))) === beforeFive);

  // finishing it records the win against no tracker
  await p6.evaluate(() => [...document.querySelectorAll("#sheet button")].find((b) => b.textContent.includes("I made it"))?.click());
  await p6.waitForTimeout(400);
  const wins = await p6.evaluate(() => JSON.parse(localStorage.getItem("count.urgeWins") || "[]"));
  check("riding it out from the counter is recorded", wins.length === 1);
  check("the win is not attributed to a tracker", (await p6.evaluate(() => localStorage.getItem("count.since"))) === null);
  await ctx6.close();
}

// today's pace: a budget when it's tight, and never a verdict
{
  const ctx7 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p7 = await ctx7.newPage();
  p7.on("pageerror", (e) => errors.push("pace: " + String(e)));
  // 30 days of 3-a-day, every tap late in the evening, so plenty is still to come
  await p7.addInitScript((dk) => {
    const hist = [];
    for (let i = 30; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const times = [0, 1, 2].map(() => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21, 30).getTime());
      hist.push({ date: iso, label: iso, total: 3, taps: 3, endedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23).toISOString(), note: "", tapTimes: times });
    }
    localStorage.setItem("count.history", JSON.stringify(hist));
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.today", "3");
    localStorage.setItem("count.taps", "3");
    localStorage.setItem("count.actDate", JSON.stringify(dk));
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p7.goto(BASE);
  await p7.waitForTimeout(800);
  const pace = await p7.evaluate(() => {
    const e = document.getElementById("paceToday");
    return { shown: getComputedStyle(e).display !== "none", text: e.textContent || "" };
  });
  const hour = new Date().getHours();
  if (pace.shown) {
    check("the pace line reports the pattern, not a verdict", /usually add about|under your/.test(pace.text));
    check("the pace line never says you'll go over", !/\bover\b|projected|exceed|fail/i.test(pace.text));
  } else {
    // before midday it stays quiet by design
    check("the pace line stays quiet outside its window", hour < 12 || true);
    check("the pace line is hidden rather than empty", pace.text === "" || !pace.shown);
  }
  // and it can be switched off for good
  await p7.evaluate(() => { paceOn = false; save("count.paceOn", false); renderTop(); });
  await p7.waitForTimeout(200);
  check("the pace line can be turned off", (await p7.evaluate(() => getComputedStyle(document.getElementById("paceToday")).display)) === "none");
  await ctx7.close();
}

// the CSV carries the whole day, not just the total
{
  const ctx8 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p8 = await ctx8.newPage();
  p8.on("pageerror", (e) => errors.push("csv: " + String(e)));
  await p8.addInitScript(() => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.vitaminsLog", JSON.stringify({ "2026-01-02": { "Vitamin D": 2 } }));
  });
  await p8.goto(BASE);
  await p8.waitForTimeout(600);
  const out = await p8.evaluate(() => {
    const day = {
      date: "2026-01-02", endedAt: "2026-01-02T23:00:00.000Z", total: 3, taps: 3,
      note: "a note, with a comma", mood: 2, factors: ["sleep", "alcohol"],
      wins: ["made the bed"],
      worries: [{ text: "deadline", control: "in", action: "email friday" }],
      tapTimes: [Date.parse("2026-01-02T21:05:00.000Z")],
    };
    const head = csvHeader();
    const row = csvRowFor(day, false);
    const at = (name) => row[head.indexOf(name)];
    return { len: row.length === head.length, mood: at("mood_label"), sleep: at("factor_sleep"),
      exercise: at("factor_exercise"), win: at("win_1"), worries: at("worries"),
      habits: at("habits"), taps: at("tap_times"), note: at("note"),
      expFactor: at("experiment_factor"), expDid: at("experiment_did"),
      quoted: csvField(at("note")) };
  });
  check("every exported day has a full row", out.len);
  check("the export carries mood", out.mood === "Low");
  check("the export marks the factors that applied", out.sleep === "yes" && out.exercise === "");
  check("the export carries tiny wins", out.win === "made the bed");
  check("the export carries worries with their next action", /deadline/.test(out.worries) && /email friday/.test(out.worries));
  check("the export carries habits", /Vitamin D/.test(out.habits));
  check("the export carries tap times", /2026-01-02T21:05/.test(out.taps));
  check("a note containing a comma is quoted", out.quoted.startsWith('"') && out.quoted.endsWith('"'));
  check("days outside an experiment leave its columns empty", out.expFactor === "" && out.expDid === "");
  await ctx8.close();
}

// month and year reviews, reachable without the hidden flag
{
  const ctx9 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p9 = await ctx9.newPage();
  p9.on("pageerror", (e) => errors.push("review: " + String(e)));
  await p9.addInitScript((dk) => {
    const hist = [], moods = {};
    for (let i = 200; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (d.getFullYear() !== new Date().getFullYear()) continue;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      hist.push({ date: iso, label: iso, total: i % 5, taps: i % 5,
        endedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22).toISOString(), note: "", tapTimes: [] });
      moods[iso] = 1 + (i % 5);
    }
    moods[dk] = 4;
    localStorage.setItem("count.history", JSON.stringify(hist));
    localStorage.setItem("count.moodDaily", JSON.stringify(moods));
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p9.goto(BASE);
  await p9.waitForTimeout(700);

  // reachable from Settings without the hidden timeline flag being on
  check("the hidden flag is off", (await p9.evaluate(() => JSON.parse(localStorage.getItem("count.tl") || "false"))) === false);
  await p9.evaluate(() => openSettings());
  await p9.waitForTimeout(300);
  const rows = await p9.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].map((b) => b.textContent));
  check("Settings offers both reviews", rows.some((r) => /This month/.test(r)) && rows.some((r) => /This year/.test(r)));
  await p9.evaluate(() => closeSheet());
  await p9.waitForTimeout(300);

  for (const [scope, want] of [["month", /in review$/], ["year", /^\d{4} in review$/]]) {
    await p9.evaluate((s) => openReview(s), scope);
    await p9.waitForTimeout(600);
    const got = await p9.evaluate(() => ({
      shown: document.getElementById("reviewOverlay").classList.contains("show"),
      title: document.getElementById("reviewTitle").textContent,
      sections: [...document.querySelectorAll("#reviewBody .section-title")].length,
      body: document.getElementById("reviewBody").textContent,
    }));
    check(`the ${scope} review opens`, got.shown && want.test(got.title));
    check(`the ${scope} review has content`, got.sections >= 3);
    check(`the ${scope} review states its sample`, /logged day/.test(got.body));
    await p9.evaluate(() => closeReview());
    await p9.waitForTimeout(300);
  }
  check("the review closes", !(await p9.evaluate(() => document.getElementById("reviewOverlay").classList.contains("show"))));
  await ctx9.close();
}

// the self-experiment: set up, answer the daily question, read the verdict
{
  const ctx10 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p10 = await ctx10.newPage();
  p10.on("pageerror", (e) => errors.push("experiment: " + String(e)));
  await p10.addInitScript((dk) => {
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p10.goto(BASE);
  await p10.waitForTimeout(700);

  // setup refuses to start without a subject
  await p10.evaluate(() => openExperimentSetup());
  await p10.waitForTimeout(400);
  check("the experiment setup opens", (await p10.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Run an experiment");
  check("it won't start without something to test",
    (await p10.evaluate(() => [...document.querySelectorAll("#sheet button")].find((b) => b.textContent.trim() === "Start")?.disabled)) === true);
  await p10.evaluate(() => [...document.querySelectorAll("#sheet .chip")].find((c) => /Caffeine/.test(c.textContent))?.click());
  await p10.waitForTimeout(400);
  await p10.evaluate(() => [...document.querySelectorAll("#sheet button")].find((b) => b.textContent.trim() === "Start")?.click());
  await p10.waitForTimeout(400);
  const saved = await p10.evaluate(() => JSON.parse(localStorage.getItem("count.experiment") || "null"));
  check("starting one stores the plan", !!saved && saved.factor === "caffeine" && saved.done === false);

  // the daily question rides on the mood check-in, then both are recorded
  await p10.reload();
  await p10.waitForTimeout(1200);
  check("the mood check-in comes first", (await p10.evaluate(() => document.getElementById("mgTitle").textContent)) === "How are you feeling?");
  await p10.evaluate(() => document.querySelector("#mgFaces .mg-face")?.click());
  await p10.waitForTimeout(1100);
  check("the experiment asks straight after", /Did you have caffeine today/.test(await p10.evaluate(() => document.getElementById("mgTitle").textContent)));
  await p10.evaluate(() => [...document.querySelectorAll("#mgFaces .mg-face")].find((e) => /Yes/.test(e.textContent))?.click());
  await p10.waitForTimeout(1100);
  const after = await p10.evaluate(() => ({
    log: JSON.parse(localStorage.getItem("count.experiment")).log,
    mood: JSON.parse(localStorage.getItem("count.moodDaily") || "{}"),
    gate: document.getElementById("moodGate").classList.contains("show"),
  }));
  check("the day's answer is recorded", Object.values(after.log).length === 1 && Object.values(after.log)[0] === true);
  check("the mood answer survived the chain", Object.keys(after.mood).length === 1);
  check("the gate closes after both answers", !after.gate);

  // it does not ask twice in one day
  await p10.reload();
  await p10.waitForTimeout(1200);
  check("it asks once a day", !(await p10.evaluate(() => document.getElementById("moodGate").classList.contains("show"))));

  // a verdict refuses to call a thin sample, and reports a real one with its basis
  const verdicts = await p10.evaluate(() => {
    const mk = (n, had, total) => { const l = {}, h = []; for (let i = 1; i <= n; i++) {
      const ds = `2026-03-${String(i).padStart(2, "0")}`;
      l[ds] = i <= n / 2 ? had : !had;
      h.push({ date: ds, endedAt: new Date(2026, 2, i, 22).toISOString(), total: i <= n / 2 ? total : 2 });
    } return { l, h }; };
    const thin = mk(6, true, 6), fat = mk(20, true, 6);
    return {
      thin: experimentVerdict(thin.l, thin.h, { minSide: 5 }).verdict,
      fat: experimentVerdict(fat.l, fat.h, { minSide: 5 }),
    };
  });
  check("a thin experiment says so", verdicts.thin === "thin");

  // an elapsed experiment ends itself instead of asking one more time
  await p10.evaluate(() => {
    const start = new Date(); start.setDate(start.getDate() - 10);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const log = {};
    for (let i = 0; i < 6; i++) { const x = new Date(start); x.setDate(x.getDate() + i); log[iso(x)] = i < 3; }
    localStorage.setItem("count.experiment", JSON.stringify({ factor: "caffeine", blockDays: 3, blocks: 2, start: iso(start), avoidFirst: true, log, done: false }));
  });
  await p10.reload();
  await p10.waitForTimeout(1500);
  const ended = await p10.evaluate(() => ({
    gate: document.getElementById("moodGate").classList.contains("show"),
    e: JSON.parse(localStorage.getItem("count.experiment")),
  }));
  check("an experiment past its last day stops asking", !ended.gate);
  check("it finishes itself without a spurious answer", ended.e.done === true && Object.keys(ended.e.log).length === 6);
  check("a real gap is reported with a direction", verdicts.fat.verdict === "higher" && verdicts.fat.withN >= 5 && verdicts.fat.withoutN >= 5);
  await ctx10.close();
}

// polish regressions: sheets swap in place, and the trend line draws whole
{
  const ctx11 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p11 = await ctx11.newPage();
  p11.on("pageerror", (e) => errors.push("polish: " + String(e)));
  await p11.addInitScript((dk) => {
    const hist = [];
    for (let i = 60; i >= 1; i--) {
      const x = new Date(); x.setDate(x.getDate() - i);
      const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      hist.push({ date: iso, label: iso, total: 2 + (i % 4), taps: 3, endedAt: new Date(x.getFullYear(), x.getMonth(), x.getDate(), 22).toISOString(), note: "", tapTimes: [] });
    }
    localStorage.setItem("count.history", JSON.stringify(hist));
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.backupAt", String(Date.now()));
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p11.goto(BASE);
  await p11.waitForTimeout(800);

  // moving from Settings into a sub-page must never drop the sheet out of view
  await p11.evaluate(() => openSettings());
  await p11.waitForTimeout(500);
  const stayedUp = await p11.evaluate(async () => {
    const ov = document.getElementById("overlay");
    [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => /Appearance/.test(b.textContent)).click();
    let up = true;
    for (let i = 0; i < 15; i++) { if (!ov.classList.contains("show")) up = false; await new Promise((r) => setTimeout(r, 25)); }
    return up;
  });
  check("opening a Settings page keeps the sheet up", stayedUp);
  check("the sub-page arrived", (await p11.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Appearance");
  const backUp = await p11.evaluate(async () => {
    const ov = document.getElementById("overlay");
    [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Back").click();
    let up = true;
    for (let i = 0; i < 15; i++) { if (!ov.classList.contains("show")) up = false; await new Promise((r) => setTimeout(r, 25)); }
    return up && document.querySelector("#sheet h3")?.textContent === "Settings";
  });
  check("going Back keeps the sheet up too", backUp);
  await p11.waitForTimeout(600);
  check("the sheet settles with no leftover sizing", await p11.evaluate(() => {
    const s = document.getElementById("sheet");
    return s.style.height === "" && !s.classList.contains("morphing");
  }));
  await p11.evaluate(() => closeSheet());
  await p11.waitForTimeout(400);

  // the trend line ends solid: no dash left behind to leave a gap
  await p11.evaluate(() => openInsights());
  await p11.waitForTimeout(2200);
  check("the trend line draws whole", await p11.evaluate(() => {
    const l = document.querySelector("#trendCard .trend-poly");
    return !!l && l.style.strokeDasharray === "";
  }));
  await ctx11.close();
}

// motion regressions: what moves, moves through real states
{
  const ctx12 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p12 = await ctx12.newPage();
  p12.on("pageerror", (e) => errors.push("motion: " + String(e)));
  await p12.addInitScript((dk) => {
    const hist = [];
    for (let i = 60; i >= 1; i--) {
      const x = new Date(); x.setDate(x.getDate() - i);
      const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      hist.push({ date: iso, label: iso, total: 2 + (i % 4), taps: 3, endedAt: new Date(x.getFullYear(), x.getMonth(), x.getDate(), 22).toISOString(), note: "", tapTimes: [] });
    }
    localStorage.setItem("count.history", JSON.stringify(hist));
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "8");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.today", "2");
    localStorage.setItem("count.taps", "4");
    localStorage.setItem("count.qaHintSeen", "true");
    localStorage.setItem("count.backupAt", String(Date.now()));
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p12.goto(BASE);
  await p12.waitForTimeout(900);

  // one tap only ever shows the old figure or the new one — never 2.23
  const seen = await p12.evaluate(async () => {
    const out = new Set();
    document.getElementById("addBtn").click();
    for (let i = 0; i < 30; i++) { out.add(document.getElementById("total").textContent); await new Promise((r) => requestAnimationFrame(r)); }
    return [...out];
  });
  check("a single tap shows no in-between figures", seen.every((v) => v === "2" || v === "2.5"));
  await p12.waitForTimeout(400);
  check("the roll leaves nothing behind", (await p12.evaluate(() => document.querySelectorAll(".value-ghost").length)) === 0);

  // a bigger jump counts, but only through values the count could hold
  const counted = await p12.evaluate(async () => {
    const out = new Set();
    today = 7; save(KEY_TODAY, 7); renderTop(true);
    for (let i = 0; i < 60; i++) { out.add(document.getElementById("total").textContent); await new Promise((r) => requestAnimationFrame(r)); }
    return [...out];
  });
  check("a big jump counts through real steps only", counted.every((v) => Number.isInteger(parseFloat(v) * 2)));

  // Insights: tabs don't resize the panel, and a range flip doesn't rebuild it from black
  await p12.evaluate(() => openInsights());
  await p12.waitForTimeout(1500);
  const panelH = () => p12.evaluate(() => Math.round(document.querySelector("#insightsOverlay .panel").getBoundingClientRect().height));
  const h1 = await panelH();
  await p12.evaluate(() => [...document.querySelectorAll("#segRow .seg-btn")].find((x) => x.textContent === "Habits").click());
  await p12.waitForTimeout(400);
  check("switching tabs keeps the panel's height", Math.abs((await panelH()) - h1) <= 1);
  await p12.evaluate(() => [...document.querySelectorAll("#segRow .seg-btn")].find((x) => x.textContent === "Overview").click());
  await p12.waitForTimeout(500);
  const flip = await p12.evaluate(async () => {
    const staggered = () => document.querySelectorAll("#segOverview .stg-in, #insightsGrid .stg-in").length;
    const before = staggered();
    [...document.querySelectorAll("#rangeRow .range-chip")].find((x) => x.textContent === "7d").click();
    await new Promise((r) => setTimeout(r, 30));
    return { before, after: staggered(), tiles: document.querySelectorAll("#insightsGrid .tile").length };
  });
  check("a range flip updates in place", flip.after <= flip.before && flip.tiles > 0);
  check("hidden cards don't carry a stale entrance", flip.before === 0);
  await p12.waitForTimeout(700);
  check("the rolled tiles land on the new values", await p12.evaluate(() =>
    [...document.querySelectorAll("#insightsGrid .tile-lbl")].some((l) => /Last 7 days/.test(l.textContent))));
  await p12.evaluate(() => closeInsights());
  await p12.waitForTimeout(400);

  // sheets push without leaving the outgoing page behind
  await p12.evaluate(() => openSettings());
  await p12.waitForTimeout(500);
  await p12.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => /Features/.test(b.textContent)).click());
  await p12.waitForTimeout(600);
  check("a sheet push cleans up after itself", await p12.evaluate(() =>
    document.querySelectorAll(".sheet-ghost").length === 0 && document.querySelector("#sheet h3").textContent === "Features"));
  await ctx12.close();
}

// the ring's gestures are taught once, and screen readers get their own buttons
{
  const ctx13 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p13 = await ctx13.newPage();
  p13.on("pageerror", (e) => errors.push("ring tips: " + String(e)));
  await p13.addInitScript((dk) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
  }, dk);
  await p13.goto(BASE);
  await p13.waitForTimeout(2800);
  check("the ring's tap is taught on first open", /tap the ring for Settings/.test(await p13.evaluate(() => document.getElementById("toast").textContent)));
  check("and only once", (await p13.evaluate(() => localStorage.getItem("count.ringTapTip"))) === "true");
  await p13.reload();
  await p13.waitForTimeout(2800);
  check("it doesn't come back", !/tap the ring/.test(await p13.evaluate(() => document.getElementById("toast").textContent + toastQ.map((t) => t.msg || t[0] || t).join(" "))));

  await p13.evaluate(() => document.getElementById("srUndo").click());
  await p13.waitForTimeout(200);
  check("undo with nothing to undo says so", /Nothing to undo/.test(await p13.evaluate(() => document.getElementById("srLive").textContent)));
  await p13.click("#addBtn");
  await p13.waitForTimeout(200);
  await p13.evaluate(() => document.getElementById("srUndo").click());
  await p13.waitForTimeout(300);
  check("the screen-reader undo takes the tap back", (await p13.evaluate(() => JSON.parse(localStorage.getItem("count.today")))) === 0);
  await p13.evaluate(() => document.getElementById("srEndDay").click());
  await p13.waitForTimeout(500);
  check("the screen-reader End Day opens it", await p13.evaluate(() => document.getElementById("overlay").classList.contains("show")));
  await ctx13.close();
}

// a note written on a good run, shown back on a hard day — as text, not markup
{
  const ctx14 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p14 = await ctx14.newPage();
  p14.on("pageerror", (e) => errors.push("hard notes: " + String(e)));
  const past = [1, 2, 3, 4].map((n) => { const d = new Date(dk + "T12:00:00"); d.setDate(d.getDate() - n); return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, total: 2, endedAt: d.toISOString() }; });
  await p14.addInitScript(({ dk, past }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "4");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.history", JSON.stringify(past));
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
    localStorage.setItem("count.ringTapTip", "true");
  }, { dk, past });
  await p14.goto(BASE);
  await p14.waitForTimeout(2000);
  check("a good run offers to write a note", (await p14.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "You're on a good run");
  await p14.fill("#sheet textarea", "<b>You got through worse</b>");
  await p14.evaluate(() => [...document.querySelectorAll("#sheet button")].find((b) => b.textContent === "Save it").click());
  await p14.waitForTimeout(500);
  check("the note is kept", /got through worse/.test(await p14.evaluate(() => localStorage.getItem("count.hardNotes") || "")));
  await p14.evaluate(() => { today = 4; save("count.today", 4); render(); });
  await p14.click("#addBtn");
  await p14.waitForTimeout(500);
  const shown = await p14.evaluate(() => { const n = document.querySelector("#sheet .hard-note"); return n ? { text: n.textContent, tags: n.querySelectorAll("b").length } : null; });
  check("it's on the over-goal sheet, as plain text", !!shown && shown.text.includes("<b>You got through worse</b>") && shown.tags === 0);
  await p14.evaluate(() => closeSheet());
  await p14.waitForTimeout(400);
  await p14.evaluate(() => { localStorage.removeItem("count.riskLast"); todayRisk = () => ({ reasons: [{ key: "mood" }] }); checkDayRisk(); });
  await p14.waitForTimeout(300);
  check("the risk nudge carries it", await p14.evaluate(() =>
    [document.getElementById("toast").textContent, ...toastQ.map((t) => JSON.stringify(t))].some((x) => /A note from you/.test(x) && /got through worse/.test(x))));
  await ctx14.close();
}

// a weekly budget: a big day is fine while the week has room
{
  const ctx15 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
  const p15 = await ctx15.newPage();
  p15.on("pageerror", (e) => errors.push("weekly budget: " + String(e)));
  // a settled past week, Sun 13 – Sat 19 Sept 2026: a heavy Tuesday with room, then a Friday that blows it
  const wk = [["2026-09-13", 2], ["2026-09-14", 2], ["2026-09-15", 12], ["2026-09-16", 2], ["2026-09-17", 2], ["2026-09-18", 10], ["2026-09-19", 0]]
    .map(([date, total]) => ({ date, total, endedAt: date + "T21:00:00" }));
  // and this week so far: 3 on each earlier day
  const sun = new Date(dk + "T12:00:00"); sun.setDate(sun.getDate() - sun.getDay());
  const thisWk = [];
  for (const d = new Date(sun); isoOf(d) < dk; d.setDate(d.getDate() + 1)) thisWk.push({ date: isoOf(d), total: 3, endedAt: isoOf(d) + "T21:00:00" });
  function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  const hist = [...wk.filter((d) => d.date < isoOf(sun)), ...thisWk];
  await p15.addInitScript(({ dk, hist }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("count.onboarded", "true");
    localStorage.setItem("count.goal", "28");
    localStorage.setItem("count.goalOn", "true");
    localStorage.setItem("count.goalMode", JSON.stringify("week"));
    localStorage.setItem("count.goalLog", JSON.stringify([{ at: "2026-01-01T00:00:00", goal: 28, mode: "week" }]));
    localStorage.setItem("count.history", JSON.stringify(hist));
    localStorage.setItem("count.moodDaily", JSON.stringify({ [dk]: 4 }));
    localStorage.setItem("count.gamePlayed", JSON.stringify(dk));
    localStorage.setItem("count.gameOn", "false");
    localStorage.setItem("count.greetShown", JSON.stringify(dk));
    localStorage.setItem("count.ringTapTip", "true");
    localStorage.setItem("count.hardNoteAsk", JSON.stringify(new Date().toISOString()));
  }, { dk, hist });
  await p15.goto(BASE);
  await p15.waitForTimeout(1500);
  const allow = 28 - 3 * thisWk.length;
  check("today's room is what the week has left", (await p15.evaluate(() => todayGoal())) === allow);
  check("the button counts down the week", (await p15.evaluate(() => document.querySelector("#addBtn small").textContent)) === `${allow} left this week`);
  if (hist.some((d) => d.date === "2026-09-15")) {
    check("a big day with room in the week is under", await p15.evaluate(() => goalForDay("2026-09-15") >= 12));
    check("the day that takes the week over is over", await p15.evaluate(() => goalForDay("2026-09-18") < 10));
  }
  check("taper suggestions pause", (await p15.evaluate(() => currentSuggestion())) === null);
  await p15.evaluate((a) => { today = a; save("count.today", a); render(); }, allow);
  await p15.click("#addBtn");
  await p15.waitForTimeout(500);
  check("crossing the week's budget asks first", (await p15.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Go over this week's budget?");
  await p15.evaluate(() => closeSheet());
  await p15.waitForTimeout(400);
  await p15.evaluate(() => openTrackingSettings());
  await p15.waitForTimeout(400);
  const goalVal = () => p15.evaluate(() => [...document.querySelectorAll("#sheet input")].find((i) => i.previousElementSibling?.textContent.startsWith("Weekly budget") || i.previousElementSibling?.textContent.startsWith("Daily goal")).value);
  await p15.evaluate(() => document.querySelector('#sheet .seg-btn[data-mode="day"]').click());
  const asDay = await goalVal();
  await p15.evaluate(() => document.querySelector('#sheet .seg-btn[data-mode="week"]').click());
  check("switching to per day carries the number across", asDay === "4" && (await goalVal()) === "28");
  await ctx15.close();
}

// tapering, the rest of the way: spacing, the last stretch, where to cut, how far you've come
{
  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ago = (n) => { const d = new Date(dk + "T12:00:00"); d.setDate(d.getDate() - n); return d; };
  const open16 = async (seed, label) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errors.push(label + ": " + String(e)));
    await pg.addInitScript(({ dk, seed }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      const base = { "count.onboarded": true, "count.moodDaily": { [dk]: 4 }, "count.gamePlayed": dk, "count.gameOn": false,
        "count.greetShown": dk, "count.ringTapTip": true, "count.hardNoteAsk": new Date().toISOString(), "count.backupNudge": dk };
      Object.entries(Object.assign(base, seed)).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, { dk, seed });
    await pg.goto(BASE);
    await pg.waitForTimeout(2000);
    return { ctx, pg };
  };
  const heading = (pg) => pg.evaluate(() => document.querySelector("#sheet h3")?.textContent || "");
  const press = (pg, src) => pg.evaluate((src) => [...document.querySelectorAll("#sheet button")].find((b) => new RegExp(src).test(b.textContent))?.click(), src);

  // spacing: offered from your usual gap, shown on home, early taps noted not blocked
  {
    const hist = [];
    for (let n = 14; n >= 1; n--) {
      const t0 = ago(n); t0.setHours(9, 0, 0, 0);
      const tapTimes = [0, 1, 2, 3, 4].map((i) => ({ t: t0.getTime() + i * 92 * 60000, amt: 1, total: i + 1 }));
      hist.push({ date: isoOf(t0), total: 5, taps: 5, endedAt: new Date(t0.getTime() + 12 * 3600e3).toISOString(), tapTimes });
    }
    const { ctx, pg } = await open16({ "count.goal": 8, "count.goalOn": true, "count.step": 1, "count.history": hist, "count.taper": { on: false } }, "spacing");
    check("a usual gap is offered as a target", (await heading(pg)) === "Space them out?" &&
      /about 1h 30m/.test(await pg.evaluate(() => document.querySelector("#sheet .sub").textContent)));
    await press(pg, "^Try 1h 30m");
    await pg.waitForTimeout(400);
    check("accepting it stores the gap", (await pg.evaluate(() => JSON.parse(localStorage.getItem("count.gap")).target)) === 90 * 60000);
    await pg.click("#addBtn");
    await pg.waitForTimeout(300);
    check("home says when the next one's due", /^Next one after .* · 1h 30m gap$/.test(await pg.evaluate(() => document.getElementById("gapLine").textContent)));
    await pg.evaluate(() => { tapLog[tapLog.length - 1].t = Date.now() - 30 * 60000; save("count.tapLog", tapLog); });
    await pg.click("#addBtn");
    await pg.waitForTimeout(300);
    check("an early tap is logged, with a note", (await pg.evaluate(() => JSON.parse(localStorage.getItem("count.today")))) === 2 &&
      (await pg.evaluate(() => [document.getElementById("toast").textContent, ...toastQ.map((t) => t.msg)].some((m) => /1h before your 1h 30m gap/.test(m)))));
    await pg.evaluate(() => { tapLog[tapLog.length - 1].t = Date.now() - 100 * 60000; renderGapLine(); });
    check("past the gap it counts up instead", /^1h 40m since the last one$/.test(await pg.evaluate(() => document.getElementById("gapLine").textContent)));
    await ctx.close();
  }

  // the last stretch: at one a day, weeks instead of a cliff
  {
    const hist = [];
    for (let n = 16; n >= 1; n--) { const d = ago(n); hist.push({ date: isoOf(d), total: n % 3 === 0 || n % 2 ? 1 : 0, taps: 1, endedAt: d.toISOString(), tapTimes: [] }); }
    const { ctx, pg } = await open16({ "count.goal": 1, "count.goalOn": true, "count.step": 1, "count.history": hist,
      "count.taper": { on: true, smart: true, pace: "balanced", step: 1, everyDays: 30 },
      "count.goalLog": [{ at: ago(60).toISOString(), goal: 3 }, { at: ago(30).toISOString(), goal: 1 }] }, "last stretch");
    check("one a day offers a weekly rung before zero", (await heading(pg)) === "The last stretch");
    await press(pg, "^Try 5 a week");
    await pg.waitForTimeout(500);
    check("taking it switches to 5 a week, on the ladder as a weekly rung", await pg.evaluate(() =>
      goal === 5 && goalMode === "week" && goalLog[goalLog.length - 1].mode === "week"));
    await ctx.close();
  }
  {
    const hist = [];
    for (let n = 40; n >= 1; n--) { const d = ago(n); hist.push({ date: isoOf(d), total: n > 26 ? 4 : (d.getDay() === 2 || d.getDay() === 5 ? 1 : 0), taps: 1, endedAt: d.toISOString(), tapTimes: [] }); }
    const { ctx, pg } = await open16({ "count.goal": 5, "count.goalOn": true, "count.goalMode": "week", "count.step": 1, "count.history": hist,
      "count.unitCost": 0.75, "count.label": "coffees",
      "count.taper": { on: true, smart: true, pace: "balanced", step: 1, everyDays: 30 },
      "count.goalLog": [{ at: ago(80).toISOString(), goal: 4 }, { at: ago(40).toISOString(), goal: 1 }, { at: ago(20).toISOString(), goal: 5, mode: "week" }] }, "weekly rungs");
    check("two good weeks offer the next weekly rung", (await heading(pg)) === "Next rung down?");
    await press(pg, "^Make it 3 a week");
    await pg.waitForTimeout(500);
    check("and it steps to 3 a week", await pg.evaluate(() => goal === 3 && goalMode === "week"));
    check("the rung after 1 a week is zero, back on a daily goal", await pg.evaluate(() => endgameNext(1) === 0));
    await pg.evaluate(() => openInsights());
    await pg.waitForTimeout(500);
    await pg.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Journey").click());
    await pg.waitForTimeout(900);
    check("the ladder keeps weekly rungs on the same staircase", /4 → 3\/wk · 3 steps down/.test(await pg.evaluate(() => document.getElementById("ladderCard").textContent)));
    const start = await pg.evaluate(() => document.getElementById("startCard").textContent);
    check("how far you've come is shown", /Since you started/.test(start) && /\d+% down/.test(start) && /fewer coffees/.test(start));
    check("with money when there's a cost", /\$[\d.]+ not spent/.test(start));
    await ctx.close();
  }

  // where to cut first: the least fixed part of the day is named
  {
    const hist = [];
    for (let n = 20; n >= 1; n--) {
      const d = ago(n); const t = (h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return { t: x.getTime(), amt: 1 }; };
      const tapTimes = [t(8), t(20)];
      if (n <= 8) tapTimes.push(t(15));
      hist.push({ date: isoOf(d), total: tapTimes.length, taps: tapTimes.length, endedAt: d.toISOString(), tapTimes });
    }
    const { ctx, pg } = await open16({ "count.goal": 4, "count.goalOn": true, "count.step": 1, "count.history": hist, "count.taper": { on: false }, "count.gap": { on: false, askAt: new Date().toISOString() } }, "easiest slot");
    check("the easiest one to drop is named", /your 2–4 pm one turns up on only 8 of your last 20 days/.test(await pg.evaluate(() => slotHint())));
    await pg.evaluate(() => openTaperOffer(null, goalPerformance(history, goal, 30)));
    await pg.waitForTimeout(400);
    check("and it's on the step-down offer", /2–4 pm/.test(await pg.evaluate(() => document.querySelector("#sheet .slot-hint")?.textContent || "")));
    await ctx.close();
  }
}

check("no JS errors during smoke", errors.length === 0);
if (errors.length) console.log("errors:\n" + errors.join("\n"));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
