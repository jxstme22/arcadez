# Overnight autonomous agent execution guide

The ChatGPT response that delivered this repo cannot continue running after the conversation turn. To execute actual unattended coding work locally, install/launch **OpenCode** on a powered, networked machine, with its usual coding-provider credentials already configured (separate from the three decision-provider API keys). The model/provider you already use for OpenCode drives the coding work; its API costs and limits are separate.

## One-time local bootstrap

```bash
cd arcade-decisions-v0
node --version                  # >=22.13
npm test
npx get-shit-done-cc@latest --opencode --local
opencode --version
opencode run --help            # check your installed flags
```

Review the installation and local permissions before unattended runs. GSD's older repo is archived and maintained distributions can change; choose the upstream you trust. Verify `/gsd-help` is available inside OpenCode. GSD supports `/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-verify-work` and `/gsd-progress --next` in its command interface, but installed versions may differ. This repository ships task files even if GSD isn't installed.

## Overnight run (Mac)

```bash
cd arcade-decisions-v0
caffeinate -i bash ops/run-overnight.sh
```

`caffeinate -i` keeps the host awake only while command runs (macOS). Keep the MacBook plugged in and internet connected, prevent lid-close/system sleep as needed; OS may sleep if lid closed. `run-overnight.sh` runs **one** noninteractive `opencode run` session and tee's output to ignored `var/agent-logs`; it is not a cron or persistent cloud worker. An agent context limit, model access failure, tool permission request, power loss or network outage may stop progress. The morning report is the record of completion, **not the promise of an overnight finish**.

## GSD per-phase loop

- Research: primary docs, first-party read-only probes, source/fixture provenance; save dated `PXX-RESEARCH.md`.
- Planner: `PXX-PLAN.md` atomic tasks with acceptance tests and dependencies, using `/gsd-plan-phase XX` when supported.
- Execution: `/gsd-execute-phase XX` or controlled manual code tasks; small commits, stop on hard safety gate.
- Audit: adversarial review of semantics, leakage, security, contract drift, statistical claims and no-wallet policy.
- Verify: `/gsd-verify-work XX` or `npm test` + fixture replay + targeted contract checks; record actual tool output.
- Repair: up to three bounded attempts; root-cause fix + regression, re-audit, re-verify. Declare BLOCKED rather than loop forever.
- Handoff: update `.planning/STATE.md`, phase report and all `ops/*REPORT` files.

## Escalation rules without waking the user

Proceed on unrelated tasks if a route is inaccessible, price subscription is undocumented, model keys are missing or new authorization required. Do not request user passwords, generate paid API keys, approve spend, change system security settings, or send real trades. If API live schema cannot be verified, record exactly where it failed and preserve a safe `BLOCKED_*` guard in `npm run paper`. If all safe work exhausted, stop; do not fabricate 24-hour progress.
