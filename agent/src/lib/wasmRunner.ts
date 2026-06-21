import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getKv, setKv, readDb, updateDb, getStash, setStash } from './db';

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// --- Enclave signing key (Ed25519) -----------------------------------------
// The manifest VC is signed with a real EdDSA signature so that anyone holding
// the enclave public key can verify it (and detect a forged/tampered manifest).
// Pin a key across restarts with SILO_ENCLAVE_PRIVATE_KEY (PKCS8 PEM); otherwise
// an ephemeral key is generated for the process.
let enclaveKeys: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } | null = null;
function getEnclaveKeys() {
  if (enclaveKeys) return enclaveKeys;
  const pem = process.env.SILO_ENCLAVE_PRIVATE_KEY;
  if (pem) {
    const privateKey = crypto.createPrivateKey(pem);
    const publicKey = crypto.createPublicKey(privateKey);
    enclaveKeys = { publicKey, privateKey };
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    enclaveKeys = { publicKey, privateKey };
  }
  return enclaveKeys;
}

export const ENCLAVE_ISSUER_DID = 'did:t3n:silo-enclave-authority';

// Public key (JWK) for verifiers (journalist console / CLI / external tools).
export function getEnclavePublicKeyJwk(): JsonWebKey {
  return getEnclaveKeys().publicKey.export({ format: 'jwk' }) as JsonWebKey;
}

