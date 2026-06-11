// Sends Web Push bill reminders. Run daily by .github/workflows/bill-reminders.yml.
//
// Required env:
//   JSONBIN_KEY       - JSONBin master key (repo secret)
//   JSONBIN_BIN_ID    - the bin holding the budget data (repo secret)
//   VAPID_PRIVATE_KEY - private half of the pair whose public half is in budget.html (repo secret)
// Optional env:
//   VAPID_SUBJECT     - contact mailto: for push services (defaults below)
//   TZ                - set in the workflow so "today" matches your timezone
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = 'BM7mJKLvnmdaHuhWDG8CNbA7uHWfRafXBVl66E7e_O1C6svwe2e_4K-42oWRhikeJpNo3Y48XXFZRhleOpwA4o0';

const { JSONBIN_KEY, JSONBIN_BIN_ID, VAPID_PRIVATE_KEY } = process.env;
if (!JSONBIN_KEY || !JSONBIN_BIN_ID || !VAPID_PRIVATE_KEY) {
  console.error('Missing required secrets: JSONBIN_KEY, JSONBIN_BIN_ID, VAPID_PRIVATE_KEY');
  process.exit(1);
}

const API = `${process.env.JSONBIN_API_BASE || 'https://api.jsonbin.io/v3/b'}/${JSONBIN_BIN_ID}`;
const headers = { 'X-Master-Key': JSONBIN_KEY, 'Content-Type': 'application/json' };

const resp = await fetch(`${API}/latest`, { headers });
if (!resp.ok) { console.error('JSONBin fetch failed: HTTP ' + resp.status); process.exit(1); }
const data = (await resp.json()).record;

const subs = Array.isArray(data.pushSubs) ? data.pushSubs : [];
if (!subs.length) { console.log('No devices subscribed — nothing to do.'); process.exit(0); }

// ── Find unpaid bills due within the window (mirrors budget.html) ──
function billActiveInMonth(bill, mk) {
  if (bill.history && mk in bill.history) return true;
  if (!bill.recurring) return false;
  if (bill.endMonth && mk > bill.endMonth) return false;
  return true;
}

const today = new Date(); today.setHours(0, 0, 0, 0);
const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
const windowDays = typeof data.notifyDays === 'number' ? data.notifyDays : 3;

const dueSoon = [], overdue = [];
for (const b of data.bills || []) {
  if (!billActiveInMonth(b, mk)) continue;
  if (b.history?.[mk]?.paid) continue;
  const due = new Date(today.getFullYear(), today.getMonth(), Math.min(b.dueDay, lastDay));
  const diff = Math.round((due - today) / 86400000);
  if (diff >= 0 && diff <= windowDays) dueSoon.push({ b, diff });
  else if (diff < 0) overdue.push({ b, diff });
}

if (!dueSoon.length && !overdue.length) { console.log('No bills due within ' + windowDays + ' days.'); process.exit(0); }

const fmt$ = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const when = d => d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
const lines = [
  ...overdue.map(({ b, diff }) => `${b.name} — ${fmt$(b.budgetedAmount)} OVERDUE (${-diff}d)`),
  ...dueSoon.sort((a, z) => a.diff - z.diff).map(({ b, diff }) => `${b.name} — ${fmt$(b.budgetedAmount)} due ${when(diff)}`)
];
const count = dueSoon.length + overdue.length;
const title = overdue.length
  ? `💰 ${overdue.length} bill${overdue.length > 1 ? 's' : ''} overdue`
  : `💰 ${count} bill${count > 1 ? 's' : ''} due soon`;
const payload = JSON.stringify({ title, body: lines.join('\n') });
console.log(`Sending to ${subs.length} device(s):\n${title}\n${lines.join('\n')}`);

// ── Send to every subscribed device ──
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:budget-app@users.noreply.github.com',
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const live = [];
let failed = 0;
for (const sub of subs) {
  try {
    await webpush.sendNotification(sub, payload);
    live.push(sub);
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      console.log('Pruning expired subscription:', sub.endpoint?.slice(0, 60) + '…');
    } else {
      console.error('Send failed (' + (e.statusCode || e.message) + '), keeping subscription.');
      live.push(sub); failed++;
    }
  }
}

// Write back only if expired subscriptions were pruned
if (live.length !== subs.length) {
  const fresh = await fetch(`${API}/latest`, { headers });
  if (fresh.ok) {
    const cur = (await fresh.json()).record;
    const liveEndpoints = new Set(live.map(s => s.endpoint));
    cur.pushSubs = (cur.pushSubs || []).filter(s => liveEndpoints.has(s.endpoint));
    const put = await fetch(API, { method: 'PUT', headers, body: JSON.stringify(cur) });
    console.log(put.ok ? 'Pruned expired subscriptions.' : 'Prune write-back failed: HTTP ' + put.status);
  }
}

console.log(`Done — ${live.length - failed}/${subs.length} delivered.`);
