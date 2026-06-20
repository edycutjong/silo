import express from 'express';
import cors from 'cors';
import { runWasmContract } from './lib/wasmRunner';
import { readDb, writeDb, clearDb, initDb, getStash } from './lib/db';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
    const result = await runWasmContract('open_drop', { outletId: outlet });
    
    if (result.error) {
      return res.status(400).json(result);
    }

    // Generate active OTP and save to database for validation
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP
    const db = readDb();
    db.activeOtp = otp;
    writeDb(db);

    console.log(`[Agent] Generated active OTP code for session ${result.sessionId}: ${otp}`);
    
    res.json({
      ...result,
      debugOtp: otp // Returned for easy testing in mock UI
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

    console.log(`[Agent] verify-source request received for session: ${session}, code: ${otp}`);
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
app.post('/api/seed/media', (req, res) => {
  const db = readDb();
  const outlet = req.body;
  if (!outlet || !outlet.id) {
    return res.status(400).json({ error: 'Invalid media outlet schema' });
  }
  
  db.mediaOutlets = db.mediaOutlets.filter(x => x.id !== outlet.id);
  db.mediaOutlets.push(outlet);
  writeDb(db);
  res.json({ success: true });
});

// Seed route to register user profiles
app.post('/api/seed/profile', (req, res) => {
  const db = readDb();
  const { did, profile } = req.body;
  if (!did || !profile) {
    return res.status(400).json({ error: 'Invalid profile seed schema' });
  }
  
  db.profiles[did] = profile;
  writeDb(db);
  res.json({ success: true });
});

// Admin endpoint to retrieve all dispatched reports
app.get('/api/admin/reports', (req, res) => {
  const db = readDb();
  res.json({ reports: db.dispatchedReports });
});

// Admin endpoint to download raw stash file bytes (for integrity checks)
app.get('/api/admin/download', (req, res) => {
  const { ref } = req.query;
  if (!ref) {
    return res.status(400).json({ error: 'Stash reference required' });
  }
  const fileBase64 = getStash(ref as string);
  if (!fileBase64) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.json({ fileBase64 });
});

// Endpoint to fetch current DB state (for debugging)
app.get('/api/seed', (req, res) => {
  const db = readDb();
  res.json(db);
});

// Reset endpoint
app.post('/api/admin/reset', (req, res) => {
  clearDb();
  res.json({ success: true });
});

export { app };