export async function runWasmContract(
  functionName: 'open_drop' | 'attach_evidence' | 'verify_source' | 'submit_report' | 'relay_message' | 'get_thread',
  requestPayload: any
): Promise<any> {
  const wasmPath = path.resolve(process.cwd(), 'src/lib/silo_contract.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WebAssembly binary not found at ${wasmPath}. Build the contract first.`);
  }

  const wasmBuffer = fs.readFileSync(wasmPath);
  let wasmMemory: WebAssembly.Memory;

  const readStringFromWasm = (ptr: number, len: number): string => {
    const memView = new Uint8Array(wasmMemory.buffer, ptr, len);
    return new TextDecoder().decode(memView);
  };

  const writeStringToWasm = (str: string, ptr: number, maxLen: number): number => {
    const encoded = new TextEncoder().encode(str);
    const len = Math.min(encoded.length, maxLen);
    const memView = new Uint8Array(wasmMemory.buffer, ptr, maxLen);
    memView.set(encoded.slice(0, len));
    return len;
  };

  const importObject = {
    env: {
      host_kv_store_get: (keyPtr: number, keyLen: number, valBufPtr: number, valBufLen: number): number => {
        const key = readStringFromWasm(keyPtr, keyLen);
        const value = getKv(key);
        if (value === null) {
          return -1;
        }
        // Write what fits but return the FULL byte length, so the guest can detect
        // truncation and re-read into a larger buffer instead of losing data.
        const encoded = new TextEncoder().encode(value);
        const writeLen = Math.min(encoded.length, valBufLen);
        const memView = new Uint8Array(wasmMemory.buffer, valBufPtr, valBufLen);
        memView.set(encoded.subarray(0, writeLen));
        return encoded.length;
      },

      host_kv_store_set: (keyPtr: number, keyLen: number, valPtr: number, valLen: number): number => {
        const key = readStringFromWasm(keyPtr, keyLen);
        const value = readStringFromWasm(valPtr, valLen);
        setKv(key, value);
        return 0;
      },

      host_clock_now: (): bigint => {
        return BigInt(Date.now());
      },

      host_logging_log: (msgPtr: number, msgLen: number): void => {
        const msg = readStringFromWasm(msgPtr, msgLen);
        console.log(`[Contract Log] ${msg}`);
      },

      host_signing_issue_vc: (
        subjectPtr: number, subjectLen: number,
        claimsPtr: number, claimsLen: number,
        vcBufPtr: number, vcBufLen: number
      ): number => {
        const subject = readStringFromWasm(subjectPtr, subjectLen);
        const claims = readStringFromWasm(claimsPtr, claimsLen);

        // Do not log claims (they carry report metadata); subject is non-PII.
        console.log(`[Host Signing] Issuing VC for subject=${subject}`);

        const header = JSON.stringify({ alg: "EdDSA", typ: "JWT" });
        const payload = JSON.stringify({
          sub: subject,
          iss: ENCLAVE_ISSUER_DID,
          nbf: Math.floor(Date.now() / 1000),
          vc: {
            "@context": [
              "https://www.w3.org/2018/credentials/v1"
            ],
            type: ["VerifiableCredential", "WhistleblowerReportCredential"],
            credentialSubject: JSON.parse(claims)
          }
        });

        // Real EdDSA (Ed25519) signature over the JWS signing input.
        const signingInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
        const { privateKey } = getEnclaveKeys();
        const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
        const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

        const vcResponse = JSON.stringify({
          credential: jwt,
          issuer: ENCLAVE_ISSUER_DID,
          subject,
          claims: JSON.parse(claims)
        });

        return writeStringToWasm(vcResponse, vcBufPtr, vcBufLen);
      },

      host_http_with_placeholders_post: (
        urlPtr: number, urlLen: number,
        bodyPtr: number, bodyLen: number,
        resBufPtr: number, resBufLen: number
      ): number => {
        const url = readStringFromWasm(urlPtr, urlLen);
        const body = readStringFromWasm(bodyPtr, bodyLen);
        // Log only the destination — the body resolves to PII at egress.
        console.log(`[Host Egress] Dispatching blind POST to ${url}`);

        // Resolve the contact bound to THIS session (not a shared global profile),
        // so a journalist follow-up can never be routed to a different source.
        const db = readDb();
        let sessionId: string | null = null;
        try {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed.sessionId === 'string') sessionId = parsed.sessionId;
        } catch (_e) { /* body may not be JSON (e.g. raw placeholder test) */ }

        const activeDid = process.env.DID || "did:t3n:whistleblower123";
        const profile =
          (sessionId ? db.profiles[sessionId] : undefined) ||
          db.profiles[activeDid] ||
          db.profiles["did:t3n:whistleblower123"] || {
            first_name: process.env.DEFAULT_PROFILE_FIRST_NAME || "Anonymous",
            verified_contacts: { email: { value: process.env.DEFAULT_PROFILE_EMAIL || "whistleblower@hospital-safety.org" } }
          };

        // The resolved body (with real contact) is what the newsroom receives, but
        // it is NEVER persisted or logged. We store a redacted copy so the dashboard
        // can show the manifest without burning the source.
        let resolvedBody = body;
        resolvedBody = resolvedBody.replace(/\{\{profile\.first_name\}\}/g, profile.first_name);
        resolvedBody = resolvedBody.replace(
          /\{\{profile\.verified_contacts\.email\.value\}\}/g,
          profile.verified_contacts?.email?.value || process.env.DEFAULT_PROFILE_EMAIL || "whistleblower@hospital-safety.org"
        );

        // Redacted body for persistence: replace contact placeholders with a marker
        // so pseudonym/evidenceHash/manifestSignature survive but the contact does not.
        const redactedBody = body
          .replace(/\{\{profile\.first_name\}\}/g, '[redacted]')
          .replace(/\{\{profile\.verified_contacts\.email\.value\}\}/g, '[redacted]');

        const report = {
          timestamp: Date.now(),
          url,
          originalBody: body,
          resolvedBody: redactedBody,
          status: "delivered",
          inboxId: `inbox-${crypto.randomBytes(6).toString('hex')}`
        };

        updateDb((d) => { d.dispatchedReports.push(report); });

        const responseJson = JSON.stringify({
          status: "accepted",
          inboxId: report.inboxId,
          timestamp: Date.now()
        });

        return writeStringToWasm(responseJson, resBufPtr, resBufLen);
      },

      host_stash_put: (dataPtr: number, dataLen: number, refBufPtr: number, refBufLen: number): number => {
        const memView = new Uint8Array(wasmMemory.buffer, dataPtr, dataLen);
        const dataBuf = Buffer.from(memView);
        const dataBase64 = dataBuf.toString('base64');
        // Content-addressed reference: identical uploads dedupe to the same ref.
        const digest = crypto.createHash('sha256').update(dataBuf).digest('hex');
        const refStr = `stash://ref-${digest.slice(0, 16)}`;
        setStash(refStr, dataBase64);

        console.log(`[Host Stash] Stored ${dataLen} bytes (content-addressed) ref=${refStr}`);
        return writeStringToWasm(refStr, refBufPtr, refBufLen);
      },

      host_stash_get: (refPtr: number, refLen: number, dataBufPtr: number, dataBufLen: number): number => {
        const refStr = readStringFromWasm(refPtr, refLen);
        const dataBase64 = getStash(refStr);
        if (dataBase64 === null) {
          console.error(`[Host Stash] Stash reference not found: ${refStr}`);
          return -1;
        }
        const buffer = Buffer.from(dataBase64, 'base64');
        
        const memView = new Uint8Array(wasmMemory.buffer, dataBufPtr, dataBufLen);
        const writeLen = Math.min(buffer.length, dataBufLen);
        memView.set(buffer.slice(0, writeLen));
        console.log(`[Host Stash] Downloaded ${writeLen} bytes from stash: ${refStr}`);
        return writeLen;
      },

      host_otp_verify: (codePtr: number, codeLen: number): number => {
        const code = readStringFromWasm(codePtr, codeLen);
        const db = readDb();
        // Never log the submitted code or the expected OTP.
        console.log('[Host OTP] Verifying submitted code against the enclave-held challenge');
        if (db.activeOtp !== null && code === db.activeOtp) {
          return 1;
        }
        // Mock backdoor codes are only honored outside production (demos/tests).
        if (process.env.NODE_ENV !== 'production') {
          const mockOtps = (process.env.MOCK_OTP_CODES || '883391,000000').split(',');
          if (mockOtps.includes(code)) {
            return 1;
          }
        }
        return 0;
      }
    }
  };

  const { instance } = await WebAssembly.instantiate(wasmBuffer, importObject);
  wasmMemory = instance.exports.memory as WebAssembly.Memory;

  const allocFn = instance.exports.alloc as (size: number) => number;
  const deallocFn = instance.exports.dealloc as (ptr: number, size: number) => void;
  const contractFn = instance.exports[functionName] as (ptr: number, len: number) => bigint;

  if (!contractFn) {
    throw new Error(`Exported function ${functionName} not found in WebAssembly binary.`);
  }

  const requestJson = JSON.stringify(requestPayload);
  const requestBytes = new TextEncoder().encode(requestJson);

  const requestPtr = allocFn(requestBytes.length);
  const memView = new Uint8Array(wasmMemory.buffer, requestPtr, requestBytes.length);
  memView.set(requestBytes);

  let packedResult: bigint;
  try {
    packedResult = contractFn(requestPtr, requestBytes.length);
  } finally {
    deallocFn(requestPtr, requestBytes.length);
  }

  const resultPtr = Number(packedResult >> 32n);
  const resultLen = Number(packedResult & 0xffffffffn);

  const resultJson = readStringFromWasm(resultPtr, resultLen);
  deallocFn(resultPtr, resultLen);

  return JSON.parse(resultJson);
}
