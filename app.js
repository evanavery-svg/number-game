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
const KEY_JOURNAL_PIN = "count.journalPin";   // separate passcode for the private reset journal
const KEY_JOURNAL_SALT = "count.journalSalt";
const KEY_JOURNAL_BIO = "count.journalBio";   // base64 WebAuthn credential id for journal Face ID
const KEY_RISKY_LAST = "count.riskyLast";     // "YYYY-MM-DD-HH" of the last risky-time heads-up
const KEY_TL = "count.tl";                    // hidden flag for the optional tracker extras
const KEY_RECAP_LAST = "count.recapLast";     // week key of the last recap shown
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
const KEY_MOOD_DAILY = "count.moodDaily";       // { "YYYY-MM-DD": 1..5 } mandatory once-a-day mood pulse
const KEY_GAME_ON = "count.gameOn";             // bool — daily focus game enabled
const KEY_GAME_PLAYED = "count.gamePlayed";     // day key of the last game played
const KEY_GAME_BEST = "count.gameBest";         // best focus-game score

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
  moodCard: document.getElementById("moodCard"),
  connCard: document.getElementById("connCard"),
  winsCard: document.getElementById("winsCard"),
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
  moodGate: document.getElementById("moodGate"),
  mgFaces: document.getElementById("mgFaces"),
  mgTimer: document.getElementById("mgTimer"),
  mgCount: document.getElementById("mgCount"),
  mgBar: document.getElementById("mgBar"),
  gameGate: document.getElementById("gameGate"),
  ggArena: document.getElementById("ggArena"),
  ggTimer: document.getElementById("ggTimer"),
  ggScore: document.getElementById("ggScore"),
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
let moodDaily = load(KEY_MOOD_DAILY, {});   // once-a-day mood pulse, keyed by day
let gameOn = load(KEY_GAME_ON, true);       // daily focus game (toggle in Settings)
let gamePlayed = load(KEY_GAME_PLAYED, ""); // day key the game was last played
let gameBest = load(KEY_GAME_BEST, 0);      // best focus-game score
let timelineOn = load(KEY_TL, false);       // hidden per-device flag (secret gesture)
let water = load(KEY_WATER, null);   // hydration for today (auto-reset on a new day)
let waterGlass = load(KEY_WATER_GLASS, 8);
let waterGoal = load(KEY_WATER_GOAL, 64);
let waterPresets = load(KEY_WATER_PRESETS, [4, 8, 12, 16, 20, 24]);
let calOffset = 0;                   // Insights calendar: months back from the current one
// Theme keys must match the CSS blocks + the head inline script's `order`.
const THEMES = [
  { key: "default", name: "Classic",    accent: "#ff9500", bg: "#000000" },
  { key: "blue",    name: "Mono",     accent: "#ffffff", bg: "#000000" },
  { key: "forest",  name: "Eclipse",  accent: "#2f7ff2", bg: "#090b12" },
  { key: "teal",    name: "Scarlet",  accent: "#e01f2b", bg: "#edeef2" },
];
let theme = load(KEY_THEME, "default");
if (!THEMES.some((t) => t.key === theme)) theme = "default";   // a since-removed theme was saved — fall back cleanly
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

// ---- end-day reflection: mood, daily factors, tiny wins, worry dump ----
// These live on each history entry (all optional), so nothing extra persists
// on its own. A quick daily mood check-in gets correlated against the factors
// over time to surface patterns ("your mood is lower on days you skip breakfast").
const MOODS = [
  { v: 1, emoji: "😞", cap: "Rough" },
  { v: 2, emoji: "😕", cap: "Low" },
  { v: 3, emoji: "😐", cap: "Okay" },
  { v: 4, emoji: "🙂", cap: "Good" },
  { v: 5, emoji: "😄", cap: "Great" },
];
const FACTORS = [
  { key: "sleep",      emoji: "😴", label: "Slept well",     phrase: "sleep well" },
  { key: "exercise",   emoji: "🏃", label: "Exercised",      phrase: "exercise" },
  { key: "social",     emoji: "💬", label: "Saw people",     phrase: "see people" },
  { key: "breakfast",  emoji: "🍳", label: "Ate breakfast",  phrase: "eat breakfast" },
  { key: "outside",    emoji: "☀️", label: "Went outside",   phrase: "get outside" },
  { key: "water",      emoji: "💧", label: "Drank water",    phrase: "drink enough water" },
  { key: "ate_well",   emoji: "🥗", label: "Ate well",       phrase: "eat well" },
  { key: "meditate",   emoji: "🧘", label: "Meditated",      phrase: "meditate" },
  { key: "read",       emoji: "📖", label: "Read",           phrase: "read" },
  { key: "journal",    emoji: "📓", label: "Journaled",      phrase: "journal" },
  { key: "music",      emoji: "🎧", label: "Music",          phrase: "listen to music" },
  { key: "early",      emoji: "🌅", label: "Woke up early",  phrase: "wake up early" },
  { key: "productive", emoji: "✅", label: "Productive",     phrase: "have a productive day" },
  { key: "caffeine",   emoji: "☕", label: "Caffeine",       phrase: "have caffeine" },
  { key: "alcohol",    emoji: "🍷", label: "Alcohol",        phrase: "drink alcohol" },
  { key: "screens",    emoji: "📱", label: "Lots of screens", phrase: "spend a lot on screens" },
  { key: "stress",     emoji: "😣", label: "Stressful day",  phrase: "have a stressful day" },
];
function moodEmoji(v) { const m = MOODS.find((x) => x.v === Math.round(v)); return m ? m.emoji : "—"; }
// Draft state so the multi-step worry-dump flow can leave the End Day sheet and
// return without losing the mood/factors/wins captured so far.
let endDayDraft = null;
function freshDraft() {
  return { date: null, note: "", mood: null, factors: {}, wins: ["", "", ""], worries: [], extra: 0, extraTimes: [] };
}

// ---- mandatory daily mood gate ----
// A quick, once-a-day check-in that covers the app until you tap a face. Keyed
// by the app's day (so before 4am still counts as the previous day). The pulse
// also seeds End Day's mood so the patterns in Insights stay in one place.
let moodGateTimer = null;
function moodGateKey() { return sessionDate(); }
// Run the once-a-day gates in order: mood check-in first, then the focus game
// (if enabled). Each gate chains into the next when it finishes.
function runDailyGates() {
  if (el.moodGate.classList.contains("show") || el.gameGate.classList.contains("show")) return;
  if (el.lock && el.lock.style.display === "flex") return;   // wait until unlocked
  if (moodDaily[moodGateKey()] == null) { showMoodGate(); return; }
  if (gameOn && gamePlayed !== moodGateKey()) { showGameGate(); return; }
}
function showMoodGate() {
  const faces = el.mgFaces;
  faces.textContent = "";
  faces.classList.remove("nudge");
  el.mgTimer.style.opacity = "";
  MOODS.forEach((m, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mg-face";
    b.style.setProperty("--stg", i * 70);   // sequenced spring-in + idle bob
    const e = document.createElement("span"); e.className = "mg-emoji"; e.textContent = m.emoji;
    const c = document.createElement("span"); c.className = "mg-cap"; c.textContent = m.cap;
    b.append(e, c);
    b.addEventListener("click", () => recordDailyMood(m.v, b));
    faces.appendChild(b);
  });
  el.moodGate.style.display = "flex";
  el.moodGate.classList.remove("out");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => el.moodGate.classList.add("show"));

  // decorative ~10s countdown + depleting bar — it never auto-dismisses
  // (this is mandatory), it just nudges you to answer.
  el.mgBar.classList.remove("run");
  el.mgBar.style.width = "100%";
  requestAnimationFrame(() => requestAnimationFrame(() => el.mgBar.classList.add("run")));
  let left = 10;
  el.mgCount.textContent = left;
  if (moodGateTimer) clearInterval(moodGateTimer);
  moodGateTimer = setInterval(() => {
    left -= 1;
    el.mgCount.textContent = Math.max(0, left);
    el.mgTimer.classList.remove("tick"); void el.mgTimer.offsetWidth; el.mgTimer.classList.add("tick");
    if (left <= 0) {
      clearInterval(moodGateTimer); moodGateTimer = null;
      faces.classList.remove("nudge"); void faces.offsetWidth; faces.classList.add("nudge");
      buzz([0, 30, 50, 30]);
    }
  }, 1000);
}
function recordDailyMood(v, faceEl) {
  if (moodGateTimer) { clearInterval(moodGateTimer); moodGateTimer = null; }
  moodDaily[moodGateKey()] = v;
  save(KEY_MOOD_DAILY, moodDaily);
  buzz([0, 15, 30, 45]);
  // celebrate: the chosen face pops with confetti, the rest dim away
  el.mgFaces.querySelectorAll(".mg-face").forEach((f) => f.classList.add(f === faceEl ? "chosen" : "dim"));
  if (faceEl) {
    const r = faceEl.getBoundingClientRect();
    confettiBurst(r.left + r.width / 2, r.top + r.height / 2, 20);
  }
  el.mgTimer.style.opacity = "0";
  setTimeout(hideMoodGate, reduceMotion() ? 0 : 640);
}
function hideMoodGate() {
  el.mgTimer.style.opacity = "";
  document.body.style.overflow = "";
  if (reduceMotion()) { el.moodGate.classList.remove("show"); el.moodGate.style.display = "none"; runDailyGates(); return; }
  el.moodGate.classList.remove("show");
  el.moodGate.classList.add("out");
  setTimeout(() => { el.moodGate.style.display = "none"; el.moodGate.classList.remove("out"); runDailyGates(); }, 360);
}

