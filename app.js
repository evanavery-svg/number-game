// ---- Tap Counter ----
// Data lives entirely on this device (localStorage). No accounts, no servers.

const KEY_TODAY = "count.today";     // number: current running total
const KEY_TAPS = "count.taps";       // number: tap count today (for Undo + meta)
const KEY_HISTORY = "count.history"; // array of finished days
const KEY_STEP = "count.step";       // number: amount added per tap
const KEY_GOAL = "count.goal";       // number: daily target (0 = none)
const KEY_LASTENDED = "count.lastEnded"; // snapshot for "undo End Day"

const CHART_DAYS = 14;

const el = {
  total: document.getElementById("total"),
  meta: document.getElementById("meta"),
  stats: document.getElementById("stats"),
  goal: document.getElementById("goal"),
  goalFill: document.getElementById("goalFill"),
  goalLabel: document.getElementById("goalLabel"),
  add: document.getElementById("addBtn"),
  undo: document.getElementById("undoBtn"),
  end: document.getElementById("endBtn"),
  gear: document.getElementById("gearBtn"),
  chartCard: document.getElementById("chartCard"),
  chartTitle: document.getElementById("chartTitle"),
  chart: document.getElementById("chart"),
  chartFrom: document.getElementById("chartFrom"),
  history: document.getElementById("history"),
  histEmpty: document.getElementById("histEmpty"),
  export: document.getElementById("exportBtn"),
  import: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  toast: document.getElementById("toast"),
  overlay: document.getElementById("overlay"),
  sheet: document.getElementById("sheet"),
};

// ---- state helpers ----
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let today = load(KEY_TODAY, 0);
let taps = load(KEY_TAPS, 0);
let history = load(KEY_HISTORY, []);    // [{ date, label, total, taps, endedAt }]
let step = load(KEY_STEP, 0.5);
let goal = load(KEY_GOAL, 0);
let lastEnded = load(KEY_LASTENDED, null);

// ---- formatting ----
function round2(n) { return Math.round(n * 100) / 100; }
function fmt(n) { return Number(n).toFixed(2); }
function shortLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---- rendering ----
function render() {
  // total + goal-reached color
  const reached = goal > 0 && today >= goal;
  el.total.textContent = fmt(today);
  el.total.classList.toggle("reached", reached);

  // meta (taps + step)
  el.meta.textContent = taps === 0
    ? "No taps yet"
    : `${taps} tap${taps === 1 ? "" : "s"} · +${fmt(step)} each`;

  // stats line (recent average + best)
  if (history.length === 0) {
    el.stats.textContent = "";
  } else {
    const recent = history.slice(-7);
    const avg = recent.reduce((s, d) => s + d.total, 0) / recent.length;
    const best = Math.max(...history.map((d) => d.total));
    el.stats.textContent = `avg ${fmt(avg)} · best ${fmt(best)}`;
  }

  // goal progress
  if (goal > 0) {
    el.goal.style.display = "block";
    const pct = Math.min(100, (today / goal) * 100);
    el.goalFill.style.width = pct + "%";
    el.goalFill.classList.toggle("reached", reached);
    el.goalLabel.textContent = reached
      ? `Goal ${fmt(goal)} reached ✓`
      : `${fmt(today)} / ${fmt(goal)} · ${Math.round(pct)}%`;
  } else {
    el.goal.style.display = "none";
  }

  // add button label
  el.add.firstChild.textContent = `+ ${fmt(step)}`;
  el.undo.disabled = taps === 0;

  renderChart();
  renderHistory();
}

function renderChart() {
  // Build a series of the last CHART_DAYS finished days, plus today as the last bar.
  const series = history.slice(-CHART_DAYS).map((d) => ({ value: d.total, today: false, label: d.label }));
  series.push({ value: today, today: true, label: "today" });

  const hasAny = series.some((s) => s.value > 0) || history.length > 0;
  if (!hasAny) {
    el.chartCard.style.display = "none";
    return;
  }
  el.chartCard.style.display = "block";
  el.chartTitle.textContent = `Last ${Math.min(CHART_DAYS, history.length) + 1} days`;

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
  if (history.length === 0) {
    el.histEmpty.style.display = "block";
    return;
  }
  el.histEmpty.style.display = "none";
  // newest first; remember original index for editing
  history.slice().reverse().forEach((day, i) => {
    const idx = history.length - 1 - i;
    const row = document.createElement("div");
    row.className = "hist-row";
    const d = document.createElement("span");
    d.className = "date";
    d.textContent = day.label;
    const a = document.createElement("span");
    a.className = "amt";
    a.textContent = fmt(day.total);
    row.appendChild(d);
    row.appendChild(a);
    row.addEventListener("click", () => openHistorySheet(idx));
    el.history.appendChild(row);
  });
}

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1800);
}
function buzz(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

// ---- core actions ----
function addTap() {
  today = round2(today + step);
  taps += 1;
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  buzz(15);
  render();
}

function undo() {
  if (taps === 0) return;
  today = round2(today - step);
  if (today < 0) today = 0;
  taps -= 1;
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  render();
}

function endDay() {
  if (taps === 0 && today === 0) { toast("Nothing to log yet"); return; }
  if (!confirm(`Log ${fmt(today)} and start a new day?`)) return;

  const now = new Date();
  const entry = {
    date: now.toISOString().slice(0, 10),
    label: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    total: today,
    taps: taps,
    endedAt: now.toISOString(),
  };
  history.push(entry);
  save(KEY_HISTORY, history);

  lastEnded = entry;            // remember for undo
  save(KEY_LASTENDED, lastEnded);

  today = 0;
  taps = 0;
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  buzz([10, 40, 10]);
  toast("Day logged ✓ — tap ⚙ to undo");
  render();
}

// Feature 9: undo the most recent End Day (merges it back into today).
function undoEndDay() {
  if (!lastEnded) { toast("Nothing to restore"); return; }
  // remove the matching entry from history (last one with same endedAt)
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].endedAt === lastEnded.endedAt) { history.splice(i, 1); break; }
  }
  today = round2(today + lastEnded.total);
  taps = taps + (lastEnded.taps || 0);
  lastEnded = null;
  save(KEY_HISTORY, history);
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  save(KEY_LASTENDED, lastEnded);
  toast("End Day undone");
  render();
}

