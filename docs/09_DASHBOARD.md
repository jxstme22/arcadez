# Dashboard design requirements

Local-only research cockpit for laptop/mobile browser on same machine (V0 binds to 127.0.0.1). Visual language: dark slate, restrained lime accent, minimal dense tables, clear card spacing. No external fonts/assets/CDN, no login needed when loopback only, no exposed model keys or full raw provider payloads. Three equal model cards with matched layout; not ranking until statistically valid.

## Current implemented starter

`npm run dashboard`: local HTML UI, every 5s GET `/api/stats`; header `NO REAL MONEY`, counts, independent cards for OpenAI/Jev/GLiDE, settled paper win/attempt count, model response count, mean latency, Brier where settled, recent decision table. Unknown payouts explicitly labeled. Dashboard reports no fake earnings and has no mutating endpoints.

## Further agent jobs

- Add live feed freshness indicator and gap/reconnect status (source expected frequency vs observed).
- Countdown card to NEXT target start, measured local clock offset warning, projected T−10s snapshot and T−3s nominal lock.
- Equal-height model cards: probability bar, UP/DOWN/SKIP, exact response status, ms latency and mode badge; show Missing Key / Unsupported Schema separately from model prediction.
- History filters by UTC date, round ID, eligible/matched arms, missingness class, prompt version; do not hide losing or skipped rounds by default.
- Calibration panels with Brier trend and reliability bins, not cherry-picked win streaks. Show raw score is not proven probability.
- PnL section behind verified observed pool/fee data; display `Not available: payout contract unverified` until approved.
- Responsive >=320px, keyboard focus, aria labels, semantic headings, no horizontal clipping for key stat cards; test Safari/macOS and mobile viewport when tool available.
- Export scrubbable CSV with provenance flags, direct full raw events only via local operator tool (not browser by default).

## Acceptance

Offline demo displays clear `FIXTURE ONLY` indicator or has its own separate labeled launcher; live UI must never mix fixture numbers. Malformed backend data renders error state, not zero profits. No network requests except localhost dashboard API. Auditors can check every displayed metric back to DB query and denominator.
