# Silo Setup — Agent Configuration

This document specifies the software architecture, package structures, and components for **Silo**, the zero-knowledge whistleblower drop.

## Project Structure

```text
/Users/edycu/Projects/Hackathon/HermesDocs/projects/dorahacks-t3adk-launch-2026/projects/silo/
├── PROGRESS.md
├── DECISIONS.md
├── README.md
├── AGENTS.md
├── .env.example
├── contract/           # Rust WASM Contract (TEE Enclave Logic)
├── agent/              # Node.js Coordinator Agent (Express Gateway)
├── ui/                 # Next.js Dashboard App (Whistleblower + Journalist Panels)
└── scripts/            # Benchmarking, seeding, and verification scripts
```

## Setup Components

### 1. Rust TEE Contract (`/contract`)
*   **Role:** Processes all cryptographic operations inside the hardware enclave. Handles pseudonym minting, calculates SHA-256 evidence hashes, uploads blobs to T3 Stash, verifies OTP contact control, and issues signed report VCs.
*   **Technological Stack:** Rust `wasm32-unknown-unknown` target, `serde_json`, `sha2`, `base64`.
*   **WASM Exports:** `open_drop`, `attach_evidence`, `verify_source`, `submit_report`, `relay_message`, `get_thread`.

### 2. Node.js Coordinator Agent (`/agent`)
*   **Role:** Express API gateway that handles client requests, instantiates the WebAssembly module, mocks the T3 Host APIs (Stash, OTP, HTTP-with-placeholders, signing, and KV store), and acts as the unsecure proxy.
*   **Technological Stack:** Node.js, TypeScript, Express, CORS.
*   **Endpoints Exposed:** `/api/drop/open`, `/api/drop/attach`, `/api/drop/verify`, `/api/drop/dispatch`, `/api/drop/thread`, `/api/drop/relay`.

### 3. Silo Console Dashboard (`/ui`)
*   **Role:** Double-sided dashboard presenting the Whistleblower Secure Drop Panel (file upload, OTP challenge entry, and success pseudonym printout) and the Journalist Console (report listing, tamper evidence check, and blind chat relay).
*   **Technological Stack:** Next.js, React, Tailwind CSS, Lucide Icons, Orbitron & JetBrains Mono typography.

### 4. Developer Telemetry & Telemetry scripts (`/scripts`)
*   **Role:** Benchmarking latency over 100 uploads (`bench.py`), offline TEE sandbox validation (`verify_offline.py`), and pre-submission safety checks (`check_submission_readiness.py`).
*   **Technological Stack:** Python 3, requests.
