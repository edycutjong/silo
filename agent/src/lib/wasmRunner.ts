import fs from 'fs';
import path from 'path';
import { getKv, setKv, readDb, writeDb, getStash, setStash } from './db';

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
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
        return writeStringToWasm(value, valBufPtr, valBufLen);
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

        console.log(`[Host Signing] Issuing VC for subject=${subject}, claims=${claims}`);

        const header = JSON.stringify({ alg: "EdDSA", typ: "JWT" });
        const payload = JSON.stringify({
          sub: subject,
          iss: "did:t3n:silo-enclave-authority",
          nbf: Math.floor(Date.now() / 1000),
          vc: {
            "@context": [
              "https://www.w3.org/2018/credentials/v1"
            ],
            type: ["VerifiableCredential", "WhistleblowerReportCredential"],
            credentialSubject: JSON.parse(claims)
          }
        });

        const signature = "sig-" + Buffer.from(payload).slice(0, 16).toString('hex');
        const jwt = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.${base64UrlEncode(signature)}`;

        const vcResponse = JSON.stringify({
          credential: jwt,
          issuer: "did:t3n:silo-enclave-authority",
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
        console.log(`[Host Egress] Received POST to ${url} with placeholders: ${body}`);

        // Resolve profile placeholders
        const db = readDb();
        const activeDid = process.env.DID || "did:t3n:whistleblower123";
        const profile = db.profiles[activeDid] || db.profiles["did:t3n:whistleblower123"] || {
          first_name: process.env.DEFAULT_PROFILE_FIRST_NAME || "Anonymous",
          verified_contacts: { email: { value: process.env.DEFAULT_PROFILE_EMAIL || "whistleblower@hospital-safety.org" } }
        };

        let resolvedBody = body;
        resolvedBody = resolvedBody.replace(/\{\{profile\.first_name\}\}/g, profile.first_name);
        resolvedBody = resolvedBody.replace(
          /\{\{profile\.verified_contacts\.email\.value\}\}/g,
          profile.verified_contacts?.email?.value || process.env.DEFAULT_PROFILE_EMAIL || "whistleblower@hospital-safety.org"
        );

        console.log(`[Host Egress] Resolved body for egress: ${resolvedBody}`);

        // Log this delivery to database so dashboard can fetch it
        const report = {
          timestamp: Date.now(),
          url,
          originalBody: body,
          resolvedBody,
          status: "delivered",
          inboxId: `inbox-${Math.random().toString(36).substr(2, 9)}`
        };

        db.dispatchedReports.push(report);
        writeDb(db);

        const responseJson = JSON.stringify({
          status: "accepted",
          inboxId: report.inboxId,
          timestamp: Date.now()
        });

        return writeStringToWasm(responseJson, resBufPtr, resBufLen);
      },

      host_stash_put: (dataPtr: number, dataLen: number, refBufPtr: number, refBufLen: number): number => {
        const memView = new Uint8Array(wasmMemory.buffer, dataPtr, dataLen);
        const dataBase64 = Buffer.from(memView).toString('base64');
        const refId = `ref-${Math.random().toString(36).substr(2, 9)}`;
        const refStr = `stash://${refId}`;
        setStash(refStr, dataBase64);
        
        console.log(`[Host Stash] Uploaded ${dataLen} bytes to stash, reference: ${refStr}`);
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
        console.log(`[Host OTP] Verifying code: ${code} against activeOtp: ${db.activeOtp}`);
        const mockOtps = (process.env.MOCK_OTP_CODES || '883391,000000').split(',');
        if (code === db.activeOtp || mockOtps.includes(code)) {
          return 1;
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