// ---- bottom sheet ----
function openSheet(builder) {
  el.sheet.textContent = "";
  builder(el.sheet);
  el.overlay.classList.add("show");
}
function closeSheet() { el.overlay.classList.remove("show"); }

function makeBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = "sheet-btn " + (cls || "");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// Feature 1 + 7: settings (step + goal) and undo-End-Day live here.
function openSettings() {
  openSheet((s) => {
    const h = document.createElement("h3");
    h.textContent = "Settings";
    s.appendChild(h);

    const stepLabel = document.createElement("label");
    stepLabel.textContent = "Amount added per tap";
    const stepInput = document.createElement("input");
    stepInput.type = "number"; stepInput.step = "0.01"; stepInput.min = "0.01";
    stepInput.value = fmt(step);
    s.appendChild(stepLabel); s.appendChild(stepInput);

    const goalLabel = document.createElement("label");
    goalLabel.textContent = "Daily goal (blank or 0 for none)";
    const goalInput = document.createElement("input");
    goalInput.type = "number"; goalInput.step = "0.01"; goalInput.min = "0";
    goalInput.value = goal > 0 ? fmt(goal) : "";
    s.appendChild(goalLabel); s.appendChild(goalInput);

    s.appendChild(makeBtn("Save", "primary", () => {
      const ns = parseFloat(stepInput.value);
      if (isNaN(ns) || ns <= 0) { toast("Step must be greater than 0"); return; }
      step = round2(ns);
      const ng = parseFloat(goalInput.value);
      goal = isNaN(ng) || ng <= 0 ? 0 : round2(ng);
      save(KEY_STEP, step);
      save(KEY_GOAL, goal);
      closeSheet();
      render();
    }));

    if (lastEnded) {
      s.appendChild(makeBtn(`↶ Undo last End Day (${fmt(lastEnded.total)})`, "", () => {
        closeSheet(); undoEndDay();
      }));
    }
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}

// Feature 5: tap a history day to edit or delete it.
function openHistorySheet(idx) {
  const day = history[idx];
  if (!day) return;
  openSheet((s) => {
    const h = document.createElement("h3");
    h.textContent = day.label;
    s.appendChild(h);

    const label = document.createElement("label");
    label.textContent = "Total for this day";
    const input = document.createElement("input");
    input.type = "number"; input.step = "0.01"; input.min = "0";
    input.value = fmt(day.total);
    s.appendChild(label); s.appendChild(input);

    s.appendChild(makeBtn("Save", "primary", () => {
      const v = parseFloat(input.value);
      if (isNaN(v) || v < 0) { toast("Enter a number ≥ 0"); return; }
      history[idx].total = round2(v);
      save(KEY_HISTORY, history);
      closeSheet(); render();
    }));
    s.appendChild(makeBtn("Delete this day", "danger", () => {
      if (!confirm(`Delete ${day.label} (${fmt(day.total)})?`)) return;
      history.splice(idx, 1);
      save(KEY_HISTORY, history);
      closeSheet(); render();
    }));
    s.appendChild(makeBtn("Cancel", "ghost", closeSheet));
  });
}

// ---- CSV export / import ----
function exportCsv() {
  const rows = [["date", "ended_at", "total", "taps"]];
  history.forEach((d) => rows.push([d.date, d.endedAt, fmt(d.total), d.taps]));
  if (taps > 0 || today > 0) rows.push(["(today, in progress)", "", fmt(today), taps]);
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Backup downloaded");
}

// Feature 6 partner: restore history from a previously exported CSV.
function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lines = String(reader.result).split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) { toast("CSV looks empty"); return; }
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const date = cols[0];
        if (!date || date.startsWith("(today")) continue; // skip in-progress row
        const endedAt = cols[1] || (date + "T00:00:00.000Z");
        const total = round2(parseFloat(cols[2]));
        const tcount = parseInt(cols[3], 10) || 0;
        if (isNaN(total)) continue;
        parsed.push({
          date,
          label: new Date(endedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          total,
          taps: tcount,
          endedAt,
        });
      }
      if (parsed.length === 0) { toast("No valid rows found"); return; }
      if (!confirm(`Replace current history (${history.length} days) with ${parsed.length} day${parsed.length === 1 ? "" : "s"} from the file?`)) return;
      history = parsed;
      save(KEY_HISTORY, history);
      render();
      toast(`Imported ${parsed.length} days`);
    } catch (e) {
      toast("Could not read that file");
    }
  };
  reader.readAsText(file);
}

// ---- wire up ----
el.add.addEventListener("click", addTap);
el.undo.addEventListener("click", undo);
el.end.addEventListener("click", endDay);
el.gear.addEventListener("click", openSettings);
el.export.addEventListener("click", exportCsv);
el.import.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) importCsv(e.target.files[0]);
  e.target.value = "";
});
el.overlay.addEventListener("click", (e) => { if (e.target === el.overlay) closeSheet(); });

render();

// ---- PWA: register the service worker so the app works offline ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
