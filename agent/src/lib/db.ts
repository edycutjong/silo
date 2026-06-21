import fs from 'fs';
import path from 'path';

// Parse .env if it exists
export function loadEnv(localPath = '.env', parentPath = '../.env') {
  try {
    const envPath = path.resolve(process.cwd(), parentPath);
    const localEnvPath = path.resolve(process.cwd(), localPath);
    let envContent = '';
    if (fs.existsSync(localEnvPath)) {
      envContent = fs.readFileSync(localEnvPath, 'utf8');
    } else if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    if (envContent) {
      const lines = envContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index > 0) {
          const key = trimmed.substring(0, index).trim();
          const value = trimmed.substring(index + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (e) {
    // Ignore env loading errors
  }
}

// Run on load
loadEnv();

const DB_PATH = path.resolve(process.cwd(), 'data/db.json');

export interface DbSchema {
  kv: Record<string, string>;
  profiles: Record<string, any>;
  mediaOutlets: any[];
  dispatchedReports: any[];
  stash: Record<string, string>; // maps stashRef -> base64 file data
  otps: Record<string, string>; // maps sessionId -> active OTP code (per-session)
  activeOtp: string | null; // legacy global OTP (kept for host_otp_verify compatibility)
}

export function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const activeDid = process.env.DID || 'did:t3n:whistleblower123';
    const initialDb: DbSchema = {
      kv: {},
      profiles: {
        'did:t3n:whistleblower123': {
          first_name: process.env.DEFAULT_PROFILE_FIRST_NAME || 'Anonymous',
          verified_contacts: {
            email: {
              value: process.env.DEFAULT_PROFILE_EMAIL || 'whistleblower@hospital-safety.org'
            }
          }
        },
        ...(activeDid !== 'did:t3n:whistleblower123' ? {
          [activeDid]: {
            first_name: (process.env.DEFAULT_PROFILE_FIRST_NAME || 'Anonymous') + ' User',
            verified_contacts: {
              email: {
                value: process.env.DEFAULT_PROFILE_EMAIL || 'whistleblower@hospital-safety.org'
              }
            }
          }
        } : {})
      },
      mediaOutlets: [
        {
          id: 'newsroom-main',
          host: 'https://newsroom.sandbox.test',
          path: '/inbox/submit',
          method: 'POST'
        }
      ],
      dispatchedReports: [],
      stash: {},
      otps: {},
      activeOtp: null
    };

    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2));
  }
}

export function readDb(): DbSchema {
  initDb();
  const content = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    // Defensive: ensure newer collections exist on DBs written by older versions.
    if (!parsed.otps) parsed.otps = {};
    return parsed;
  } catch (e) {
    // Corrupt file: preserve it for forensics instead of silently overwriting,
    // then fall back to an empty schema so the process keeps serving.
    fs.renameSync(DB_PATH, `${DB_PATH}.corrupt`);
    return { kv: {}, profiles: {}, mediaOutlets: [], dispatchedReports: [], stash: {}, otps: {}, activeOtp: null };
  }
}

// Atomic write: write to a temp file then rename, so a crash mid-write can never
// leave a half-written (corrupt) db.json behind.
export function writeDb(data: DbSchema) {
  initDb();
  const tmpPath = `${DB_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

// Safe read-modify-write. The mutator runs synchronously between read and write
// (no await), so concurrent requests cannot interleave and clobber each other.
export function updateDb(mutator: (db: DbSchema) => void): DbSchema {
  const db = readDb();
  mutator(db);
  writeDb(db);
  return db;
}

export function getKv(key: string): string | null {
  const db = readDb();
  // Use key-presence (not truthiness) so a legitimately empty value is returned.
  return Object.prototype.hasOwnProperty.call(db.kv, key) ? db.kv[key] : null;
}

export function setKv(key: string, value: string): void {
  updateDb((db) => { db.kv[key] = value; });
}

export function getStash(ref: string): string | null {
  const db = readDb();
  return Object.prototype.hasOwnProperty.call(db.stash, ref) ? db.stash[ref] : null;
}

export function setStash(ref: string, value: string): void {
  updateDb((db) => { db.stash[ref] = value; });
}

export function getOtp(sessionId: string): string | null {
  const db = readDb();
  return Object.prototype.hasOwnProperty.call(db.otps, sessionId) ? db.otps[sessionId] : null;
}

export function setOtp(sessionId: string, code: string): void {
  updateDb((db) => {
    db.otps[sessionId] = code;
    db.activeOtp = code; // keep legacy global in sync for host_otp_verify
  });
}

// Align the legacy global challenge that the in-enclave host_otp_verify reads
// with a specific session's OTP, just before verification.
export function setActiveOtp(code: string): void {
  updateDb((db) => { db.activeOtp = code; });
}

export function clearDb(): void {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  initDb();
}
