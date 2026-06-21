import fs from 'fs';
import path from 'path';

// Setup fs spies before importing db or app to cover top-level parsing and initDb folder creation
const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;

const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
  const pathStr = p.toString();
  if (pathStr.endsWith('.env')) {
    return true;
  }
  if (pathStr.endsWith('data') && !pathStr.includes('db.json')) {
    return false;
  }
  return originalExistsSync(p);
});

const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((p: any, options: any) => {
  const pathStr = p.toString();
  if (pathStr.endsWith('.env')) {
    if (pathStr.includes('agent')) {
      return 'DID=did:t3n:mock_user_agent\nDEFAULT_PROFILE_FIRST_NAME=MockAgent\nDEFAULT_PROFILE_EMAIL=mock_agent@test.com';
    } else {
      return 'DID=did:t3n:mock_user_silo\nDEFAULT_PROFILE_FIRST_NAME=MockSilo\nDEFAULT_PROFILE_EMAIL=mock_silo@test.com';
    }
  }
  return originalReadFileSync(p, options);
});

// Import modules now that mock spies are active
import request from 'supertest';
import { app } from '../app';
import * as db from '../lib/db';
import * as wasmRunner from '../lib/wasmRunner';

// Restore spies for normal file operations
existsSyncSpy.mockRestore();
readFileSyncSpy.mockRestore();

let capturedImportObject: any = null;
let capturedInstance: any = null;
const originalInstantiate = WebAssembly.instantiate;

jest.spyOn(WebAssembly, 'instantiate').mockImplementation(async (bytes, importObject) => {
  capturedImportObject = importObject;
  const result = await originalInstantiate(bytes, importObject);
  capturedInstance = (result as any).instance;
  return result;
});

