# Golden Path — 2-Minute Reviewer Quickstart (Silo)

> For judges: see the whole **zero-knowledge whistleblower drop** flow end-to-end with **zero credentials, no API keys, no external services**. Everything runs locally against the bundled Rust→WASM enclave contract.

## Choose your path

| Goal | Command | Time | Credentials |
|------|---------|------|-------------|
| **See it all pass** (lint, types, Rust + agent + UI tests, e2e) | `make bootstrap && make ci` | ~2 min | None |
| **Click through the UI** | `cd ui && npm run dev` → http://localhost:3000 | ~2 min | None |
| **Prove no PII leaks the enclave** | `make verify-offline` | ~1 min | None |
| **Read the full walkthrough** | [DEMO.md](DEMO.md) | — | — |

## The 2-minute demo (UI)

1. **Open a drop** — pick a newsroom outlet; the enclave mints an anonymous pseudonym (`Source #…`) and a session.
2. **Verify the source** — pass the **`otp`** human-liveness check *inside the enclave*; the identifier is then discarded, so even the journalist can't deidentify you.
3. **Attach evidence** — upload a leak file; it goes to **`stash`** content-addressed storage and its bytes are bound to a signed **manifest VC** (tamper-evident).
4. **Blind relay** — exchange follow-ups with the newsroom; the enclave holds the only link, so neither side learns the other's contact details.
5. **Newsroom alert** — the enclave dispatches an alert via **`http-with-placeholders`**, substituting the journalist's contact at the egress edge.

## What's real vs simulated
- **Real:** the Rust→WASM enclave contract, `stash` content-addressed uploads, `otp` liveness verification, enclave-signed manifest VCs, and PII-blind placeholder alerts.
- **Simulated (local sandbox):** the Terminal 3 host APIs, newsroom endpoints (seeded test targets), and uploads stay on your machine. See the "Hackathon Simulation Context" banner in the app.

## Bug-bounty track
See **[SDK_AUDIT.md](SDK_AUDIT.md)** — confirmed, code-cited security findings verified from the real published `@terminal3` VC packages — and **[BUGS.md](BUGS.md)** for integration/doc gaps.
