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
  tapLogCard: document.getElementById("tapLogCard"),
  sinceBtn: document.getElementById("sinceBtn"),
  sinceOverlay: document.getElementById("sinceOverlay"),
  sinceClose: document.getElementById("sinceClose"),
  sinceList: document.getElementById("sinceList"),
  sinceAdd: document.getElementById("sinceAdd"),
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
}

// Today's taps, by the clock — count plus a row per tap: the time, how much
// that tap added, and the running total after it. Resets when the day ends.
function tapEntry(e) {
  // tolerate the old format where a tap was stored as just a timestamp
  return typeof e === "number" ? { t: e, amt: null, total: null } : e;
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

  const list = document.createElement("div");
  list.className = "tap-list";
  tapLog.forEach((raw) => {
    const e = tapEntry(raw);
    const row = document.createElement("div");
    row.className = "tap-row";

    const time = document.createElement("span");
    time.className = "tap-t";
    time.textContent = new Date(e.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

    const amt = document.createElement("span");
    amt.className = "tap-amt";
    amt.textContent = e.amt != null ? "+" + fmt(e.amt) : "";

    const tot = document.createElement("span");
    tot.className = "tap-total";
    tot.textContent = e.total != null ? fmt(e.total) : "—";

    row.append(time, amt, tot);
    list.appendChild(row);
  });
  card.appendChild(list);
}

const WK_INIT = ["S", "M", "T", "W", "T", "F", "S"];
const WK_NAME = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

// Calendar heatmap of the current month — each day tinted under (green) / over (red).
function renderCalendar() {
  const card = el.calCard;
  if (history.length === 0 && today === 0) { card.style.display = "none"; return; }
  card.style.display = "block";
  card.textContent = "";

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();
  const todayStr = isoLocal(now);

  // map date -> total for this month (history + today in progress)
  const totals = {};
  history.forEach((d) => { totals[d.date] = d.total; });
  if (today > 0) totals[todayStr] = today;

  const title = document.createElement("div");
  title.className = "section-title";
  title.textContent = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  card.appendChild(title);

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

function openInsights() { renderInsights(); el.insightsOverlay.classList.add("show"); }
function closeInsights() { el.insightsOverlay.classList.remove("show"); }

// Cheap render for the today area only — used on every tap so rapid
// tapping never rebuilds the history list.
function renderTop(animate) {
  const zone = zoneOf();
  setValue(today, animate);

  // colour the today area by how close we are to the goal
  el.totalWrap.classList.remove("zone-safe", "zone-warn", "zone-over");
  if (zone !== "none") el.totalWrap.classList.add("zone-" + zone);

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
    el.goalText.classList.remove("hint");
    if (zone === "over") {
      el.goalText.textContent = `Over goal by ${fmt(today - goal)}`;
    } else if (today === goal) {
      el.goalText.textContent = `At your goal of ${fmt(goal)}`;
    } else {
      el.goalText.textContent = `${Math.round((today / goal) * 100)}% of ${fmt(goal)} goal`;
    }
  } else {
    el.totalWrap.classList.remove("has-goal");
    el.ringProg.style.strokeDashoffset = RING_C;   // just the grey frame
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
function addTap(e) {
  const prev = today;
  today = round2(today + step);
  taps += 1;
  tapLog.push({ t: Date.now(), amt: step, total: today });
  save(KEY_TODAY, today); save(KEY_TAPS, taps); save(KEY_TAPLOG, tapLog);
  spawnRipple(e);
  buzz(15); click();
  el.total.classList.remove("bump"); void el.total.offsetWidth; el.total.classList.add("bump");
  if (goal > 0) {
    if (prev < goal && today === goal) atGoalHeadsUp();        // landed exactly on the limit
    else if (prev <= goal && today > goal) warnOver();          // crossed over it
  }
  renderTop(true); renderChart();   // history list doesn't change on a tap
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
  today = round2(today - step);
  if (today < 0) today = 0;
  taps -= 1;
  tapLog.pop();
  save(KEY_TODAY, today); save(KEY_TAPS, taps); save(KEY_TAPLOG, tapLog);
  renderTop(true); renderChart();
}

// New: End Day opens a sheet with an optional note.
function openEndDay() {
  if (taps === 0 && today === 0) { toast("Nothing to log yet"); return; }
  openSheet((s) => {
    addEl(s, "h3", "End Day");
    addEl(s, "p", `Log ${fmt(today)} and start a fresh day.`, "sub");

    addEl(s, "label", "Date for this day");
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = isoLocal(new Date());
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

  // a fuller "day complete" moment
  buzz([0, 35, 40, 35, 40, 70]);
  toast(`Day complete · ${fmt(total)} logged${underGoal ? " · under goal ✓" : ""}`);
  el.ringWrap.classList.remove("pulse"); void el.ringWrap.offsetWidth; el.ringWrap.classList.add("pulse");

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
function openSheet(builder) { el.sheet.textContent = ""; builder(el.sheet); el.overlay.classList.add("show"); }
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

// Feature 5: tap a history day to edit total / note, or delete.
function openHistorySheet(idx) {
  const day = history[idx];
  if (!day) return;
  openSheet((s) => {
    addEl(s, "h3", day.label);

    addEl(s, "label", "Total for this day");
    const input = numInput(fmt(day.total), "0");
    s.appendChild(input);

    addEl(s, "label", "Note");
    const ta = document.createElement("textarea");
    ta.rows = 3; ta.value = day.note || ""; ta.placeholder = "No note";
    s.appendChild(ta);

    s.appendChild(makeBtn("Save", "primary", () => {
      const v = parseFloat(input.value);
      if (isNaN(v) || v < 0) { toast("Enter a number ≥ 0"); return; }
      history[idx].total = round2(v);
      history[idx].note = ta.value.replace(/\s*\n\s*/g, " ").trim();
      save(KEY_HISTORY, history);
      closeSheet(); render();
    }));
    s.appendChild(makeBtn("Delete this day", "danger", () => {
      confirmSheet(`Delete ${day.label}?`, `${fmt(day.total)} will be removed.`, "Delete", () => {
        history.splice(idx, 1); save(KEY_HISTORY, history); render();
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
const LOCK_GRACE_MS = 5 * 60 * 1000;   // don't re-ask within 5 min of unlocking

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
  el.lock.style.display = "flex";
  document.body.style.overflow = "hidden";
  buildPad();
  updateDots();
}
function hideLock() {
  el.lock.style.display = "none";
  document.body.style.overflow = "";
  save(KEY_UNLOCK_AT, Date.now());   // start the 5-minute grace window
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
function pinDel() { pinEntry = pinEntry.slice(0, -1); updateDots(); }
async function tryBio() {
  try { await bioUnlock(); buzz(20); hideLock(); }
  catch (e) { el.lockError.textContent = "Face ID failed — enter passcode"; }
}
function buildPad() {
  el.lockPad.textContent = "";
  ["1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach((k) => el.lockPad.appendChild(padKey(k, () => pinKey(k))));
  el.lockPad.appendChild(bioSet() ? padKey("Face ID", tryBio, true) : document.createElement("div"));
  el.lockPad.appendChild(padKey("0", () => pinKey("0")));
  el.lockPad.appendChild(padKey("⌫", pinDel, true));
}
function padKey(label, fn, isFn) {
  const b = document.createElement("button");
  b.className = "lock-key" + (isFn ? " fn" : "");
  b.textContent = label;
  b.addEventListener("click", fn);
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
  { ms: HR, label: "1 hour" }, { ms: 12 * HR, label: "12 hours" },
  { ms: DAY, label: "1 day" }, { ms: 3 * DAY, label: "3 days" },
  { ms: 7 * DAY, label: "1 week" }, { ms: 14 * DAY, label: "2 weeks" },
  { ms: 30 * DAY, label: "1 month" }, { ms: 90 * DAY, label: "3 months" },
  { ms: 180 * DAY, label: "6 months" }, { ms: YR, label: "1 year" },
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
}
function openSince() {
  renderSince();
  el.sinceOverlay.classList.add("show");
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

    s.appendChild(makeBtn("Save", "primary", () => {
      const nm = name.value.trim();
      if (!nm) { toast("Add a name"); return; }
      const st = start.value ? new Date(start.value) : new Date();
      if (isNaN(st.getTime())) { toast("Pick a valid date"); return; }
      if (existing) { existing.name = nm; existing.start = st.toISOString(); }
      else { since.push({ id: sid(), name: nm, start: st.toISOString(), best: 0, resets: 0 }); }
      save(KEY_SINCE, since); closeSheet(); renderSince();
    }));
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

// ---- wire up ----
el.add.addEventListener("click", addTap);
el.undo.addEventListener("click", undo);
el.end.addEventListener("click", openEndDay);
el.gear.addEventListener("click", openSettings);
el.ringWrap.addEventListener("click", openSettings);  // tap the ring to set/adjust the goal
el.overlay.addEventListener("click", (e) => { if (e.target === el.overlay) closeSheet(); });
el.statsBtn.addEventListener("click", openInsights);
el.insightsClose.addEventListener("click", closeInsights);
el.insightsOverlay.addEventListener("click", (e) => { if (e.target === el.insightsOverlay) closeInsights(); });
el.reminderDismiss.addEventListener("click", () => { save(KEY_REMIND_DISMISS, isoLocal(new Date())); el.reminder.style.display = "none"; });
el.sinceBtn.addEventListener("click", openSince);
el.sinceClose.addEventListener("click", closeSince);
el.sinceOverlay.addEventListener("click", (e) => { if (e.target === el.sinceOverlay) closeSince(); });
el.sinceAdd.addEventListener("click", () => openSinceForm(null));

render();

// Lock on launch and on return — but only if the 5-minute grace window
// since the last unlock has lapsed, so quick trips out don't re-prompt.
maybeLock();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  maybeLock();
  checkReminder();
});

// Daily reminder + keep the unlock window fresh during active use.
checkReminder();
setInterval(() => {
  checkReminder();
  if (lockSet() && el.lock.style.display !== "flex" && !document.hidden) save(KEY_UNLOCK_AT, Date.now());
}, 60000);

// ---- theme ---- follow the phone's light/dark setting for the status-bar tint
const themeMeta = document.querySelector('meta[name="theme-color"]');
function syncTheme() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (themeMeta) themeMeta.setAttribute("content", dark ? "#000000" : "#f2f2f7");
}
syncTheme();
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