// ---- daily focus game: tap the smileys, skip the frowns (10 seconds) ----
const GG_SMILE = ["😀", "😄", "🙂", "😊", "😁", "😃"];
const GG_FROWN = ["☹️", "🙁", "😞", "😟", "😠", "😫"];
// a calm little wind-down message shown when the round ends
const GG_MOTIVATIONS = [
  "Take it slow — today will be a good day.",
  "Breathe. You've got this.",
  "One small step at a time.",
  "Be gentle with yourself today.",
  "Slow is smooth. Smooth is fast.",
  "Today is yours to shape.",
  "Small steps still move you forward.",
  "You showed up. That already counts.",
  "Good things are on their way.",
  "Make today a little kinder than yesterday.",
  "Steady wins it. No rush.",
  "You're doing better than you think.",
];
const GG_CALM_EMOJI = ["🌤️", "🌱", "🍃", "✨", "☀️", "🌊", "🕊️", "🌙"];
// common relapse triggers — one-tap tags on a reset, correlated over time
const TRIGGERS = [
  { key: "stress", label: "Stress", emoji: "😰" },
  { key: "alone", label: "Alone", emoji: "🧍" },
  { key: "social", label: "Social", emoji: "👥" },
  { key: "bored", label: "Bored", emoji: "🥱" },
  { key: "tired", label: "Tired", emoji: "😴" },
  { key: "craving", label: "Craving", emoji: "🌊" },
  { key: "celebrating", label: "Celebrating", emoji: "🎉" },
  { key: "lonely", label: "Lonely", emoji: "💭" },
  { key: "angry", label: "Angry", emoji: "😤" },
  { key: "hungry", label: "Hungry", emoji: "🍽️" },
  { key: "autopilot", label: "Autopilot", emoji: "🔁" },
];
function triggerOf(k) { return TRIGGERS.find((t) => t.key === k); }
// gentle reassurance when a "time since" streak is reset — slipping is human
const SINCE_RESET_MSGS = [
  "It's okay to fail — what matters is you're back.",
  "Slipping up is part of it. Begin again.",
  "One slip isn't the end. You've got this.",
  "Be kind to yourself — fresh start from now.",
  "Falling down is human. Getting back up is you.",
  "It's okay. Tomorrow doesn't care about today.",
  "Progress isn't a straight line. Keep going.",
  "You didn't fail — you're still trying. That counts.",
];
let gameSpawnT = null, gameTickT = null;
const GG_DURATION = 12;      // seconds per round
const GG_SPAWN_MS = 1200;    // gap between faces (slow and calm)
const GG_LIFE_MS = 3600;     // each face lingers well over 3 seconds
function showGameGate() {
  const arena = el.ggArena;
  arena.textContent = "";
  el.gameGate.querySelectorAll(".gg-end").forEach((e) => e.remove());   // clear any prior end screen
  // fixed 3×3 board — faces appear one per empty cell
  const cells = [];
  for (let i = 0; i < 9; i++) { const c = document.createElement("div"); c.className = "gg-cell"; arena.appendChild(c); cells.push(c); }
  let score = 0, left = GG_DURATION;
  el.ggScore.textContent = "0";
  el.ggTimer.textContent = String(left);
  el.ggTimer.classList.remove("low");
  el.gameGate.style.display = "flex";
  el.gameGate.classList.remove("out");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => el.gameGate.classList.add("show"));

  const spawn = () => {
    const empty = cells.filter((c) => !c.firstChild);
    if (!empty.length) return;
    const cell = empty[(Math.random() * empty.length) | 0];
    const smile = Math.random() < 0.68;   // mostly smileys — nice and easy
    const face = document.createElement("button");
    face.type = "button";
    face.className = "gg-face";
    const set = smile ? GG_SMILE : GG_FROWN;
    face.textContent = set[(Math.random() * set.length) | 0];
    let gone = false;
    const remove = (cls) => { if (gone) return; gone = true; face.classList.add(cls); setTimeout(() => { if (face.parentNode) face.remove(); }, 300); };
    face.addEventListener("click", () => {
      if (gone) return;
      if (smile) {
        score += 1; el.ggScore.textContent = String(score);
        const box = el.ggScore.parentElement;
        box.classList.remove("bump"); void box.offsetWidth; box.classList.add("bump");
        buzz(12);
        const r = face.getBoundingClientRect();
        confettiBurst(r.left + r.width / 2, r.top + r.height / 2, 10);
        remove("go");
      } else {
        score = Math.max(0, score - 1); el.ggScore.textContent = String(score);
        buzz([0, 30, 45, 30]);
        remove("bad");
      }
    });
    cell.appendChild(face);
    setTimeout(() => remove("fade"), GG_LIFE_MS);   // auto-expire if not tapped
  };

  spawn();
  gameSpawnT = setInterval(spawn, GG_SPAWN_MS);
  gameTickT = setInterval(() => {
    left -= 1;
    el.ggTimer.textContent = String(Math.max(0, left));
    if (left <= 3) el.ggTimer.classList.add("low");
    if (left <= 0) endGame(score);
  }, 1000);
}
function endGame(score) {
  if (gameSpawnT) { clearInterval(gameSpawnT); gameSpawnT = null; }
  if (gameTickT) { clearInterval(gameTickT); gameTickT = null; }
  gamePlayed = moodGateKey();
  save(KEY_GAME_PLAYED, gamePlayed);
  const isBest = score > gameBest;
  if (isBest) { gameBest = score; save(KEY_GAME_BEST, gameBest); }
  el.ggArena.textContent = "";
  // a calm, full-screen wind-down: a gentle emoji + a motivating line
  const end = document.createElement("div");
  end.className = "gg-end";
  addEl(end, "div", GG_CALM_EMOJI[(Math.random() * GG_CALM_EMOJI.length) | 0], "gg-end-emoji");
  addEl(end, "div", GG_MOTIVATIONS[(Math.random() * GG_MOTIVATIONS.length) | 0], "gg-end-msg");
  addEl(end, "div", isBest && score > 0 ? `New best · ${score}` : `Score ${score} · best ${gameBest}`, "gg-end-sub");
  el.gameGate.appendChild(end);
  buzz([0, 25, 45, 25]);
  // linger so the message can be read, but a tap dismisses right away
  const t = setTimeout(hideGameGate, reduceMotion() ? 0 : 3000);
  end.addEventListener("click", () => { clearTimeout(t); hideGameGate(); }, { once: true });
}
function hideGameGate() {
  document.body.style.overflow = "";
  const done = () => { el.gameGate.style.display = "none"; el.gameGate.classList.remove("out"); el.gameGate.querySelectorAll(".gg-end").forEach((e) => e.remove()); };
  if (reduceMotion()) { el.gameGate.classList.remove("show"); done(); return; }
  el.gameGate.classList.remove("show");
  el.gameGate.classList.add("out");
  setTimeout(done, 360);
}

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
// round2 / fmt / dayLabel live in core.js
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
function toast(msg, ms) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms || 2000);
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
  renderMood();
  renderConnections();
  renderWins();
}

// Connections — cross-links the count against the end-day check-ins: how much
// more (or less) you log on days a factor was present, and on low-mood days.
// For a limit, logging less is the good direction.
function renderConnections() {
  const card = el.connCard;
  const days = history.filter((d) => typeof d.total === "number");
  const lines = [];

  const avg = (arr) => arr.reduce((s, d) => s + d.total, 0) / arr.length;
  FACTORS.forEach((f) => {
    // compare only among days that actually recorded factors
    const on = days.filter((d) => (d.factors || []).includes(f.key));
    const offR = days.filter((d) => Array.isArray(d.factors) && !d.factors.includes(f.key));
    if (on.length < 2 || offR.length < 2) return;
    const aOn = avg(on), aOff = avg(offR);
    if (aOff <= 0) return;
    const pct = Math.round(((aOn - aOff) / aOff) * 100);
    if (Math.abs(pct) < 20) return;
    lines.push({ mag: Math.abs(pct), html: pct < 0
      ? `You log <span class="mc-up">${Math.abs(pct)}% less</span> on days you <b>${f.phrase}</b>`
      : `You log <span class="mc-down">${pct}% more</span> on days you <b>${f.phrase}</b>` });
  });

  // low-mood vs good-mood days (from end-day check-ins)
  const lows = days.filter((d) => d.mood != null && d.mood <= 2);
  const highs = days.filter((d) => d.mood != null && d.mood >= 4);
  if (lows.length >= 2 && highs.length >= 2) {
    const aLow = avg(lows), aHigh = avg(highs);
    if (aHigh > 0) {
      const pct = Math.round(((aLow - aHigh) / aHigh) * 100);
      if (Math.abs(pct) >= 20) {
        lines.push({ mag: Math.abs(pct), html: pct > 0
          ? `You log <span class="mc-down">${pct}% more</span> on <b>rough-mood days</b>`
          : `You log <span class="mc-up">${Math.abs(pct)}% less</span> on <b>rough-mood days</b>` });
      }
    }
  }

  if (!lines.length) { card.style.display = "none"; return; }
  card.style.display = "block";
  card.textContent = "";
  addEl(card, "div", "Connections", "section-title");
  lines.sort((a, b) => b.mag - a.mag).slice(0, 3).forEach((l) => {
    const p = document.createElement("div");
    p.className = "mood-corr";
    p.innerHTML = l.html;
    card.appendChild(p);
  });
}

// Mood & patterns — average check-in, a recent sparkline, and factor
// correlations (avg mood on days a factor is present vs absent), surfacing
// the strongest as plain sentences like "your mood is lower on days you skip
// breakfast".
function renderMood() {
  const card = el.moodCard;
  const withMood = history.filter((d) => typeof d.mood === "number" && d.mood >= 1);
  if (withMood.length < 3) { card.style.display = "none"; return; }
  card.style.display = "block";
  card.textContent = "";

  addEl(card, "div", "Mood & patterns", "section-title");

  const avg = withMood.reduce((s, d) => s + d.mood, 0) / withMood.length;
  const head = document.createElement("div");
  head.className = "mood-head";
  addEl(head, "div", moodEmoji(avg), "mood-avg-emoji");
  const col = document.createElement("div");
  addEl(col, "div", avg.toFixed(1), "mood-avg-val");
  addEl(col, "div", `avg mood · ${withMood.length} day${withMood.length === 1 ? "" : "s"}`, "mood-avg-sub");
  head.appendChild(col);
  card.appendChild(head);

  // sparkline of the most recent check-ins (up to 21), oldest → newest
  const recent = withMood.slice(-21);
  const spark = document.createElement("div");
  spark.className = "mood-spark";
  recent.forEach((d) => {
    const bar = document.createElement("div");
    bar.className = "ms-bar";
    bar.style.height = Math.max(8, (d.mood / 5) * 100) + "%";
    bar.title = `${d.label}: ${moodEmoji(d.mood)}`;
    spark.appendChild(bar);
  });
  card.appendChild(spark);

  // factor correlations — need enough days each side to be meaningful
  const lines = [];
  FACTORS.forEach((f) => {
    const on = withMood.filter((d) => (d.factors || []).includes(f.key));
    const off = withMood.filter((d) => !(d.factors || []).includes(f.key));
    if (on.length < 2 || off.length < 2) return;
    const aOn = on.reduce((s, d) => s + d.mood, 0) / on.length;
    const aOff = off.reduce((s, d) => s + d.mood, 0) / off.length;
    const delta = aOn - aOff;
    if (Math.abs(delta) >= 0.3) lines.push({ f, delta });
  });
  lines.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  lines.slice(0, 3).forEach(({ f, delta }) => {
    const p = document.createElement("div");
    p.className = "mood-corr";
    const up = delta > 0;
    const mag = Math.abs(delta).toFixed(1);
    p.innerHTML = up
      ? `Your mood runs <span class="mc-up">higher</span> on days you <b>${f.phrase}</b> — +${mag}`
      : `Your mood runs <span class="mc-down">lower</span> on days you <b>${f.phrase}</b> — −${mag}`;
    card.appendChild(p);
  });
  if (!lines.length) addEl(card, "div", "Keep checking in — patterns between your mood and daily habits will show up here.", "mood-hint");
}

