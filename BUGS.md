# Terminal 3 ADK — Onboarding Bug & Documentation Audit

> Submitted for the **Terminal 3 ADK Dev Challenge 2026 — Track 2 (Bug Bounty)**.
>
> Concrete onboarding blockers and documentation gaps found while building **Silo**
> (and the wider Vouch Suite: Epoch, Lethe, Silo, Synod, Visor) against the T3 ADK host
> APIs and SDK. Each entry lists where it bit us in Silo and the workaround we shipped.

> 🔬 **See [SDK_AUDIT.md](SDK_AUDIT.md)** for **confirmed, code-cited security findings** verified directly from the *real published* `@terminal3` VC packages via `npm pack` (hardcoded BBS `nonce` → proof replay, revocation bypass, no holder/challenge binding). The list below is integration/documentation gaps; the audit is reproducible SDK bugs.

| # | Area | Type | Severity |
|---|---|---|---|
| 1 | `metamask_sign` | Undocumented param | Low |
| 2 | `kv-store` | Interface discrepancy | High |
| 3 | `clock` | Method name mismatch | High |
| 4 | `signing` | Missing WIT helper | Medium |
| 5 | `loadWasmComponent` | Opaque path resolution | Medium |
| 6 | tenant DID | Hex double-encoding trap | High |
| 7 | public KV route | Missing spec (CORS/cache/pagination) | Low |
| 8 | transactions | Rollback semantics undocumented | Medium |
| 9 | `outbox` | Idempotency lifecycle undocumented | Medium |
| 10 | `stash` | Reference scheme & size limits undocumented | Medium |
| 11 | `otp` | Challenge-scheme config undocumented | Medium |

---

## Bug #1 — Undocumented second parameter in `metamask_sign`
**Type:** Documentation · **Severity:** Low

`EthSign: metamask_sign(address, undefined, T3N_API_KEY)` never documents the second positional argument, blocking custom wallet bindings. **Ask:** document its type/values or use a named options object.

## Bug #2 — `kv-store` interface discrepancy (map-name vs. flat keys)
**Type:** Interface · **Severity:** High

WIT declares `get(map-name, key)` but the C ABI is flat `(key_ptr, key_len)`. **Where it bit us:** Silo stores drop metadata, sessions, and relay threads through the flat shape; a WIT-component port needs a wrapper. **Ask:** make the WIT and C ABI agree.

## Bug #3 — Clock API method-name mismatch
**Type:** Interface · **Severity:** High

Docs say `host_clock_now() -> u64`; WIT requires `now-ms() -> result<u64, clock-error>`, breaking `wasm32-wasip2` builds. **Ask:** align docs with WIT and state the target triple per example.

## Bug #4 — Missing `host_signing_issue_vc` in the `signing` WIT
**Type:** Interface · **Severity:** Medium

Templates call `host_signing_issue_vc`, but WIT only exposes raw `sign`. **Where it bit us:** Silo mints a signed liveness/evidence manifest VC and had to hand-build the W3C envelope over `sign`. **Ask:** add a VC helper or document the recipe.

## Gap #5 — Opaque `loadWasmComponent()` path resolution
**Type:** Documentation · **Severity:** Medium

`loadWasmComponent()` is called with no args and no documented resolution base/override. **Where it bit us:** we resolve the `.wasm` path explicitly. **Ask:** document the base path and an override.

## Gap #6 — Tenant DID hex double-encoding trap
**Type:** Correctness · **Severity:** High

`format!("z:{}:secrets", hex::encode(&tid))` double-encodes when `tenant_did()` returns a string, breaking KV routing. **Ask:** clarify the return type and the correct derivation.

## Gap #7 — Public KV route specification
**Type:** Documentation · **Severity:** Low

`/api/dev/public-kv/<tid>/<tail>` is mentioned with no CORS, cache, or pagination spec. **Ask:** publish them.

## Gap #8 — Transaction rollback semantics undocumented
**Type:** Documentation · **Severity:** Medium

It is unspecified what an `Err` return rolls back (KV writes? `stash` puts?). **Where it bit us:** if attaching evidence fails after a `stash_put`, Silo must not leave an orphaned blob referenced by a half-written session; we order writes in guest code. **Ask:** document the rollback boundary.

## Gap #9 — `outbox` idempotency lifecycle undocumented
**Type:** Documentation · **Severity:** Medium

The dedup window/TTL and overflow behavior of the `idk` key are undocumented. **Ask:** document them.

## Gap #10 — `stash` reference scheme & size limits undocumented
**Type:** Documentation · **Severity:** Medium

`host_stash_put` returns a `stash://ref-…` handle, but the docs don't specify the reference format, whether it is content-addressed (dedupes identical uploads), the max object size, or retention. **Where it bit us:** Silo accepts arbitrary leak files (PDF/DOCX) and surfaces a `stash://` ref to the source; we assumed content-addressing for integrity but the contract is unspecified. **Ask:** document the reference scheme, size limit, and retention.

## Gap #11 — `otp` challenge-scheme configuration undocumented
**Type:** Documentation · **Severity:** Medium

`host_otp_verify` checks a code against the user's "configured authentication scheme", but the docs don't say how that scheme is provisioned, what algorithms/time-steps are supported, or how to seed a test secret. **Where it bit us:** Silo verifies source liveness via OTP before discarding the identifier; we had to assume a TOTP-style scheme. **Ask:** document scheme provisioning and supported algorithms.