describe('Silo Agent Test Suite (100% Coverage)', () => {
  beforeEach(async () => {
    // Reset database before each test
    await request(app).post('/api/admin/reset').expect(200);
  });

  afterAll(async () => {
    // Clean up
    await request(app).post('/api/admin/reset').expect(200);
  });

  // --- 1. Database and Environment Coverage Tests ---

  test('db.ts env loading: cover envPath branch', () => {
    jest.resetModules();
    
    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('.env')) {
        // Force localEnvPath (which has agent in it) to be false, but envPath (no agent) to be true
        if (pathStr.includes('agent')) {
          return false;
        }
        return true;
      }
      return originalExistsSync(p);
    });

    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((p: any, options: any) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('.env') && !pathStr.includes('agent')) {
        return 'DID=did:t3n:mock_user_parent\nDEFAULT_PROFILE_FIRST_NAME=MockParent';
      }
      return originalReadFileSync(p, options);
    });

    // Re-require db.ts to trigger top-level parsing of envPath (line 12)
    const localDb = require('../lib/db');
    localDb.initDb();
    
    existsSpy.mockRestore();
    readSpy.mockRestore();
  });

  test('db.ts edge cases: invalid JSON parsing in readDb', () => {
    const DB_PATH = path.resolve(process.cwd(), 'data/db.json');
    fs.writeFileSync(DB_PATH, 'invalid { json }');
    const data = db.readDb();
    expect(data.kv).toEqual({});
  });

  test('db.ts edge cases: activeDid environment check and initDb', () => {
    process.env.DID = 'did:t3n:another_user';
    process.env.DEFAULT_PROFILE_FIRST_NAME = 'Jane';
    process.env.DEFAULT_PROFILE_EMAIL = 'jane@test.org';
    db.clearDb(); // will trigger initDb with process.env values
    
    const data = db.readDb();
    expect(data.profiles['did:t3n:another_user']).toBeDefined();
    expect(data.profiles['did:t3n:another_user'].first_name).toBe('Jane User');
    expect(data.profiles['did:t3n:another_user'].verified_contacts.email.value).toBe('jane@test.org');

    // Reset env
    delete process.env.DID;
    delete process.env.DEFAULT_PROFILE_FIRST_NAME;
    delete process.env.DEFAULT_PROFILE_EMAIL;
    db.clearDb();
  });

  test('db.ts edge cases: get/set helpers', () => {
    db.setKv('test-key', 'test-value');
    expect(db.getKv('test-key')).toBe('test-value');
    expect(db.getKv('nonexistent-key')).toBeNull();

    db.setStash('stash://test-ref', 'test-data');
    expect(db.getStash('stash://test-ref')).toBe('test-data');
    expect(db.getStash('stash://nonexistent')).toBeNull();
  });

  test('db.ts edge cases: clearDb when file does not exist', () => {
    db.clearDb();
    const DB_PATH = path.resolve(process.cwd(), 'data/db.json');
    expect(fs.existsSync(DB_PATH)).toBe(true);
    
    fs.unlinkSync(DB_PATH);
    expect(fs.existsSync(DB_PATH)).toBe(false);
    db.clearDb();
    expect(fs.existsSync(DB_PATH)).toBe(true);
  });

  // --- 2. Express Route Tests ---

  test('POST /api/drop/open success', async () => {
    const res = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' })
      .expect(200);
    
    expect(res.body.success).toBe(true);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.debugOtp).toHaveLength(6);
  });

  test('POST /api/drop/open missing outlet', async () => {
    const res = await request(app)
      .post('/api/drop/open')
      .send({})
      .expect(400);
    
    expect(res.body.error).toBe('Outlet ID is required');
  });

  test('POST /api/drop/open WASM error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockResolvedValueOnce({ error: 'Mocked WASM Error' });
    const res = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' })
      .expect(400);
    
    expect(res.body.error).toBe('Mocked WASM Error');
  });

  test('POST /api/drop/open catch 500 error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockRejectedValueOnce(new Error('Internal Server Error'));
    const res = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' })
      .expect(500);
    
    expect(res.body.error).toBe('Internal Server Error');
  });

  test('POST /api/drop/attach success', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });
    
    const res = await request(app)
      .post('/api/drop/attach')
      .send({
        session: openRes.body.sessionId,
        fileBase64: 'aGVsbG8=',
        declaredHash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      })
      .expect(200);
    
    expect(res.body.success).toBe(true);
  });

  test('POST /api/drop/attach missing params', async () => {
    const res = await request(app)
      .post('/api/drop/attach')
      .send({ session: 'session-id' })
      .expect(400);
    
    expect(res.body.error).toBe('Missing session, fileBase64, or declaredHash');
  });

  test('POST /api/drop/attach WASM error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockResolvedValueOnce({ error: 'Mocked WASM Error' });
    const res = await request(app)
      .post('/api/drop/attach')
      .send({ session: 'session-id', fileBase64: '', declaredHash: 'hash' })
      .expect(400);
    
    expect(res.body.error).toBe('Mocked WASM Error');
  });

  test('POST /api/drop/attach catch 500 error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockRejectedValueOnce(new Error('Wasm Crash'));
    const res = await request(app)
      .post('/api/drop/attach')
      .send({ session: 'session-id', fileBase64: '', declaredHash: 'hash' })
      .expect(500);
    
    expect(res.body.error).toBe('Wasm Crash');
  });

  test('POST /api/drop/verify success', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    const res = await request(app)
      .post('/api/drop/verify')
      .send({ session: openRes.body.sessionId, otp: '883391' })
      .expect(200);
    
    expect(res.body.success).toBe(true);
  });

  test('POST /api/drop/verify incorrect OTP', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    const res = await request(app)
      .post('/api/drop/verify')
      .send({ session: openRes.body.sessionId, otp: '999999' })
      .expect(400);
    
    expect(res.body.error).toBe('OTP Verification Failed');
  });

  test('POST /api/drop/verify missing params', async () => {
    const res = await request(app)
      .post('/api/drop/verify')
      .send({ session: 'session-id' })
      .expect(400);
    
    expect(res.body.error).toBe('Missing session or otp');
  });

  test('POST /api/drop/verify WASM error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockResolvedValueOnce({ error: 'Mocked WASM Error' });
    const res = await request(app)
      .post('/api/drop/verify')
      .send({ session: 'session-id', otp: '123456' })
      .expect(400);
    
    expect(res.body.error).toBe('Mocked WASM Error');
  });

  test('POST /api/drop/verify catch 500 error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockRejectedValueOnce(new Error('Wasm Crash'));
    const res = await request(app)
      .post('/api/drop/verify')
      .send({ session: 'session-id', otp: '123456' })
      .expect(500);
    
    expect(res.body.error).toBe('Wasm Crash');
  });

  test('POST /api/drop/dispatch success', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    await request(app)
      .post('/api/drop/attach')
      .send({
        session: openRes.body.sessionId,
        fileBase64: 'aGVsbG8=',
        declaredHash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      });

    await request(app)
      .post('/api/drop/verify')
      .send({ session: openRes.body.sessionId, otp: '883391' });

    const res = await request(app)
      .post('/api/drop/dispatch')
      .send({ session: openRes.body.sessionId })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('dispatched');
  });

  test('POST /api/drop/dispatch missing session', async () => {
    const res = await request(app)
      .post('/api/drop/dispatch')
      .send({})
      .expect(400);
    
    expect(res.body.error).toBe('Session ID is required');
  });

  test('POST /api/drop/dispatch WASM error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockResolvedValueOnce({ error: 'Mocked WASM Error' });
    const res = await request(app)
      .post('/api/drop/dispatch')
      .send({ session: 'session-id' })
      .expect(400);
    
    expect(res.body.error).toBe('Mocked WASM Error');
  });

  test('POST /api/drop/dispatch catch 500 error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockRejectedValueOnce(new Error('Wasm Crash'));
    const res = await request(app)
      .post('/api/drop/dispatch')
      .send({ session: 'session-id' })
      .expect(500);
    
    expect(res.body.error).toBe('Wasm Crash');
  });

  test('GET /api/drop/thread success', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    const res = await request(app)
      .get(`/api/drop/thread?session=${openRes.body.sessionId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.thread).toBeDefined();
  });

  test('GET /api/drop/thread missing session', async () => {
    const res = await request(app)
      .get('/api/drop/thread')
      .expect(400);
    
    expect(res.body.error).toBe('Session ID is required');
  });

  test('GET /api/drop/thread WASM error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockResolvedValueOnce({ error: 'Mocked WASM Error' });
    const res = await request(app)
      .get('/api/drop/thread?session=session-id')
      .expect(400);
    
    expect(res.body.error).toBe('Mocked WASM Error');
  });

  test('GET /api/drop/thread catch 500 error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockRejectedValueOnce(new Error('Wasm Crash'));
    const res = await request(app)
      .get('/api/drop/thread?session=session-id')
      .expect(500);
    
    expect(res.body.error).toBe('Wasm Crash');
  });

  test('POST /api/drop/relay success', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    const res = await request(app)
      .post('/api/drop/relay')
      .send({ session: openRes.body.sessionId, message: 'Hello', sender: 'source' })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  test('POST /api/drop/relay missing params', async () => {
    const res = await request(app)
      .post('/api/drop/relay')
      .send({ session: 'session-id' })
      .expect(400);
    
    expect(res.body.error).toBe('Missing session, message, or sender');
  });

  test('POST /api/drop/relay WASM error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockResolvedValueOnce({ error: 'Mocked WASM Error' });
    const res = await request(app)
      .post('/api/drop/relay')
      .send({ session: 'session-id', message: 'Hello', sender: 'source' })
      .expect(400);
    
    expect(res.body.error).toBe('Mocked WASM Error');
  });

  test('POST /api/drop/relay catch 500 error', async () => {
    jest.spyOn(wasmRunner, 'runWasmContract').mockRejectedValueOnce(new Error('Wasm Crash'));
    const res = await request(app)
      .post('/api/drop/relay')
      .send({ session: 'session-id', message: 'Hello', sender: 'source' })
      .expect(500);
    
    expect(res.body.error).toBe('Wasm Crash');
  });

  test('POST /api/seed/media success and validation', async () => {
    const res = await request(app)
      .post('/api/seed/media')
      .send({ id: 'test-outlet', host: 'https://test.host', path: '/path', method: 'POST' })
      .expect(200);
    
    expect(res.body.success).toBe(true);

    const failRes = await request(app)
      .post('/api/seed/media')
      .send({})
      .expect(400);

    expect(failRes.body.error).toBe('Invalid media outlet schema');
  });

  test('POST /api/seed/profile success and validation', async () => {
    const res = await request(app)
      .post('/api/seed/profile')
      .send({ did: 'did:t3n:user', profile: { name: 'User' } })
      .expect(200);
    
    expect(res.body.success).toBe(true);

    const failRes = await request(app)
      .post('/api/seed/profile')
      .send({})
      .expect(400);

    expect(failRes.body.error).toBe('Invalid profile seed schema');
  });

  test('GET /api/admin/download success and validation', async () => {
    const openRes = await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });
    
    const attachRes = await request(app)
      .post('/api/drop/attach')
      .send({
        session: openRes.body.sessionId,
        fileBase64: 'aGVsbG8=',
        declaredHash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      });

    const res = await request(app)
      .get(`/api/admin/download?ref=${encodeURIComponent(attachRes.body.stashRef)}`)
      .expect(200);
    
    expect(res.body.fileBase64).toBe('aGVsbG8=');

    const missingRefRes = await request(app)
      .get('/api/admin/download')
      .expect(400);

    expect(missingRefRes.body.error).toBe('Stash reference required');

    const notFoundRes = await request(app)
      .get('/api/admin/download?ref=stash://nonexistent')
      .expect(404);

    expect(notFoundRes.body.error).toBe('File not found');
  });

  test('GET /api/seed and GET /api/admin/reports', async () => {
    const res = await request(app).get('/api/seed').expect(200);
    expect(res.body.kv).toBeDefined();

    const reportsRes = await request(app).get('/api/admin/reports').expect(200);
    expect(reportsRes.body.reports).toBeDefined();
  });

  // --- 3. WebAssembly Runner Error Paths and Host Functions ---

  test('WasmRunner: WebAssembly binary not found throws error', async () => {
    const originalExistsSync = fs.existsSync;
    jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      if (p.toString().includes('silo_contract.wasm')) {
        return false;
      }
      return originalExistsSync(p);
    });

    await expect(wasmRunner.runWasmContract('open_drop', { outletId: 'newsroom-main' }))
      .rejects.toThrow('WebAssembly binary not found');

    jest.restoreAllMocks();
  });

  test('WasmRunner: export not found in WASM throws error', async () => {
    await expect(wasmRunner.runWasmContract('nonexistent_function' as any, {}))
      .rejects.toThrow('Exported function nonexistent_function not found in WebAssembly');
  });

  test('WasmRunner Host Functions: host_stash_get coverage', async () => {
    // Run any valid function first to compile/instantiate and capture importObject/wasmMemory
    await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    expect(capturedImportObject).toBeDefined();
    expect(capturedInstance).toBeDefined();
    
    // Set up a mock memory buffer and call host_stash_get
    const env = capturedImportObject.env;
    
    // Store test stash entry
    db.setStash('stash://test-ref', Buffer.from('hello').toString('base64'));

    const wasmMemory = capturedInstance.exports.memory as WebAssembly.Memory;
    const buffer = new Uint8Array(wasmMemory.buffer);
    const encoder = new TextEncoder();
    
    // Write reference string at offset 0
    const refString = 'stash://test-ref';
    const refBytes = encoder.encode(refString);
    buffer.set(refBytes, 0);

    // Call host_stash_get: reference at pointer 0, length, target buffer at pointer 100, length 50
    const writeLen = env.host_stash_get(0, refBytes.length, 100, 50);
    expect(writeLen).toBe(5);

    const decoder = new TextDecoder();
    const resultString = decoder.decode(new Uint8Array(wasmMemory.buffer, 100, 5));
    expect(resultString).toBe('hello');

    // Test error case: reference not found
    const invalidRefString = 'stash://invalid';
    const invalidBytes = encoder.encode(invalidRefString);
    buffer.set(invalidBytes, 200);

    const errResult = env.host_stash_get(200, invalidBytes.length, 300, 50);
    expect(errResult).toBe(-1);
  });

  test('WasmRunner Host Functions: host_otp_verify branch coverage', async () => {
    await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    expect(capturedImportObject).toBeDefined();
    expect(capturedInstance).toBeDefined();

    const env = capturedImportObject.env;
    const wasmMemory = capturedInstance.exports.memory as WebAssembly.Memory;
    const buffer = new Uint8Array(wasmMemory.buffer);
    const encoder = new TextEncoder();

    const callOtpVerify = (code: string) => {
      const codeBytes = encoder.encode(code);
      buffer.set(codeBytes, 0);
      return env.host_otp_verify(0, codeBytes.length);
    };

    // Test with active OTP
    const database = db.readDb();
    database.activeOtp = '123456';
    db.writeDb(database);
    expect(callOtpVerify('123456')).toBe(1);

    // Test with custom MOCK_OTP_CODES env variable
    process.env.MOCK_OTP_CODES = '777777,888888';
    expect(callOtpVerify('777777')).toBe(1);
    expect(callOtpVerify('123456')).toBe(1); // still active OTP
    expect(callOtpVerify('999999')).toBe(0);

    delete process.env.MOCK_OTP_CODES;
  });

  test('WasmRunner Host Functions: host_http_with_placeholders_post branch coverage', async () => {
    // Run open_drop to ensure capturedImportObject is populated
    await request(app)
      .post('/api/drop/open')
      .send({ outlet: 'newsroom-main' });

    expect(capturedImportObject).toBeDefined();
    expect(capturedInstance).toBeDefined();

    const env = capturedImportObject.env;
    const wasmMemory = capturedInstance.exports.memory as WebAssembly.Memory;
    const buffer = new Uint8Array(wasmMemory.buffer);
    const encoder = new TextEncoder();

    const callPost = (url: string, body: string) => {
      const urlBytes = encoder.encode(url);
      const bodyBytes = encoder.encode(body);
      
      // Write url to memory at pointer 0
      buffer.set(urlBytes, 0);
      // Write body to memory at pointer 1000
      buffer.set(bodyBytes, 1000);

      // Call: url at 0, len; body at 1000, len; response buffer at 2000, len 500
      return env.host_http_with_placeholders_post(0, urlBytes.length, 1000, bodyBytes.length, 2000, 500);
    };

    // Scenario A: Profile is completely missing, and DEFAULT_PROFILE_EMAIL / DEFAULT_PROFILE_FIRST_NAME are missing
    const database = db.readDb();
    database.profiles = {};
    db.writeDb(database);
    
    // Clear env defaults if any
    const origFirstName = process.env.DEFAULT_PROFILE_FIRST_NAME;
    const origEmail = process.env.DEFAULT_PROFILE_EMAIL;
    delete process.env.DEFAULT_PROFILE_FIRST_NAME;
    delete process.env.DEFAULT_PROFILE_EMAIL;

    let resLen = callPost('https://test.url', '{{profile.first_name}} {{profile.verified_contacts.email.value}}');
    expect(resLen).toBeGreaterThan(0);

    // Restore env
    process.env.DEFAULT_PROFILE_FIRST_NAME = origFirstName;
    process.env.DEFAULT_PROFILE_EMAIL = origEmail;

    // Scenario B: Profile is present but verified_contacts is missing completely
    const database2 = db.readDb();
    database2.profiles['did:t3n:whistleblower123'] = {
      first_name: 'Jane'
      // verified_contacts is missing
    };
    db.writeDb(database2);

    resLen = callPost('https://test.url', '{{profile.first_name}} {{profile.verified_contacts.email.value}}');
    expect(resLen).toBeGreaterThan(0);

    // Scenario C: Profile has verified_contacts as an empty object
    const database3 = db.readDb();
    database3.profiles['did:t3n:whistleblower123'] = {
      first_name: 'Jane',
      verified_contacts: {}
    };
    db.writeDb(database3);

    resLen = callPost('https://test.url', '{{profile.first_name}} {{profile.verified_contacts.email.value}}');
    expect(resLen).toBeGreaterThan(0);

    // Scenario D: Profile has verified_contacts.email, but value is missing
    const database4 = db.readDb();
    database4.profiles['did:t3n:whistleblower123'] = {
      first_name: 'Jane',
      verified_contacts: {
        email: {}
      }
    };
    db.writeDb(database4);

    resLen = callPost('https://test.url', '{{profile.first_name}} {{profile.verified_contacts.email.value}}');
    expect(resLen).toBeGreaterThan(0);

    // Scenario E: Profile has verified_contacts.email, but value is missing AND process.env.DEFAULT_PROFILE_EMAIL is deleted
    const database5 = db.readDb();
    database5.profiles['did:t3n:whistleblower123'] = {
      first_name: 'Jane',
      verified_contacts: {
        email: {}
      }
    };
    db.writeDb(database5);
    delete process.env.DEFAULT_PROFILE_EMAIL;

    resLen = callPost('https://test.url', '{{profile.first_name}} {{profile.verified_contacts.email.value}}');
    expect(resLen).toBeGreaterThan(0);

    // Cover the per-session sessionId parse branches:
    resLen = callPost('https://test.url', 'null'); // valid JSON but falsy -> no sessionId
    expect(resLen).toBeGreaterThan(0);
    resLen = callPost('https://test.url', JSON.stringify({ foo: 1 })); // JSON object, no sessionId
    expect(resLen).toBeGreaterThan(0);
    resLen = callPost('https://test.url', JSON.stringify({ sessionId: 'drop-x' })); // JSON with sessionId
    expect(resLen).toBeGreaterThan(0);

    // Restore process.env
    process.env.DEFAULT_PROFILE_EMAIL = origEmail;
  });

  test('db.loadEnv edge cases', () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('test-local.env')) {
        return true;
      }
      if (pathStr.endsWith('test-parent.env')) {
        return true;
      }
      return originalExistsSync(p);
    });

    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((p: any, options: any) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('test-local.env')) {
        return '# Comment line\n\nINVALID_LINE_NO_EQUALS\nTEST_EXISTING_KEY=new_val\nTEST_NEW_KEY=new_val';
      }
      if (pathStr.endsWith('test-parent.env')) {
        return 'PARENT_KEY=parent_val';
      }
      return originalReadFileSync(p, options);
    });

    process.env.TEST_EXISTING_KEY = 'old_val';

    // Call loadEnv with localPath to cover comments, empty lines, no equals, and already-defined keys
    db.loadEnv('test-local.env', 'test-parent.env');
    expect(process.env.TEST_EXISTING_KEY).toBe('old_val'); // not overwritten
    expect(process.env.TEST_NEW_KEY).toBe('new_val');

    // Call loadEnv where localPath is missing to cover the parentPath branch (else if)
    existsSpy.mockImplementation((p: any) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('test-local.env')) {
        return false;
      }
      if (pathStr.endsWith('test-parent.env')) {
        return true;
      }
      return originalExistsSync(p);
    });

    db.loadEnv('test-local.env', 'test-parent.env');
    expect(process.env.PARENT_KEY).toBe('parent_val');

    // Call loadEnv where both are missing
    existsSpy.mockImplementation((p: any) => {
      const pathStr = p.toString();
      if (pathStr.endsWith('test-local.env') || pathStr.endsWith('test-parent.env')) {
        return false;
      }
      return originalExistsSync(p);
    });
    db.loadEnv('test-local.env', 'test-parent.env');

    // Test error case inside try-catch block by making existsSync throw
    existsSpy.mockImplementation(() => {
      throw new Error('Disk read error');
    });
    // This should not throw because db.loadEnv catches all errors internally
    expect(() => db.loadEnv('test-local.env', 'test-parent.env')).not.toThrow();

    // Clean up
    delete process.env.TEST_EXISTING_KEY;
    delete process.env.TEST_NEW_KEY;
    delete process.env.PARENT_KEY;
    existsSpy.mockRestore();
    readSpy.mockRestore();
  });

  test('db.ts edge cases: initDb with activeDid and deleted env defaults', () => {
    process.env.DID = 'did:t3n:fallback_user';
    const origFirstName = process.env.DEFAULT_PROFILE_FIRST_NAME;
    const origEmail = process.env.DEFAULT_PROFILE_EMAIL;
    delete process.env.DEFAULT_PROFILE_FIRST_NAME;
    delete process.env.DEFAULT_PROFILE_EMAIL;

    db.clearDb(); // will run initDb where activeDid is 'did:t3n:fallback_user' and process.env options are missing

    const data = db.readDb();
    expect(data.profiles['did:t3n:fallback_user']).toBeDefined();
    expect(data.profiles['did:t3n:fallback_user'].first_name).toBe('Anonymous User');
    expect(data.profiles['did:t3n:fallback_user'].verified_contacts.email.value).toBe('whistleblower@hospital-safety.org');

    // Restore env & db
    process.env.DEFAULT_PROFILE_FIRST_NAME = origFirstName;
    process.env.DEFAULT_PROFILE_EMAIL = origEmail;
    delete process.env.DID;
    db.clearDb();
  });

  // --- 4. Security hardening coverage ---

  test('requireAdmin enforces ADMIN_TOKEN when configured', async () => {
    process.env.ADMIN_TOKEN = 'secret-token';
    try {
      await request(app).post('/api/admin/reset').expect(401);
      await request(app).post('/api/admin/reset').set('Authorization', 'Bearer wrong').expect(401);
      await request(app).post('/api/admin/reset').set('Authorization', 'Bearer secret-token').expect(200);
    } finally {
      delete process.env.ADMIN_TOKEN;
    }
  });

  test('GET /api/enclave/pubkey returns the EdDSA public key', async () => {
    const res = await request(app).get('/api/enclave/pubkey').expect(200);
    expect(res.body.alg).toBe('EdDSA');
    expect(res.body.publicKeyJwk.kty).toBe('OKP');
  });

  test('GET /api/seed redacts contact profiles and OTPs', async () => {
    const openRes = await request(app).post('/api/drop/open').send({ outlet: 'newsroom-main' });
    expect(openRes.body.debugOtp).toHaveLength(6);

    const res = await request(app).get('/api/seed').expect(200);
    expect(res.body.activeOtp).toBeNull();
    expect(res.body.otps).toEqual({});
    for (const did of Object.keys(res.body.profiles)) {
      expect(res.body.profiles[did]).toEqual({ redacted: true });
    }
  });

  test('debugOtp is withheld in production', async () => {
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).post('/api/drop/open').send({ outlet: 'newsroom-main' }).expect(200);
      expect(res.body.debugOtp).toBeUndefined();
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  test('host_otp_verify rejects mock codes in production', async () => {
    await request(app).post('/api/drop/open').send({ outlet: 'newsroom-main' });
    const env = capturedImportObject.env;
    const wasmMemory = capturedInstance.exports.memory as WebAssembly.Memory;
    const buffer = new Uint8Array(wasmMemory.buffer);
    const encoder = new TextEncoder();
    const callOtpVerify = (code: string) => {
      const codeBytes = encoder.encode(code);
      buffer.set(codeBytes, 0);
      return env.host_otp_verify(0, codeBytes.length);
    };

    const database = db.readDb();
    database.activeOtp = '654321';
    db.writeDb(database);

    process.env.NODE_ENV = 'production';
    try {
      expect(callOtpVerify('883391')).toBe(0); // backdoor disabled in prod
      expect(callOtpVerify('654321')).toBe(1); // the real session OTP still works
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  test('readDb backfills otps for a legacy db.json without otps', () => {
    const DB_PATH = path.resolve(process.cwd(), 'data/db.json');
    fs.writeFileSync(DB_PATH, JSON.stringify({
      kv: {}, profiles: {}, mediaOutlets: [], dispatchedReports: [], stash: {}, activeOtp: null
    }));
    const data = db.readDb();
    expect(data.otps).toEqual({});
  });

  test('readDb backs up a corrupt db.json before falling back', () => {
    const DB_PATH = path.resolve(process.cwd(), 'data/db.json');
    fs.writeFileSync(DB_PATH, 'totally not json');
    const data = db.readDb();
    expect(data.kv).toEqual({});
    expect(fs.existsSync(`${DB_PATH}.corrupt`)).toBe(true);
    fs.unlinkSync(`${DB_PATH}.corrupt`);
  });

  test('enclave keys can be loaded from SILO_ENCLAVE_PRIVATE_KEY PEM', () => {
    jest.resetModules();
    const cryptoMod = require('crypto');
    const { privateKey } = cryptoMod.generateKeyPairSync('ed25519');
    process.env.SILO_ENCLAVE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    try {
      const wr = require('../lib/wasmRunner');
      const jwk = wr.getEnclavePublicKeyJwk();
      expect(jwk.kty).toBe('OKP');
    } finally {
      delete process.env.SILO_ENCLAVE_PRIVATE_KEY;
    }
  });
});