// Tiny wins — a running log of the small things, newest first.
function renderWins() {
  const card = el.winsCard;
  const items = [];
  for (let i = history.length - 1; i >= 0 && items.length < 15; i--) {
    const d = history[i];
    if (!d.wins || !d.wins.length) continue;
    const short = new Date(d.endedAt || d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    d.wins.forEach((w) => { if (items.length < 15) items.push({ text: w, day: short }); });
  }
  if (!items.length) { card.style.display = "none"; return; }
  card.style.display = "block";
  card.textContent = "";
  addEl(card, "div", "Tiny wins", "section-title");
  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "win-item";
    addEl(row, "span", "✓", "win-check");
    row.appendChild(document.createTextNode(it.text));
    addEl(row, "span", it.day, "win-day");
    card.appendChild(row);
  });
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
// When `editable` is true each row can be tapped to edit that minute's time
// (from/to are the covered indices into `taps`, passed to openTapTimeEdit).
function tapRows(taps, editable) {
  const list = document.createElement("div");
  list.className = "tap-list";

  const groups = [];
  taps.forEach((raw, i) => {
    const e = tapEntry(raw);
    const label = new Date(e.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      if (e.amt != null) last.amt = round2((last.amt || 0) + e.amt);
      if (e.total != null) last.total = e.total;   // running total at the end of the minute
      last.count += 1;
      last.to = i;
    } else {
      groups.push({ label, amt: e.amt, total: e.total, count: 1, from: i, to: i });
    }
  });

  groups.forEach((g) => {
    const row = document.createElement("div");
    row.className = "tap-row" + (editable ? " tap-editable" : "");

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
    if (editable) row.addEventListener("click", () => openTapTimeEdit(g.from, g.to));
    list.appendChild(row);
  });
  return list;
}
// Edit the clock time of a minute's worth of taps (indices from..to in tapLog).
function openTapTimeEdit(from, to) {
  const first = tapEntry(tapLog[from]);
  const base = new Date(first.t);
  const n = to - from + 1;
  openSheet((s) => {
    addEl(s, "h3", "Edit tap time");
    addEl(s, "p", n > 1 ? `${n} taps happened in this minute — move them together.` : "Move this tap to a different time.", "sub");
    addEl(s, "label", "Time");
    const input = document.createElement("input");
    input.type = "time";
    input.value = `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
    s.appendChild(input);
    s.appendChild(makeBtn("Save", "primary", () => {
      const parts = (input.value || "").split(":");
      const h = Number(parts[0]), m = Number(parts[1]);
      if (isNaN(h) || isNaN(m)) { toast("Pick a valid time"); return; }
      // normalise everything to objects, move the selected minute's taps
      tapLog = tapLog.map((raw) => { const e = tapEntry(raw); return { t: e.t, amt: e.amt, total: e.total }; });
      for (let i = from; i <= to; i++) {
        const d = new Date(tapLog[i].t);
        d.setHours(h, m, i - from, 0);   // stagger seconds so they keep order + stay in one minute
        tapLog[i].t = d.getTime();
      }
      // re-sort by time and recompute running totals so the timeline stays consistent
      tapLog.sort((a, b) => a.t - b.t);
      let run = 0;
      tapLog.forEach((e) => { if (e.amt != null) { run = round2(run + e.amt); e.total = run; } });
      save(KEY_TAPLOG, tapLog);
      closeSheet(); renderTapLog();
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
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
  addEl(card, "div", "Tap a row to edit its time.", "tap-hint");
  card.appendChild(tapRows(tapLog, true));
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

// isoLocal / sessionDate (4am cutoff) live in core.js

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
  growBars(el.moodCard, ".ms-bar");
  const cal = el.calCard.querySelector(".cal");
  if (cal) staggerIn(cal, 6, 40);
}
function closeInsights() { el.insightsOverlay.classList.remove("show"); }

// The progress line starts with flat ends, then rounds off once you're at
// least halfway to the goal — a clean rounded stroke end, no floating dot.
function updateRingCap(frac) {
  el.ringProg.style.strokeLinecap = frac >= 0.5 ? "round" : "butt";
}

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
    updateRingCap(frac);
    // progress is already shown by the ring, the number's colour and the
    // button's "X left today" — no separate goal caption needed
    el.goalText.style.display = "none";
  } else {
    el.totalWrap.classList.remove("has-goal");
    el.ringProg.style.strokeDashoffset = RING_C;   // just the grey frame
    updateRingCap(0);
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
  save(KEY_ACT_DATE, sessionDate());   // remember which day this activity belongs to (past-midnight taps still count as the day before)
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

// End Day: a short daily wind-down — log the total plus an optional mood
// check-in, factor chips, tiny wins and a worry dump. `resume` is true only
// when returning from the worry-dump sub-flow, so a fresh open starts clean.
function openEndDay(resume) {
  if (resume !== true) {
    endDayDraft = freshDraft();   // click handler passes an Event, not true
    // seed the mood picker from today's mandatory check-in, if it happened
    const dk = load(KEY_ACT_DATE, sessionDate());
    if (moodDaily[dk] != null) endDayDraft.mood = moodDaily[dk];
  }
  const draft = endDayDraft;
  // the total that will actually be logged = today's taps + any you add here
  const projected = () => round2(today + draft.extra);

  openSheet((s) => {
    addEl(s, "h3", "End Day");
    // say plainly where the day landed against the goal (kept live as you add taps)
    const subEl = addEl(s, "p", "", "sub");
    const refreshSub = () => {
      const p = projected();
      let sub = `Log ${fmt(p)} and start a fresh day.`;
      if (goal > 0) {
        sub = p > goal
          ? `Log ${fmt(p)} — ${fmt(round2(p - goal))} over your ${fmt(goal)} goal.`
          : `Log ${fmt(p)} — under your ${fmt(goal)} goal ✓`;
      }
      subEl.textContent = sub;
    };
    refreshSub();

    addEl(s, "label", "Date for this day");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    // Default to the day these taps actually belong to (not necessarily
    // "today") — e.g. tapping through the evening and ending the day the
    // next morning should default to yesterday, not the day you happen to
    // be tapping "End Day" on.
    dateInput.value = draft.date || load(KEY_ACT_DATE, sessionDate());
    dateInput.max = isoLocal(new Date());
    s.appendChild(dateInput);

    // --- add taps you missed (e.g. forgot to log yesterday) ---
    addEl(s, "label", "Total to log");
    const adder = document.createElement("div");
    adder.className = "tap-adder";
    const totalEl = document.createElement("div");
    totalEl.className = "tap-adder-total";
    adder.appendChild(totalEl);
    const refreshTotal = () => {
      totalEl.textContent = fmt(projected());
      refreshSub();
    };
    // add a chunk to the projected total, recorded as a tap so it shows in the timeline
    const addAmount = (amt) => {
      amt = round2(amt);
      if (!amt) return;
      // don't let it go below zero
      if (round2(draft.extra + amt) < -today) amt = round2(-today - draft.extra);
      draft.extra = round2(draft.extra + amt);
      draft.extraTimes.push({ t: Date.now() + draft.extraTimes.length, amt, total: projected() });
      refreshTotal();
      buzz(12);
    };
    const btnRow = document.createElement("div");
    btnRow.className = "tap-adder-btns";
    const stepBtn = document.createElement("button");
    stepBtn.type = "button"; stepBtn.className = "tap-adder-btn";
    stepBtn.textContent = `+ ${fmt(step)}`;
    stepBtn.addEventListener("click", () => addAmount(step));
    const oneBtn = document.createElement("button");
    oneBtn.type = "button"; oneBtn.className = "tap-adder-btn";
    oneBtn.textContent = "+ 1";
    oneBtn.addEventListener("click", () => addAmount(1));
    const undoBtn = document.createElement("button");
    undoBtn.type = "button"; undoBtn.className = "tap-adder-btn ghost";
    undoBtn.textContent = "Undo";
    undoBtn.addEventListener("click", () => {
      const last = draft.extraTimes.pop();
      if (!last) { toast("Nothing added here yet"); return; }
      draft.extra = round2(draft.extra - (last.amt || 0));
      refreshTotal();
    });
    btnRow.append(stepBtn, oneBtn, undoBtn);
    adder.appendChild(btnRow);
    // custom amount
    const customRow = document.createElement("div");
    customRow.className = "tap-adder-custom";
    const customInput = numInput("", "0");
    customInput.placeholder = "Custom amount";
    customInput.value = "";
    const customBtn = makeBtn("Add", "link", () => {
      const v = parseFloat(customInput.value);
      if (isNaN(v) || v === 0) { toast("Enter an amount"); return; }
      addAmount(v);
      customInput.value = "";
    });
    customRow.append(customInput, customBtn);
    adder.appendChild(customRow);
    refreshTotal();
    s.appendChild(adder);

    // --- quick mood check-in (tap once) ---
    addEl(s, "label", "How did today feel?");
    const moodRow = document.createElement("div");
    moodRow.className = "mood-row";
    MOODS.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mood-btn" + (draft.mood === m.v ? " on" : "");
      const e = document.createElement("span"); e.className = "mood-emoji"; e.textContent = m.emoji;
      const c = document.createElement("span"); c.className = "mood-cap"; c.textContent = m.cap;
      b.append(e, c);
      b.addEventListener("click", () => {
        draft.mood = draft.mood === m.v ? null : m.v;   // tap again to clear
        moodRow.querySelectorAll(".mood-btn").forEach((x, i) => x.classList.toggle("on", MOODS[i].v === draft.mood));
        buzz(10);
      });
      moodRow.appendChild(b);
    });
    s.appendChild(moodRow);

    // --- daily factors (what correlates with mood over time) ---
    addEl(s, "label", "Today I…");
    const chipRow = document.createElement("div");
    chipRow.className = "chip-row";
    FACTORS.forEach((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (draft.factors[f.key] ? " on" : "");
      const em = document.createElement("span"); em.className = "chip-emoji"; em.textContent = f.emoji;
      b.append(em, document.createTextNode(f.label));
      b.addEventListener("click", () => {
        draft.factors[f.key] = !draft.factors[f.key];
        b.classList.toggle("on", !!draft.factors[f.key]);
        buzz(10);
      });
      chipRow.appendChild(b);
    });
    s.appendChild(chipRow);

    // --- tiny wins log ---
    addEl(s, "label", "Tiny wins today (no matter how small)");
    const winInputs = [];
    for (let i = 0; i < 3; i++) {
      const row = document.createElement("div");
      row.className = "win-row";
      addEl(row, "span", "✓", "win-n");
      const inp = document.createElement("input");
      inp.type = "text"; inp.value = draft.wins[i] || "";
      inp.placeholder = i === 0 ? "e.g. made the bed, called a friend…" : "Another win (optional)";
      row.appendChild(inp);
      winInputs.push(inp);
      s.appendChild(row);
    }

    // --- worry dump entry point ---
    const ta = document.createElement("textarea");   // declared early so sync() can read it
    // pull the current form values into the draft (before leaving for a sub-flow or committing)
    const sync = () => {
      draft.date = dateInput.value;
      draft.note = ta.value;
      draft.wins = winInputs.map((x) => x.value);
    };

    addEl(s, "label", "Worry dump");
    const worry = document.createElement("button");
    worry.type = "button";
    worry.className = "worry-open";
    const wleft = document.createElement("div");
    addEl(wleft, "div", "Empty your head", "worry-ttl");
    const nW = draft.worries.length;
    const nAct = draft.worries.filter((w) => w.control === "in" && (w.action || "").trim()).length;
    addEl(wleft, "div", nW ? `${nW} noted${nAct ? ` · ${nAct} to act on` : ""}` : "Timed brain dump, then sort what you can control", "worry-sub");
    worry.appendChild(wleft);
    addEl(worry, "div", nW ? "✎" : "→", "worry-arrow");
    worry.addEventListener("click", () => { sync(); openWorryDump(); });
    s.appendChild(worry);

    addEl(s, "label", "Note for this day (optional)");
    ta.rows = 3; ta.placeholder = "e.g. how it went, anything notable…"; ta.value = draft.note || "";
    s.appendChild(ta);

    s.appendChild(makeBtn("Log day ✓", "primary", () => {
      sync();
      const hasReflection = draft.mood || Object.values(draft.factors).some(Boolean) ||
        draft.wins.some((w) => (w || "").trim()) || draft.worries.length;
      if (taps === 0 && projected() === 0 && !hasReflection) { toast("Add some taps first"); return; }
      // fold any missed taps you added here into today's live count so commitDay logs them
      if (draft.extraTimes.length) {
        today = round2(today + draft.extra);
        if (today < 0) today = 0;
        taps += draft.extraTimes.length;
        tapLog = tapLog.concat(draft.extraTimes);
        save(KEY_TODAY, today); save(KEY_TAPS, taps); save(KEY_TAPLOG, tapLog);
      }
      commitDay(ta.value.replace(/\s*\n\s*/g, " ").trim(), dateInput.value, {
        mood: draft.mood,
        factors: draft.factors,
        wins: draft.wins,
        worries: draft.worries,
      });
      endDayDraft = null;
      closeSheet();
    }));
    s.appendChild(makeBtn("Cancel", "ghost", () => { endDayDraft = null; closeSheet(); }));
  });
}

// ---- worry dump: timed brain dump → sort in/out of control → next actions ----
let worryTimer = null;
function clearWorryTimer() { if (worryTimer) { clearInterval(worryTimer); worryTimer = null; } }
const WORRY_SECONDS = 120;

// Stage 1 — a gently timed free write, one worry per line.
function openWorryDump() {
  clearWorryTimer();
  openSheet((s) => {
    addEl(s, "h3", "Worry dump");
    addEl(s, "p", "Set a timer and write whatever's on your mind — one worry per line. Don't overthink it.", "sub");

    const timer = document.createElement("div");
    timer.className = "worry-timer";
    s.appendChild(timer);
    addEl(s, "div", "then we'll sort them", "worry-timer-sub");

    const ta = document.createElement("textarea");
    ta.rows = 7;
    ta.placeholder = "money is tight\nthat text I haven't answered\nthe presentation friday…";
    // prefill with anything already captured so re-opening doesn't lose it
    if (endDayDraft && endDayDraft.worries.length) ta.value = endDayDraft.worries.map((w) => w.text).join("\n");
    s.appendChild(ta);

    const toSort = () => {
      clearWorryTimer();
      const items = ta.value.split("\n").map((t) => t.trim()).filter(Boolean);
      if (!items.length) { endDayDraft.worries = []; openEndDay(true); return; }
      // preserve prior control/action choices when the text matches
      const prev = endDayDraft.worries;
      const worries = items.map((text) => {
        const match = prev.find((w) => w.text === text);
        return { text, control: match ? match.control : null, action: match ? match.action : "" };
      });
      openWorrySort(worries);
    };

    s.appendChild(makeBtn("Sort them →", "primary", toSort));
    s.appendChild(makeBtn("Back", "ghost", () => { clearWorryTimer(); openEndDay(true); }));

    let left = WORRY_SECONDS;
    const paint = () => {
      const mm = Math.floor(left / 60), ss = left % 60;
      timer.textContent = `${mm}:${String(ss).padStart(2, "0")}`;
    };
    paint();
    worryTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        left = 0; paint();
        timer.classList.add("done");
        clearWorryTimer();
        buzz([0, 40, 60, 40]);
        if (ta.value.trim()) toSort();   // auto-advance once time's up and there's something written
      } else {
        paint();
      }
    }, 1000);
  });
}

// Stage 2 — sort each worry into in / out of your control.
function openWorrySort(worries) {
  openSheet((s) => {
    addEl(s, "h3", "In your control?");
    addEl(s, "p", "For each worry, decide: is this something you can act on, or something to let go of?", "sub");

    worries.forEach((w) => {
      const item = document.createElement("div");
      item.className = "worry-item";
      addEl(item, "div", w.text, "worry-text");
      const row = document.createElement("div");
      row.className = "ctl-row";
      const inBtn = document.createElement("button");
      inBtn.type = "button"; inBtn.className = "ctl-btn in" + (w.control === "in" ? " on" : "");
      inBtn.textContent = "In my control";
      const outBtn = document.createElement("button");
      outBtn.type = "button"; outBtn.className = "ctl-btn out" + (w.control === "out" ? " on" : "");
      outBtn.textContent = "Not in my control";
      inBtn.addEventListener("click", () => { w.control = "in"; inBtn.classList.add("on"); outBtn.classList.remove("on"); buzz(10); });
      outBtn.addEventListener("click", () => { w.control = "out"; outBtn.classList.add("on"); inBtn.classList.remove("on"); buzz(10); });
      row.append(inBtn, outBtn);
      item.appendChild(row);
      s.appendChild(item);
    });

    s.appendChild(makeBtn("Next →", "primary", () => {
      if (worries.some((w) => !w.control)) { toast("Sort each one first"); return; }
      openWorryActions(worries);
    }));
    s.appendChild(makeBtn("Back", "ghost", () => openWorryDump()));
  });
}

// Stage 3 — turn the controllable worries into a next action; let the rest go.
function openWorryActions(worries) {
  const controllable = worries.filter((w) => w.control === "in");
  const letGo = worries.filter((w) => w.control === "out");
  openSheet((s) => {
    addEl(s, "h3", "Next actions");

    if (controllable.length) {
      addEl(s, "p", "For each one you can act on, name the very next small step.", "sub");
      controllable.forEach((w) => {
        const lbl = document.createElement("div");
        lbl.className = "worry-action-lbl";
        addEl(lbl, "div", "You can act on", "wa-tag");
        lbl.appendChild(document.createTextNode(w.text));
        s.appendChild(lbl);
        const inp = document.createElement("input");
        inp.type = "text"; inp.value = w.action || "";
        inp.placeholder = "Next step — e.g. text them back tomorrow AM";
        inp.addEventListener("input", () => { w.action = inp.value; });
        s.appendChild(inp);
      });
    } else {
      addEl(s, "p", "Nothing here is in your control right now — and that's okay.", "sub");
    }

    if (letGo.length) {
      addEl(s, "label", "Out of your hands — let these go");
      const box = document.createElement("div");
      box.className = "worry-let-go";
      letGo.forEach((w) => addEl(box, "div", w.text, "worry-lg-item"));
      s.appendChild(box);
    }

    s.appendChild(makeBtn("Save ✓", "primary", () => {
      endDayDraft.worries = worries;
      openEndDay(true);
    }));
    s.appendChild(makeBtn("Back", "ghost", () => openWorrySort(worries)));
  });
}
function commitDay(note, dateStr, extras) {
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
  // optional end-day reflection (mood check-in, factors, tiny wins, worries)
  if (extras) {
    if (extras.mood) entry.mood = extras.mood;
    // fall back to that day's mandatory mood pulse if none was set in End Day
    if (entry.mood == null && moodDaily[entry.date] != null) entry.mood = moodDaily[entry.date];
    const facs = FACTORS.map((f) => f.key).filter((k) => extras.factors && extras.factors[k]);
    if (facs.length) entry.factors = facs;
    const wins = (extras.wins || []).map((w) => (w || "").trim()).filter(Boolean).slice(0, 3);
    if (wins.length) entry.wins = wins;
    const worries = (extras.worries || [])
      .filter((w) => w && (w.text || "").trim())
      .map((w) => ({ text: w.text.trim(), control: w.control || null, action: (w.action || "").trim() }));
    if (worries.length) entry.worries = worries;
  }
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
function closeSheet() { clearWorryTimer(); if (cravingTimer) { clearInterval(cravingTimer); cravingTimer = null; } el.overlay.classList.remove("show"); }
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

    const gameToggle = makeToggle(s, "Daily focus game (10s)", gameOn);
    addEl(s, "p", `A quick once-a-day warm-up: tap the smileys, skip the frowns.${gameBest > 0 ? ` Best: ${gameBest}.` : ""}`, "sub");
    gameToggle.addEventListener("change", () => {
      gameOn = gameToggle.checked;
      save(KEY_GAME_ON, gameOn);
      buzz(8);
      // turned on and not yet played today → show it right away
      if (gameOn && gamePlayed !== moodGateKey()) { closeSheet(); setTimeout(runDailyGates, 380); }
    });
    // test it any time, even after today's round is already done
    s.appendChild(makeBtn("▶ Play now (test)", "link", () => { closeSheet(); setTimeout(showGameGate, 380); }));

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
    s.appendChild(makeBtn(journalPinSet() ? "Journal passcode — On" : "Journal passcode — Off", "", () => { closeSheet(); openJournalPinSettings(); }));
    s.appendChild(makeBtn("Export backup (CSV)", "link", exportCsv));
    s.appendChild(makeBtn("Full backup (everything)", "link", () => { closeSheet(); startFullBackup(); }));
    s.appendChild(makeBtn("Restore from backup", "link", () => { closeSheet(); startRestore(); }));

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

    // read-only recap of the end-day reflection, if any was captured
    if (day.mood || (day.factors && day.factors.length) || (day.wins && day.wins.length) || (day.worries && day.worries.length)) {
      addEl(s, "label", "That day's check-in");
      const recap = document.createElement("div");
      recap.className = "day-recap";
      if (day.mood) {
        const m = MOODS.find((x) => x.v === day.mood);
        const line = document.createElement("div");
        line.innerHTML = `<span class="dr-mood-emoji">${moodEmoji(day.mood)}</span>Mood: <b>${m ? m.cap : day.mood}</b>`;
        recap.appendChild(line);
      }
      if (day.factors && day.factors.length) {
        const labels = day.factors.map((k) => { const f = FACTORS.find((x) => x.key === k); return f ? f.label : k; });
        const line = document.createElement("div");
        line.innerHTML = `<b>${labels.join(", ")}</b>`;
        recap.appendChild(line);
      }
      if (day.wins && day.wins.length) {
        addEl(recap, "div", "Tiny wins:");
        const ul = document.createElement("ul");
        ul.className = "dr-list";
        day.wins.forEach((w) => addEl(ul, "li", w));
        recap.appendChild(ul);
      }
      if (day.worries && day.worries.length) {
        const acts = day.worries.filter((w) => w.control === "in" && w.action);
        if (acts.length) {
          addEl(recap, "div", "Next actions:");
          const ul = document.createElement("ul");
          ul.className = "dr-list";
          acts.forEach((w) => addEl(ul, "li", w.action));
          recap.appendChild(ul);
        }
        const letGo = day.worries.filter((w) => w.control === "out").length;
        if (letGo) addEl(recap, "div", `Let go of ${letGo} thing${letGo === 1 ? "" : "s"} out of your control.`);
      }
      s.appendChild(recap);
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

// ---- backup export (csvField in core.js quotes the notes) ----
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

// ---- full backup & restore ----
// Everything lives only in this browser's storage — if the device is lost or
// the browser clears site data, it's gone. A full backup is one JSON file of
// every key; when a journal passcode is set the file is AES-GCM encrypted with
// it, so the private journal never leaves the device readable.
function downloadFile(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime || "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
async function backupKey(pass, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function gatherAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("count.")) data[k] = localStorage.getItem(k);
  }
  return data;
}
async function writeBackup(pass) {
  const payload = JSON.stringify(gatherAll());
  let file;
  if (pass) {
    const salt = randHex(16), ivHex = randHex(12);
    const iv = Uint8Array.from(ivHex.match(/../g).map((h) => parseInt(h, 16)));
    const key = await backupKey(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(payload));
    file = { app: "tracker-backup", v: 1, enc: true, at: new Date().toISOString(), salt, iv: ivHex, ct: b64(ct) };
  } else {
    file = { app: "tracker-backup", v: 1, enc: false, at: new Date().toISOString(), data: gatherAll() };
  }
  downloadFile(`tracker-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(file));
  toast("Full backup downloaded ✓");
}
function startFullBackup() {
  if (journalPinSet()) {
    // encrypt with the journal passcode (and confirm the owner is asking)
    openSheet((s) => {
      addEl(s, "h3", "Full backup");
      addEl(s, "p", "The file will be encrypted with your journal passcode — you'll need it to restore.", "sub");
      addEl(s, "label", "Journal passcode");
      const p = pinField(); s.appendChild(p);
      const err = addEl(s, "p", "", "sub"); err.style.color = "var(--over)"; err.style.minHeight = "16px";
      s.appendChild(makeBtn("Download backup", "primary", async () => {
        if (!(await journalPinMatches(p.value.trim()))) { err.textContent = "Wrong passcode"; p.value = ""; buzz([0, 40, 60, 40]); return; }
        const pass = p.value.trim();
        closeSheet();
        await writeBackup(pass);
      }));
      s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
      setTimeout(() => p.focus(), 50);
    });
  } else {
    confirmSheet("Full backup", "Downloads one file with everything in the app, unencrypted (no journal passcode is set). Keep it somewhere safe.", "Download", () => writeBackup(null));
  }
}
function applyBackup(data) {
  // replace this device's data with the backup's
  Object.keys(gatherAll()).forEach((k) => localStorage.removeItem(k));
  Object.keys(data).forEach((k) => { if (k.startsWith("count.")) localStorage.setItem(k, data[k]); });
  toast("Restored — reloading…");
  setTimeout(() => location.reload(), 700);
}
function startRestore() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      let file;
      try { file = JSON.parse(reader.result); } catch (e) { toast("That's not a backup file"); return; }
      if (!file || file.app !== "tracker-backup" || !file.v) { toast("That's not a backup file"); return; }
      const when = file.at ? new Date(file.at).toLocaleDateString() : "unknown date";
      if (!file.enc) {
        confirmSheet("Restore backup?", `From ${when}. This replaces everything currently in the app on this device.`, "Restore", () => applyBackup(file.data || {}), true);
        return;
      }
      // encrypted — ask for the passcode it was made with
      openSheet((s) => {
        addEl(s, "h3", "Restore backup");
        addEl(s, "p", `Encrypted backup from ${when}. Enter the journal passcode it was made with. This replaces everything on this device.`, "sub");
        addEl(s, "label", "Passcode");
        const p = pinField(); s.appendChild(p);
        const err = addEl(s, "p", "", "sub"); err.style.color = "var(--over)"; err.style.minHeight = "16px";
        s.appendChild(makeBtn("Restore", "danger", async () => {
          try {
            const key = await backupKey(p.value.trim(), file.salt);
            const iv = Uint8Array.from(file.iv.match(/../g).map((h) => parseInt(h, 16)));
            const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, unb64(file.ct));
            applyBackup(JSON.parse(new TextDecoder().decode(pt)));
          } catch (e) {
            err.textContent = "Wrong passcode for this backup"; p.value = ""; buzz([0, 40, 60, 40]);
          }
        }));
        s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
        setTimeout(() => p.focus(), 50);
      });
    };
    reader.readAsText(f);
  });
  input.click();
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
  if (reduceMotion()) { el.lock.style.display = "none"; runDailyGates(); return; }
  el.lock.classList.add("out");   // pointer-events:none while fading
  setTimeout(() => { el.lock.style.display = "none"; el.lock.classList.remove("out"); runDailyGates(); }, 230);
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
// durations & milestone math live in core.js
function sinceParts(start) { return partsMs(Date.now() - new Date(start).getTime()); }
// Optional per-tracker wellbeing timeline — stages that light up as the run
// grows. Timing reflects commonly reported recovery phases (early urges, a
// mid dip, then steadily building gains). Each has a little indicator icon.
const RECOVERY_STAGES = [
  { label: "Day 1",    ms: 0,           icon: "🔄", text: "The reset begins — motivation runs high" },
  { label: "Day 3",    ms: 3 * DAY,     icon: "🌊", text: "Urges tend to peak now — ride them out" },
  { label: "Day 5",    ms: 5 * DAY,     icon: "🌫️", text: "Brain fog and mood swings are normal" },
  { label: "Week 1",   ms: 7 * DAY,     icon: "⚡", text: "A first lift — energy starts to return" },
  { label: "Day 10",   ms: 10 * DAY,    icon: "〰️", text: "A flat, numb dip can set in — it's healing, keep going" },
  { label: "Week 2",   ms: 14 * DAY,    icon: "🧠", text: "Focus and emotional control sharpen" },
  { label: "Day 21",   ms: 21 * DAY,    icon: "😌", text: "The dip eases — mood steadies" },
  { label: "Month 1",  ms: 30 * DAY,    icon: "💪", text: "Clearer head, more control, rising confidence" },
  { label: "Day 45",   ms: 45 * DAY,    icon: "☀️", text: "Energy and drive keep climbing" },
  { label: "Month 2",  ms: 60 * DAY,    icon: "🗣️", text: "It feels like your default now — social ease returns" },
  { label: "Month 3",  ms: 90 * DAY,    icon: "🌟", text: "Deep recovery — a new baseline" },
  { label: "6 months", ms: 180 * DAY,   icon: "🧭", text: "Steady, clear, in control" },
  { label: "1 year",   ms: 365 * DAY,   icon: "🏔️", text: "Transformed — this is who you are now" },
];
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// resetPatterns (slip triggers/timing/trend/mood-link) lives in core.js

