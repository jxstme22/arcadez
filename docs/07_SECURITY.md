# Security, privacy, budgets and safe autonomy

This system is intentionally **not a trading bot**. Contains no signer, no wallet code, no Solana private keys, no submit/order/execute code. Source ingress only read-only Jupiter first-party GET and `wss://.../ws/crypto`; inference egress only three exact whitelisted API URLs and POST. API keys remain local server variables. Do not commit `.env`, nor log request headers, response authorization, identifiable bettors, or secret-bearing raw objects. Review any external tool output before executing shell commands it suggests.

## Safe allowlist

- Jupiter round GET `prediction-market-api.jup.ag/api/v1/play/...` routes audited from live OpenAPI; reject trading-related route name patterns.
- Jupiter price-service GET `prediction-market-price-service.fly.dev/price/crypto/...` and WS `wss://prediction-market-price-service.fly.dev/ws/crypto` (specific audited path only).
- OpenAI `https://api.openai.com/v1/decisions`; TypeSafe `https://api.typesafe.ai/v1/systemone`; Fastino `https://api.fastino.ai/v1/systemone`.
- Never allow URL redirects, user-controlled arbitrary hosts, HTTP downgrade, external image analytics, or browser access to keys.

## Explicit no-go commands

- No wallet connect, seed phrase import, signing, quote execution, Jupiter orders/execute, claim, or on-chain transactions.
- No `curl | bash` without source inspection and explicit operator approval.
- No `--dangerously-skip-permissions` blanket autoapproval or script permitting arbitrary terminal commands while unattended; configure narrowly scoped safe actions in your agent runtime.
- No auto-buy API credits; no unlimited inference retries. Missing keys are a normal `DISABLED` state.
- No public dashboard binding; default `127.0.0.1` only; no public ingress or deployment.

## Costs

Cap session requests and per-arm requests, per-request timeout and retry count (initially zero) and use provider-side hard spend limit when available. Record model usage and resolved ID for later accounting. Never assume public beta is free or that vendor benchmark implies trading advantage.

## Audit checklist

Check `git status --porcelain`, `git diff --check`; `grep -R` for `execute|signTransaction|secretKey|sendTransaction|withdraw|privateKey`; inspect matches to distinguish harmless docs from dangerous code. Verify source only uses `method:'GET'` on Jupiter and exact-model URLs for POST; dashboard has no POST handler. Ensure sample `.env.example` values blank. File permissions for SQLite and logs local-only. Test refusal, timeouts, bad timestamps, mass reconnect, late API output and malformed provider JSON. Write dated `ops/SECURITY_AUDIT.md`; mark findings accurately.
