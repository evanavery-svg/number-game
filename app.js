// ---- Tap Counter ----
// Data lives entirely on this device (localStorage). No accounts, no servers.

const KEY_TODAY = "count.today";
const KEY_TAPS = "count.taps";
const KEY_HISTORY = "count.history";   // [{ date, label, total, taps, endedAt, note }]
const KEY_STEP = "count.step";
const KEY_GOAL = "count.goal";
const KEY_LASTENDED = "count.lastEnded";
const KEY_HAPTIC = "count.haptic";     // bool
const KEY_SOUND = "count.sound";       // bool
const KEY_LOCK_PIN = "count.lockPin";  // sha-256 hash of (pin + salt)
const KEY_LOCK_SALT = "count.lockSalt";
const KEY_LOCK_BIO = "count.lockBio";  // base64 WebAuthn credential id
const KEY_REMIND = "count.remind";          // bool
const KEY_REMIND_TIME = "count.remindTime"; // "HH:MM"
const KEY_REMIND_DISMISS = "count.remindDismiss"; // YYYY-MM-DD last dismissed
const KEY_REMIND_LAST = "count.remindLast";       // YYYY-MM-DD last OS notification
const KEY_UNLOCK_AT = "count.unlockAt";   // timestamp of last unlock (for the grace window)
const KEY_SINCE = "count.since";          // [{ id, name, start }]
const KEY_TAPLOG = "count.tapLog";        // [timestamp, …] times of today's taps; cleared on End Day
const KEY_ACT_DATE = "count.actDate";     // local date of the last tap — catches days never ended
const KEY_THEME = "count.theme";          // active theme key (see THEMES), else "default"
const KEY_THEME_AUTO = "count.themeAuto"; // rotate through themes daily
const KEY_TREE = "count.tree";            // { level, progress, sad, seenLevel, seenProgress }
const TREE_DAYS = 30;                     // under-goal days to fully grow + prestige
const KEY_WATER = "count.water";          // { date, oz, log: [amounts] } — hydration, auto-resets daily
const KEY_WATER_GLASS = "count.waterGlass"; // oz added per tap
const KEY_WATER_GOAL = "count.waterGoal";   // daily oz goal
const KEY_WATER_PRESETS = "count.waterPresets"; // [oz, …] quick glass-size buttons

const CHART_DAYS = 14;
const RING_C = 2 * Math.PI * 54;   // circumference of the progress ring (r=54 in viewBox)

const el = {
  date: document.getElementById("dateLabel"),
  total: document.getElementById("total"),
  totalWrap: document.getElementById("totalWrap"),
  ringWrap: document.getElementById("ringWrap"),
  ringProg: document.getElementById("ringProg"),
  meta: document.getElementById("meta"),
  goalText: document.getElementById("goalText"),
  add: document.getElementById("addBtn"),
  moreBtn: document.getElementById("moreBtn"),
  undo: document.getElementById("undoBtn"),
  end: document.getElementById("endBtn"),
  gear: document.getElementById("gearBtn"),
  statsBtn: document.getElementById("statsBtn"),
  insightsOverlay: document.getElementById("insightsOverlay"),
  insightsClose: document.getElementById("insightsClose"),
  insightsGrid: document.getElementById("insightsGrid"),
  chartCard: document.getElementById("chartCard"),
  chartTitle: document.getElementById("chartTitle"),
  chartStats: document.getElementById("chartStats"),
  chart: document.getElementById("chart"),
  chartLegend: document.getElementById("chartLegend"),
  chartLabels: document.getElementById("chartLabels"),
  addLabel: document.querySelector("#addBtn .add-label"),
  addSub: document.querySelector("#addBtn small"),
  history: document.getElementById("history"),
  histEmpty: document.getElementById("histEmpty"),
  quote: document.getElementById("quote"),
  toast: document.getElementById("toast"),
  overlay: document.getElementById("overlay"),
  sheet: document.getElementById("sheet"),
  lock: document.getElementById("lockScreen"),
  lockTitle: document.getElementById("lockTitle"),
  lockDots: document.getElementById("lockDots"),
  lockError: document.getElementById("lockError"),
  lockPad: document.getElementById("lockPad"),
  reminder: document.getElementById("reminderBanner"),
  reminderText: document.getElementById("reminderText"),
  reminderDismiss: document.getElementById("reminderDismiss"),
  calCard: document.getElementById("calCard"),
  weekdayCard: document.getElementById("weekdayCard"),
  timeCard: document.getElementById("timeCard"),
  tapLogCard: document.getElementById("tapLogCard"),
  sinceStrip: document.getElementById("sinceStrip"),
  sinceOverlay: document.getElementById("sinceOverlay"),
  sinceClose: document.getElementById("sinceClose"),
  sinceList: document.getElementById("sinceList"),
  sinceAdd: document.getElementById("sinceAdd"),
  waterOverlay: document.getElementById("waterOverlay"),
  waterClose: document.getElementById("waterClose"),
  waterBody: document.getElementById("waterBody"),
  treeOverlay: document.getElementById("treeOverlay"),
  treeClose: document.getElementById("treeClose"),
  treeBody: document.getElementById("treeBody"),
};

// ---- state ----
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

let today = load(KEY_TODAY, 0);
let taps = load(KEY_TAPS, 0);
let history = load(KEY_HISTORY, []);
let step = load(KEY_STEP, 0.5);
let goal = load(KEY_GOAL, 0);
let lastEnded = load(KEY_LASTENDED, null);
let haptic = load(KEY_HAPTIC, true);
let sound = load(KEY_SOUND, false);
let reminderOn = load(KEY_REMIND, false);
let reminderTime = load(KEY_REMIND_TIME, "20:00");
let since = load(KEY_SINCE, []);
let tapLog = load(KEY_TAPLOG, []);   // times of today's taps, for the Insights breakdown
let water = load(KEY_WATER, null);   // hydration for today (auto-reset on a new day)
let waterGlass = load(KEY_WATER_GLASS, 8);
let waterGoal = load(KEY_WATER_GOAL, 64);
let waterPresets = load(KEY_WATER_PRESETS, [4, 8, 12, 16, 20, 24]);
let calOffset = 0;                   // Insights calendar: months back from the current one
// Theme keys must match the CSS blocks + the head inline script's `order`.
const THEMES = [
  { key: "default", name: "Classic", accent: "#ff9500", bg: "#000000" },
  { key: "blue",    name: "Ocean",   accent: "#296dbe", bg: "#1f3238" },
  { key: "forest",  name: "Forest",  accent: "#2fae6a", bg: "#10221a" },
  { key: "teal",    name: "Teal",    accent: "#2bb7c4", bg: "#16191c" },
  { key: "grape",   name: "Grape",   accent: "#9b5de5", bg: "#1c1526" },
  { key: "rose",    name: "Rose",    accent: "#e5548b", bg: "#241820" },
  { key: "ember",   name: "Ember",   accent: "#f0632e", bg: "#201312" },
  { key: "gold",    name: "Gold",    accent: "#d9a520", bg: "#201c10" },
];
let theme = load(KEY_THEME, "default");
let themeAuto = load(KEY_THEME_AUTO, false);
// Local-midnight day number, so the auto theme flips on a new calendar day.
function dayIndex() {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}
function themeForToday() {
  const n = THEMES.length;
  return THEMES[((dayIndex() % n) + n) % n].key;
}
let tree = load(KEY_TREE, { level: 0, progress: 0, sad: false, seenLevel: 0, seenProgress: 0 });

// ---- daily encouragement ----
const QUOTES = [
  "Small steps, every day.",
  "Show up. That's the whole secret.",
  "Progress, not perfection.",
  "Consistency beats intensity.",
  "One more is enough.",
  "You're building something.",
  "A little today is a lot over time.",
  "Begin again, as many times as it takes.",
  "Quietly keep going.",
  "Done is better than perfect.",
  "The streak is built one day at a time.",
  "Today counts.",
  "Slow is smooth. Smooth is fast.",
  "Discipline is a kind of self-respect.",
  "Trust the process you can't yet see.",
  "Make it easy to start.",
  "Tiny gains compound.",
  "Be patient with the work.",
  "Showing up is already winning.",
  "Keep the promise you made yourself.",
  "Momentum loves a single step.",
  "You don't have to be fast, just faithful.",
  "Better today than yesterday.",
  "Earn it once more.",
];
function quoteOfTheDay() {
  const d = new Date();
  const seed = d.getFullYear() * 366 + monthDayIndex(d);
  return QUOTES[((seed % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
function monthDayIndex(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000); // day of year, local
}

// ---- helpers ----
function round2(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return String(round2(Number(n))); }   // trims trailing zeros: 12.5, 13, 0.25
function dayLabel(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function reduceMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

// ---- shared motion helpers ----
// Staggered entrance for a container's children (panels, grids, sheets).
function staggerIn(container, step, cap) {
  if (reduceMotion() || !container) return;
  step = step || 35; cap = cap == null ? 14 : cap;
  [...container.children].forEach((c, i) => {
    c.style.setProperty("--stg", Math.min(i, cap) * step);
    c.classList.add("stg-in");
    c.addEventListener("animationend", () => c.classList.remove("stg-in"), { once: true });
  });
}
// Replay a bar/fill growth: shrink to nothing, force reflow, restore —
// the element's existing CSS transition animates it back to size.
function growBars(container, sel, prop) {
  if (reduceMotion() || !container) return;
  prop = prop || "height";
  container.querySelectorAll(sel).forEach((b) => {
    const target = b.style[prop];
    const t = b.style.transition;
    b.style.transition = "none";
    b.style[prop] = prop === "height" ? "2px" : "0%";
    void b.getBoundingClientRect();
    b.style.transition = t;
    b.style[prop] = target;
  });
}
// A little burst of theme-coloured confetti from (x, y) — celebration only.
function confettiBurst(x, y, n) {
  if (reduceMotion()) return;
  const cs = getComputedStyle(document.documentElement);
  const colors = [cs.getPropertyValue("--accent"), cs.getPropertyValue("--safe"), cs.getPropertyValue("--accent-2"), cs.getPropertyValue("--warn")];
  for (let i = 0; i < (n || 18); i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit";
    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 110;
    bit.style.left = x + "px";
    bit.style.top = y + "px";
    bit.style.background = colors[i % colors.length];
    bit.style.borderRadius = Math.random() < 0.5 ? "50%" : "2px";
    bit.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    bit.style.setProperty("--dy", (Math.sin(ang) * dist - 55) + "px");   // biased upward
    bit.style.setProperty("--rot", (Math.random() * 540 - 270) + "deg");
    document.body.appendChild(bit);
    bit.addEventListener("animationend", () => bit.remove());
  }
}

// Progressive colour for the big number: it starts at the theme text colour
// (white in dark mode) and moves white → green → orange → red as today climbs
// toward the goal, so the colour tracks how close you are to your limit.
let COLOR_STOPS = null;
function parseRGB(c) {
  c = c.trim();
  if (c[0] === "#") {
    if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = c.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}
function readRGB(varName) {
  return parseRGB(getComputedStyle(document.documentElement).getPropertyValue(varName));
}
function refreshColorStops() {
  COLOR_STOPS = [
    { at: 0,    c: readRGB("--text") },
    { at: 0.45, c: readRGB("--num-lo") },
    { at: 0.78, c: readRGB("--num-mid") },
    { at: 1,    c: readRGB("--num-hi") },
  ];
}
function numberColor() {
  if (goal <= 0) return "";               // no goal → default text colour
  if (!COLOR_STOPS) refreshColorStops();
  const f = today / goal;
  if (f <= 0) return "";                   // at the start → default (white)
  const s = COLOR_STOPS;
  if (f >= 1) return `rgb(${s[3].c.join(",")})`;   // at or over goal → red
  for (let i = 1; i < s.length; i++) {
    if (f <= s[i].at) {
      const t = (f - s[i - 1].at) / (s[i].at - s[i - 1].at);
      const mix = s[i - 1].c.map((v, k) => Math.round(v + (s[i].c[k] - v) * t));
      return `rgb(${mix.join(",")})`;
    }
  }
  return "";
}

// Feature 4: roll the big number up/down to its new value instead of snapping.
let countRAF = null;
function setValue(target, animate) {
  if (countRAF) { cancelAnimationFrame(countRAF); countRAF = null; }
  const start = parseFloat(el.total.textContent);
  if (!animate || reduceMotion() || !isFinite(start) || start === target) {
    el.total.textContent = fmt(target); return;
  }
  const t0 = performance.now(), dur = 280;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const v = start + (target - start) * (1 - Math.pow(1 - p, 3));   // ease-out cubic
    el.total.textContent = fmt(v);
    if (p < 1) { countRAF = requestAnimationFrame(tick); }
    else { el.total.textContent = fmt(target); countRAF = null; }
  };
  countRAF = requestAnimationFrame(tick);
}

// Goal is a ceiling: streak = consecutive recent days that stayed at or under it.
function underStreak() {
  if (goal <= 0) return 0;
  let s = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].total <= goal) s++; else break;
  }
  if (taps > 0 && today <= goal) s++;   // today counts once started and still under
  return s;
}

// Which colour zone today sits in relative to the goal.
function zoneOf() {
  if (goal <= 0) return "none";
  if (today > goal) return "over";
  if (today / goal >= 0.8) return "warn";
  return "safe";
}

// Feature 3: total logged so far this week (Sunday start) + today in progress.
function weekTotal() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - now.getDay());
  let sum = today;
  history.forEach((d) => { if (new Date(d.endedAt) >= start) sum += d.total; });
  return sum;
}