// ---- milestone celebrations + risky-time heads-up ----
// True while a full-screen gate/lock is covering the app — defer surprises.
function gatesUp() {
  return (el.lock && el.lock.style.display === "flex") || el.moodGate.classList.contains("show") || el.gameGate.classList.contains("show");
}
// Celebrate when a run crosses a new milestone. First sight of a tracker just
// records where it is (so old milestones aren't re-announced).
function checkMilestones() {
  if (gatesUp()) return;
  let changed = false;
  since.forEach((it) => {
    const elapsed = Math.max(0, Date.now() - new Date(it.start).getTime());
    const cur = highestMile(elapsed);
    if (it.seenMile == null) { it.seenMile = cur; changed = true; return; }
    if (cur > it.seenMile) {
      it.seenMile = cur; changed = true;
      buzz([0, 40, 60, 40, 60, 90]);
      toast(`🎉 ${it.name} · ${mileLabelFor(cur)}!`, 3600);
      const cx = window.innerWidth / 2, cy = window.innerHeight / 3;
      confettiBurst(cx, cy, 26);
    }
  });
  if (changed) save(KEY_SINCE, since);
}
// A gentle heads-up if right now is an hour you've slipped in before.
function checkRiskyTimes() {
  if (!since.length || gatesUp()) return;
  const now = new Date();
  const key = isoLocal(now) + "-" + now.getHours();
  if (load(KEY_RISKY_LAST, "") === key) return;   // at most once per clock-hour
  const hr = now.getHours();
  for (const it of since) {
    const n = (it.log || []).filter((e) => { const d = new Date(e.at); return !isNaN(d.getTime()) && d.getHours() === hr; }).length;
    if (n >= 2) {
      save(KEY_RISKY_LAST, key);
      toast(`🫶 Around now is when "${it.name}" has tripped you up before. You've got this.`, 4600);
      return;
    }
  }
}

