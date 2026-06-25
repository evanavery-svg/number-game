// ---- Tap Counter ----
// Data lives entirely on this device (localStorage). No accounts, no servers.

const STEP = 0.50;            // amount added per tap
const KEY_TODAY = "count.today";   // number: current running total
const KEY_TAPS = "count.taps";     // number: tap count today (for Undo + meta)
const KEY_HISTORY = "count.history"; // array of finished days

const el = {
  total: document.getElementById("total"),
  meta: document.getElementById("meta"),
  add: document.getElementById("addBtn"),
  undo: document.getElementById("undoBtn"),
  end: document.getElementById("endBtn"),
  history: document.getElementById("history"),
  histEmpty: document.getElementById("histEmpty"),
  export: document.getElementById("exportBtn"),
  toast: document.getElementById("toast"),
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
let history = load(KEY_HISTORY, []); // [{ date, label, total, taps, endedAt }]

// ---- rendering ----
function fmt(n) {
  return Number(n).toFixed(2);
}

function render() {
  el.total.textContent = fmt(today);
  el.meta.textContent = taps === 0
    ? "No taps yet"
    : `${taps} tap${taps === 1 ? "" : "s"} · +${fmt(STEP)} each`;
  el.undo.disabled = taps === 0;

  // history list
  el.history.querySelectorAll(".hist-row").forEach((n) => n.remove());
  if (history.length === 0) {
    el.histEmpty.style.display = "block";
  } else {
    el.histEmpty.style.display = "none";
    // newest first
    history.slice().reverse().forEach((day) => {
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
      el.history.appendChild(row);
    });
  }
}

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1800);
}

function buzz(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---- actions ----
function addTap() {
  today = Math.round((today + STEP) * 100) / 100;
  taps += 1;
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  buzz(15);
  render();
}

function undo() {
  if (taps === 0) return;
  today = Math.round((today - STEP) * 100) / 100;
  if (today < 0) today = 0;
  taps -= 1;
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  render();
}

function endDay() {
  if (taps === 0 && today === 0) {
    toast("Nothing to log yet");
    return;
  }
  const ok = confirm(`Log ${fmt(today)} and start a new day?`);
  if (!ok) return;

  const now = new Date();
  history.push({
    date: now.toISOString().slice(0, 10),
    label: now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    total: today,
    taps: taps,
    endedAt: now.toISOString(),
  });
  save(KEY_HISTORY, history);

  today = 0;
  taps = 0;
  save(KEY_TODAY, today);
  save(KEY_TAPS, taps);
  buzz([10, 40, 10]);
  toast("Day logged ✓");
  render();
}

function exportCsv() {
  const rows = [["date", "ended_at", "total", "taps"]];
  history.forEach((d) => rows.push([d.date, d.endedAt, fmt(d.total), d.taps]));
  // include the in-progress day too, marked
  if (taps > 0 || today > 0) {
    rows.push(["(today, in progress)", "", fmt(today), taps]);
  }
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

// ---- wire up ----
el.add.addEventListener("click", addTap);
el.undo.addEventListener("click", undo);
el.end.addEventListener("click", endDay);
el.export.addEventListener("click", exportCsv);

render();

// ---- PWA: register the service worker so the app works offline ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