// ---- insights ----
// Longest run of consecutive logged days that stayed at or under the goal.
function bestStreak() {
  if (goal <= 0) return 0;
  let best = 0, run = 0;
  history.forEach((d) => { if (d.total <= goal) { run++; if (run > best) best = run; } else run = 0; });
  return Math.max(best, underStreak());   // current in-progress run can be the best
}
// Sum logged in a given calendar month. offset 0 = this month, 1 = last month.
function monthSum(offset) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const ty = target.getFullYear(), tm = target.getMonth();
  let sum = 0;
  history.forEach((d) => {
    const dt = new Date(d.endedAt || d.date);
    if (dt.getFullYear() === ty && dt.getMonth() === tm) sum += d.total;
  });
  if (offset === 0) sum += today;   // include the day in progress
  return sum;
}

// ---- feedback ----
function buzz(ms) { if (haptic && navigator.vibrate) navigator.vibrate(ms); }
let audioCtx;
function click() {
  if (!sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sine"; o.frequency.value = 660;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.1);
  } catch (e) {}
}
let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2000);
}

// ---- render ----
// Full render: header + today + the insights panel (chart/history/stats).
function render() {
  el.date.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  el.quote.textContent = quoteOfTheDay();
  renderTop();
  renderInsights();
  renderChart();
  renderHistory();
  renderSinceStrip();
}

// Insights panel: a grid of headline stats above the chart and history.
function renderInsights() {
  const g = el.insightsGrid;
  g.textContent = "";
  const logged = history.length;
  const allAvg = logged ? history.reduce((s, d) => s + d.total, 0) / logged : 0;

  if (goal > 0) {
    const cur = underStreak();
    g.appendChild(statTile(String(cur), "Current streak", { good: cur > 0 }));
    g.appendChild(statTile(String(bestStreak()), "Best streak"));
    const under = history.filter((d) => d.total <= goal).length;
    g.appendChild(statTile(logged ? Math.round((under / logged) * 100) + "%" : "—", "Days under goal", { good: logged > 0 }));
    g.appendChild(statTile(fmt(round2(allAvg)), "Daily average"));
  } else {
    g.appendChild(statTile(fmt(weekTotal()), "This week"));
    g.appendChild(statTile(fmt(round2(allAvg)), "Daily average"));
    g.appendChild(statTile(logged ? fmt(Math.max(...history.map((d) => d.total))) : "—", "Highest day"));
    g.appendChild(statTile(String(logged), "Days logged"));
  }

  // this month, with a down-is-good delta against last month
  const tm = monthSum(0), lm = monthSum(1);
  let delta = null;
  if (lm > 0) {
    const pct = Math.round(((tm - lm) / lm) * 100);
    if (pct < 0) delta = { cls: "down", text: `▼ ${Math.abs(pct)}% vs last month` };
    else if (pct > 0) delta = { cls: "up", text: `▲ ${pct}% vs last month` };
    else delta = { cls: "flat", text: "same as last month" };
  }
  g.appendChild(statTile(fmt(round2(tm)), "This month", { delta }));
  if (goal > 0) g.appendChild(statTile(String(logged), "Days logged"));

  renderTapLog();
  renderCalendar();
  renderWeekday();
  renderTimeOfDay();
}

// Today's taps, by the clock — count plus a row per tap: the time, how much
// that tap added, and the running total after it. Resets when the day ends.
function tapEntry(e) {
  // tolerate the old format where a tap was stored as just a timestamp
  return typeof e === "number" ? { t: e, amt: null, total: null } : e;
}
// A timeline for a list of taps (time · amount added · running total).
// Taps that land in the same clock-minute are grouped into one row whose
// amount is their sum, so "+0.25 11:00 PM / +0.25 11:00 PM" reads "+0.50 11:00 PM".
function tapRows(taps) {
  const list = document.createElement("div");
  list.className = "tap-list";

  const groups = [];
  taps.forEach((raw) => {
    const e = tapEntry(raw);
    const label = new Date(e.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      if (e.amt != null) last.amt = round2((last.amt || 0) + e.amt);
      if (e.total != null) last.total = e.total;   // running total at the end of the minute
      last.count += 1;
    } else {
      groups.push({ label, amt: e.amt, total: e.total, count: 1 });
    }
  });

  groups.forEach((g) => {
    const row = document.createElement("div");
    row.className = "tap-row";

    const time = document.createElement("span");
    time.className = "tap-t";
    time.textContent = g.label + (g.count > 1 ? ` · ${g.count} taps` : "");

    const amt = document.createElement("span");
    amt.className = "tap-amt" + (g.amt < 0 ? " neg" : "");
    amt.textContent = g.amt != null ? (g.amt < 0 ? "− " + fmt(-g.amt) : "+" + fmt(g.amt)) : "";

    const tot = document.createElement("span");
    tot.className = "tap-total";
    tot.textContent = g.total != null ? fmt(g.total) : "—";

    row.append(time, amt, tot);
    list.appendChild(row);
  });
  return list;
}
function renderTapLog() {
  const card = el.tapLogCard;
  card.style.display = "block";
  card.textContent = "";

  const title = document.createElement("div");
  title.className = "section-title";
  title.textContent = `Today's taps · ${tapLog.length}`;
  card.appendChild(title);

  if (tapLog.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tap-empty";
    empty.textContent = "No taps yet today.";
    card.appendChild(empty);
    return;
  }
  card.appendChild(tapRows(tapLog));
}

const WK_INIT = ["S", "M", "T", "W", "T", "F", "S"];
const WK_NAME = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

// How many whole months back the earliest logged day sits (history is sorted ascending).
function earliestMonthOffset() {
  if (!history.length) return 0;
  const now = new Date();
  const first = new Date(history[0].endedAt || history[0].date);
  if (isNaN(first.getTime())) return 0;
  return Math.max(0, (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()));
}

// Calendar heatmap — each day tinted under (green) / over (red). calOffset lets
// you page back through previous months (0 = current month).
function renderCalendar() {
  const card = el.calCard;
  if (history.length === 0 && today === 0) { card.style.display = "none"; return; }
  card.style.display = "block";
  card.textContent = "";

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - calOffset, 1);
  const y = target.getFullYear(), m = target.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();
  const todayStr = isoLocal(now);

  // map date -> total (history + today in progress); keys are per-day so any month works
  const totals = {};
  history.forEach((d) => { totals[d.date] = d.total; });
  if (today > 0) totals[todayStr] = today;

  // header with ‹ month year › navigation
  const nav = document.createElement("div");
  nav.className = "cal-nav";
  const maxBack = earliestMonthOffset();
  const prev = document.createElement("button");
  prev.className = "cal-nav-btn"; prev.textContent = "‹"; prev.setAttribute("aria-label", "Previous month");
  prev.disabled = calOffset >= maxBack;
  prev.addEventListener("click", () => { if (calOffset < maxBack) { calOffset++; renderCalendar(); } });
  const title = document.createElement("div");
  title.className = "section-title";
  title.textContent = target.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const next = document.createElement("button");
  next.className = "cal-nav-btn"; next.textContent = "›"; next.setAttribute("aria-label", "Next month");
  next.disabled = calOffset <= 0;
  next.addEventListener("click", () => { if (calOffset > 0) { calOffset--; renderCalendar(); } });
  nav.append(prev, title, next);
  card.appendChild(nav);

  const grid = document.createElement("div");
  grid.className = "cal";
  WK_INIT.forEach((w) => { const h = document.createElement("div"); h.className = "cal-head"; h.textContent = w; grid.appendChild(h); });
  for (let i = 0; i < lead; i++) { const b = document.createElement("div"); b.className = "cal-day blank"; grid.appendChild(b); }
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = String(day);
    if (ds in totals) {
      if (goal > 0) cell.classList.add(totals[ds] <= goal ? "under" : "over");
      else cell.classList.add("logged");
      cell.title = `${ds}: ${fmt(totals[ds])}`;
    } else {
      cell.classList.add("empty");
    }
    if (ds === todayStr) cell.classList.add("today");
    grid.appendChild(cell);
  }
  card.appendChild(grid);

  if (goal > 0) {
    const lg = document.createElement("div");
    lg.className = "cal-legend";
    lg.innerHTML = `<span><i style="background:var(--safe)"></i>under goal</span><span><i style="background:var(--over)"></i>over goal</span>`;
    card.appendChild(lg);
  }
}