// Opt-in timeline of how you're doing as the run grows — stages fill in as you
// reach them, with the next one showing how far off it is.
function appendRecovery(card, it) {
  const elapsed = Math.max(0, Date.now() - new Date(it.start).getTime());
  addEl(card, "div", "Recovery timeline", "rec-title");
  const wrap = document.createElement("div"); wrap.className = "rec";
  let nextMarked = false;
  RECOVERY_STAGES.forEach((st) => {
    const row = document.createElement("div"); row.className = "rec-row";
    const reached = elapsed >= st.ms;
    if (reached) row.classList.add("reached");
    else if (!nextMarked) { row.classList.add("next"); nextMarked = true; }
    else row.classList.add("future");
    const dot = document.createElement("span"); dot.className = "rec-dot";
    const body = document.createElement("div"); body.className = "rec-body";
    const head = document.createElement("div"); head.className = "rec-head";
    addEl(head, "span", st.icon, "rec-icon");
    addEl(head, "span", st.label, "rec-label");
    if (row.classList.contains("next")) addEl(head, "span", "in " + durLabel(st.ms - elapsed), "rec-when");
    body.appendChild(head);
    addEl(body, "div", st.text, "rec-text");
    row.append(dot, body);
    wrap.appendChild(row);
  });
  card.appendChild(wrap);
}

