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
  activeOtp: string | null;
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
      activeOtp: null
    };

    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2));
  }
}

export function readDb(): DbSchema {
  initDb();
  const content = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    return { kv: {}, profiles: {}, mediaOutlets: [], dispatchedReports: [], stash: {}, activeOtp: null };
  }
}

export function writeDb(data: DbSchema) {
  initDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function getKv(key: string): string | null {
  const db = readDb();
  return db.kv[key] || null;
}

export function setKv(key: string, value: string): void {
  const db = readDb();
  db.kv[key] = value;
  writeDb(db);
}

export function getStash(ref: string): string | null {
  const db = readDb();
  return db.stash[ref] || null;
}

export function setStash(ref: string, value: string): void {
  const db = readDb();
  db.stash[ref] = value;
  writeDb(db);
}

export function clearDb(): void {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  initDb();
}