// Average by weekday — the highest (worst, for a limit) is flagged.
function renderWeekday() {
  const card = el.weekdayCard;
  if (history.length < 4) { card.style.display = "none"; return; }
  card.style.display = "block";
  card.textContent = "";

  const sums = Array(7).fill(0), counts = Array(7).fill(0);
  history.forEach((d) => { const wd = new Date(d.endedAt || d.date).getDay(); sums[wd] += d.total; counts[wd] += 1; });
  const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const max = Math.max(1, ...avgs);
  let peak = -1, peakVal = -1;
  avgs.forEach((a, i) => { if (counts[i] && a > peakVal) { peakVal = a; peak = i; } });

  const title = document.createElement("div");
  title.className = "section-title";
  title.textContent = "By weekday";
  card.appendChild(title);

  const wk = document.createElement("div");
  wk.className = "wk";
  avgs.forEach((a, i) => {
    const bar = document.createElement("div");
    bar.className = "wk-bar" + (i === peak ? " peak" : "");
    bar.style.height = Math.max(3, (a / max) * 100) + "%";
    bar.title = counts[i] ? `${WK_NAME[i]}: avg ${fmt(round2(a))}` : WK_NAME[i];
    wk.appendChild(bar);
  });
  card.appendChild(wk);

  const labels = document.createElement("div");
  labels.className = "wk-labels";
  WK_INIT.forEach((w) => { const s = document.createElement("span"); s.textContent = w; labels.appendChild(s); });
  card.appendChild(labels);

  if (peak >= 0) {
    const callout = document.createElement("div");
    callout.className = "wk-callout";
    callout.innerHTML = `Highest on <b>${WK_NAME[peak]}</b> — avg ${fmt(round2(peakVal))}`;
    card.appendChild(callout);
  }
}

function hourLabel(h) {
  const ampm = h < 12 ? "AM" : "PM";
  let hr = h % 12; if (hr === 0) hr = 12;
  return `${hr} ${ampm}`;
}

// When you typically tap — every recorded tap time (history + today) bucketed
// by hour of day, so you can see the rhythm of the habit.
function renderTimeOfDay() {
  const card = el.timeCard;
  const hours = new Array(24).fill(0);
  let count = 0;
  const addTimes = (arr) => {
    (arr || []).forEach((raw) => {
      const d = new Date(tapEntry(raw).t);
      if (!isNaN(d.getTime())) { hours[d.getHours()]++; count++; }
    });
  };
  history.forEach((d) => addTimes(d.tapTimes));
  addTimes(tapLog);

  if (count < 5) { card.style.display = "none"; return; }   // too little to be meaningful
  card.style.display = "block";
  card.textContent = "";

  const max = Math.max(1, ...hours);
  let peak = 0;
  hours.forEach((c, h) => { if (c > hours[peak]) peak = h; });

  addEl(card, "div", "By time of day", "section-title");

  const chart = document.createElement("div");
  chart.className = "tod";
  hours.forEach((c, h) => {
    const bar = document.createElement("div");
    bar.className = "tod-bar" + (h === peak ? " peak" : "");
    bar.style.height = Math.max(2, (c / max) * 100) + "%";
    bar.title = `${hourLabel(h)}: ${c} tap${c === 1 ? "" : "s"}`;
    chart.appendChild(bar);
  });
  card.appendChild(chart);

  const labels = document.createElement("div");
  labels.className = "tod-labels";
  ["12 AM", "6 AM", "12 PM", "6 PM", "12 AM"].forEach((t) => addEl(labels, "span", t));
  card.appendChild(labels);

  const callout = document.createElement("div");
  callout.className = "wk-callout";
  const share = Math.round((hours[peak] / count) * 100);
  callout.innerHTML = `You usually tap around <b>${hourLabel(peak)}</b> — ${share}% of taps`;
  card.appendChild(callout);
}

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statTile(value, label, opts) {
  opts = opts || {};
  const t = document.createElement("div");
  t.className = "tile";
  const v = document.createElement("div");
  v.className = "tile-val" + (opts.good ? " good" : "") + (opts.bad ? " bad" : "");
  v.textContent = value;
  const l = document.createElement("div");
  l.className = "tile-lbl";
  l.textContent = label;
  t.appendChild(v); t.appendChild(l);
  if (opts.delta) {
    const d = document.createElement("div");
    d.className = "tile-delta " + opts.delta.cls;
    d.textContent = opts.delta.text;
    t.appendChild(d);
  }
  return t;
}

function openInsights() {
  calOffset = 0;
  renderInsights();
  el.insightsOverlay.classList.add("show");
  // entrance choreography: tiles + cards rise in, bars grow to height
  staggerIn(el.insightsGrid, 30);
  const body = el.insightsOverlay.querySelector(".panel-body");
  if (body) staggerIn(body, 55, 8);
  growBars(el.chart, ".bar");
  growBars(el.weekdayCard, ".wk-bar");
  growBars(el.timeCard, ".tod-bar");
  const cal = el.calCard.querySelector(".cal");
  if (cal) staggerIn(cal, 6, 40);
}
function closeInsights() { el.insightsOverlay.classList.remove("show"); }

// Cheap render for the today area only — used on every tap so rapid
// tapping never rebuilds the history list.
function renderTop(animate) {
  const zone = zoneOf();
  setValue(today, animate);

  // colour the today area by how close we are to the goal
  el.totalWrap.classList.remove("zone-safe", "zone-warn", "zone-over");
  if (zone !== "none") el.totalWrap.classList.add("zone-" + zone);
  el.total.style.color = numberColor();   // white → green → orange → red toward the goal

  // streak line — tinted green while alive (Feature 2); a warm hello on a blank first run (Feature 7)
  const streak = underStreak();
  const firstRun = history.length === 0 && taps === 0 && today === 0;
  if (streak > 0) {
    el.meta.textContent = `✓ ${streak} ${streak === 1 ? "day" : "days"} under goal`;
    el.meta.classList.add("streak");
  } else {
    el.meta.classList.remove("streak");
    el.meta.textContent = firstRun ? "Welcome 👋 tap the button to begin" : "";
  }

  // goal ring + caption (ring is always visible; it fills only with a goal set)
  el.ringProg.style.strokeDasharray = RING_C;
  if (goal > 0) {
    el.totalWrap.classList.add("has-goal");
    const frac = Math.min(1, today / goal);
    el.ringProg.style.strokeDashoffset = RING_C * (1 - frac);
    // progress is already shown by the ring, the number's colour and the
    // button's "X left today" — no separate goal caption needed
    el.goalText.style.display = "none";
  } else {
    el.totalWrap.classList.remove("has-goal");
    el.ringProg.style.strokeDashoffset = RING_C;   // just the grey frame
    el.goalText.style.display = "";
    el.goalText.classList.add("hint");
    el.goalText.textContent = "Tap to set a daily goal →";
  }

  // button label + live headroom under it (Feature 3)
  el.addLabel.textContent = `+ ${fmt(step)}`;
  if (goal > 0) {
    if (today > goal) el.addSub.textContent = `${fmt(today - goal)} over`;
    else if (today === goal) el.addSub.textContent = "at your goal";
    else el.addSub.textContent = `${fmt(goal - today)} left today`;
  } else {
    el.addSub.textContent = "tap to add";
  }

  el.undo.disabled = taps === 0;
}

function renderChart() {
  const series = history.slice(-CHART_DAYS).map((d) => ({ value: d.total, today: false, label: d.label, date: d.endedAt || d.date }));
  series.push({ value: today, today: true, label: "today", date: new Date().toISOString() });

  if (history.length === 0 && today === 0) { el.chartCard.style.display = "none"; return; }
  el.chartCard.style.display = "block";
  el.chartTitle.textContent = `Last ${Math.min(CHART_DAYS, history.length) + 1} days`;

  // stats strip (avg of last 7 · best · success rate / this week)
  if (history.length > 0) {
    const recent = history.slice(-7);
    const avg = recent.reduce((s, d) => s + d.total, 0) / recent.length;
    const best = Math.max(...history.map((d) => d.total));
    let tail;
    if (goal > 0) {
      const under = history.filter((d) => d.total <= goal).length;
      tail = `<span>under goal <b>${under}/${history.length}</b></span>`;
    } else {
      tail = `<span>this week <b>${fmt(weekTotal())}</b></span>`;
    }
    el.chartStats.innerHTML =
      `avg <b>${fmt(avg)}</b>` +
      `<span>best <b>${fmt(best)}</b></span>` + tail;
  } else {
    el.chartStats.innerHTML = `this week <b>${fmt(weekTotal())}</b>`;
  }

  // scale includes the goal so the cap line always sits on the chart
  const max = Math.max(1, goal || 0, ...series.map((s) => s.value));
  el.chart.textContent = "";
  series.forEach((s) => {
    const over = goal > 0 && s.value > goal;
    const bar = document.createElement("div");
    bar.className = "bar" + (s.today ? " today" : "") + (over ? " over" : "");
    bar.style.height = Math.max(2, (s.value / max) * 100) + "%";
    bar.title = `${s.label}: ${fmt(s.value)}`;
    el.chart.appendChild(bar);
  });
  // dashed goal line across the chart
  if (goal > 0) {
    const line = document.createElement("div");
    line.className = "cap-line";
    line.style.bottom = (goal / max) * 100 + "%";
    el.chart.appendChild(line);
  }

  // weekday initials under each bar, today highlighted (Feature 5)
  const WK = ["S", "M", "T", "W", "T", "F", "S"];
  el.chartLabels.textContent = "";
  series.forEach((s) => {
    const lab = document.createElement("span");
    const dt = new Date(s.date);
    lab.textContent = isNaN(dt.getTime()) ? "" : WK[dt.getDay()];
    if (s.today) lab.className = "today";
    el.chartLabels.appendChild(lab);
  });

  // goal legend in the card header — replaces the inline tag so nothing overlaps the bars (Feature 6)
  el.chartLegend.innerHTML = goal > 0 ? `<i></i>goal ${fmt(goal)}` : "";
}

function renderHistory() {
  el.history.querySelectorAll(".hist-row").forEach((n) => n.remove());
  if (history.length === 0) { el.histEmpty.style.display = "block"; return; }
  el.histEmpty.style.display = "none";

  history.slice().reverse().forEach((day, i) => {
    const idx = history.length - 1 - i;
    const row = document.createElement("div");
    row.className = "hist-row";

    const top = document.createElement("div");
    top.className = "hist-top";
    const d = document.createElement("span");
    d.className = "date"; d.textContent = day.label;
    const a = document.createElement("span");
    a.className = "amt"; a.textContent = fmt(day.total);
    top.appendChild(d); top.appendChild(a);
    row.appendChild(top);

    if (day.note) {
      const note = document.createElement("div");
      note.className = "hist-note";
      note.textContent = "“" + day.note + "”";
      row.appendChild(note);
    }

    row.addEventListener("click", () => openHistorySheet(idx));
    el.history.appendChild(row);
  });
}

// ---- core actions ----
// Shared by the main +step button and the quick ±0.25 buttons: adjusts
// today's total, logs the tap (so Undo and the Insights timeline stay
// accurate for whichever button was actually used), and re-renders.
function applyDelta(amt, confirmed) {
  if (amt < 0 && today <= 0) return;   // nothing to subtract
  // Accountability: the tap that would cross the goal has to be a conscious
  // choice — pause and confirm instead of sliding over on autopilot.
  if (!confirmed && goal > 0 && amt > 0 && today <= goal && round2(today + amt) > goal) {
    confirmOver(amt);
    return;
  }
  const prev = today;
  today = round2(today + amt);
  if (today < 0) today = 0;
  taps += 1;
  tapLog.push({ t: Date.now(), amt: amt, total: today });
  save(KEY_TODAY, today); save(KEY_TAPS, taps); save(KEY_TAPLOG, tapLog);
  save(KEY_ACT_DATE, isoLocal(new Date()));   // remember which day this activity belongs to
  buzz(amt > 0 ? 15 : 10); click();
  el.total.classList.remove("bump"); void el.total.offsetWidth; el.total.classList.add("bump");
  if (goal > 0 && amt > 0) {
    if (prev < goal && today === goal) atGoalHeadsUp();        // landed exactly on the limit
    else if (prev <= goal && today > goal) warnOver();          // crossed over it
  }
  renderTop(true); renderChart();   // history list doesn't change on a tap
}
// The moment of truth: going over the goal requires an explicit yes.
function confirmOver(amt) {
  buzz([0, 20, 40, 20]);
  openSheet((s) => {
    addEl(s, "h3", "Go over your goal?");
    addEl(s, "p", `You're at ${fmt(today)} of ${fmt(goal)}. Adding ${fmt(amt)} puts you ${fmt(round2(today + amt - goal))} over.`, "sub");
    s.appendChild(makeBtn(`Add ${fmt(amt)} anyway`, "danger", () => { closeSheet(); applyDelta(amt, true); }));
    s.appendChild(makeBtn(`Stay at ${fmt(today)}`, "primary", closeSheet));
  });
}
function addTap(e) {
  spawnRipple(e);
  applyDelta(step);
}

