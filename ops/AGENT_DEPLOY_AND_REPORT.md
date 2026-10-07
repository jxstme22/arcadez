# AGENT RUNBOOK — Deploy ArcadeZ on Your Own VM + Report Paper Results

> You are an autonomous coding agent. Your operator gave you this repo and a fresh VM.
> Goal 1: deploy the paper-only system on the VM. Goal 2: later, report paper/shadow
> trade **win rate, PnL, and settled rounds**. No real trading. No wallet. No paid
> model calls unless the operator explicitly approves spend in chat.

---

## 0. Ground rules (never violate)

```text
- PAPER ONLY. No wallet, seed, signer, transaction, bet, claim, or fund movement code.
- Never invent round results, fills, or PnL. NULL means unknown, not zero.
- Never backfill paper decisions after settlement. Missed rounds are INVALID, not losses.
- Never expose API keys, SSH keys, or .env contents in any report, log, or commit.
- Never commit .env, var/, *.db, or logs to git.
```

---

## 1. What you are deploying

```text
Repo:            https://github.com/jxstme22/arcadez (branch: main)
System:          Jupiter-only BTC Arcade 60-second paper benchmark (Pattern Nodes V1)
Mode:            paper / shadow only — reads Jupiter public APIs, writes local SQLite
Needs:           Node >= 22.13, Ubuntu 22.04+/Debian 12+ (or macOS for local test),
                 1 CPU / 2 GB RAM / 10 GB disk minimum, outbound HTTPS + WSS
Needs from op:   VM IP, SSH user, EITHER an SSH private key injected by the operator
                 OR a one-time password the operator pastes in chat (never store it
                 anywhere except the live SSH agent session; never write it to disk)
```

---

## 2. Local sanity first (on your own machine)

```bash
cd /path/to/arcadez
node --version            # >= 22.13
npm test                  # expect all passing (currently 127/127)
npm run doctor            # key presence booleans only, never values
```

If tests fail: STOP, report `DEPLOYMENT_BLOCKED__TESTS_RED` with output. Do not deploy.

---

## 3. Build the deploy bundle (secret-scanned)

```bash
bash ops/vps/bundle.sh    # excludes .env, keys, var/, AppleDouble; aborts if .env present
ls -lh /tmp/arcade-deploy.tgz
```

If the script reports `FATAL`: STOP and report. Never ship `.env`.

---

## 4. Prepare the VM

```bash
# 4a. Confirm OS/clock (all read-only):
ssh <user>@<vm-ip> 'cat /etc/os-release | head -2; node --version; timedatectl | grep -E "Time zone|synchronized"'
# 4b. Create layout:
ssh <user>@<vm-ip> 'sudo mkdir -p /data/arcade/{live,live-nodes,history,pattern/{nodes,library,checkpoints,reports},backups,logs,runtime,app} && sudo chown -R $USER /data/arcade'
# 4c. Copy bundle + extract:
scp /tmp/arcade-deploy.tgz <user>@<vm-ip>:/tmp/
ssh <user>@<vm-ip> 'mkdir -p ~/arcade-deploy && tar -xzf /tmp/arcade-deploy.tgz -C ~/arcade-deploy && cp -r ~/arcade-deploy/* /data/arcade/app/ && rm /tmp/arcade-deploy.tgz'
# 4d. Write production env (SAFETY FLAGS ONLY — no keys unless operator pasted provider
#     keys explicitly for a paid phase; paper arms need none):
ssh <user>@<vm-ip> 'cat > /data/arcade/app/.env <<EOF
REAL_TRADING=0
PAID_MODEL_CALLS=0
PRIMARY_HORIZON_SECONDS=7
PAPER_VERSION=PATTERN_NODES_PAPER_V1
DATA_DIR=/data/arcade/live
EOF
chmod 600 /data/arcade/app/.env'
```

---

## 5. Install services (systemd path; use Docker Compose only if the VM already has it)

```bash
ssh <user>@<vm-ip> 'bash /data/arcade/app/ops/vps/install.sh'
ssh <user>@<vm-ip> 'systemctl is-active arcade-live arcade-pattern arcade-history arcade-dashboard'
# expect: active x4. If any is not active: journalctl -u <name> --no-pager | tail -20,
# fix environment issues only (never strategy code), retry once, else report BLOCKED.
```

---

## 6. Verify live data (read-only Jupiter smoke, ~2 min)

```bash
ssh <user>@<vm-ip> 'cd /data/arcade/app && node scripts/jupiter-smoke.mjs'
# expect 6x PASS lines: REST_config, rounds_BTC_present, pools_integer_strings,
# price_echo, WS_btcusdt_frames, trades_stream. Any FAIL: report, do not proceed to paper.
```

