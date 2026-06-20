# Silo — Pitch Deck Outline

This outline presents the structure, visual mock descriptions, and speaker notes for the Silo presentation slides.

---

## Slide 1: Title & Hook
- **Display Title:** SILO
- **Subtitle:** The Zero-Knowledge Whistleblower Drop
- **Aesthetic:** Swiss International layout (dark `#09090b` background, Outfit typography, bold Cyan `#06b6d4` accents).
- **Speaker Notes:** 
  "Good morning. Whistleblowers put their lives and careers on the line to expose truth. Yet today, every reporting form demanding inspection logs or safety records leaves a digital trail of identity, IP addresses, and metadata. We built Silo to change that. Silo is a zero-knowledge drop that decouples evidence credibility from reporter identity using secure enclaves."

---

## Slide 2: The Problem
- **Display Title:** Anonymity is Broken
- **Visual Mock:** A split screen showing Web2 upload forms demand details (e.g. email, phone) on one side, and an database logging IPs and sessions on the other.
- **Bullets:**
  - Standard forms log IP address, browser fingerprint, and metadata.
  - OTP checks force whistleblowers to expose their phone numbers/SMS history.
  - Subpoenas or hacks on Web2 servers instantly expose the source.
- **Speaker Notes:**
  "When an insider wants to report malpractice—like falsifying safety inspections at a hospital—they face a choice. Report it internally and get fired, or report it externally where standard forms log their identity. If a newsroom is subpoenaed or hacked, the source is instantly burned."

---

## Slide 3: The Solution
- **Display Title:** Enter Silo
- **Visual Mock:** A clean, glowing green boundary representing the secure TEE hardware enclave separating Whistleblower Profile and Journalist Inbox.
- **Bullets:**
  - Hardware-isolated enclaves process all uploads and OTP validations.
  - Sources verify their credibility (Insider status) without revealing contact values.
  - Plaintext data never enters databases, logs, or agent memory.
- **Speaker Notes:**
  "Silo solves this by using Terminal 3's secure hardware enclaves. The whistleblower uploads evidence and verifies their real phone number. The enclave validates their authenticity but never logs or exposes their PII to the database. The newsroom gets a verified human proof, and the source remains completely invisible."

---

## Slide 4: Core Product Flow
- **Display Title:** Decoupled Verification Pipeline
- **Visual Diagram:**
  ```mermaid
  sequenceDiagram
      Whistleblower->>Enclave: Upload PDF + Hashing
      Enclave->>Stash API: Secure Storage upload
      Whistleblower->>Enclave: SMS OTP Challenge
      Enclave->>OTP API: Match code (no contact logged)
      Enclave->>Journalist: Sign Report manifest (VC) & Dispatch
  ```
- **Speaker Notes:**
  "The flow is simple. The source drops a file, which is hashed inside the enclave. They receive and input an OTP. The enclave verifies the OTP code without storing the email or phone number, signs a report manifest Verifiable Credential, and dispatches it blind to the journalist outbox."

---

## Slide 5: Technical Architecture
- **Display Title:** Terminal 3 Stack Integration
- **Bullets:**
  - **`stash` API:** Enclave uploads files directly to T3 stash and verifies SHA-256 integrity.
  - **`otp` API:** Validates real-world contact status without storing contact details.
  - **`http-with-placeholders`:** Relays outgoing message threads blind using profile variable filters.
  - **`signing` API:** Signs the report manifest with the enclave DID to guarantee non-tampering.
- **Speaker Notes:**
  "Let's look at the tech stack. Silo is a Rust WASM contract running inside a Terminal 3 enclave. It leverages the `stash` API for secure uploads, the `otp` API for blind verification, `http-with-placeholders` for relayed communications, and `signing` to sign report credentials. Unsecure databases only see ephemeral hashes."

---