// expanding ripple from the tap point on the big button
function spawnRipple(e) {
  if (reduceMotion()) return;
  const rect = el.add.getBoundingClientRect();
  const r = document.createElement("span");
  r.className = "ripple";
  const size = Math.max(rect.width, rect.height) * 1.1;
  r.style.width = r.style.height = size + "px";
  r.style.left = (e && e.clientX != null ? e.clientX - rect.left : rect.width / 2) + "px";
  r.style.top = (e && e.clientY != null ? e.clientY - rect.top : rect.height / 2) + "px";
  el.add.appendChild(r);
  r.addEventListener("animationend", () => r.remove());
}

// Landed exactly on the goal: a soft heads-up that the next tap goes over.
function atGoalHeadsUp() {
  buzz([0, 25, 45, 25]);
  el.ringWrap.classList.remove("pulse"); void el.ringWrap.offsetWidth; el.ringWrap.classList.add("pulse");
  toast("That's your goal — next tap goes over");
}

// A quiet nudge the moment you cross the goal — no celebration, just awareness.
function warnOver() {
  buzz(45);
  el.ringWrap.classList.remove("nudge"); void el.ringWrap.offsetWidth; el.ringWrap.classList.add("nudge");
  toast("Over your goal for today");
}
function undo() {
  if (taps === 0) return;
  const last = tapLog.pop();
  const amt = last != null ? tapEntry(last).amt : null;
  today = round2(today - (amt != null ? amt : step));   // reverse whatever the last tap actually added
  if (today < 0) today = 0;
  taps -= 1;
  save(KEY_TODAY, today); save(KEY_TAPS, taps); save(KEY_TAPLOG, tapLog);
  renderTop(true); renderChart();
}

// New: End Day opens a sheet with an optional note.
function openEndDay() {
  if (taps === 0 && today === 0) { toast("Nothing to log yet"); return; }
  openSheet((s) => {
    addEl(s, "h3", "End Day");
    // say plainly where the day landed against the goal
    let sub = `Log ${fmt(today)} and start a fresh day.`;
    if (goal > 0) {
      sub = today > goal
        ? `Log ${fmt(today)} — ${fmt(round2(today - goal))} over your ${fmt(goal)} goal.`
        : `Log ${fmt(today)} — under your ${fmt(goal)} goal ✓`;
    }
    addEl(s, "p", sub, "sub");

    addEl(s, "label", "Date for this day");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    // Default to the day these taps actually belong to (not necessarily
    // "today") — e.g. tapping through the evening and ending the day the
    // next morning should default to yesterday, not the day you happen to
    // be tapping "End Day" on.
    dateInput.value = load(KEY_ACT_DATE, isoLocal(new Date()));
    dateInput.max = isoLocal(new Date());
    s.appendChild(dateInput);

    addEl(s, "label", "Note for this day (optional)");
    const ta = document.createElement("textarea");
    ta.rows = 3; ta.placeholder = "e.g. how it went, anything notable…";
    s.appendChild(ta);
    s.appendChild(makeBtn("Log day ✓", "primary", () => {
      commitDay(ta.value.replace(/\s*\n\s*/g, " ").trim(), dateInput.value);
      closeSheet();
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
    setTimeout(() => ta.focus(), 50);
  });
}
function commitDay(note, dateStr) {
  const now = new Date();
  // log under the chosen date (keeping the current time of day), or today
  let when = now;
  if (dateStr) {
    const [y, mo, d] = dateStr.split("-").map(Number);
    if (y && mo && d) when = new Date(y, mo - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  }
  const total = today;
  const underGoal = goal > 0 && total <= goal;
  const entry = {
    date: isoLocal(when),
    label: dayLabel(when),
    total: total, taps: taps, endedAt: when.toISOString(),
    note: note || "", tapTimes: tapLog.slice(),
  };
  history.push(entry);
  // keep chronological order so the chart, streaks and calendar stay correct
  // even when a day is logged under an earlier date
  history.sort((a, b) => new Date(a.endedAt || a.date) - new Date(b.endedAt || b.date));
  lastEnded = entry;
  today = 0; taps = 0; tapLog = [];
  save(KEY_HISTORY, history); save(KEY_LASTENDED, lastEnded);
  save(KEY_TODAY, today); save(KEY_TAPS, taps); save(KEY_TAPLOG, tapLog);

  // grow the tree on an under-goal day; a miss makes it droop (no growth)
  let prestiged = false;
  if (goal > 0) {
    if (underGoal) {
      tree.sad = false;
      tree.progress += 1;
      if (tree.progress >= TREE_DAYS) { tree.progress = 0; tree.level += 1; prestiged = true; }
    } else {
      tree.sad = true;
    }
    save(KEY_TREE, tree);
  }

  // a fuller "day complete" moment
  buzz(prestiged ? [0, 40, 60, 40, 60, 90] : [0, 35, 40, 35, 40, 70]);
  const overBy = goal > 0 && total > goal ? ` · ${fmt(round2(total - goal))} over goal` : "";
  toast(prestiged
    ? `🌳 Tree fully grown — Prestige ${tree.level}!`
    : `Day complete · ${fmt(total)} logged${underGoal ? " · under goal ✓" : overBy}`);
  el.ringWrap.classList.remove("pulse"); void el.ringWrap.offsetWidth; el.ringWrap.classList.add("pulse");

  // confetti from the ring for a day finished under the goal (never when over —
  // the celebration is reserved for keeping the promise)
  if (underGoal) {
    const r = el.ringWrap.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top + r.height / 2, prestiged ? 28 : 18);
  }

  // refresh the header/quote, then let the number roll down to 0 and the ring drain
  el.date.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  el.quote.textContent = quoteOfTheDay();
  el.total.textContent = fmt(total);   // seed the count-down start value
  renderTop(true);
  renderChart();
  renderHistory();

  // animate the freshly logged day sliding into the list (only when it's the
  // most recent entry — a back-dated day lands further down, not at the top)
  if (history[history.length - 1] === entry) {
    const firstRow = el.history.querySelector(".hist-row");
    if (firstRow) firstRow.classList.add("enter");
  }
}

// Accountability: if the running count was built on a previous day and never
// ended, catch it on the next open — otherwise yesterday quietly bleeds into
// today and the record stops being honest.
function checkStaleDay() {
  const actDate = load(KEY_ACT_DATE, null);
  const todayStr = isoLocal(new Date());
  if (!(today > 0) || !actDate || actDate >= todayStr) return;
  if (el.overlay.classList.contains("show")) return;   // don't clobber an open sheet
  const [y, mo, d] = actDate.split("-").map(Number);
  const label = dayLabel(new Date(y, mo - 1, d));
  openSheet((s) => {
    addEl(s, "h3", "Finish " + label + "?");
    addEl(s, "p", `You logged ${fmt(today)} on ${label} but never ended the day. Log it to that day so today starts clean?`, "sub");
    s.appendChild(makeBtn(`Log ${fmt(today)} to ${label}`, "primary", () => {
      closeSheet();
      commitDay("", actDate);
    }));
    s.appendChild(makeBtn("Keep counting as today", "ghost", () => {
      save(KEY_ACT_DATE, todayStr);   // fold it into today on purpose — stop asking
      closeSheet();
    }));
  });
}

// Feature 9: undo the most recent End Day (merges it back into today).
function undoEndDay() {
  if (!lastEnded) { toast("Nothing to restore"); return; }
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].endedAt === lastEnded.endedAt) { history.splice(i, 1); break; }
  }
  today = round2(today + lastEnded.total);
  taps = taps + (lastEnded.taps || 0);
  tapLog = (lastEnded.tapTimes || []).concat(tapLog);
  lastEnded = null;
  save(KEY_HISTORY, history); save(KEY_TODAY, today);
  save(KEY_TAPS, taps); save(KEY_LASTENDED, lastEnded); save(KEY_TAPLOG, tapLog);
  toast("End Day undone");
  render();
}

