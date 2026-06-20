# Security Policy

## Supported Versions

Silo is currently in active development. We actively monitor and maintain the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of Silo seriously, especially given its role as a zero-knowledge whistleblower drop managing whistleblower anonymity, tamper-evident logs, and secure report dispatches inside Intel TDX enclaves.

If you discover a security vulnerability within Silo, please do not disclose it publicly. Instead, follow these steps to report it responsibly:

1. Go to the [Security Advisories](../../security/advisories) tab on GitHub.
2. Click **Report a vulnerability**.
3. Provide a detailed description of the vulnerability, including steps to reproduce it, potential impact on whistleblower anonymity, SHA-256 evidence validation, OTP contact verification, or secure chat relay.

We will acknowledge receipt of your vulnerability report within 48 hours and strive to resolve the issue responsibly.

## Scope

The following areas are in scope for security reports:
- The Rust TEE contract (`contract/`)
- The Node.js Coordinator Agent (`agent/`)
- The Silo Console Next.js dashboard (`ui/`)
- The T3 Host API mocks and integration scripts

Thank you for helping keep Silo secure!
