# Push server

A tiny Cloudflare Worker that lets the app notify you with the app closed
(the evening check-in and bedtime). iPhone only wakes a home-screen web app
for a real push, and a real push has to come from a server.

**What it stores:** your phone's push address, your time zone, and the times
you picked. Nothing you log. The words in each notification are worked out on
your phone from its own data when the push arrives.

## Set up from the Cloudflare dashboard (works from a phone)

1. Make a free account at dash.cloudflare.com.
2. **Storage & Databases › KV › Create a namespace**, named `tracker-push`.
3. **Workers & Pages › Create › Start with Hello World**, name it
   `tracker-push`, deploy.
4. **Edit code**: replace everything with the contents of `worker.mjs`
   (the app's Settings › Reminders › Push notifications has a Copy button),
   then **Deploy**.
5. The worker's **Settings › Bindings › Add › KV namespace**: variable name
   `SUBS`, namespace `tracker-push`.
6. **Settings › Trigger events › Add › Cron trigger**: `*/5 * * * *`.
7. Copy the worker's address (`…workers.dev`) into the app and tap
   **Turn on push**.

Optional: a variable `VAPID_SUBJECT` set to `mailto:you@example.com`, the
contact Apple and Google see for this sender.

## Or with wrangler

Put your KV namespace id in `wrangler.toml`, then `npx wrangler deploy` here.

## Tests

`node --test push/worker.test.mjs` checks the encryption and signatures by
playing the phone's side, plus the schedule.