## Slide 6: Live Demo Highlights
- **Display Title:** Verified Human Badge & Integrity Check
- **Visual Mock:** A screenshot of the Journalist Inbox Detail screen with a bright green **Verified Human** badge, a file check status "✅ MATCH", and an inline chat relay.
- **Bullets:**
  - Journalist console checks PDF hashes against enclave-signed manifest VC.
  - Flashing red warning banner `Integrity Check Failed` if a file is tampered.
  - Blind two-way chat relays messages to the whistleblower's email without displaying it.
- **Speaker Notes:**
  "In our demo, the journalist inbox receives the document with a green 'Verified Human' badge. If anyone alters even a single character in the PDF, the console immediately flags a Hash Mismatch. The journalist can also chat with the source in real-time. Messages are relayed, but the source's email is never exposed."

---

## Slide 7: Sponsor Integration (Stacking Bounties)
- **Display Title:** Maximizing Terminal 3 Bounties
- **Bullets:**
  - **Best Agent Track:** Implemented as a complete autonomous gateway and Rust WASM contract.
  - **Google Cloud Credits:** Enclave gateway and agent processes ready for Google Cloud Run.
  - **Friction-Log Bonus:** Documented 4 core DX friction log entries in `DX-REPORT.md`.
- **Speaker Notes:**
  "We structured Silo to maximize Terminal 3 sponsor integration. We target the Best Agent track with a robust coordinator agent, and have outlined a friction log that details compilation, heap allocator, and 64-bit pointer issues solved during development."

---

## Slide 8: Competitive Edge
- **Display Title:** Silo vs. Standard Leaks
- **Table:**
  - Secure Enclave Verification: Silo (Yes) | SecureDrop (No) | Standard Forms (No)
  - Zero PII Logs: Silo (Yes) | SecureDrop (No) | Standard Forms (No)
  - Tamper-proof Manifests: Silo (Yes) | SecureDrop (Yes) | Standard Forms (No)
  - Two-way Chat Relay: Silo (Yes) | SecureDrop (Complex) | Standard Forms (No)
- **Speaker Notes:**
  "Silo outperforms traditional leak platforms like SecureDrop. SecureDrop requires complex Tor browser configurations and is hard for everyday whistleblowers to navigate. Silo provides Web2 ease of use (SMS OTP) with Web3 hardware-level enclave privacy."

---

## Slide 9: Product Roadmap
- **Display Title:** 30/60/90-Day Vision
- **Bullets:**
  - **30 Days:** Multi-media evidence streaming uploads, and support for multi-party whistleblowing.
  - **60 Days:** Support for economic whistleblower payouts using zero-knowledge escrow.
  - **90 Days:** Mobile-native drop SDKs for secure leak submissions on Android/iOS.
- **Speaker Notes:**
  "Our roadmap is clear. In the next 30 days we will add support for multi-media streaming. In 60 days, we'll implement zero-knowledge payout escrows. In 90 days, we'll ship mobile-native drop SDKs."

---

## Slide 10: Engineering Rigor (Metrics)
- **Display Title:** Performance & Test Harness
- **Bullets:**
  - **46 Tests:** Rust unit tests + Express API integration tests.
  - **41.29 ms Mean Latency:** Over 100 benchmark iterations.
  - **Zero Placeholders:** PII filter prevents leakage in logs or database.
- **Speaker Notes:**
  "We built Silo with extreme engineering rigor. The codebase is tested with 46 test cases spanning enclaves and APIs. Our benchmark shows a mean latency of 41.29 milliseconds over 100 runs, well within secure enclave requirements."

---

## Slide 11: Team
- **Display Title:** The Silo Engineers
- **Bullets:**
  - Experienced systems developers and Web3 security researchers.
  - Specialized in secure hardware execution environments (TEE) and zero-knowledge proofs.
- **Speaker Notes:**
  "Our team brings deep expertise in hardware-isolated execution and Web3 security. We are excited about building private, credible communication channels."

---

## Slide 12: Conclusion & Ask
- **Display Title:** Hand Over Proof. Stay Invisible.
- **Call to Action:** Learn more at [github.com/silo-drop](https://github.com/silo-drop)
- **Speaker Notes:**
  "Silo is the bridge that lets sources expose the truth while staying safe. Let's protect those who protect the truth. Thank you."
