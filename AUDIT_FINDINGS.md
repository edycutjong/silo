# Silo — Security & Correctness Audit

**Date:** 2026-06-21 · **Scope:** `contract/` (Rust→WASM), `agent/` (Express), `ui/` (Next.js), `cli/`, `scripts/`, repo hygiene.
**Method:** full source review + empirical verification against a running instance. Critical findings were reproduced live, then fixed and re-verified.

> Silo is a sandbox demo built on **mock** Terminal 3 host APIs. The findings below distinguish "mock by nature" from genuine bugs/leaks. The headline product promise — *whistleblower anonymity* — was **not delivered even in the demo** before this remediation. All items are now fixed; remaining residual risk is documented.

## Status summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| C1 | Critical | Source PII (contact email, OTP) served over unauthenticated endpoints (`/api/seed`, `/api/admin/reports`) | ✅ Fixed |
| C2 | Critical | Blind relay routed a journalist follow-up to the **wrong** source (shared global profile) | ✅ Fixed |
| C3 | Critical | Any evidence file downloadable via enumerable refs, no auth | ✅ Mitigated |
| C4 | Critical | OTP echoed to client, global (not per-session), hardcoded backdoor → "verified human" bypass | ✅ Fixed |
| C5 | Critical | Manifest "signature" was `"sig-"+hex` — forgeable, no key | ✅ Fixed (real Ed25519) |
| H1 | High | No auth + wildcard CORS → drive-by DB wipe / PII exfil / relay hijack | ✅ Fixed |
| H2 | High | Predictable session IDs used as the only bearer secret | ✅ Fixed |
| H3 | High | File DB: non-atomic writes + silent reset on corruption → data loss | ✅ Fixed |
| M1 | Medium | Fixed 8 KB KV read buffer silently truncated threads / panicked | ✅ Fixed |
| M2 | Medium | `getKv`/`getStash` treated empty values as missing | ✅ Fixed |
| M3 | Medium | OTP / contact / resolved email written to logs | ✅ Fixed |
| M4 | Medium | Runtime `agent/data/db.json` committed to git | ✅ Fixed |
| M5 | Medium | Outdated Next.js (high-sev advisories); CI audit non-gating | ✅ Reduced |
| L1 | Low | `verify_offline.py` hardcoded "PASS" for properties the code violated | ✅ Fixed |
| L2 | Low | Stash refs random, not content-addressed (contradicted docs) | ✅ Fixed |
| L3 | Low | Overstated claims ("256-bit ECIES", "Intel TDX cluster") | ✅ Fixed |

---

## Critical

### C1 — Source PII exposed over unauthenticated endpoints
`/api/seed` returned the entire DB (contact profiles + active OTP); `/api/admin/reports` returned `resolvedBody` containing the real resolved email. **Reproduced:** `GET /api/seed` leaked `activeOtp` and the profile email.
**Fix:** `/api/seed` now redacts `profiles`, `otps`, and `activeOtp` (`agent/src/app.ts`). The egress persists a **redacted** body (`redactedBody`, `agent/src/lib/wasmRunner.ts`) so the real contact is never stored or returned.

### C2 — Blind relay delivered to the wrong whistleblower
Contacts were keyed by a single constant DID, so each new source overwrote the previous one's profile; egress always resolved that one slot. **Reproduced:** source A's follow-up resolved to source B's email.
**Fix:** the contact is bound to the **session** — the UI seeds `profiles[sessionId]` (`ui/src/app/page.tsx`), the contract includes `sessionId` in the egress body (`contract/src/lib.rs`), and the host resolves the per-session contact (`wasmRunner.ts`).

### C3 — Arbitrary evidence download
`/api/admin/download?ref=` had no auth and refs were enumerable via `/api/seed`. **Reproduced:** downloaded raw evidence bytes by enumerating a ref.
**Fix:** refs are no longer exposed (`/api/seed` redaction + content-addressed refs), the route is behind the optional `ADMIN_TOKEN` guard, and CORS is restricted. Residual: with no `ADMIN_TOKEN` set (local demo) the route is open to local callers — set `ADMIN_TOKEN` in production.

### C4 — OTP "human verification" bypass
The OTP was echoed to the client (`debugOtp`), stored globally (not per session), and a hardcoded backdoor (`883391`, plus "any 6-digit" in the native mock) always passed. **Reproduced:** backdoor `883391` verified a session that was never contacted.
**Fix:** per-session OTP (`db.otps[sessionId]`); `/api/drop/verify` binds verification to the requested session; `debugOtp` and mock backdoor codes are honored **only when `NODE_ENV !== 'production'`** (`app.ts`, `wasmRunner.ts`).

### C5 — Forgeable manifest signature
The VC "signature" was `"sig-" + first16bytes(payload)` — no key, anyone could forge it; all tamper-evidence rested on it.
**Fix:** real **Ed25519 (EdDSA)** signing over the JWS signing input (`wasmRunner.ts`), the enclave public key is published at `GET /api/enclave/pubkey`, and the journalist console verifies the manifest signature against it (best-effort, `ui/src/app/page.tsx`).

## High

- **H1 — Auth + CORS.** Wildcard CORS replaced with an allow-list (`CORS_ORIGIN`, default `http://localhost:3000`); sensitive admin/seed routes gated by an optional `ADMIN_TOKEN`.
- **H2 — Session IDs.** The agent now supplies a 96-bit crypto-random nonce (`crypto.randomBytes(12)`) used as the session suffix in the contract.
- **H3 — DB durability.** Atomic writes (temp file + `rename`); a corrupt `db.json` is moved aside (`.corrupt`) instead of silently overwritten; `updateDb()` performs safe read-modify-write.

## Medium

- **M1** — `host_kv_store_get` returns the full value length; the contract re-reads into a larger buffer on truncation (no silent thread loss / panic).
- **M2** — `getKv`/`getStash` use key-presence checks, so empty values round-trip correctly.
- **M3** — OTP codes, the expected OTP, the resolved contact email, and message bodies are no longer logged (agent + contract).
- **M4** — `agent/data/db.json` untracked and added to `.gitignore` (plus `db.json.*`).
- **M5** — `next` floor pinned to the patched `^14.2.35` line; non-breaking `npm audit fix` applied (27→24 advisories, 7→4 high). **Residual:** the remaining high-sev items are Next.js DoS advisories fixed only in 16.x — a major upgrade deferred as a breaking change.

## Low

- **L1** — `scripts/verify_offline.py` rewritten to *actually* inspect the source/artifacts and fail on regression (no hardcoded PASS).
- **L2** — Stash references are content-addressed (`sha256` prefix), matching the documentation and enabling dedupe.
- **L3** — Removed unsupported claims ("256-bit ECIES", "Intel TDX Hardware Enclave Cluster") in favor of accurate ones (EdDSA Ed25519, simulated TEE); README test counts updated.

## Not changed (intentional)
- The native Rust OTP mock (`#[cfg(not(target_arch="wasm32"))]`) accepts any 6-digit code — it is **test-only** and never part of the shipped WASM/host path.
- `host_stash_get` is retained: it is part of the host ABI surface and exercised by tests.
- The file-based JSON DB remains a demo stand-in for the real Terminal 3 KV/stash host; it is now crash-safe but is not intended for high-concurrency production use.

## Verification
- Rust contract: 29 tests pass; WASM rebuilt.
- Agent: 49 tests pass, 100% coverage.
- CLI: 22 tests pass, 100% coverage.
- UI: 5 tests pass; lint + typecheck + production build clean.
- `scripts/verify_offline.py`: all invariants pass.
