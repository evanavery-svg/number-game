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
  chartCard: document.getElementById("chartCard"),
  chartTitle: document.getElementById("chartTitle"),
  chartStats: document.getElementById("chartStats"),
  chart: document.getElementById("chart"),
  chartFrom: document.getElementById("chartFrom"),
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

// Feature 1: consecutive days (ending now) that met the goal.
function goalStreak() {
  if (goal <= 0) return 0;
  let s = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].total >= goal) s++; else break;
  }
  if (today >= goal) s++;            // today counts if already reached
  return s;
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
function render() {
  el.date.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  el.quote.textContent = quoteOfTheDay();

  const reached = goal > 0 && today >= goal;
  el.total.textContent = fmt(today);
  el.total.classList.toggle("reached", reached);

  // merged meta line (streak + taps)
  const parts = [];
  const streak = goalStreak();
  if (streak > 0) parts.push(`🔥 ${streak}-day streak`);
  parts.push(taps === 0 ? "No taps yet" : `${taps} tap${taps === 1 ? "" : "s"}`);
  el.meta.textContent = parts.join("  ·  ");

  // goal progress ring + caption
  if (goal > 0) {
    el.totalWrap.classList.add("has-goal");
    const frac = Math.min(1, today / goal);
    el.ringProg.style.strokeDasharray = RING_C;
    el.ringProg.style.strokeDashoffset = RING_C * (1 - frac);
    el.goalText.classList.toggle("reached", reached);
    el.goalText.textContent = reached
      ? `Goal ${fmt(goal)} reached ✓`
      : `${Math.round(frac * 100)}% of ${fmt(goal)}`;
  } else {
    el.totalWrap.classList.remove("has-goal");
    el.goalText.textContent = "";
    el.goalText.classList.remove("reached");
  }

  el.add.firstChild.textContent = `+ ${fmt(step)}`;
  el.undo.disabled = taps === 0;

  renderChart();
  renderHistory();
}

function renderChart() {
  const series = history.slice(-CHART_DAYS).map((d) => ({ value: d.total, today: false, label: d.label }));
  series.push({ value: today, today: true, label: "today" });

  if (history.length === 0 && today === 0) { el.chartCard.style.display = "none"; return; }
  el.chartCard.style.display = "block";
  el.chartTitle.textContent = `Last ${Math.min(CHART_DAYS, history.length) + 1} days`;

  // stats strip (avg of last 7 · best · this week)
  if (history.length > 0) {
    const recent = history.slice(-7);
    const avg = recent.reduce((s, d) => s + d.total, 0) / recent.length;
    const best = Math.max(...history.map((d) => d.total));
    el.chartStats.innerHTML =
      `avg <b>${fmt(avg)}</b>` +
      `<span>best <b>${fmt(best)}</b></span>` +
      `<span>this week <b>${fmt(weekTotal())}</b></span>`;
  } else {
    el.chartStats.innerHTML = `this week <b>${fmt(weekTotal())}</b>`;
  }

  const max = Math.max(1, ...series.map((s) => s.value));
  el.chart.textContent = "";
  series.forEach((s) => {
    const bar = document.createElement("div");
    bar.className = "bar" + (s.today ? " today" : "");
    bar.style.height = Math.max(2, (s.value / max) * 100) + "%";
    bar.title = `${s.label}: ${fmt(s.value)}`;
    el.chart.appendChild(bar);
  });
  el.chartFrom.textContent = series.length > 1 ? series[0].label : "";
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
function addTap() {
  const wasReached = goal > 0 && today >= goal;
  today = round2(today + step);
  taps += 1;
  save(KEY_TODAY, today); save(KEY_TAPS, taps);
  buzz(15); click();
  el.total.classList.remove("bump"); void el.total.offsetWidth; el.total.classList.add("bump");
  if (goal > 0 && !wasReached && today >= goal) celebrate();
  render();
}

// Feature 1: a small moment the instant you cross your goal.
function celebrate() {
  buzz([0, 50, 60, 50]);
  el.ringWrap.classList.remove("celebrate"); void el.ringWrap.offsetWidth; el.ringWrap.classList.add("celebrate");
  toast("Goal reached 🔥");
}
function undo() {
  if (taps === 0) return;
  today = round2(today - step);
  if (today < 0) today = 0;
  taps -= 1;
  save(KEY_TODAY, today); save(KEY_TAPS, taps);
  render();
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
  const entry = {
    date: now.toISOString().slice(0, 10),
    label: dayLabel(now),
    total: today, taps: taps, endedAt: now.toISOString(),
    note: note || "",
  };
  history.push(entry);
  lastEnded = entry;
  today = 0; taps = 0;
  save(KEY_HISTORY, history); save(KEY_LASTENDED, lastEnded);
  save(KEY_TODAY, today); save(KEY_TAPS, taps);
  buzz([10, 40, 10]);
  toast("Day logged ✓ — undo from ⚙");
  render();
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
el.overlay.addEventListener("click", (e) => { if (e.target === el.overlay) closeSheet(); });

render();

// ---- PWA ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
