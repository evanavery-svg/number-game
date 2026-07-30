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

// settings opens with sections
await page.click("#gearBtn");
await page.waitForTimeout(300);
check("settings has sections", (await page.$$("#sheet .settings-section")).length >= 4);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.trim() === "Cancel")?.click());
await page.waitForTimeout(200);

// end day logs an entry
await page.click("#addBtn"); await page.waitForTimeout(120);
await page.click("#endBtn");
await page.waitForTimeout(300);
const histLenBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").length);
await page.evaluate(() => [...document.querySelectorAll("#sheet .sheet-btn")].find((b) => b.textContent.includes("Log day"))?.click());
await page.waitForTimeout(400);
const histLenAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("count.history") || "[]").length);
check("end day appends a history entry", histLenAfter === histLenBefore + 1);

check("no JS errors during smoke", errors.length === 0);
if (errors.length) console.log("errors:\n" + errors.join("\n"));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
