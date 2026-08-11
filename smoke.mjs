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

// undo
await page.click("#undoBtn");
await page.waitForTimeout(150);
check("undo restores today", (await page.evaluate(() => JSON.parse(localStorage.getItem("count.today") || "0"))) === before);

// insights opens and renders the grid
await page.click("#statsBtn");
await page.waitForTimeout(400);
check("insights panel opens", await page.evaluate(() => document.getElementById("insightsOverlay").classList.contains("show")));
check("range switcher present", (await page.$$("#rangeRow .range-chip")).length === 4);
await page.click("#insightsClose");
await page.waitForTimeout(200);

// settings opens as a menu, and a sub-sheet opens from it
await page.click("#gearBtn");
await page.waitForTimeout(300);
check("settings menu renders rows", (await page.$$("#sheet .sheet-btn.with-ico")).length >= 6);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Tracking"))?.click());
await page.waitForTimeout(500);
check("settings sub-sheet opens", (await page.evaluate(() => document.querySelector("#sheet h3")?.textContent)) === "Tracking");
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Back")?.click());
await page.waitForTimeout(500);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Done")?.click());
await page.waitForTimeout(300);

// themes: the picker, and the head pre-paint script, must agree with THEMES.
// A mismatch is invisible until a specific calendar day rotates onto it, so
// assert the two lists are identical rather than waiting to find out.
{
  await page.click("#gearBtn");
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Appearance"))?.click());
  await page.waitForTimeout(500);
  const keys = await page.evaluate(() => THEMES.map((t) => t.key));
  const swatches = (await page.$$("#sheet .theme-swatch")).length;
  check("theme picker renders every theme", swatches === keys.length && keys.length === 12);
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
await page.click("#endBtn");
await page.waitForTimeout(300);
const histLenBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").length);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Log day"))?.click());
await page.waitForTimeout(400);
const histLenAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").length);
check("end day appends a history entry", histLenAfter === histLenBefore + 1);

// a logged calendar day opens the full editor, not the light backfill sheet
{
  await page.click("#statsBtn");
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

check("no JS errors during smoke", errors.length === 0);
if (errors.length) console.log("errors:\n" + errors.join("\n"));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
