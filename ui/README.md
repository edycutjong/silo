# Silo Dashboard UI

Next.js 14 interactive dashboard for the Zero-Knowledge Whistleblower Drop. It implements both sides of the submission pipeline: the Whistleblower Secure Drop Panel (anonymous uploads and OTP validation) and the Journalist Console (tamper checks and blind chat relay).

## Structure & Layout

The dashboard is built as a single-page web console with three main sections:

1. **Whistleblower Portal**
    - Anonymous document uploader with client-side drag-and-drop.
    - OTP verification challenge form (shields user identifiers).
    - Session pseudonym display and key card download.

2. **Journalist Panel**
    - Inbox of reports.
    - Cryptographic validation dashboard showing document SHA-256 integrity checks.
    - Two-way blind chat interface.

3. **Telemetry Console**
    - Split-screen visual trace showing host coordinator logs vs. inside-enclave operations.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI Components**: React 18, Lucide React Icons
- **Styling**: Tailwind CSS
- **Testing**: Playwright E2E testing framework, Lighthouse CI

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run Playwright E2E tests
npx playwright test
```
