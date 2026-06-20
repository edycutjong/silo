# Silo TEE Contract

Rust WASM contract implementing the zero-knowledge whistleblower drop core logic, running within a hardware-isolated secure enclave.

## Contract Exports

| Export | Description |
|---|---|
| `open_drop` | Initializes a new whistleblower submission session in the enclave's memory boundary. |
| `attach_evidence` | Attaches a document or media file to the session, computing its SHA-256 hash inside the enclave. |
| `verify_source` | Calls the `otp_verify` host API to confirm human verification without storing credentials. |
| `submit_report` | Seals the drop evidence in the enclave stash, signs the report manifest VC, and issues a pseudonym. |
| `relay_message` | Evaluates message sender status and blinds the destination details using `http-with-placeholders`. |
| `get_thread` | Fetches the chronological history of messages for the session from the enclave's KV store. |

## Build and Testing

### Compilation Target

The contract compiles to `wasm32-unknown-unknown` WASM target, which represents the secure guest runtime.

```bash
# Compile the contract to WASM release
cargo build --target wasm32-unknown-unknown --release

# Run Rust unit tests
cargo test
```

## Security Guarantees

1. **Identity Blinding**: Plaintext phone numbers and email addresses are verified inside the enclave volatile memory and immediately scrubbed, never written to disk or the untrusted host.
2. **Tamper-Evident Evidence**: File hashes are generated inside the enclave boundary before storage, rendering any host tampering immediately detectable by verification clients.
