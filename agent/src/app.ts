import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { runWasmContract, getEnclavePublicKeyJwk, ENCLAVE_ISSUER_DID } from './lib/wasmRunner';
import { readDb, clearDb, initDb, getStash, updateDb, setOtp, getOtp, setActiveOtp } from './lib/db';

const app = express();

// Restrict CORS to the known UI origin(s) so an arbitrary website the user
// visits cannot drive-by call this API (CSRF/exfiltration). Configure with
// CORS_ORIGIN (comma-separated) — defaults to the local UI dev server.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '50mb' }));

// Mock backdoor OTP codes and the debug OTP echo are only allowed outside prod.
const nonProd = () => process.env.NODE_ENV !== 'production';

// Optional bearer-token guard for sensitive admin/seed routes. If ADMIN_TOKEN is
// unset (local demo) it is a no-op; set it in production to lock these down.
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next();
  if (req.headers.authorization === `Bearer ${token}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

initDb();

// Endpoints mapping to WASM TEE Contract

// 1. Create drop session
app.post('/api/drop/open', async (req, res) => {
  try {
    const { outlet } = req.body;
    if (!outlet) {
      return res.status(400).json({ error: 'Outlet ID is required' });
    }

    console.log(`[Agent] open-drop request received for outlet: ${outlet}`);
    // Crypto-random, unguessable session suffix (used as the bearer session token).
    const nonce = crypto.randomBytes(12).toString('hex');
    const result = await runWasmContract('open_drop', { outletId: outlet, nonce });

    if (result.error) {
      return res.status(400).json(result);
    }

    // Generate a per-session OTP (cryptographically random) bound to this session.
    const otp = crypto.randomInt(100000, 1000000).toString(); // 6 digit OTP
    setOtp(result.sessionId, otp);

    console.log(`[Agent] open-drop session created: ${result.sessionId}`);

    res.json({
      ...result,
      // The OTP is only echoed back outside production (no real SMS in the sandbox).
      ...(nonProd() ? { debugOtp: otp } : {})
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Attach evidence blob to stash and hash
app.post('/api/drop/attach', async (req, res) => {
  try {
    const { session, fileBase64, declaredHash } = req.body;
    if (!session || fileBase64 === undefined || !declaredHash) {
      return res.status(400).json({ error: 'Missing session, fileBase64, or declaredHash' });
    }

    console.log(`[Agent] attach-evidence request received for session: ${session}`);
    const result = await runWasmContract('attach_evidence', {
      sessionId: session,
      fileBase64,
      declaredHash
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Verify source OTP
app.post('/api/drop/verify', async (req, res) => {
  try {
    const { session, otp } = req.body;
    if (!session || !otp) {
      return res.status(400).json({ error: 'Missing session or otp' });
    }

    console.log(`[Agent] verify-source request for session: ${session}`);
    // Bind verification to THIS session: align the enclave challenge with the
    // OTP that was issued for this specific session, so a code issued for one
    // session cannot be replayed to verify another.
    const expected = getOtp(session);
    if (expected !== null) {
      setActiveOtp(expected);
    }
    const result = await runWasmContract('verify_source', {
      sessionId: session,
      otpCode: otp
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Dispatch report
app.post('/api/drop/dispatch', async (req, res) => {
  try {
    const { session } = req.body;
    if (!session) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    console.log(`[Agent] submit-report request received for session: ${session}`);
    const result = await runWasmContract('submit_report', {
      sessionId: session
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Get conversation thread
app.get('/api/drop/thread', async (req, res) => {
  try {
    const { session } = req.query;
    if (!session) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const result = await runWasmContract('get_thread', {
      sessionId: session as string
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Post message to thread (anonymous relay)
app.post('/api/drop/relay', async (req, res) => {
  try {
    const { session, message, sender } = req.body;
    if (!session || !message || !sender) {
      return res.status(400).json({ error: 'Missing session, message, or sender' });
    }

    console.log(`[Agent] relay-message request received for session: ${session}, sender: ${sender}`);
    const result = await runWasmContract('relay_message', {
      sessionId: session,
      message,
      sender
    });

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Seeding and Admin endpoints for testing and dashboard use

// Seed route to register media outlets
app.post('/api/seed/media', requireAdmin, (req, res) => {
  const outlet = req.body;
  if (!outlet || !outlet.id) {
    return res.status(400).json({ error: 'Invalid media outlet schema' });
  }

  updateDb((db) => {
    db.mediaOutlets = db.mediaOutlets.filter((x) => x.id !== outlet.id);
    db.mediaOutlets.push(outlet);
  });
  res.json({ success: true });
});

// Seed route to register user profiles
app.post('/api/seed/profile', requireAdmin, (req, res) => {
  const { did, profile } = req.body;
  if (!did || !profile) {
    return res.status(400).json({ error: 'Invalid profile seed schema' });
  }

  updateDb((db) => { db.profiles[did] = profile; });
  res.json({ success: true });
});

// Admin endpoint to retrieve all dispatched reports. Bodies are stored with the
// contact already redacted, so this returns no source PII.
app.get('/api/admin/reports', (req, res) => {
  const db = readDb();
  res.json({ reports: db.dispatchedReports });
});

// Admin endpoint to download raw stash file bytes (for integrity checks)
app.get('/api/admin/download', requireAdmin, (req, res) => {
  const { ref } = req.query;
  if (!ref) {
    return res.status(400).json({ error: 'Stash reference required' });
  }
  const fileBase64 = getStash(ref as string);
  if (fileBase64 === null) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.json({ fileBase64 });
});

// Enclave public key so journalists/CLI can verify the EdDSA manifest signature.
app.get('/api/enclave/pubkey', (req, res) => {
  res.json({ issuer: ENCLAVE_ISSUER_DID, alg: 'EdDSA', publicKeyJwk: getEnclavePublicKeyJwk() });
});

// Endpoint to fetch current DB state (for the dashboard/telemetry). Sensitive
// fields (contact profiles, OTP challenges) are redacted before leaving the agent.
app.get('/api/seed', (req, res) => {
  const db = readDb();
  const safe = {
    ...db,
    profiles: Object.fromEntries(Object.keys(db.profiles).map((k) => [k, { redacted: true }])),
    otps: {},
    activeOtp: null
  };
  res.json(safe);
});

// Reset endpoint
app.post('/api/admin/reset', requireAdmin, (req, res) => {
  clearDb();
  res.json({ success: true });
});

export { app };
