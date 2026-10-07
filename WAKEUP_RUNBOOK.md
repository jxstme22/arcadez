# When you wake up — operator checklist

1. Read `ops/MORNING_REPORT.md`. If absent, the unattended coding agent did not produce its required handoff; use the starter safely. Check `.planning/STATE.md` and `ops/BLOCKERS.md`.
2. Use Node 24 LTS preferred or >=22.13; `node --version` and `npm test`. No `npm install` necessary for the current zero-dependency starter.
3. Copy `.env.example` to `.env`; paste your **OpenAI**, **TypeSafe**, and **Fastino** decision API keys. You may keep one arm disabled by leaving its key empty; it will record `DISABLED_MISSING_KEY`. Do **not** paste wallet keys; never share API keys with ChatGPT.
4. Configure spending limits in each provider account, then run `npm run doctor` and confirm 3 model keys present. This command shows only booleans.
5. Run `npm run discover`: confirm `/play` GET round route belongs to the freshly retrieved live OpenAPI spec. If failed, read the precise error and `docs/01_SOURCE_DISCOVERY.md`; **do not override route gate**.
6. If schema is inaccessible, use `npm run capture -- 30` to collect raw public Jupiter frames without spending on models; share no secrets or wallet access. You may also harvest a modest historical interval with the bounded `npm run harvest -- --from ISO --to ISO --step 60 --limit 240` utility; these prices are never live features.
7. Confirm agent captured a real WebSocket fixture with correct BTC timestamp fields, and that normalization tests passed. If not, running paper will record raw frames but skip all rounds; this is safe, not success.
8. Run `caffeinate -i npm run start:paper` (macOS) and keep terminal active. This starts the paper process and local dashboard together. Open browser `http://127.0.0.1:8789`. Alternatively use separate `npm run paper` and `npm run dashboard` terminals.
9. After several rounds, inspect model request counters and `npm run report`. `pnl_usdc` is intentionally unknown unless precise odds/fees were verified. Look at `SKIP` reasons, `LATE`, uptime, matched rounds and Brier only on settled outcomes.

Troubleshooting: `BLOCKED_UNVERIFIED_ROUNDS_ROUTE` means `/play` candidate not in live schema; no money or model requests sent. `SKIP_NO_LIVE_DATA` means WS quotes absent, stale or unparsed. `DISABLED_MISSING_KEY` means no provider key. `MODEL_HTTP_401` invalid/ineligible key; `MODEL_HTTP_422` invalid payload. Any source change must be fixed with new raw fixture and regression test. Offline `npm run demo` is isolated fixture only and is **not** a trading test.
