# Silo Coordinator Agent

TypeScript Express gateway that interfaces between the client dashboard and the secure enclave. It implements local database mocking and simulates the secure TEE enclave host APIs for the development environment.

## Architecture Role

The coordinator agent runs in an untrusted host context, routing requests to the secure enclave contract while remaining completely blind to the whistleblower's real-world identity (PII).
```mermaid
graph LR
    Client["Client UI (Browser)"] -- "Ciphertext Only" --> Agent["Coordinator Agent"]
    Agent -- "Ciphertext Only" --> TEE["TEE WASM Contract"]
    TEE -.-> Plaintext["Plaintext (Enclave-only)"]

    style Client fill:#0a0b0d,stroke:#06b6d4,stroke-width:2px,color:#fff
    style Agent fill:#0a0b0d,stroke:#ef4444,stroke-width:2px,color:#fff
    style TEE fill:#0a0b0d,stroke:#22c55e,stroke-width:2px,color:#fff
    style Plaintext fill:#0a0b0d,stroke:#22c55e,stroke-width:1px,stroke-dasharray: 5 5,color:#fff
```

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/drop/open` | Open a new secure drop session and register profile variables |
| `POST` | `/api/drop/attach` | Attach document evidence blobs to the active drop session |
| `POST` | `/api/drop/verify` | Submit and verify SMS OTP code without exposing caller details |
| `POST` | `/api/drop/dispatch` | Submit the finalized report, compiling evidence and signing VC |
| `GET` | `/api/drop/thread` | Retrieve the anonymous chat history for the session |
| `POST` | `/api/drop/relay` | Relay a blind chat message between journalist and whistleblower |
| `GET` | `/api/admin/reports` | Retrieve a list of submitted whistleblower reports |
| `GET` | `/api/admin/download` | Download encrypted evidence files from stash |
| `POST` | `/api/admin/reset` | Clear all database tables and reset active sessions |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Express server port |
| `DATABASE_URL` | *(mock json)* | Path to the local database file |
| `DID` | `did:t3n:whistleblower123` | Terminal 3 Tenant DID |
| `MOCK_OTP_CODES` | `883391,000000` | Comma-separated OTP fallback codes allowed for local verification |
| `DEFAULT_PROFILE_FIRST_NAME` | `Anonymous` | Default whistleblower persona first name |
| `DEFAULT_PROFILE_EMAIL` | `whistleblower@hospital-safety.org` | Default whistleblower persona contact email |
| `T3N_API_KEY` | *(none)* | Terminal 3 Developer API Key (Production deployments only) |
| `ENCLAVE_URL` | *(none)* | TEE enclave host sandbox URL (Production deployments only) |
| `ENCLAVE_PUB_KEY` | *(uncompressed)* | secp256k1 public key of the enclave |

### GitHub Actions Secrets & Variables

For CI/CD workflows and target deployments, the following values should be configured in your repository settings:

*   **Secrets** (`Repository Secrets`):
    *   `T3N_API_KEY`: Your Terminal 3 Developer API Key.
*   **Variables** (`Repository Variables`):
    *   `DID`: The target Tenant DID.
    *   `ENCLAVE_URL`: Enclave gateway URL.
    *   `MOCK_OTP_CODES`: OTP bypass codes for test runs.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run unit and integration tests
npm test
```