// "Don't break the chain": a contribution-style grid of clean days (green) vs
// slip days (red) since the tracker began, so the streak is something you see.
const CHAIN_WEEKS = 13;
function appendChain(card, it) {
  const DAYMS = 86400e3;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // origin = the earliest day this tracker has existed (first run start)
  const stamps = [new Date(it.start).getTime()];
  (it.log || []).forEach((e) => { const t = new Date(e.at).getTime(); if (!isNaN(t)) { stamps.push(t); if (e.ran > 0) stamps.push(t - e.ran); } });
  const origin = new Date(Math.min(...stamps)); origin.setHours(0, 0, 0, 0);
  const slip = new Set();
  (it.log || []).forEach((e) => { const d = new Date(e.at); if (!isNaN(d.getTime())) slip.add(isoLocal(d)); });

  addEl(card, "div", "Don't break the chain", "chain-title");
  const grid = document.createElement("div"); grid.className = "chain-grid";
  const startCell = new Date(today);
  startCell.setDate(startCell.getDate() - startCell.getDay() - (CHAIN_WEEKS - 1) * 7);   // Sunday, N-1 weeks back
  for (let i = 0; i < CHAIN_WEEKS * 7; i++) {
    const d = new Date(startCell); d.setDate(startCell.getDate() + i); d.setHours(0, 0, 0, 0);
    const cell = document.createElement("span"); cell.className = "chain-cell";
    const tt = d.getTime();
    if (tt > today.getTime()) cell.classList.add("future");
    else if (tt < origin.getTime()) cell.classList.add("pre");
    else if (slip.has(isoLocal(d))) cell.classList.add("slip");
    else cell.classList.add("clean");
    if (tt === today.getTime()) cell.classList.add("today");
    cell.title = d.toLocaleDateString();
    grid.appendChild(cell);
  }
  card.appendChild(grid);
  const totalDays = Math.floor((today.getTime() - origin.getTime()) / DAYMS) + 1;
  const slips = slip.size;
  const clean = Math.max(0, totalDays - slips);
  const cap = document.createElement("div"); cap.className = "chain-cap";
  cap.innerHTML = `<b>${clean}</b> clean day${clean === 1 ? "" : "s"} · ${slips} slip${slips === 1 ? "" : "s"}`;
  card.appendChild(cap);
}

// Ride out a craving — a timed pause that logs a win when you make it through.
let cravingTimer = null;
const CRAVE_SECONDS = 300;
const CRAVE_LINES = [
  "You're stronger than the urge.",
  "This feeling is temporary — let it pass.",
  "Breathe. You don't have to act on it.",
  "Every second here is a win.",
  "The wave rises, then it falls.",
  "Almost there — stay with it.",
];
function logUrgeWin(it) {
  it.urges = it.urges || [];
  it.urges.push(new Date().toISOString());
  save(KEY_SINCE, since);
}
function openCravingTimer(it) {
  if (cravingTimer) { clearInterval(cravingTimer); cravingTimer = null; }
  openSheet((s) => {
    addEl(s, "h3", "Ride it out");
    addEl(s, "p", "Cravings peak and pass, usually within a few minutes. Sit with it — you don't have to act.", "sub");
    const clock = document.createElement("div"); clock.className = "craving-clock"; s.appendChild(clock);
    const wrap = document.createElement("div"); wrap.className = "breath-wrap";
    const orb = document.createElement("div"); orb.className = "breath-orb in"; wrap.appendChild(orb); s.appendChild(wrap);
    const line = addEl(s, "p", CRAVE_LINES[0], "craving-line");
    let left = CRAVE_SECONDS, phase = 0;
    const paint = () => { const m = Math.floor(left / 60), sec = left % 60; clock.textContent = `${m}:${String(sec).padStart(2, "0")}`; };
    paint();
    // gently pulse the orb in/out on a slow loop for something to breathe with
    const phases = ["in", "out"];
    cravingTimer = setInterval(() => {
      left -= 1; paint();
      if (left % 5 === 0) { phase = (phase + 1) % 2; orb.className = "breath-orb " + phases[phase]; }
      if (left % 30 === 0) line.textContent = CRAVE_LINES[(Math.random() * CRAVE_LINES.length) | 0];
      if (left <= 0) {
        clearInterval(cravingTimer); cravingTimer = null;
        logUrgeWin(it);
        buzz([0, 40, 60, 40, 60, 90]);
        confettiBurst(window.innerWidth / 2, window.innerHeight / 2, 22);
        toast("You rode it out 🌊 — that's a win", 3600);
        closeSheet(); renderSince();
      }
    }, 1000);
    const madeIt = makeBtn("I made it 💪", "primary", () => {
      clearInterval(cravingTimer); cravingTimer = null;
      logUrgeWin(it);
      buzz([0, 30, 50, 30]);
      const r = madeIt.getBoundingClientRect();   // burst from the button itself
      confettiBurst(r.left + r.width / 2, r.top + r.height / 2, 18);
      toast("Urge beaten 🛡️ — that's a win", 3000);
      closeSheet(); renderSince();
    });
    s.appendChild(madeIt);
    s.appendChild(makeBtn("Back", "ghost", () => { clearInterval(cravingTimer); cravingTimer = null; closeSheet(); }));
  });
}

