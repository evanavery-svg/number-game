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
  save(KEY_TODAY, today); save(KEY_TAPS, taps);
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
  save(KEY_TODAY, today); save(KEY_TAPS, taps);
  renderTop(true); renderChart();
}

// New: End Day opens a sheet with an optional note.
function openEndDay() {
  if (taps === 0 && today === 0) { toast("Nothing to log yet"); return; }
  openSheet((s) => {
    addEl(s, "h3", "End Day");
    addEl(s, "p", `Log ${fmt(today)} and start a fresh day.`, "sub");
    const label = addEl(s, "label", "Note for this day (optional)");
    const ta = document.createElement("textarea");
    ta.rows = 3; ta.placeholder = "e.g. how it went, anything notable…";
    s.appendChild(ta);
    s.appendChild(makeBtn("Log day ✓", "primary", () => {
      commitDay(ta.value.replace(/\s*\n\s*/g, " ").trim());
      closeSheet();
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
    setTimeout(() => ta.focus(), 50);
  });
}
function commitDay(note) {
  const now = new Date();
  const total = today;
  const underGoal = goal > 0 && total <= goal;
  const entry = {
    date: now.toISOString().slice(0, 10),
    label: dayLabel(now),
    total: total, taps: taps, endedAt: now.toISOString(),
    note: note || "",
  };
  history.push(entry);
  lastEnded = entry;
  today = 0; taps = 0;
  save(KEY_HISTORY, history); save(KEY_LASTENDED, lastEnded);
  save(KEY_TODAY, today); save(KEY_TAPS, taps);

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

  // animate the freshly logged day sliding into the list
  const firstRow = el.history.querySelector(".hist-row");
  if (firstRow) firstRow.classList.add("enter");
}

// Feature 9: undo the most recent End Day (merges it back into today).
function undoEndDay() {
  if (!lastEnded) { toast("Nothing to restore"); return; }
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].endedAt === lastEnded.endedAt) { history.splice(i, 1); break; }
  }
  today = round2(today + lastEnded.total);
  taps = taps + (lastEnded.taps || 0);
  lastEnded = null;
  save(KEY_HISTORY, history); save(KEY_TODAY, today);
  save(KEY_TAPS, taps); save(KEY_LASTENDED, lastEnded);
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

    s.appendChild(makeBtn("Save", "primary", () => {
      const ns = parseFloat(stepInput.value);
      if (isNaN(ns) || ns <= 0) { toast("Step must be greater than 0"); return; }
      step = round2(ns);
      const ng = parseFloat(goalInput.value);
      goal = isNaN(ng) || ng <= 0 ? 0 : round2(ng);
      haptic = hapticToggle.checked;
      sound = soundToggle.checked;
      save(KEY_STEP, step); save(KEY_GOAL, goal);
      save(KEY_HAPTIC, haptic); save(KEY_SOUND, sound);
      closeSheet(); render();
    }));

    if (lastEnded) {
      s.appendChild(makeBtn(`↶ Undo last End Day (${fmt(lastEnded.total)})`, "", () => { closeSheet(); undoEndDay(); }));
    }

    const divider = document.createElement("hr");
    divider.className = "sheet-divider";
    s.appendChild(divider);
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

render();

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
