# Silo — Demo Protocol

This guide walks through the step-by-step demo protocol for judges to reproduce and verify **Silo** functionality.

---

## 1. Setup & Environment
- **Prerequisites:** Node.js ≥ 20.9.0, Rust, and the Terminal 3 Local Sandbox CLI installed.
- **Run Seeding:**
  ```bash
  python3 scripts/seed.py
  ```
  *This registers the mock newsroom templates and seeds the profile context for `did:t3n:whistleblower123`.*

---

## 2. Step-by-Step Walkthrough

### Step 1: Create Secure Drop Session
1. Open the UI at `http://localhost:3000`.
2. Select **File a Report** on the source drop portal.
3. Drag and drop the test file `data/fixtures/inspection-logs.pdf` into the upload zone.
4. Input the whistleblower SMS phone number. Watch the agent logs display the registration using `{{profile.verified_contacts.phone.value}}`.

### Step 2: Authenticate and Submit
1. Trigger the OTP code. In the mock dashboard, view the generated code `883391`.
2. Input the code in the verification field. Click **Verify & Submit**.
3. The UI prints the generated pseudonym handle: `Source #7`, along with the signed manifest hash.

### Step 3: Journalist Inbox Triage & Validation
1. Open the Journalist Inbox at `http://localhost:3000/journalist`.
2. Select the report from `Source #7`. Observe the green badge: `VERIFIED HUMAN`.
3. Locate `inspection-logs.pdf`. Click **Validate Integrity**. The UI calculates the SHA-256 hash in-enclave and confirms: `Integrity Checked: Match.`
4. To simulate database tampering, edit a single character in the base64 string under the `"stash"` key in `data/db.json` inside the agent root, and re-run **Validate Integrity**. Watch the UI display a red warning banner: `Tampering Detected: Hash Mismatch.`

### Step 4: Two-Way Anonymous Chat Relay
1. In the chat input under `Source #7`'s detail pane, type: *"Can you confirm the dates of the violations?"* and click Send.
2. Watch the agent logs: the message is routed back to the whistleblower using `{{profile.verified_contacts.phone.value}}`. The journalist and agent logs contain no trace of the whistleblower's phone number.