// A gentle weekly recap — mentioned once a week when the combo is active.
// (weekKey lives in core.js)
function maybeWeeklyRecap() {
  if (!timelineOn || gatesUp()) return;
  const wk = weekKey();
  const last = load(KEY_RECAP_LAST, null);
  if (last == null) { save(KEY_RECAP_LAST, wk); return; }   // first sight — arm, don't show
  if (last === wk) return;
  save(KEY_RECAP_LAST, wk);
  // don't interrupt — just mention it; the recap lives in the ⋯ menu
  toast("📊 Your weekly recap is ready — it's in ⋯", 4200);
}
function openWeeklyRecap() {
  const weekAgo = Date.now() - 7 * DAY;
  const wkHist = history.filter((d) => new Date(d.endedAt || d.date).getTime() >= weekAgo);
  const total = wkHist.reduce((sum, d) => sum + d.total, 0);
  const moods = Object.keys(moodDaily).filter((k) => new Date(k).getTime() >= weekAgo).map((k) => moodDaily[k]);
  const avgMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
  const wins = wkHist.reduce((sum, d) => sum + ((d.wins && d.wins.length) || 0), 0);
  openSheet((s) => {
    addEl(s, "h3", "Your week");
    addEl(s, "p", "A quick look back at the last 7 days.", "sub");
    const list = document.createElement("div"); list.className = "recap"; s.appendChild(list);
    const row = (icon, label, value) => {
      const r = document.createElement("div"); r.className = "recap-row";
      addEl(r, "span", icon, "recap-ico");
      const b = document.createElement("div"); b.className = "recap-body";
      addEl(b, "div", value, "recap-val"); addEl(b, "div", label, "recap-lbl");
      r.appendChild(b); list.appendChild(r);
    };
    row("📊", wkHist.length + (wkHist.length === 1 ? " day logged" : " days logged"), fmt(round2(total)) + " tracked");
    if (avgMood != null) row("🙂", "average mood", `${moodEmoji(avgMood)} ${avgMood.toFixed(1)}`);
    if (wins > 0) row("✓", wins === 1 ? "tiny win" : "tiny wins", String(wins));
    since.forEach((it) => {
      const runMs = Math.max(0, Date.now() - new Date(it.start).getTime());
      const wonWeek = (it.urges || []).filter((t) => new Date(t).getTime() >= weekAgo).length;
      row("🔥", it.name + (wonWeek ? ` · ${wonWeek} urge${wonWeek === 1 ? "" : "s"} resisted` : ""), durLabel(runMs) + " strong");
    });
    addEl(s, "p", "Small steps, every day. Keep going.", "sub");
    s.appendChild(makeBtn("Nice", "primary", closeSheet));
  });
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

    // urge-resisted tally + ride-it-out button (only when the combo is active)
    if (timelineOn) {
      const won = (it.urges || []).length;
      const urge = document.createElement("div"); urge.className = "urge-row";
      addEl(urge, "div", `🛡️ ${won} urge${won === 1 ? "" : "s"} resisted`, "urge-count");
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "urge-btn";
      btn.textContent = "Craving? Ride it out";
      btn.addEventListener("click", (ev) => { ev.stopPropagation(); openCravingTimer(it); });
      urge.appendChild(btn);
      card.appendChild(urge);
    }

    // optional wellbeing timeline (hidden flag / legacy per-tracker)
    if (timelineOn || it.timeline) appendRecovery(card, it);

    // don't-break-the-chain calendar of clean vs slip days
    appendChain(card, it);

    // private reset journal — gated behind its own separate passcode
    const entries = (it.log || []).filter((e) => e && ((e.reason || "").trim() || (e.tags && e.tags.length) || (e.cope || "").trim()));
    if (entries.length) {
      addEl(card, "div", "🔒 Why you reset · private", "since-log-title");
      if (!journalPinSet()) {
        const setBtn = document.createElement("button");
        setBtn.className = "since-log-locked";
        setBtn.textContent = `🔒 Set a passcode to open your journal (${entries.length})`;
        setBtn.addEventListener("click", (ev) => { ev.stopPropagation(); promptJournalSetup(); });
        card.appendChild(setBtn);
      } else if (!journalUnlocked) {
        const unlockBtn = document.createElement("button");
        unlockBtn.className = "since-log-locked";
        unlockBtn.textContent = `🔒 Locked · tap to unlock (${entries.length})`;
        unlockBtn.addEventListener("click", (ev) => { ev.stopPropagation(); promptJournalUnlock(); });
        card.appendChild(unlockBtn);
      } else {
        // patterns from the slips — triggers, timing, mood link, and a hopeful trend
        const pat = resetPatterns(it, moodDaily);
        if (pat) {
          const pw = document.createElement("div"); pw.className = "pat";
          if (pat.topTag) {
            const t = triggerOf(pat.topTag);
            if (t) addEl(pw, "div", `Most common trigger: ${t.emoji} ${t.label} · ${pat.topN}×`, "pat-line");
          }
          if (pat.peakWN >= 2 || pat.peakHN >= 2) {
            const bits = [];
            if (pat.peakWN >= 2) bits.push("on " + WK_NAME[pat.peakW]);
            if (pat.peakHN >= 2) bits.push("around " + hourLabel(pat.peakH));
            addEl(pw, "div", "Slips cluster " + bits.join(", "), "pat-line");
          }
          if (pat.moodGap === "low") addEl(pw, "div", "Slips tend to land on lower-mood days — extra care when you're low", "pat-line");
          if (pat.trend === "up") addEl(pw, "div", "📈 Your runs are getting longer — keep it up", "pat-line good");
          if (pw.childNodes.length) card.appendChild(pw);
        }
        const logWrap = document.createElement("div"); logWrap.className = "since-log";
        entries.slice(-6).reverse().forEach((e) => {
          const row = document.createElement("div"); row.className = "since-log-row";
          addEl(row, "span", new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }), "since-log-date");
          const body = document.createElement("div"); body.className = "since-log-body";
          if (e.tags && e.tags.length) {
            const tg = document.createElement("div"); tg.className = "since-log-tags";
            e.tags.forEach((k) => { const t = triggerOf(k); if (t) { const c = document.createElement("span"); c.className = "since-log-tag"; c.textContent = `${t.emoji} ${t.label}`; tg.appendChild(c); } });
            body.appendChild(tg);
          }
          if ((e.reason || "").trim()) addEl(body, "div", e.reason, "since-log-reason");
          if ((e.cope || "").trim()) addEl(body, "div", "→ " + e.cope, "since-log-cope");
          row.appendChild(body);
          logWrap.appendChild(row);
        });
        card.appendChild(logWrap);
        logWrap.addEventListener("click", (ev) => ev.stopPropagation());   // don't open the edit form
      }
    }

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
    chip.addEventListener("click", requestSince);
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
// The Time Since page requires the passcode every time it's opened. If none is
// set yet, prompt to create one first (so it becomes locked going forward).
function requestSince() {
  if (journalUnlocked) { openSince(); return; }
  if (!journalPinSet()) { promptJournalSetup(openSince); return; }
  promptJournalUnlock(openSince);
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
  journalUnlocked = false;   // re-lock the private journal each time the page closes
}
// ---- private reset journal, gated by its own separate passcode ----
// Distinct from the app lock (its own key + salt). Unlock lasts only while the
// Time Since page is open, then re-locks.
let journalUnlocked = false;
function journalPinSet() { return !!load(KEY_JOURNAL_PIN, null); }
async function setJournalPin(pin) {
  const salt = randHex(16);
  save(KEY_JOURNAL_SALT, salt);
  save(KEY_JOURNAL_PIN, await sha256(pin + salt));
}
async function journalPinMatches(pin) {
  return (await sha256(pin + load(KEY_JOURNAL_SALT, ""))) === load(KEY_JOURNAL_PIN, null);
}
function clearJournalPin() {
  [KEY_JOURNAL_PIN, KEY_JOURNAL_SALT, KEY_JOURNAL_BIO].forEach((k) => localStorage.removeItem(k));
  journalUnlocked = false;
}
// Face ID / Touch ID for the journal, via a separate WebAuthn credential.
function journalBioSet() { return !!load(KEY_JOURNAL_BIO, null); }
async function journalBioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Tracker", id: location.hostname },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "journal", displayName: "journal" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
    timeout: 60000,
  } });
  save(KEY_JOURNAL_BIO, b64(cred.rawId));
}
async function journalBioUnlock() {
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: "public-key", id: unb64(load(KEY_JOURNAL_BIO, null)) }],
    userVerification: "required", timeout: 60000,
  } });
}
function pinField() {
  const i = document.createElement("input");
  i.type = "password"; i.inputMode = "numeric"; i.autocomplete = "off";
  i.setAttribute("pattern", "[0-9]*"); i.maxLength = 12;
  return i;
}
// First-time setup (or change): pick + confirm a separate passcode.
function promptJournalSetup(onSuccess) {
  openSheet((s) => {
    addEl(s, "h3", "Set a passcode");
    addEl(s, "p", "This passcode locks your Time Since trackers and their private journals. It's separate from your app lock, and kept only on this device.", "sub");
    addEl(s, "label", "New passcode (4+ digits)");
    const p1 = pinField(); s.appendChild(p1);
    addEl(s, "label", "Confirm passcode");
    const p2 = pinField(); s.appendChild(p2);
    let bioToggle = null;
    if (BIO_AVAIL) bioToggle = makeToggle(s, "Also unlock with Face ID", false);
    s.appendChild(makeBtn("Set passcode", "primary", async () => {
      const a = p1.value.trim(), b = p2.value.trim();
      if (a.length < 4) { toast("Use at least 4 digits"); return; }
      if (a !== b) { toast("Passcodes don't match"); return; }
      await setJournalPin(a);
      if (bioToggle && bioToggle.checked) {
        try { await journalBioRegister(); } catch (e) { toast("Face ID setup skipped"); }
      }
      journalUnlocked = true;
      closeSheet(); (onSuccess || renderSince)();
      toast("Passcode set 🔒");
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
    setTimeout(() => p1.focus(), 50);
  });
}
// Enter the passcode (or Face ID) to unlock. onSuccess defaults to re-rendering
// the (already-open) panel; the timer gate passes openSince to open it.
function promptJournalUnlock(onSuccess) {
  const done = () => { journalUnlocked = true; closeSheet(); (onSuccess || renderSince)(); };
  openSheet((s) => {
    addEl(s, "h3", "Enter passcode");
    addEl(s, "p", "Unlocks your Time Since trackers — they lock again when you close the page.", "sub");
    addEl(s, "label", "Passcode");
    const p = pinField(); s.appendChild(p);
    const err = addEl(s, "p", "", "sub"); err.style.color = "var(--over)"; err.style.minHeight = "16px";
    s.appendChild(makeBtn("Unlock", "primary", async () => {
      if (await journalPinMatches(p.value.trim())) done();
      else { err.textContent = "Wrong passcode"; p.value = ""; buzz([0, 40, 60, 40]); p.focus(); }
    }));
    if (journalBioSet()) {
      s.appendChild(makeBtn("Unlock with Face ID", "", async () => {
        try { await journalBioUnlock(); done(); }
        catch (e) { err.textContent = "Face ID didn't match"; buzz([0, 40, 60, 40]); }
      }));
    }
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
    setTimeout(() => p.focus(), 50);
  });
}
// Manage the journal passcode from Settings.
function openJournalPinSettings() {
  openSheet((s) => {
    addEl(s, "h3", "Journal passcode");
    addEl(s, "p", "A separate passcode that protects the private “why you reset” journal on your trackers. All of it stays on this device.", "sub");
    if (journalPinSet()) {
      if (BIO_AVAIL) {
        const bt = makeToggle(s, "Unlock with Face ID", journalBioSet());
        bt.addEventListener("change", async () => {
          if (bt.checked) { try { await journalBioRegister(); toast("Face ID on"); } catch (e) { bt.checked = false; toast("Couldn't set up Face ID"); } }
          else { localStorage.removeItem(KEY_JOURNAL_BIO); toast("Face ID off"); }
        });
      }
      s.appendChild(makeBtn("Change passcode", "primary", promptJournalSetup));
      s.appendChild(makeBtn("Remove passcode", "danger", () => {
        confirmSheet("Remove journal passcode?", "Your reset journal will no longer be protected.", "Remove", () => { clearJournalPin(); toast("Journal passcode removed"); });
      }));
    } else {
      s.appendChild(makeBtn("Set a passcode", "primary", promptJournalSetup));
    }
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}

// A gentle speed-bump BEFORE resetting — your why, your run vs record, what
// you've saved, and a breath — so the choice to reset is a considered one.
function openResetPause(existing) {
  openSheet((s) => {
    addEl(s, "h3", "Hang on a sec");
    addEl(s, "p", "You're in the middle of a run. Take a breath before you decide.", "sub");

    const run = Date.now() - new Date(existing.start).getTime();
    const best = existing.best || 0;

    const card = document.createElement("div");
    card.className = "pause-card";
    addEl(card, "div", existing.name, "pause-name");
    addEl(card, "div", durLabel(run) + " strong", "pause-run");
    if (best > 0 && run < best) {
      addEl(card, "div", `Only ${durLabel(best - run)} to beat your record of ${durLabel(best)} 🔥`, "pause-line");
    } else if (best > 0 && run >= best) {
      addEl(card, "div", "You're in record territory right now 🏆", "pause-line");
    }
    if (existing.rate > 0) addEl(card, "div", `${savedText(existing.rate, existing.unit, run)} saved so far`, "pause-line");
    s.appendChild(card);

    if (existing.note) {
      const why = document.createElement("div"); why.className = "pause-why";
      addEl(why, "div", "Remember your why", "pause-why-tag");
      addEl(why, "div", existing.note, "pause-why-text");
      s.appendChild(why);
    }

    // any coping notes you left before, resurfaced when it counts
    const copes = (existing.log || []).map((e) => (e.cope || "").trim()).filter(Boolean);
    if (copes.length) {
      const box = document.createElement("div"); box.className = "pause-why";
      addEl(box, "div", "What's helped before", "pause-why-tag");
      copes.slice(-2).reverse().forEach((c) => addEl(box, "div", "• " + c, "pause-why-text"));
      s.appendChild(box);
    }

    s.appendChild(makeBtn("Keep going 💪", "primary", closeSheet));
    s.appendChild(makeBtn("Take a breath", "", () => openBreath(existing)));
    s.appendChild(makeBtn("Reset anyway", "ghost", () => openResetReason(existing)));
  });
}

// A simple guided breath — in, hold, out — loops until you're ready.
function openBreath(existing) {
  openSheet((s) => {
    addEl(s, "h3", "Breathe");
    const stage = addEl(s, "p", "Follow the circle.", "sub");
    const wrap = document.createElement("div"); wrap.className = "breath-wrap";
    const orb = document.createElement("div"); orb.className = "breath-orb";
    wrap.appendChild(orb); s.appendChild(wrap);
    // 4s in · 4s hold · 6s out, looping
    const phases = [["Breathe in", 4000, "in"], ["Hold", 4000, "hold"], ["Breathe out", 6000, "out"]];
    let i = 0, timer = null;
    const step = () => {
      const [label, ms, cls] = phases[i];
      stage.textContent = label;
      orb.className = "breath-orb " + cls;   // set atomically so it eases between phases
      buzz(12);
      i = (i + 1) % phases.length;
      timer = setTimeout(step, ms);
    };
    step();
    const stop = () => { if (timer) clearTimeout(timer); };
    const back = makeBtn("I'm okay — back", "primary", () => { stop(); openResetPause(existing); });
    s.appendChild(back);
    // stop the loop if the sheet is dismissed another way
    const obs = new MutationObserver(() => { if (!el.overlay.classList.contains("show")) { stop(); obs.disconnect(); } });
    obs.observe(el.overlay, { attributes: true, attributeFilter: ["class"] });
  });
}

// Reset a tracker after a slip — capture triggers, a private note, and a plan.
function openResetReason(existing) {
  openSheet((s) => {
    addEl(s, "h3", "Reset timer");
    addEl(s, "p", "Starts counting from now. Your longest run is kept as your record.", "sub");

    addEl(s, "label", "What triggered it? (tap any)");
    const picked = {};
    const chipRow = document.createElement("div"); chipRow.className = "chip-row";
    TRIGGERS.forEach((t) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip";
      const em = document.createElement("span"); em.className = "chip-emoji"; em.textContent = t.emoji;
      b.append(em, document.createTextNode(t.label));
      b.addEventListener("click", () => { picked[t.key] = !picked[t.key]; b.classList.toggle("on", !!picked[t.key]); buzz(10); });
      chipRow.appendChild(b);
    });
    s.appendChild(chipRow);

    addEl(s, "label", "Why did you reset? (optional)");
    const ta = document.createElement("textarea");
    ta.rows = 3; ta.maxLength = 280; ta.placeholder = "What happened? What led to it?";
    s.appendChild(ta);

    addEl(s, "label", "What might help next time? (optional)");
    const cope = document.createElement("textarea");
    cope.rows = 2; cope.maxLength = 280; cope.placeholder = "A plan for the next craving…";
    s.appendChild(cope);

    addEl(s, "p", "🔒 Private — kept only on this device, just for you.", "sub");
    s.appendChild(makeBtn("Reset", "primary", () => {
      const reason = ta.value.replace(/\s*\n\s*/g, " ").trim();
      const plan = cope.value.replace(/\s*\n\s*/g, " ").trim();
      const tags = TRIGGERS.map((t) => t.key).filter((k) => picked[k]);
      const run = Date.now() - new Date(existing.start).getTime();
      if (run > (existing.best || 0)) existing.best = run;
      existing.resets = (existing.resets || 0) + 1;
      existing.log = existing.log || [];
      existing.log.push({ at: new Date().toISOString(), reason: reason, ran: run, tags: tags, cope: plan });
      existing.start = new Date().toISOString();
      existing.seenMile = 0;   // fresh run — milestones can be celebrated again
      save(KEY_SINCE, since); closeSheet(); renderSince();
      // a kind word — slipping is part of it, and the best run is still kept
      toast(SINCE_RESET_MSGS[(Math.random() * SINCE_RESET_MSGS.length) | 0], 3600);
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
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
      s.appendChild(makeBtn("Reset to now", "", () => openResetPause(existing)));
      // wipe the tallies (reset count, chain calendar, journal) back to zero
      // without touching the running timer
      if ((existing.resets || 0) > 0 || (existing.log || []).length || (existing.best || 0) > 0) {
        s.appendChild(makeBtn("Clear reset history", "", () => {
          confirmSheet("Start the count over?", "Sets resets back to 0 and clears the clean-days calendar, best run and private journal for this tracker. Your current timer keeps running. This can't be undone.", "Clear", () => {
            existing.resets = 0;
            existing.best = 0;
            existing.log = [];
            const elapsed = Math.max(0, Date.now() - new Date(existing.start).getTime());
            existing.seenMile = highestMile(elapsed);   // don't re-announce old milestones
            save(KEY_SINCE, since); closeSheet(); renderSince();
            toast("Cleared — fresh start ✓");
          }, true);
        }));
      }
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
    s.appendChild(makeBtn("⏱   Time Since", "", () => { closeSheet(); requestSince(); }));
    s.appendChild(makeBtn("💧   Water", "", () => { closeSheet(); openWater(); }));
    s.appendChild(makeBtn("🌳   Your Tree", "", () => { closeSheet(); openTree(); }));
    if (timelineOn) s.appendChild(makeBtn("📊   Your week", "", () => { closeSheet(); openWeeklyRecap(); }));
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

// Hidden gesture: tap the date 5×, then the footer 5×, to flip the flag.
(() => {
  const footer = document.querySelector(".version");
  if (!el.date || !footer) return;
  let a = 0, b = 0, t = null;
  const arm = () => { clearTimeout(t); t = setTimeout(() => { a = 0; b = 0; }, 4000); };
  el.date.addEventListener("click", () => { if (a < 5) { a++; b = 0; arm(); } });
  footer.addEventListener("click", () => {
    if (a < 5) return;
    b++; arm();
    if (b >= 5) {
      clearTimeout(t); a = 0; b = 0;
      timelineOn = !timelineOn; save(KEY_TL, timelineOn);
      buzz([0, 30, 50, 30]);
      toast(timelineOn ? "On" : "Off");
      if (el.sinceOverlay.classList.contains("show")) renderSince();
    }
  });
})();
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
runDailyGates();   // mandatory daily check-in (skips itself if the lock is up — hideLock re-checks)
checkMilestones();
// the heads-up waits a beat so it never lands on top of the lock/daily gates
setTimeout(checkRiskyTimes, 2500);
maybeWeeklyRecap();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  maybeLock();
  runDailyGates();
  checkReminder();
  checkMilestones();
  setTimeout(checkRiskyTimes, 2500);
  maybeWeeklyRecap();
  if (themeAuto && theme !== themeForToday()) applyTheme();   // new day → new theme
});

// Daily reminder + keep the unlock window fresh during active use.
checkReminder();
setInterval(() => {
  checkReminder();
  if (themeAuto && theme !== themeForToday()) applyTheme();   // roll the theme over at midnight
  if (lockSet() && el.lock.style.display !== "flex" && !document.hidden) save(KEY_UNLOCK_AT, Date.now());
}, 60000);

// keep the main-page "time since" strip ticking every second; milestone
// crossings only need a coarser watch (a few seconds late is fine)
setInterval(() => { if (!document.hidden && since.length) tickSinceStrip(); }, 1000);
setInterval(() => { if (!document.hidden && since.length) checkMilestones(); }, 10000);

// ---- theme ---- follow the phone's light/dark setting for the status-bar tint
const themeMeta = document.querySelector('meta[name="theme-color"]');
function syncTheme() {
  // Keep the top status bar black on every theme (iOS only allows black/white
  // for the web-app status bar); this avoids a light bar on the light themes.
  if (themeMeta) themeMeta.setAttribute("content", "#000000");
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