---

## 7. Import GRID seed (one-time; stop pattern service to avoid lock contention)

```bash
# 7a. Copy a VACUUM snapshot of the local nodes DB (never a live-written file):
node --input-type=module -e "import{DatabaseSync}from'node:sqlite';const s=new DatabaseSync('var/pattern-nodes/nodes.db');s.exec(\"VACUUM INTO '/tmp/grid-seed.db'\");s.close();"
scp /tmp/grid-seed.db <user>@<vm-ip>:/tmp/grid-seed.db && rm /tmp/grid-seed.db
# 7b. On VM: stop pattern service, INSERT OR IGNORE obs + pattern rows, verify exact
#     counts (expect 2066 VENUE_RECORDED obs + 2 pattern defs), restart service.
```

---

## 8. Overlap validation (≥30 min, before calling anything canonical)

Compare the new VM collector against any existing collector (or the repo's local demo):
same settled round IDs, same UP/DOWN outcomes, same-order tick cadence. Any systematic
divergence: report BLOCKED, do not promote. Record the comparison table in your report.

---

## 9. Start canonical paper + declare smoke window

```text
- Record benchmark start UTC + policy/library/feature hashes.
- Rounds predicted during deployment verification are DEPLOYMENT_SMOKE (excluded).
- Canonical counting starts with the first round AFTER you close the smoke window.
- A round missed for any operational reason is INVALID (never backfilled, never scored).
```

---

## 10. Keep running + watch

```bash
# health (exit 0 = all green):
ssh <user>@<vm-ip> 'cd /data/arcade/app && node ops/vps/watchdog.mjs'
# paper status anytime:
ssh <user>@<vm-ip> 'cd /data/arcade/app && NODES_DIR=/data/arcade/pattern/nodes node scripts/pattern-status.mjs'
# backups (verify at least once):
ssh <user>@<vm-ip> 'bash /data/arcade/app/ops/vps/backup.sh'
```

---

## 11. REPORT BACK TO THE OPERATOR (the actual deliverable)

When the operator asks for results — or at each 100-valid-round milestone — query the
VPS nodes DB and report EXACTLY this (fill every field; use `null`/counts, never guesses):

```text
ROUNDS_PREDICTED=<n>        # distinct round_ids in pattern_predictions
ROUNDS_SETTLED=<n>          # ...with venue UP/DOWN in prediction_results
ROUNDS_INVALID=<n>          # predicted window gaps + VOID + missing-snapshot (list IDs)

Per arm (A0..A10 + baselines you ran):
  ARM=<name> ACTED=<n> SKIPPED=<n> WINS=<n> LOSSES=<n>
  WIN_RATE=<wins/acted or null>
  BRIER=<mean (p-y)^2 over valid responses or null>
  CALIBRATION=<bucket table or LOW_PROBABILITY_DISPERSION + ranges>

SETTLED_UP=<n> SETTLED_DOWN=<n> SETTLED_VOID=<n>   # venue truth only
ALWAYS_UP_WIN_RATE=<n>                             # base rate context (required)

PNL_USDC=<null>                                    # stays NULL until payout
                                                   # semantics are independently
                                                   # verified; NEVER estimate it

SPEND_USD=<0 or metered>                           # $0 unless paid phase approved
ERRORS=<429s/timeouts/LATE counts per arm>
UPTIME_NOTE=<collector gaps, restarts, OOD rate>
```

Suggested queries (run on VM, read-only):

```bash
# per-arm scorecard:
node --input-type=module -e "
import{DatabaseSync}from'node:sqlite';
const d=new DatabaseSync('/data/arcade/pattern/nodes/nodes.db',{readOnly:true});
for(const r of d.prepare('SELECT arm,COUNT(*) n,SUM(action!=\"SKIP\") a,SUM(correct=1) w,SUM(correct=0) l FROM pattern_predictions p LEFT JOIN prediction_results s ON s.round_id=p.round_id AND s.arm=p.arm GROUP BY arm').all()) console.log(JSON.stringify(r));
d.close();"
```

Rules for the report: compare every accuracy against the realized base rate (not 50%);
call anything near base rate NO_DETECTABLE_SIGNAL; never write PROVEN/PROFITABLE/BEATS;
attach the raw numbers so the operator can recompute.

---

## 12. If anything is blocked, report exactly this and stop spending effort

```text
DEPLOYMENT_BLOCKED__<EXACT_REASON>  + last command output + exact recovery command
```

Got it — deploy clean, paper only, report numbers with receipts.
