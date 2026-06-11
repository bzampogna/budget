# budget
Budget PWA

## Bill reminder push notifications

A GitHub Action (`.github/workflows/bill-reminders.yml`) runs every morning,
reads the budget data from JSONBin, and sends a Web Push notification to every
subscribed device listing unpaid bills that are overdue or due within the
chosen reminder window.

### One-time setup

1. In the repo go to **Settings → Secrets and variables → Actions → New
   repository secret** and add these three secrets:
   - `JSONBIN_KEY` — your JSONBin master key (same one entered in the app's
     Cloud Sync screen)
   - `JSONBIN_BIN_ID` — your bin ID (shown in the app's Cloud Sync screen)
   - `VAPID_PRIVATE_KEY` — the private half of the push key pair (the public
     half is hardcoded in `budget.html` and `scripts/send-reminders.mjs`)
2. On each phone: open the app from the Home Screen → ⚙ Settings →
   **🔔 Bill Reminders** → Turn On Notifications. (iOS 16.4+ required, and the
   app must be installed via Add to Home Screen.)
3. Optional: test it from the **Actions** tab → "Bill reminders" →
   **Run workflow**. Nothing is sent unless a bill is actually due within the
   window.

The reminder window (1–7 days before the due date) is set in the app under
Bill Reminders and is shared by all devices. The send time is set by the cron
line in the workflow (UTC).

### Regenerating push keys

Generate a new P-256 VAPID pair, then update all three places together:
`VAPID_PUBLIC_KEY` in `budget.html`, the same constant in
`scripts/send-reminders.mjs`, and the `VAPID_PRIVATE_KEY` repo secret.
Devices must then re-enable notifications.
