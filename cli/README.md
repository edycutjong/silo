# Silo CLI Client 🛡️

Silo Command Line Interface client for zero-knowledge whistleblower drop submissions.

## Installation

```bash
cd cli
npm install
npm run build
npm link
```

## Commands

### 1. Open Session
Open a new whistleblower drop session:
```bash
silo open --outlet newsroom-main
```

### 2. Attach Evidence
Attach a PDF or log file as evidence:
```bash
silo attach --session <session-id> --file <path-to-file>
```

### 3. Verify Identity
Complete OTP verification:
```bash
silo verify --session <session-id> --otp <code>
```

### 4. Dispatch Report
Finalize and submit the report to the media outlet outbox:
```bash
silo dispatch --session <session-id>
```

### 5. Two-Way Secure Chat Relay
Send a message:
```bash
silo relay --session <session-id> --message "hello" --sender source
```

Fetch the thread logs:
```bash
silo thread --session <session-id>
```

## Testing

```bash
npm run test
```
