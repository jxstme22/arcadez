// Telegram paper reporter: per-arm win rates from the live A/B DB.
// Credentials ONLY from env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Never logged.
import {Store} from '../src/store.mjs';
import {loadEnv, config} from '../src/config.mjs';
loadEnv();
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chat = process.env.TELEGRAM_CHAT_ID || '';
if (!token || !chat) { console.error('TELEGRAM_CREDENTIALS_MISSING'); process.exit(2); }
const cfg = {...config(), dataDir: process.env.LIVE_DIR || './var/p12ab-live'};
const s = new Store(cfg.dataDir);
const ids = s.db.prepare(`SELECT DISTINCT d.round_id FROM decisions d JOIN rounds r ON r.id=d.round_id WHERE r.result IN ('UP','DOWN')`).all().map(r => r.round_id);
if (!ids.length) { s.close(); console.log('TELEGRAM_SKIP_EMPTY (no settled rounds; A/B not started)'); process.exit(0); }
const nUp = ids.length ? s.db.prepare(`SELECT COUNT(*) n FROM rounds WHERE id IN (${ids.map(()=>'?').join(',')}) AND result='UP'`).get(...ids).n : 0;
const rows = ids.length ? s.db.prepare(`SELECT d.arm, d.action, p.correct FROM decisions d LEFT JOIN paper p ON p.round_id=d.round_id AND p.arm=d.arm WHERE d.round_id IN (${ids.map(()=>'?').join(',')})`).all(...ids) : [];
const by = {};
for (const r of rows) {
  (by[r.arm] = by[r.arm] || {a: 0, w: 0, l: 0});
  if (r.action !== 'SKIP') { by[r.arm].a++; if (r.correct === 1) by[r.arm].w++; if (r.correct === 0) by[r.arm].l++; }
}
s.close();
const tag = process.env.REPORT_TAG || 'models';
let msg = `*ArcadeZ paper [${tag}]* — ${ids.length} settled (${nUp} UP/${ids.length - nUp} DOWN)\n\`\`\`\n`;
msg += `arm        acted  W-L    win%\n`;
for (const a of Object.keys(by).sort()) {
  const v = by[a];
  const pct = v.a ? (v.w / v.a * 100).toFixed(1) + '%' : '  --';
  msg += `${a.padEnd(10)} ${String(v.a).padStart(3)}   ${v.w}W/${v.l}L  ${pct}\n`;
}
msg += '```\nPnL: NULL (unverified payout) · n small, no edge claims';
const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({chat_id: chat, text: msg, parse_mode: 'Markdown'}),
});
const j = await res.json();
if (!j.ok) { console.error('TELEGRAM_SEND_FAILED'); process.exit(1); }
console.log(`TELEGRAM_SENT message_id=${j.result.message_id} rounds=${ids.length}`);
