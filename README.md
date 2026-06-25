# Grams Tracker

A tiny installable web app (PWA) to count grams in 0.50 g steps, remember past days,
and reset only when *you* say the day is over.

## Features
- **Big tap button** — each tap adds 0.50 g (0.50 → 1.00 → 1.50…).
- **Undo** — removes the last tap.
- **End Day** — logs today's total to history and resets to 0 (with a confirm prompt).
  Does **not** reset at midnight.
- **History** — past days are remembered on the device.
- **Export backup (CSV)** — one tap saves a backup file.
- **Installable** — "Add to Home Screen" on your phone; works offline.

## Data
Everything is stored locally in the browser (`localStorage`). No accounts, no servers.
Use **Export backup** periodically so you have a copy.

## Run locally
Open a terminal in this folder and run:

```
python3 -m http.server 8099
```

Then visit http://localhost:8099 in a browser.

## Hosting (GitHub Pages)
This is a static site. Enable GitHub Pages on the repo (Settings → Pages →
Deploy from a branch) and it will be served at a public URL you can open on your phone.