// ---- bottom sheet plumbing ----
function openSheet(builder) {
  el.sheet.textContent = "";
  builder(el.sheet);
  el.overlay.classList.add("show");
  staggerIn(el.sheet, 22, 10);   // fast content rise so forms feel snappy, not slow
}
function closeSheet() { el.overlay.classList.remove("show"); }
function addEl(parent, tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}
function makeBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = "sheet-btn " + (cls || "");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
function makeToggle(parent, labelText, checked) {
  const row = document.createElement("div");
  row.className = "toggle-row";
  const span = document.createElement("span");
  span.textContent = labelText;
  const sw = document.createElement("label");
  sw.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox"; input.checked = checked;
  const slider = document.createElement("span");
  slider.className = "slider";
  sw.appendChild(input); sw.appendChild(slider);
  row.appendChild(span); row.appendChild(sw);
  parent.appendChild(row);
  return input;
}
// custom confirm via sheet (replaces native confirm)
function confirmSheet(title, sub, confirmLabel, onYes, danger) {
  openSheet((s) => {
    addEl(s, "h3", title);
    if (sub) addEl(s, "p", sub, "sub");
    s.appendChild(makeBtn(confirmLabel, danger ? "danger" : "primary", () => { closeSheet(); onYes(); }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}

// Feature 1 + 7 + 5: settings (step, goal, toggles) + undo End Day.
function openSettings() {
  openSheet((s) => {
    addEl(s, "h3", "Settings");

    addEl(s, "label", "Amount added per tap");
    const stepInput = numInput(fmt(step), "0.01");
    s.appendChild(stepInput);

    addEl(s, "label", "Daily goal (blank or 0 for none)");
    const goalInput = numInput(goal > 0 ? fmt(goal) : "", "0");
    s.appendChild(goalInput);

    const hapticToggle = makeToggle(s, "Vibrate on tap", haptic);
    const soundToggle = makeToggle(s, "Sound on tap", sound);

    // Theme picker — swatches apply live; daily auto-rotate is a toggle.
    addEl(s, "label", "Theme");
    const themeGrid = document.createElement("div");
    themeGrid.className = "theme-grid";
    let autoInput;
    const buildSwatches = () => {
      themeGrid.textContent = "";
      THEMES.forEach((th) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "theme-swatch" + (theme === th.key ? " on" : "");
        b.disabled = themeAuto;
        b.style.setProperty("--sw-accent", th.accent);
        b.style.setProperty("--sw-bg", th.bg);
        const dot = document.createElement("span"); dot.className = "theme-dot";
        const nm = document.createElement("span"); nm.className = "theme-name"; nm.textContent = th.name;
        b.append(dot, nm);
        b.addEventListener("click", () => {
          theme = th.key; themeAuto = false; save(KEY_THEME_AUTO, false);
          if (autoInput) autoInput.checked = false;
          themeFade(); applyTheme(); buzz(6); buildSwatches();
        });
        themeGrid.appendChild(b);
      });
    };
    buildSwatches();
    s.appendChild(themeGrid);

    autoInput = makeToggle(s, "Switch theme every day", themeAuto);
    autoInput.addEventListener("change", () => {
      themeAuto = autoInput.checked;
      save(KEY_THEME_AUTO, themeAuto);
      themeFade(); applyTheme(); buzz(8); buildSwatches();
    });
    addEl(s, "p", "Rotates through all themes — a new one each day.", "sub");

    const remindToggle = makeToggle(s, "Daily reminder", reminderOn);
    addEl(s, "label", "Reminder time");
    const timeInput = document.createElement("input");
    timeInput.type = "time"; timeInput.value = reminderTime || "20:00";
    s.appendChild(timeInput);
    addEl(s, "p", "A nudge if you haven't tracked by this time. On iPhone, reminders show while the app is open — add it to your Home Screen for the best chance of a notification.", "sub");

    s.appendChild(makeBtn("Save", "primary", () => {
      const ns = parseFloat(stepInput.value);
      if (isNaN(ns) || ns <= 0) { toast("Step must be greater than 0"); return; }
      step = round2(ns);
      const ng = parseFloat(goalInput.value);
      goal = isNaN(ng) || ng <= 0 ? 0 : round2(ng);
      haptic = hapticToggle.checked;
      sound = soundToggle.checked;
      const wasOff = !reminderOn;
      reminderOn = remindToggle.checked;
      reminderTime = timeInput.value || "20:00";
      save(KEY_STEP, step); save(KEY_GOAL, goal);
      save(KEY_HAPTIC, haptic); save(KEY_SOUND, sound);
      save(KEY_REMIND, reminderOn); save(KEY_REMIND_TIME, reminderTime);
      if (reminderOn && wasOff && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      closeSheet(); render(); checkReminder();
    }));

    if (lastEnded) {
      s.appendChild(makeBtn(`↶ Undo last End Day (${fmt(lastEnded.total)})`, "", () => { closeSheet(); undoEndDay(); }));
    }

    const divider = document.createElement("hr");
    divider.className = "sheet-divider";
    s.appendChild(divider);
    s.appendChild(makeBtn(lockSet() ? "App Lock — On" : "App Lock — Off", "", () => { closeSheet(); openLockSettings(); }));
    s.appendChild(makeBtn("Export backup (CSV)", "link", exportCsv));

    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}

// Feature 5: tap a history day to edit its date / total / note, or delete.
// Also shows the times that day's taps happened, if recorded.
function openHistorySheet(idx) {
  const day = history[idx];
  if (!day) return;
  openSheet((s) => {
    addEl(s, "h3", day.label);

    addEl(s, "label", "Date");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = day.date || isoLocal(new Date(day.endedAt || Date.now()));
    dateInput.max = isoLocal(new Date());
    s.appendChild(dateInput);

    addEl(s, "label", "Total for this day");
    const input = numInput(fmt(day.total), "0");
    s.appendChild(input);

    addEl(s, "label", "Note");
    const ta = document.createElement("textarea");
    ta.rows = 3; ta.value = day.note || ""; ta.placeholder = "No note";
    s.appendChild(ta);

    // tap times for this day, if they were recorded when it was logged
    if (day.tapTimes && day.tapTimes.length) {
      addEl(s, "label", `Tap times · ${day.tapTimes.length}`);
      const scroll = document.createElement("div");
      scroll.className = "tap-scroll";
      scroll.appendChild(tapRows(day.tapTimes));
      s.appendChild(scroll);
    }

    s.appendChild(makeBtn("Save", "primary", () => {
      const v = parseFloat(input.value);
      if (isNaN(v) || v < 0) { toast("Enter a number ≥ 0"); return; }
      day.total = round2(v);
      day.note = ta.value.replace(/\s*\n\s*/g, " ").trim();
      // move the day to a new date, keeping its original time of day
      const ds = dateInput.value;
      if (ds) {
        const [y, mo, d] = ds.split("-").map(Number);
        if (y && mo && d) {
          const old = new Date(day.endedAt || day.date);
          const t = isNaN(old.getTime()) ? { h: 12, m: 0, s: 0 } : { h: old.getHours(), m: old.getMinutes(), s: old.getSeconds() };
          const when = new Date(y, mo - 1, d, t.h, t.m, t.s);
          day.date = isoLocal(when);
          day.label = dayLabel(when);
          day.endedAt = when.toISOString();
        }
      }
      // keep chronological order so charts/streaks/calendar stay correct
      history.sort((a, b) => new Date(a.endedAt || a.date) - new Date(b.endedAt || b.date));
      save(KEY_HISTORY, history);
      closeSheet(); render();
    }));
    s.appendChild(makeBtn("Delete this day", "danger", () => {
      confirmSheet(`Delete ${day.label}?`, `${fmt(day.total)} will be removed.`, "Delete", () => {
        const di = history.indexOf(day);
        if (di >= 0) history.splice(di, 1);
        save(KEY_HISTORY, history); render();
      }, true);
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}
function numInput(value, min) {
  const i = document.createElement("input");
  i.type = "number"; i.step = "0.01"; if (min != null) i.min = min;
  i.value = value;
  return i;
}

// ---- backup export (notes quoted so commas are safe) ----
function csvField(v) {
  v = String(v == null ? "" : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function exportCsv() {
  const rows = [["date", "ended_at", "total", "taps", "note"]];
  history.forEach((d) => rows.push([d.date, d.endedAt, fmt(d.total), d.taps, d.note || ""]));
  if (taps > 0 || today > 0) rows.push(["(today, in progress)", "", fmt(today), taps, ""]);
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `backup-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Backup downloaded");
}

// ---- app lock (passcode + optional Face ID via WebAuthn) ----
// A privacy gate on this device. Data isn't encrypted; this keeps casual
// eyes out, the way iOS app locks do.
let pinEntry = "";
let BIO_AVAIL = false;
(async () => {
  try { BIO_AVAIL = !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch (e) { BIO_AVAIL = false; }
})();

function lockSet() { return !!load(KEY_LOCK_PIN, null); }
function bioSet() { return !!load(KEY_LOCK_BIO, null); }
function clearLock() { [KEY_LOCK_PIN, KEY_LOCK_SALT, KEY_LOCK_BIO].forEach((k) => localStorage.removeItem(k)); }

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randHex(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const LOCK_GRACE_MS = 60 * 60 * 1000;   // don't re-ask within 1 hour of unlocking

async function setPin(pin) {
  const salt = randHex(16);
  save(KEY_LOCK_SALT, salt);
  save(KEY_LOCK_PIN, await sha256(pin + salt));
  save(KEY_UNLOCK_AT, Date.now());   // just set it — start the grace window now
}
// Show the lock only if the grace window since the last unlock has lapsed;
// otherwise refresh the window so quick in-and-out trips don't re-prompt.
function maybeLock() {
  if (!lockSet()) return;
  if (Date.now() - (load(KEY_UNLOCK_AT, 0) || 0) > LOCK_GRACE_MS) showLock();
  else save(KEY_UNLOCK_AT, Date.now());
}
async function pinMatches(pin) {
  return (await sha256(pin + load(KEY_LOCK_SALT, ""))) === load(KEY_LOCK_PIN, null);
}

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Tracker", id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "owner", displayName: "owner" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
    timeout: 60000,
  } });
  save(KEY_LOCK_BIO, b64(cred.rawId));
}
async function bioUnlock() {
  const id = load(KEY_LOCK_BIO, null);
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: "public-key", id: unb64(id) }],
    userVerification: "required",
    timeout: 60000,
  } });
}

function showLock() {
  pinEntry = "";
  el.lockError.textContent = "";
  el.lock.classList.remove("out");
  el.lock.style.display = "flex";
  document.body.style.overflow = "hidden";
  buildPad();
  staggerIn(el.lockPad, 12, 12);   // quick key cascade — input works immediately
  updateDots();
}
function hideLock() {
  // grace window + ghost-click guard start immediately; the visual melts out
  save(KEY_UNLOCK_AT, Date.now());
  swallowGhostClick();
  document.body.style.overflow = "";
  if (reduceMotion()) { el.lock.style.display = "none"; return; }
  el.lock.classList.add("out");   // pointer-events:none while fading
  setTimeout(() => { el.lock.style.display = "none"; el.lock.classList.remove("out"); }, 230);
}
// The passcode keys respond on pointerdown for instant feedback, so the last
// correct digit can hide the lock screen before the browser's trailing
// "click" for that same tap fires. With the lock screen already gone, that
// click falls through to whatever's underneath — usually the ring, which
// opens Settings. Swallow exactly one click right after unlocking so it
// never reaches the page behind the lock screen.
function swallowGhostClick() {
  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => document.removeEventListener("click", swallow, true), 500);
}
function updateDots() {
  el.lockDots.querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i < pinEntry.length));
}
async function pinKey(d) {
  if (pinEntry.length >= 4) return;
  pinEntry += d; updateDots(); buzz(8);
  if (pinEntry.length === 4) {
    if (await pinMatches(pinEntry)) { buzz(20); hideLock(); }
    else {
      el.lockError.textContent = "Wrong passcode";
      el.lock.classList.remove("shake"); void el.lock.offsetWidth; el.lock.classList.add("shake");
      buzz([0, 40, 60, 40]);
      pinEntry = ""; setTimeout(updateDots, 250);
    }
  }
}
function pinDel() { if (!pinEntry) return; pinEntry = pinEntry.slice(0, -1); updateDots(); buzz(6); }
async function tryBio() {
  try { await bioUnlock(); buzz(20); hideLock(); }
  catch (e) { el.lockError.textContent = "Face ID failed — enter passcode"; }
}
const KEY_ABC = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };
function buildPad() {
  el.lockPad.textContent = "";
  ["1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach((k) => el.lockPad.appendChild(padKey(k, () => pinKey(k))));
  el.lockPad.appendChild(bioSet() ? padKey("Face ID", tryBio, true) : blankKey());
  el.lockPad.appendChild(padKey("0", () => pinKey("0")));
  el.lockPad.appendChild(padKey("⌫", pinDel, true));
}
function blankKey() { const d = document.createElement("div"); d.className = "lock-key blank"; return d; }
function padKey(label, fn, isFn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lock-key" + (isFn ? " fn" : "");
  if (!isFn && /^\d$/.test(label)) {
    const num = document.createElement("span"); num.className = "num"; num.textContent = label;
    const abc = document.createElement("span"); abc.className = "abc"; abc.textContent = KEY_ABC[label] || "";
    b.append(num, abc);
  } else {
    b.textContent = label;   // Face ID / ⌫
  }
  // Fire on pointer-down for an instant, native-feeling press (no click delay).
  const release = () => b.classList.remove("pressed");
  b.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;        // ignore right/middle mouse
    if (el.lock.style.display !== "flex") return;  // ignore stray events when hidden
    e.preventDefault();
    b.classList.add("pressed");
    setTimeout(release, 180);   // guarantee the visual clears even if pointerup is missed
    fn();
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, release));
  return b;
}

// Lock settings live behind a button in the main settings sheet.
function openLockSettings() {
  openSheet((s) => {
    addEl(s, "h3", "App Lock");
    addEl(s, "p", "Lock the app on this device. Your data stays on your phone — this is a privacy lock, not encryption.", "sub");

    const pinToggle = makeToggle(s, "Require passcode", lockSet());
    pinToggle.addEventListener("change", () => {
      if (pinToggle.checked) { closeSheet(); promptSetPin(); }
      else {
        confirmSheet("Turn off App Lock?", "Removes your passcode" + (bioSet() ? " and Face ID." : "."), "Turn off", () => {
          clearLock(); toast("App Lock off");
        }, true);
      }
    });

    if (BIO_AVAIL) {
      const bioToggle = makeToggle(s, "Unlock with Face ID", bioSet());
      bioToggle.addEventListener("change", async () => {
        if (bioToggle.checked) {
          if (!lockSet()) { toast("Set a passcode first"); bioToggle.checked = false; return; }
          try { await bioRegister(); toast("Face ID enabled"); }
          catch (e) { bioToggle.checked = false; toast("Couldn't enable Face ID"); }
        } else {
          localStorage.removeItem(KEY_LOCK_BIO); toast("Face ID off");
        }
      });
    }

    s.appendChild(makeBtn("Done", "primary", closeSheet));
  });
}
function promptSetPin() {
  openSheet((s) => {
    addEl(s, "h3", "Set passcode");
    addEl(s, "p", "Choose a 4-digit passcode.", "sub");
    addEl(s, "label", "New passcode");
    const a = pinField(); s.appendChild(a);
    addEl(s, "label", "Confirm passcode");
    const b = pinField(); s.appendChild(b);
    s.appendChild(makeBtn("Save passcode", "primary", async () => {
      if (!/^\d{4}$/.test(a.value)) { toast("Enter 4 digits"); return; }
      if (a.value !== b.value) { toast("Passcodes don't match"); return; }
      await setPin(a.value);
      closeSheet(); toast("App Lock on");
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
    setTimeout(() => a.focus(), 60);
  });
}
function pinField() {
  const i = document.createElement("input");
  i.type = "password"; i.inputMode = "numeric"; i.maxLength = 4;
  i.autocomplete = "off"; i.setAttribute("pattern", "[0-9]*");
  return i;
}

// ---- daily reminder ----
// A dependable in-app nudge, plus a best-effort OS notification. On iOS a
// PWA can only deliver notifications while it's open, so the in-app banner
// is the reliable part.
function hasActivityToday() {
  const t = isoLocal(new Date());
  return taps > 0 || today > 0 || history.some((d) => d.date === t);
}
function checkReminder() {
  if (!reminderOn) { el.reminder.style.display = "none"; return; }
  const now = new Date();
  const [h, m] = (reminderTime || "20:00").split(":").map(Number);
  const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  const todayStr = isoLocal(now);
  if (due && !hasActivityToday() && load(KEY_REMIND_DISMISS, null) !== todayStr) {
    el.reminder.style.display = "flex";
    notifyOnce(todayStr);
  } else {
    el.reminder.style.display = "none";
  }
}
function notifyOnce(todayStr) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (load(KEY_REMIND_LAST, null) === todayStr) return;
  save(KEY_REMIND_LAST, todayStr);
  const body = "Don't forget to track today.";
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification("Tracker", { body, icon: "icon-192.png", badge: "icon-192.png", tag: "daily" })).catch(() => {});
    } else {
      new Notification("Tracker", { body });
    }
  } catch (e) {}
}

// ---- time since (a small, separate tool) ----
// Counts up from a chosen moment, like a "days since" milestone tracker.
let sinceTimer = null;

function sid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function partsMs(ms) {
  if (ms < 0) ms = 0;
  const t = Math.floor(ms / 1000);
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
function sinceParts(start) { return partsMs(Date.now() - new Date(start).getTime()); }
function bigSince(p) {
  if (p.d > 0) return { n: p.d, u: p.d === 1 ? "day" : "days" };
  if (p.h > 0) return { n: p.h, u: p.h === 1 ? "hour" : "hours" };
  if (p.m > 0) return { n: p.m, u: p.m === 1 ? "minute" : "minutes" };
  return { n: p.s, u: p.s === 1 ? "second" : "seconds" };
}
// A short label for a duration in ms, e.g. "12d 4h", "5h 12m", "2m".
function durLabel(ms) {
  const p = partsMs(ms);
  if (p.d > 0) return `${p.d}d ${p.h}h`;
  if (p.h > 0) return `${p.h}h ${p.m}m`;
  if (p.m > 0) return `${p.m}m ${p.s}s`;
  return `${p.s}s`;
}
// Milestones a "time since" run can reach. Past a year we roll over to whole years.
const HR = 3600e3, DAY = 86400e3, YR = 365 * DAY;
const MILES = [
  { ms: HR, label: "1 hour", short: "1h" }, { ms: 12 * HR, label: "12 hours", short: "12h" },
  { ms: DAY, label: "1 day", short: "1d" }, { ms: 3 * DAY, label: "3 days", short: "3d" },
  { ms: 7 * DAY, label: "1 week", short: "1w" }, { ms: 14 * DAY, label: "2 weeks", short: "2w" },
  { ms: 30 * DAY, label: "1 month", short: "1mo" }, { ms: 90 * DAY, label: "3 months", short: "3mo" },
  { ms: 180 * DAY, label: "6 months", short: "6mo" }, { ms: YR, label: "1 year", short: "1y" },
];
// The next milestone above the elapsed time, and the previous one reached.
function nextMile(ms) {
  for (const m of MILES) if (m.ms > ms) return m;
  const years = Math.floor(ms / YR) + 1;
  return { ms: years * YR, label: years + " years" };
}
function prevMileMs(ms) {
  let p = 0;
  for (const m of MILES) { if (m.ms <= ms) p = m.ms; else return p; }
  if (ms >= YR) p = Math.floor(ms / YR) * YR;
  return p;
}
// The milestones to show as chips — the fixed set, plus whole years once past one.
function mileList(elapsed) {
  const out = MILES.map((m) => ({ ms: m.ms, short: m.short }));
  if (elapsed >= YR) {
    const years = Math.floor(elapsed / YR) + 1;
    for (let y = 2; y <= years; y++) out.push({ ms: y * YR, short: y + "y" });
  }
  return out;
}
// Money/units accrued so far at a per-day rate. Symbols prefix, words suffix.
function savedText(rate, unit, ms) {
  const total = round2(rate * (ms / DAY));
  const u = (unit || "$").trim();
  const sym = u.length <= 1 || ["$", "£", "€", "¥", "₹"].includes(u);
  return sym ? `${u}${fmt(total)}` : `${fmt(total)} ${u}`;
}
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderSince() {
  const list = el.sinceList;
  list.textContent = "";
  if (since.length === 0) {
    const e = document.createElement("div");
    e.className = "since-empty";
    e.textContent = "Nothing tracked yet. Add something you want to count the time since — a fresh start, a milestone, a habit you're keeping up.";
    list.appendChild(e);
    return;
  }
  since.forEach((it) => {
    const elapsed = Math.max(0, Date.now() - new Date(it.start).getTime());
    const p = partsMs(elapsed);
    const b = bigSince(p);
    const card = document.createElement("div");
    card.className = "since-card";
    const name = document.createElement("div"); name.className = "since-name"; name.textContent = it.name;
    const big = document.createElement("div"); big.className = "since-big";
    big.innerHTML = `${b.n}<span class="since-unit">${b.u}</span>`;
    const det = document.createElement("div"); det.className = "since-detail";
    det.textContent = `${p.d}d ${p.h}h ${p.m}m ${p.s}s`;
    card.append(name, big, det);

    // the "why" — a motivation note
    if (it.note) {
      const note = document.createElement("div"); note.className = "since-note";
      note.textContent = it.note;
      card.appendChild(note);
    }

    // running savings / units avoided at a per-day rate
    if (it.rate > 0) {
      const saved = document.createElement("div"); saved.className = "since-saved";
      const val = document.createElement("span"); val.className = "since-saved-val";
      val.textContent = savedText(it.rate, it.unit, elapsed);
      const sub = document.createElement("span"); sub.className = "since-saved-sub";
      sub.textContent = savedText(it.rate, it.unit, DAY) + " per day";
      saved.append(val, sub);
      card.appendChild(saved);
    }

    // progress toward the next milestone
    const next = nextMile(elapsed), prev = prevMileMs(elapsed);
    const frac = Math.min(1, Math.max(0, (elapsed - prev) / (next.ms - prev)));
    const prog = document.createElement("div"); prog.className = "since-prog";
    const head = document.createElement("div"); head.className = "since-prog-head";
    head.innerHTML = `<span>Next: ${next.label}</span><span>${durLabel(next.ms - elapsed)} left</span>`;
    const bar = document.createElement("div"); bar.className = "since-bar";
    const fill = document.createElement("i"); fill.style.width = (frac * 100) + "%";
    bar.appendChild(fill);
    prog.append(head, bar);
    card.appendChild(prog);

    // milestone journey — chips light up as each is reached, next is outlined
    const miles = mileList(elapsed);
    const mWrap = document.createElement("div"); mWrap.className = "since-miles";
    let markedNext = false;
    miles.forEach((mi) => {
      const chip = document.createElement("span"); chip.className = "since-mile";
      chip.textContent = mi.short;
      if (elapsed >= mi.ms) chip.classList.add("reached");
      else if (!markedNext) { chip.classList.add("next"); markedNext = true; }
      mWrap.appendChild(chip);
    });
    card.appendChild(mWrap);

    // best run + reset count (only once they're meaningful)
    const best = it.best || 0, resets = it.resets || 0;
    if (best > 0 || resets > 0) {
      const stats = document.createElement("div"); stats.className = "since-stats";
      const parts = [];
      if (best > 0) parts.push(`Best <b>${durLabel(best)}</b>`);
      if (resets > 0) parts.push(`Reset <b>${resets}×</b>`);
      stats.innerHTML = parts.join(" · ");
      card.appendChild(stats);
    }

    const st = document.createElement("div"); st.className = "since-start";
    st.textContent = "since " + new Date(it.start).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    card.appendChild(st);
    card.addEventListener("click", () => openSinceForm(it.id));
    list.appendChild(card);
  });
  renderSinceStrip();   // keep the main-page strip in sync with any changes
}
// Compact main-page strip: one chip per tracker (name + elapsed), live.
const SS_CLOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>';
let sinceStripAnimated = false;   // chips slide in once per app open, not on every re-render
function renderSinceStrip() {
  const strip = el.sinceStrip;
  if (!since.length) { strip.style.display = "none"; strip.textContent = ""; return; }
  strip.style.display = "flex";
  strip.textContent = "";
  since.forEach((it) => {
    const elapsed = Math.max(0, Date.now() - new Date(it.start).getTime());
    const chip = document.createElement("div"); chip.className = "ss-chip";
    chip.innerHTML = SS_CLOCK;
    const name = document.createElement("span"); name.className = "ss-name"; name.textContent = it.name;
    const val = document.createElement("span"); val.className = "ss-val"; val.textContent = durLabel(elapsed);
    chip.append(name, val);
    chip.addEventListener("click", openSince);
    strip.appendChild(chip);
  });
  if (!sinceStripAnimated) { sinceStripAnimated = true; staggerIn(strip, 60, 6); }
}
// Cheap per-second update: refresh just the values so horizontal scroll isn't reset.
function tickSinceStrip() {
  const chips = el.sinceStrip.querySelectorAll(".ss-chip");
  if (chips.length !== since.length) { renderSinceStrip(); return; }
  since.forEach((it, i) => {
    const elapsed = Math.max(0, Date.now() - new Date(it.start).getTime());
    const val = chips[i].querySelector(".ss-val");
    if (val) val.textContent = durLabel(elapsed);
  });
}
function openSince() {
  renderSince();
  el.sinceOverlay.classList.add("show");
  // cards rise in and their milestone bars fill (kept quick — the panel
  // re-renders every second, so the entrance must finish well before then)
  staggerIn(el.sinceList, 60, 6);
  growBars(el.sinceList, ".since-bar i", "width");
  clearInterval(sinceTimer);
  sinceTimer = setInterval(() => { if (el.sinceOverlay.classList.contains("show")) renderSince(); }, 1000);
}
function closeSince() {
  el.sinceOverlay.classList.remove("show");
  clearInterval(sinceTimer); sinceTimer = null;
}
function openSinceForm(id) {
  const existing = id != null ? since.find((x) => x.id === id) : null;
  openSheet((s) => {
    addEl(s, "h3", existing ? "Edit tracker" : "New tracker");
    addEl(s, "label", "Name");
    const name = document.createElement("input");
    name.type = "text"; name.maxLength = 40; name.placeholder = "e.g. Daily walk";
    name.value = existing ? existing.name : "";
    s.appendChild(name);
    addEl(s, "label", "Counting since");
    const start = document.createElement("input");
    start.type = "datetime-local";
    start.value = toLocalInput(existing ? new Date(existing.start) : new Date());
    s.appendChild(start);

    addEl(s, "label", "Your why (optional)");
    const noteTa = document.createElement("textarea");
    noteTa.rows = 2; noteTa.maxLength = 140; noteTa.placeholder = "Why this matters to you…";
    noteTa.value = existing ? (existing.note || "") : "";
    s.appendChild(noteTa);

    addEl(s, "label", "Saved per day (optional)");
    const rateInput = numInput(existing && existing.rate > 0 ? fmt(existing.rate) : "", "0");
    rateInput.placeholder = "e.g. 8";
    s.appendChild(rateInput);
    addEl(s, "label", "Unit");
    const unitInput = document.createElement("input");
    unitInput.type = "text"; unitInput.maxLength = 16; unitInput.placeholder = "$ · cigarettes · drinks";
    unitInput.value = existing ? (existing.unit || "$") : "$";
    s.appendChild(unitInput);

    s.appendChild(makeBtn("Save", "primary", () => {
      const nm = name.value.trim();
      if (!nm) { toast("Add a name"); return; }
      const st = start.value ? new Date(start.value) : new Date();
      if (isNaN(st.getTime())) { toast("Pick a valid date"); return; }
      const note = noteTa.value.replace(/\s*\n\s*/g, " ").trim();
      const rate = Math.max(0, parseFloat(rateInput.value) || 0);
      const unit = unitInput.value.trim() || "$";
      if (existing) {
        existing.name = nm; existing.start = st.toISOString();
        existing.note = note; existing.rate = rate; existing.unit = unit;
      } else {
        since.push({ id: sid(), name: nm, start: st.toISOString(), best: 0, resets: 0, note, rate, unit });
      }
      save(KEY_SINCE, since); closeSheet(); renderSince();
    }));
    if (existing && since.length > 1) {
      const i = since.indexOf(existing);
      const moveRow = document.createElement("div");
      moveRow.style.display = "flex"; moveRow.style.gap = "10px"; moveRow.style.marginTop = "12px";
      const move = (dir) => {
        const j = i + dir;
        [since[i], since[j]] = [since[j], since[i]];
        save(KEY_SINCE, since); closeSheet(); renderSince();
      };
      if (i > 0) { const up = makeBtn("↑ Move up", "", () => move(-1)); up.style.flex = "1"; up.style.marginTop = "0"; moveRow.appendChild(up); }
      if (i < since.length - 1) { const dn = makeBtn("↓ Move down", "", () => move(1)); dn.style.flex = "1"; dn.style.marginTop = "0"; moveRow.appendChild(dn); }
      s.appendChild(moveRow);
    }
    if (existing) {
      s.appendChild(makeBtn("Reset to now", "", () => {
        confirmSheet("Reset timer?", "Starts counting from now. Your longest run is kept as your record.", "Reset", () => {
          const run = Date.now() - new Date(existing.start).getTime();
          if (run > (existing.best || 0)) existing.best = run;
          existing.resets = (existing.resets || 0) + 1;
          existing.start = new Date().toISOString();
          save(KEY_SINCE, since); renderSince();
          toast(run >= (existing.best || 0) ? "Reset · new record kept ✓" : "Timer reset");
        });
      }));
      s.appendChild(makeBtn("Delete tracker", "danger", () => {
        confirmSheet("Delete tracker?", `"${existing.name}" will be removed.`, "Delete", () => {
          since = since.filter((x) => x.id !== existing.id); save(KEY_SINCE, since); renderSince();
        }, true);
      }));
    }
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
    setTimeout(() => name.focus(), 60);
  });
}

// ---- water (a separate daily hydration counter) ----
// Tracks ounces drunk today. Auto-resets when the local date rolls over,
// so there's no "end day" — it just starts fresh each morning.
function ensureWaterDay() {
  const t = isoLocal(new Date());
  if (!water || water.date !== t) { water = { date: t, oz: 0, log: [] }; save(KEY_WATER, water); }
  else if (!Array.isArray(water.log)) { water.log = []; }
}
function addWater(amt) {
  ensureWaterDay();
  const prev = water.oz;
  water.oz = round2(water.oz + amt);
  water.log.push(amt);
  save(KEY_WATER, water);
  buzz(15); click();
  const goalHit = waterGoal > 0 && prev < waterGoal && water.oz >= waterGoal;
  if (goalHit) { buzz([0, 35, 40, 60]); toast("💧 Water goal reached!"); }
  renderWater();
  // pop the big oz readout on every pour; confetti when the goal is reached
  const big = el.waterBody.querySelector(".water-big");
  if (big && !reduceMotion()) { big.classList.add("bump"); big.addEventListener("animationend", () => big.classList.remove("bump"), { once: true }); }
  if (goalHit && big) {
    const r = big.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top + r.height / 2, 14);
  }
}
function undoWater() {
  ensureWaterDay();
  if (!water.log.length) return;
  const last = water.log.pop();
  water.oz = round2(Math.max(0, water.oz - last));
  save(KEY_WATER, water); buzz(8); renderWater();
}
function resetWater() {
  ensureWaterDay();
  if (!water.oz && !water.log.length) { toast("Nothing to reset"); return; }
  confirmSheet("Reset water?", "Clears today's water back to 0 oz.", "Reset", () => {
    water = { date: isoLocal(new Date()), oz: 0, log: [] };
    save(KEY_WATER, water); renderWater(); toast("Water reset");
  }, true);
}
function openWaterSettings() {
  openSheet((s) => {
    addEl(s, "h3", "Daily goal");
    addEl(s, "label", "Daily water goal (oz, blank or 0 for none)");
    const goalInput = numInput(waterGoal > 0 ? fmt(waterGoal) : "", "0");
    s.appendChild(goalInput);
    s.appendChild(makeBtn("Save", "primary", () => {
      const go = parseFloat(goalInput.value);
      waterGoal = isNaN(go) || go <= 0 ? 0 : round2(go);
      save(KEY_WATER_GOAL, waterGoal);
      closeSheet(); renderWater();
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}
// Add / remove your own glass-size buttons.
function openWaterPresets() {
  openSheet((s) => {
    addEl(s, "h3", "Glass sizes");
    addEl(s, "p", "Tap a size's × to remove it. Add your own below.", "sub");

    const chips = document.createElement("div");
    chips.className = "water-presets manage";
    const renderChips = () => {
      chips.textContent = "";
      if (!waterPresets.length) {
        const e = addEl(chips, "div", "No sizes yet — add one below.", "sub");
        e.style.color = "var(--faint)";
      }
      waterPresets.forEach((n) => {
        const chip = document.createElement("span"); chip.className = "water-mchip";
        chip.appendChild(document.createTextNode(fmt(n) + " oz"));
        const x = document.createElement("button");
        x.className = "water-mchip-x"; x.textContent = "×"; x.setAttribute("aria-label", "Remove " + fmt(n) + " oz");
        x.addEventListener("click", () => {
          waterPresets = waterPresets.filter((v) => v !== n);
          save(KEY_WATER_PRESETS, waterPresets); renderChips(); renderWater();
        });
        chip.appendChild(x); chips.appendChild(chip);
      });
    };
    renderChips();
    s.appendChild(chips);

    addEl(s, "label", "Add a glass size (oz)");
    const input = numInput("", "0.25");
    input.placeholder = "e.g. 10";
    s.appendChild(input);
    s.appendChild(makeBtn("Add size", "primary", () => {
      const v = round2(parseFloat(input.value));
      if (isNaN(v) || v <= 0) { toast("Enter oz greater than 0"); return; }
      if (!waterPresets.includes(v)) {
        waterPresets.push(v);
        waterPresets.sort((a, b) => a - b);
        save(KEY_WATER_PRESETS, waterPresets);
      }
      waterGlass = v; save(KEY_WATER_GLASS, waterGlass);   // select the size just added
      input.value = ""; renderChips(); renderWater();
      toast(`Added ${fmt(v)} oz`);
    }));
    s.appendChild(makeBtn("Done", "ghost", closeSheet));
  });
}
function renderWater() {
  ensureWaterDay();
  const body = el.waterBody;
  body.textContent = "";

  const oz = round2(water.oz);
  const pct = waterGoal > 0 ? Math.min(100, Math.round((oz / waterGoal) * 100)) : 0;
  const done = waterGoal > 0 && oz >= waterGoal;

  const card = document.createElement("div"); card.className = "water-card";
  const big = document.createElement("div"); big.className = "water-big";
  big.innerHTML = `${fmt(oz)}<span class="water-unit">oz</span>`;
  const gl = document.createElement("div"); gl.className = "water-goal" + (done ? " done" : "");
  if (waterGoal > 0) {
    gl.textContent = done
      ? `Goal reached — ${fmt(oz)} of ${fmt(waterGoal)} oz 💧`
      : `${fmt(oz)} of ${fmt(waterGoal)} oz · ${fmt(round2(waterGoal - oz))} to go`;
  } else {
    gl.textContent = "No daily goal set";
  }
  card.append(big, gl);
  if (waterGoal > 0) {
    const bar = document.createElement("div"); bar.className = "water-bar";
    const fill = document.createElement("i"); fill.style.width = pct + "%";
    bar.appendChild(fill); card.appendChild(bar);
  }
  body.appendChild(card);

  const addBtn = document.createElement("button"); addBtn.className = "water-add";
  addBtn.textContent = `+ ${fmt(waterGlass)} oz`;
  addBtn.addEventListener("click", () => addWater(waterGlass));
  body.appendChild(addBtn);

  const row = document.createElement("div"); row.className = "water-row";
  const undoB = document.createElement("button"); undoB.textContent = "Undo"; undoB.disabled = !water.log.length;
  undoB.addEventListener("click", undoWater);
  const resetB = document.createElement("button"); resetB.textContent = "Reset";
  resetB.addEventListener("click", resetWater);
  row.append(undoB, resetB);
  body.appendChild(row);

  addEl(body, "div", "Glass size (oz)", "water-section-title");
  const presets = document.createElement("div"); presets.className = "water-presets";
  waterPresets.forEach((n) => {
    const b = document.createElement("button");
    b.className = "water-preset" + (n === waterGlass ? " on" : "");
    b.textContent = fmt(n);
    b.addEventListener("click", () => { waterGlass = n; save(KEY_WATER_GLASS, waterGlass); buzz(6); renderWater(); });
    presets.appendChild(b);
  });
  const addChip = document.createElement("button");
  addChip.className = "water-preset add"; addChip.textContent = "+";
  addChip.setAttribute("aria-label", "Add or edit glass sizes");
  addChip.addEventListener("click", openWaterPresets);
  presets.appendChild(addChip);
  body.appendChild(presets);

  const edit = document.createElement("button");
  edit.className = "sheet-btn link"; edit.style.marginTop = "12px";
  edit.textContent = "Set daily goal";
  edit.addEventListener("click", openWaterSettings);
  body.appendChild(edit);

  const glasses = water.log.length;
  const stat = document.createElement("div"); stat.className = "water-stat";
  stat.innerHTML = `<b>${glasses}</b> ${glasses === 1 ? "glass" : "glasses"} today`;
  body.appendChild(stat);
}
function openWater() {
  renderWater();
  el.waterOverlay.classList.add("show");
  staggerIn(el.waterBody, 45, 10);
  growBars(el.waterBody, ".water-bar i", "width");
}
function closeWater() { el.waterOverlay.classList.remove("show"); }

// ---- growth tree ----
// A living reward for staying under the goal: it grows one stage each
// under-goal day, prestiges into a new tree after a month, and droops on a miss.
function treeSVG(progress) {
  const f = Math.max(0, Math.min(1, progress / TREE_DAYS));
  const gY = 196, cx = 120;
  const trunkH = 14 + f * 92;
  const wB = 5 + f * 14, wT = Math.max(2.5, (5 + f * 14) * 0.4);
  const topY = gY - trunkH;
  const R = 15 + f * 52;
  const trunk = `M${cx - wB} ${gY} C ${cx - wB} ${gY - trunkH * 0.45}, ${cx - wT} ${topY + 12}, ${cx - wT} ${topY} `
    + `L ${cx + wT} ${topY} C ${cx + wT} ${topY + 12}, ${cx + wB} ${gY - trunkH * 0.45}, ${cx + wB} ${gY} Z`;
  const circ = (x, y, r, cls) => `<circle ${cls ? `class="${cls}" ` : ""}cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
  const canopy =
    circ(cx, topY + R * 0.05, R) +
    circ(cx - R * 0.72, topY + R * 0.3, R * 0.72) +
    circ(cx + R * 0.72, topY + R * 0.3, R * 0.72) +
    circ(cx, topY - R * 0.55, R * 0.75) +
    circ(cx - R * 0.28, topY - R * 0.22, R * 0.32, "hl");
  return `<svg class="tree-svg" viewBox="0 0 240 210" fill="none" aria-hidden="true">
    <ellipse class="tree-ground" cx="120" cy="199" rx="${(40 + f * 54).toFixed(0)}" ry="12"></ellipse>
    <g class="tree-top">
      <path class="tree-trunk" d="${trunk}"></path>
      <g class="canopy">${canopy}</g>
    </g>
  </svg>`;
}
function renderTree() {
  const body = el.treeBody;
  body.textContent = "";
  const grew = tree.progress > (tree.seenProgress || 0) || tree.level > (tree.seenLevel || 0);
  const prestiged = tree.level > (tree.seenLevel || 0);

  const scene = document.createElement("div");
  scene.className = "tree-scene" + (tree.sad ? " sad" : prestiged ? " prestige" : grew ? " grew" : "");
  let html = treeSVG(tree.progress);
  if (prestiged) {
    html += '<div class="tree-sparkles">';
    for (let i = 0; i < 8; i++) html += `<span style="--a:${i * 45}deg"></span>`;
    html += "</div>";
  }
  scene.innerHTML = html;
  body.appendChild(scene);

  if (tree.level > 0) {
    const badge = document.createElement("div");
    badge.className = "tree-level";
    badge.innerHTML = `🌳 Prestige <b>${tree.level}</b>`;
    body.appendChild(badge);
  }

  const cap = document.createElement("div");
  cap.className = "tree-caption";
  if (goal <= 0) cap.textContent = "Set a daily goal in Settings to start growing your tree.";
  else if (tree.sad) cap.textContent = "Your tree is drooping — finish today under your goal to perk it back up.";
  else if (tree.progress === 0) cap.textContent = tree.level > 0 ? "A fresh seedling. Keep under your goal to grow it again." : "A tiny seed. Stay under your goal each day to grow it.";
  else cap.textContent = "Thriving 🌱 keep finishing under your goal.";
  body.appendChild(cap);

  const wrap = document.createElement("div");
  wrap.className = "tree-prog";
  const head = document.createElement("div");
  head.className = "tree-prog-head";
  head.innerHTML = `<span>Day ${tree.progress} of ${TREE_DAYS}</span><span>${Math.round((tree.progress / TREE_DAYS) * 100)}%</span>`;
  const bar = document.createElement("div");
  bar.className = "tree-bar";
  const fill = document.createElement("i");
  fill.style.width = (tree.progress / TREE_DAYS) * 100 + "%";
  bar.appendChild(fill);
  wrap.append(head, bar);
  body.appendChild(wrap);

  addEl(body, "div", "Each day you finish at or under your goal, your tree grows a little. Reach 30 days and it prestiges into a brand-new one. Miss a day and it droops until you're back under.", "tree-note");

  // remember what's been seen so the next visit only celebrates fresh growth
  if (grew) { tree.seenProgress = tree.progress; tree.seenLevel = tree.level; save(KEY_TREE, tree); }
  if (prestiged) buzz([0, 40, 60, 40, 80]);
}
function openTree() { renderTree(); el.treeOverlay.classList.add("show"); }
function closeTree() { el.treeOverlay.classList.remove("show"); }

// The three secondary tools live behind one "More" launcher to keep the
// header (and the whole screen) uncluttered.
function openMore() {
  openSheet((s) => {
    addEl(s, "h3", "More");
    s.appendChild(makeBtn("⏱   Time Since", "", () => { closeSheet(); openSince(); }));
    s.appendChild(makeBtn("💧   Water", "", () => { closeSheet(); openWater(); }));
    s.appendChild(makeBtn("🌳   Your Tree", "", () => { closeSheet(); openTree(); }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}

// ---- wire up ----
el.add.addEventListener("click", addTap);
el.undo.addEventListener("click", undo);
el.end.addEventListener("click", openEndDay);
el.gear.addEventListener("click", openSettings);
el.moreBtn.addEventListener("click", openMore);
el.ringWrap.addEventListener("click", openSettings);  // tap the ring to set/adjust the goal
el.overlay.addEventListener("click", (e) => { if (e.target === el.overlay) closeSheet(); });
el.statsBtn.addEventListener("click", openInsights);
el.insightsClose.addEventListener("click", closeInsights);
el.insightsOverlay.addEventListener("click", (e) => { if (e.target === el.insightsOverlay) closeInsights(); });
el.reminderDismiss.addEventListener("click", () => { save(KEY_REMIND_DISMISS, isoLocal(new Date())); el.reminder.style.display = "none"; });
el.sinceClose.addEventListener("click", closeSince);
el.sinceOverlay.addEventListener("click", (e) => { if (e.target === el.sinceOverlay) closeSince(); });
el.sinceAdd.addEventListener("click", () => openSinceForm(null));
el.waterClose.addEventListener("click", closeWater);
el.waterOverlay.addEventListener("click", (e) => { if (e.target === el.waterOverlay) closeWater(); });
el.treeClose.addEventListener("click", closeTree);
el.treeOverlay.addEventListener("click", (e) => { if (e.target === el.treeOverlay) closeTree(); });

render();

// Launch flourish: the number rolls up from 0 and the ring sweeps to its fill
// (a frame after first paint, so the transitions actually play).
if (!reduceMotion() && today > 0) {
  const ringTarget = el.ringProg.style.strokeDashoffset;
  el.ringProg.style.transition = "none";
  el.ringProg.style.strokeDashoffset = RING_C;
  el.total.textContent = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.ringProg.style.transition = "";
    el.ringProg.style.strokeDashoffset = ringTarget;
    renderTop(true);   // count-up animation from the seeded 0
  }));
}

// Lock on launch and on return — but only if the grace window (LOCK_GRACE_MS)
// since the last unlock has lapsed, so quick trips out don't re-prompt.
maybeLock();
checkStaleDay();   // un-ended previous day? offer to log it where it belongs
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  maybeLock();
  checkReminder();
  checkStaleDay();   // the date may have rolled over while backgrounded
  if (themeAuto && theme !== themeForToday()) applyTheme();   // new day → new theme
});

// Daily reminder + keep the unlock window fresh during active use.
checkReminder();
setInterval(() => {
  checkReminder();
  if (themeAuto && theme !== themeForToday()) applyTheme();   // roll the theme over at midnight
  if (lockSet() && el.lock.style.display !== "flex" && !document.hidden) save(KEY_UNLOCK_AT, Date.now());
}, 60000);

// keep the main-page "time since" strip ticking
setInterval(() => { if (!document.hidden && since.length) tickSinceStrip(); }, 1000);

// ---- theme ---- follow the phone's light/dark setting for the status-bar tint
const themeMeta = document.querySelector('meta[name="theme-color"]');
function syncTheme() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let tc = dark ? "#000000" : "#f2f2f7";
  if (theme && theme !== "default") {
    const th = THEMES.find((t) => t.key === theme);
    if (th) tc = th.bg;
  }
  if (themeMeta) themeMeta.setAttribute("content", tc);
  refreshColorStops();   // theme colours changed — recompute the number gradient
  renderTop();
}
// Apply the active theme (auto-rotate picks today's) and keep everything in sync.
function applyTheme() {
  if (themeAuto) theme = themeForToday();
  const root = document.documentElement;
  if (theme && theme !== "default") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  save(KEY_THEME, theme);
  syncTheme();
}
// Cross-fade every colour in the app for a user-initiated theme change
// (never on load — the head script paints the right theme before first frame).
let themeFadeTimer = null;
function themeFade() {
  if (reduceMotion()) return;
  document.documentElement.classList.add("theme-fade");
  clearTimeout(themeFadeTimer);
  themeFadeTimer = setTimeout(() => document.documentElement.classList.remove("theme-fade"), 450);
}
applyTheme();   // honour the saved theme (also keeps the data-theme attribute in sync)
const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
(darkMq.addEventListener ? darkMq.addEventListener.bind(darkMq, "change") : darkMq.addListener.bind(darkMq))(syncTheme);

// ---- PWA ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  // When a new version takes over, reload once so the latest UI shows up
  // (keeps the installed Home Screen app from getting stuck on an old build).
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
