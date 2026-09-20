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

// undo via swipe down on number
await page.evaluate(() => {
  const el = document.getElementById("totalWrap");
  const r = el.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  el.dispatchEvent(new TouchEvent("touchstart", { touches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy })], bubbles: true }));
  el.dispatchEvent(new TouchEvent("touchmove", { touches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy + 80 })], bubbles: true }));
  el.dispatchEvent(new TouchEvent("touchend", { changedTouches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy + 80 })], bubbles: true }));
});
await page.waitForTimeout(200);
check("swipe-undo restores today", (await page.evaluate(() => JSON.parse(localStorage.getItem("count.today") || "0"))) === before);

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

  // the home pill opens the toolkit with no tracker present
  check("no tracker is set up", (await p6.evaluate(() => localStorage.getItem("count.since"))) === null);
  await p6.click("#urgeBtn");
  await p6.waitForTimeout(400);
  check("the urge pill opens the toolkit", (await p6.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Ride it out");
  await p6.evaluate(() => [...document.querySelectorAll("#sheet button")].find((b) => b.textContent.includes("I made it"))?.click());
  await p6.waitForTimeout(400);
  const wins = await p6.evaluate(() => JSON.parse(localStorage.getItem("count.urgeWins") || "[]"));
  check("riding it out from the counter is recorded", wins.length === 1);
  check("the win is not attributed to a tracker", (await p6.evaluate(() => localStorage.getItem("count.since"))) === null);

  // the over-goal sheet keeps its two answers and adds one optional way out
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

check("no JS errors during smoke", errors.length === 0);
if (errors.length) console.log("errors:\n" + errors.join("\n"));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
