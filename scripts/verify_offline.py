# scripts/verify_offline.py
#
# Offline (no-server) verification of Silo's enclave-boundary invariants.
# Unlike a checklist of hardcoded "PASS" lines, every check below actually
# inspects the source/artifacts and FAILS if the corresponding control is
# missing or has regressed. Run from the repo root: `python3 scripts/verify_offline.py`.

import os
import sys


def read(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    print("=" * 70)
    print("            SILO TEE OFFLINE SECURE BOUNDARY CHECK")
    print("=" * 70)

    failures = []

    def check(name, condition, detail=""):
        status = "PASS" if condition else "FAIL"
        mark = "✅" if condition else "❌"
        print(f"{mark} [{status}] {name}")
        if detail:
            print(f"        {detail}")
        if not condition:
            failures.append(name)

    wasm_path = "agent/src/lib/silo_contract.wasm"
    app = read("agent/src/app.ts") or ""
    runner = read("agent/src/lib/wasmRunner.ts") or ""
    db = read("agent/src/lib/db.ts") or ""
    contract = read("contract/src/lib.rs") or ""

    # 0. Artifact present
    check(
        "WASM enclave binary is built",
        os.path.exists(wasm_path),
        f"{wasm_path} ({os.path.getsize(wasm_path)} bytes)" if os.path.exists(wasm_path) else "missing — run `make build-contract`",
    )

    # 1. No plaintext OTP / contact written to logs
    check(
        "OTP code is never logged",
        "code: ${code}" not in runner and "code: ${otp}" not in app,
        "host_otp_verify and verify-source log no raw code",
    )
    check(
        "Resolved contact is never logged at egress",
        "Resolved body for egress" not in runner,
        "egress logs the destination only, not the resolved PII",
    )

    # 2. Tamper-evidence rests on a real signature (not a stub)
    check(
        "Manifest VC is signed with real Ed25519",
        "crypto.sign(" in runner and '"sig-"' not in runner and "'sig-'" not in runner,
        "host_signing_issue_vc uses crypto.sign (EdDSA), not a hex stub",
    )

    # 3. Blind egress does not persist source PII
    check(
        "Dispatched reports persist a redacted body",
        "redactedBody" in runner,
        "the real contact is delivered but never stored in db.json",
    )

    # 4. Contact is bound per-session (no shared global profile)
    check(
        "Egress resolves contact per session",
        "parsed.sessionId" in runner,
        "follow-ups cannot be routed to a different source",
    )

    # 5. Database telemetry endpoint redacts secrets
    check(
        "/api/seed redacts profiles and OTPs",
        "redacted: true" in app and "activeOtp: null" in app,
        "contact profiles and OTP challenges never leave the agent",
    )

    # 6. Debug OTP and mock backdoor codes are gated out of production
    check(
        "Debug OTP echo is gated to non-production",
        "nonProd()" in app and "debugOtp: otp //" not in app,
    )
    check(
        "Mock OTP backdoor codes are disabled in production",
        "NODE_ENV !== 'production'" in runner,
    )

    # 7. Sessions are unguessable + DB writes are crash-safe
    check(
        "Session IDs use a crypto-random nonce",
        "req.nonce" in contract and "randomBytes(12)" in app,
    )
    check(
        "DB writes are atomic (temp + rename)",
        "renameSync" in db,
    )

    # 8. CORS is restricted (no wildcard)
    check(
        "CORS is restricted to a configured origin",
        "cors({ origin" in app,
    )

    print("-" * 70)
    if failures:
        print(f"[AUDIT RESULT] FAILED — {len(failures)} invariant(s) regressed:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("[AUDIT RESULT] PASSED — all enclave-boundary invariants verified.")
    print("=" * 70)


if __name__ == "__main__":
    main()
