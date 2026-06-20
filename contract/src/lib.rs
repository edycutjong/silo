use serde::{Deserialize, Serialize};
use std::slice;
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose};

// Import T3 ADK Host APIs
// --- TARGET DEPENDENT HOST API DECLARATIONS AND HELPER FUNCTIONS ---

#[cfg(target_arch = "wasm32")]
extern "C" {
    fn host_kv_store_get(key_ptr: *const u8, key_len: usize, val_buf_ptr: *mut u8, val_buf_len: usize) -> i32;
    fn host_kv_store_set(key_ptr: *const u8, key_len: usize, val_ptr: *const u8, val_len: usize) -> i32;
    fn host_clock_now() -> u64;
    fn host_logging_log(msg_ptr: *const u8, msg_len: usize);
    fn host_signing_issue_vc(
        subject_ptr: *const u8, subject_len: usize,
        claims_ptr: *const u8, claims_len: usize,
        vc_buf_ptr: *mut u8, vc_buf_len: usize
    ) -> i32;
    fn host_http_with_placeholders_post(
        url_ptr: *const u8, url_len: usize,
        body_ptr: *const u8, body_len: usize,
        res_buf_ptr: *mut u8, res_buf_len: usize
    ) -> i32;
    fn host_stash_put(
        data_ptr: *const u8, data_len: usize,
        ref_buf_ptr: *mut u8, ref_buf_len: usize
    ) -> i32;
    fn host_otp_verify(
        code_ptr: *const u8, code_len: usize
    ) -> i32;
}

#[cfg(target_arch = "wasm32")]
fn kv_get(key: &str) -> Option<String> {
    let mut buf = vec![0u8; 8192];
    let res = unsafe {
        host_kv_store_get(
            key.as_ptr(), key.len(),
            buf.as_mut_ptr(), buf.len()
        )
    };
    if res >= 0 {
        buf.truncate(res as usize);
        String::from_utf8(buf).ok()
    } else {
        None
    }
}

#[cfg(target_arch = "wasm32")]
fn kv_set(key: &str, val: &str) -> bool {
    let res = unsafe {
        host_kv_store_set(
            key.as_ptr(), key.len(),
            val.as_ptr(), val.len()
        )
    };
    res == 0
}

#[cfg(target_arch = "wasm32")]
fn get_now() -> u64 {
    unsafe { host_clock_now() }
}

#[cfg(target_arch = "wasm32")]
fn log(msg: &str) {
    unsafe { host_logging_log(msg.as_ptr(), msg.len()) }
}

#[cfg(target_arch = "wasm32")]
fn stash_put(data: &[u8]) -> Option<String> {
    let mut ref_buf = vec![0u8; 1024];
    let res = unsafe {
        host_stash_put(
            data.as_ptr(), data.len(),
            ref_buf.as_mut_ptr(), ref_buf.len()
        )
    };
    if res >= 0 {
        ref_buf.truncate(res as usize);
        String::from_utf8(ref_buf).ok()
    } else {
        None
    }
}

#[cfg(target_arch = "wasm32")]
fn otp_verify(code: &str) -> bool {
    let res = unsafe {
        host_otp_verify(
            code.as_ptr(), code.len()
        )
    };
    res == 1
}

#[cfg(target_arch = "wasm32")]
fn signing_issue_vc(subject: &str, claims: &str) -> Option<String> {
    let mut vc_buf = vec![0u8; 4096];
    let res = unsafe {
        host_signing_issue_vc(
            subject.as_ptr(), subject.len(),
            claims.as_ptr(), claims.len(),
            vc_buf.as_mut_ptr(), vc_buf.len()
        )
    };
    if res >= 0 {
        vc_buf.truncate(res as usize);
        String::from_utf8(vc_buf).ok()
    } else {
        None
    }
}

#[cfg(target_arch = "wasm32")]
fn http_with_placeholders_post(url: &str, body: &str) -> Option<String> {
    let mut res_buf = vec![0u8; 2048];
    let res = unsafe {
        host_http_with_placeholders_post(
            url.as_ptr(), url.len(),
            body.as_ptr(), body.len(),
            res_buf.as_mut_ptr(), res_buf.len()
        )
    };
    if res >= 0 {
        res_buf.truncate(res as usize);
        String::from_utf8(res_buf).ok()
    } else {
        None
    }
}

// Native Mock implementation using thread-local storage for testing
#[cfg(not(target_arch = "wasm32"))]
mod native_mock {
    use std::cell::RefCell;
    use std::collections::HashMap;

    thread_local! {
        pub static KV_STORE: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
        pub static STASH_STORE: RefCell<HashMap<String, Vec<u8>>> = RefCell::new(HashMap::new());
        pub static STRING_REGISTRY: RefCell<HashMap<u64, usize>> = RefCell::new(HashMap::new());
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn kv_get(key: &str) -> Option<String> {
    println!("[TEE LOG] kv_get: key={}", key);
    let res = native_mock::KV_STORE.with(|store| {
        store.borrow().get(key).cloned()
    });
    println!("[TEE LOG] kv_get res={:?}", res);
    res
}

#[cfg(not(target_arch = "wasm32"))]
fn kv_set(key: &str, val: &str) -> bool {
    println!("[TEE LOG] kv_set: key={}, val={}", key, val);
    native_mock::KV_STORE.with(|store| {
        store.borrow_mut().insert(key.to_string(), val.to_string());
    });
    println!("[TEE LOG] kv_set done");
    true
}

#[cfg(not(target_arch = "wasm32"))]
fn get_now() -> u64 {
    123456789
}

#[cfg(not(target_arch = "wasm32"))]
fn log(msg: &str) {
    println!("[TEE LOG] {}", msg);
}

#[cfg(not(target_arch = "wasm32"))]
fn stash_put(data: &[u8]) -> Option<String> {
    if data == b"fail" {
        return None;
    }
    let hash = format!("{:x}", sha2::Sha256::digest(data));
    let reference = format!("stash-ref-{}", &hash[0..8]);
    native_mock::STASH_STORE.with(|store| {
        store.borrow_mut().insert(reference.clone(), data.to_vec());
    });
    Some(reference)
}

#[cfg(not(target_arch = "wasm32"))]
fn otp_verify(code: &str) -> bool {
    // For testing/mock purposes, any 6-digit code or "883391" is true
    code.len() == 6
}

#[cfg(not(target_arch = "wasm32"))]
fn signing_issue_vc(subject: &str, claims: &str) -> Option<String> {
    if subject.contains("fail") {
        return None;
    }
    Some(format!("mock-vc-signature-for-subject-{}-claims-{}", subject, claims))
}

#[cfg(not(target_arch = "wasm32"))]
fn http_with_placeholders_post(_url: &str, _body: &str) -> Option<String> {
    if _body.contains("fail_egress") {
        return None;
    }
    Some(r#"{"success":true}"#.to_string())
}

// Memory Allocation API for Wasm/JS Boundary
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _slice = Box::from_raw(std::slice::from_raw_parts_mut(ptr, size));
    }
}

// Helper: Pack Rust String into u64 pointer/length (WASM uses 32-bit pointers)
#[cfg(target_arch = "wasm32")]
fn return_string(s: String) -> u64 {
    let bytes = s.into_bytes();
    let len = bytes.len();
    let mut boxed = bytes.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    std::mem::forget(boxed);
    ((ptr as u64) << 32) | (len as u64)
}

// Helper: Register Rust String pointer on native 64-bit systems
#[cfg(not(target_arch = "wasm32"))]
fn return_string(s: String) -> u64 {
    println!("[TEE LOG] return_string s={}", s);
    let bytes = s.into_bytes();
    let len = bytes.len();
    let mut boxed = bytes.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    let addr = ptr as u64;
    std::mem::forget(boxed);
    native_mock::STRING_REGISTRY.with(|reg| {
        reg.borrow_mut().insert(addr, len);
    });
    println!("[TEE LOG] return_string registered ptr={}, len={}", addr, len);
    addr
}

// Helper: Read input from Wasm memory pointer/length
unsafe fn get_input_string(ptr: *const u8, len: usize) -> String {
    let slice = slice::from_raw_parts(ptr, len);
    String::from_utf8_lossy(slice).into_owned()
}

// Struct Definitions
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct DropSession {
    id: String,
    pseudonym: String,
    status: String, // "draft", "verified", "dispatched"
    evidenceHash: String,
    stashRef: String,
    outletId: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ThreadMessage {
    sender: String, // "source" | "media"
    message: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct DropMetadata {
    signedVC: String,
    verificationStatus: bool,
}

// Request payloads
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct OpenDropRequest {
    outletId: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct AttachEvidenceRequest {
    sessionId: String,
    fileBase64: String,
    declaredHash: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VerifySourceRequest {
    sessionId: String,
    otpCode: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SubmitReportRequest {
    sessionId: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct RelayMessageRequest {
    sessionId: String,
    message: String,
    sender: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct GetThreadRequest {
    sessionId: String,
}

// CONTRACT EXPORTS

#[no_mangle]
pub unsafe extern "C" fn open_drop(ptr: *const u8, len: usize) -> u64 {
    let input = get_input_string(ptr, len);
    log(&format!("Rust open_drop: input={}", input));
    
    let req: OpenDropRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => return return_string(format!(r#"{{"error":"Invalid payload: {}"}}"#, e)),
    };
    
    // Simple mock counter implementation to match "Source #7"
    let counter_key = "silo:drop:counter";
    let count = match kv_get(counter_key) {
        Some(val) => val.parse::<u64>().unwrap_or(6) + 1,
        None => 7, // Default to 7 for the demo
    };
    kv_set(counter_key, &count.to_string());
    
    let pseudonym = format!("Source #{}", count);
    
    // Generate a simple unique session ID
    let now = get_now();
    let session_id = format!("drop-{}-{}", count, now % 10000);
    
    let session = DropSession {
        id: session_id.clone(),
        pseudonym: pseudonym.clone(),
        status: "draft".to_string(),
        evidenceHash: "".to_string(),
        stashRef: "".to_string(),
        outletId: req.outletId,
    };
    
    let session_key = format!("silo:drop:{}", session_id);
    let session_json = serde_json::to_string(&session).unwrap();
    kv_set(&session_key, &session_json);
    
    let response = serde_json::json!({
        "success": true,
        "sessionId": session_id,
        "pseudonym": pseudonym,
        "status": "draft"
    });
    
    return_string(response.to_string())
}

#[no_mangle]
pub unsafe extern "C" fn attach_evidence(ptr: *const u8, len: usize) -> u64 {
    let input = get_input_string(ptr, len);
    log("Rust attach_evidence: processing payload...");
    
    let req: AttachEvidenceRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => return return_string(format!(r#"{{"error":"Invalid payload: {}"}}"#, e)),
    };
    
    let session_key = format!("silo:drop:{}", req.sessionId);
    let session_data = match kv_get(&session_key) {
        Some(data) => data,
        None => return return_string(r#"{"error":"Session not found"}"#.to_string()),
    };
    
    let mut session: DropSession = serde_json::from_str(&session_data).unwrap();
    
    // Decode base64 file bytes
    let file_bytes = match general_purpose::STANDARD.decode(&req.fileBase64) {
        Ok(bytes) => bytes,
        Err(e) => return return_string(format!(r#"{{"error":"Base64 decode failed: {}"}}"#, e)),
    };
    
    // Compute SHA-256 hash
    let mut hasher = Sha256::new();
    hasher.update(&file_bytes);
    let computed_hash = format!("{:x}", hasher.finalize());
    
    // Verify computed hash against declared hash
    if computed_hash != req.declaredHash {
        log(&format!("Hash mismatch: computed={}, declared={}", computed_hash, req.declaredHash));
        return return_string(r#"{"error":"Mismatched evidence hash"}"#.to_string());
    }
    
    // Upload to stash
    let stash_ref = match stash_put(&file_bytes) {
        Some(s) => s,
        None => return return_string(r#"{"error":"Stash storage upload failed"}"#.to_string()),
    };
    
    // Update session state
    session.evidenceHash = computed_hash.clone();
    session.stashRef = stash_ref.clone();
    
    let updated_json = serde_json::to_string(&session).unwrap();
    kv_set(&session_key, &updated_json);
    
    let response = serde_json::json!({
        "success": true,
        "fileHash": computed_hash,
        "stashRef": stash_ref
    });
    
    return_string(response.to_string())
}

#[no_mangle]
pub unsafe extern "C" fn verify_source(ptr: *const u8, len: usize) -> u64 {
    let input = get_input_string(ptr, len);
    log(&format!("Rust verify_source: input={}", input));
    
    let req: VerifySourceRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => return return_string(format!(r#"{{"error":"Invalid payload: {}"}}"#, e)),
    };
    
    let session_key = format!("silo:drop:{}", req.sessionId);
    let session_data = match kv_get(&session_key) {
        Some(data) => data,
        None => return return_string(r#"{"error":"Session not found"}"#.to_string()),
    };
    
    let mut session: DropSession = serde_json::from_str(&session_data).unwrap();
    
    // Verify OTP code using Host API
    if !otp_verify(&req.otpCode) {
        return return_string(r#"{"error":"OTP Verification Failed"}"#.to_string());
    }
    
    session.status = "verified".to_string();
    let updated_json = serde_json::to_string(&session).unwrap();
    kv_set(&session_key, &updated_json);
    
    let response = serde_json::json!({
        "success": true,
        "status": "verified"
    });
    
    return_string(response.to_string())
}

#[no_mangle]
pub unsafe extern "C" fn submit_report(ptr: *const u8, len: usize) -> u64 {
    let input = get_input_string(ptr, len);
    log(&format!("Rust submit_report: input={}", input));
    
    let req: SubmitReportRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => return return_string(format!(r#"{{"error":"Invalid payload: {}"}}"#, e)),
    };
    
    let session_key = format!("silo:drop:{}", req.sessionId);
    let session_data = match kv_get(&session_key) {
        Some(data) => data,
        None => return return_string(r#"{"error":"Session not found"}"#.to_string()),
    };
    
    let mut session: DropSession = serde_json::from_str(&session_data).unwrap();
    if session.status != "verified" {
        return return_string(r#"{"error":"Cannot submit unverified report session"}"#.to_string());
    }
    
    // Issue signed report VC
    let subject = format!("did:t3n:silo:{}", session.id);
    let now = get_now();
    let claims = serde_json::json!({
        "sessionId": session.id,
        "pseudonym": session.pseudonym,
        "evidenceHash": session.evidenceHash,
        "verifiedHuman": true,
        "timestamp": now
    }).to_string();
    
    let signed_vc = match signing_issue_vc(&subject, &claims) {
        Some(vc) => vc,
        None => return return_string(r#"{"error":"Failed to sign report manifest VC"}"#.to_string()),
    };
    
    // Dispatch to journalist outbox using placeholders
    // The placeholder resolves target contact from user profile
    let body = serde_json::json!({
        "pseudonym": session.pseudonym,
        "evidenceHash": session.evidenceHash,
        "manifestSignature": signed_vc,
        "verifiedHuman": true,
        "timestamp": now,
        "sourceContact": "{{profile.verified_contacts.email.value}}"
    }).to_string();
    
    let url = "https://newsroom.sandbox.test/inbox/submit";
    if http_with_placeholders_post(url, &body).is_none() {
        return return_string(r#"{"error":"Failed to dispatch report to media outbox"}"#.to_string());
    }
    
    // Save metadata details
    let meta = DropMetadata {
        signedVC: signed_vc.clone(),
        verificationStatus: true,
    };
    let meta_key = format!("silo:meta:{}", session.id);
    let meta_json = serde_json::to_string(&meta).unwrap();
    kv_set(&meta_key, &meta_json);
    
    // Update session
    session.status = "dispatched".to_string();
    let updated_json = serde_json::to_string(&session).unwrap();
    kv_set(&session_key, &updated_json);
    
    let response = serde_json::json!({
        "success": true,
        "status": "dispatched",
        "pseudonym": session.pseudonym,
        "evidenceHash": session.evidenceHash,
        "manifestSignature": signed_vc
    });
    
    return_string(response.to_string())
}

#[no_mangle]
pub unsafe extern "C" fn relay_message(ptr: *const u8, len: usize) -> u64 {
    let input = get_input_string(ptr, len);
    log(&format!("Rust relay_message: input={}", input));
    
    let req: RelayMessageRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => return return_string(format!(r#"{{"error":"Invalid payload: {}"}}"#, e)),
    };
    
    let session_key = format!("silo:drop:{}", req.sessionId);
    let session_data = match kv_get(&session_key) {
        Some(data) => data,
        None => return return_string(r#"{"error":"Session not found"}"#.to_string()),
    };
    
    let session: DropSession = serde_json::from_str(&session_data).unwrap();
    let now = get_now();
    
    // Get existing thread
    let thread_key = format!("silo:thread:{}", req.sessionId);
    let mut thread: Vec<ThreadMessage> = match kv_get(&thread_key) {
        Some(data) => serde_json::from_str(&data).unwrap_or_else(|_| vec![]),
        None => vec![],
    };
    
    // Add message
    thread.push(ThreadMessage {
        sender: req.sender.clone(),
        message: req.message.clone(),
        timestamp: now,
    });
    
    let thread_json = serde_json::to_string(&thread).unwrap();
    kv_set(&thread_key, &thread_json);
    
    // If journalist is sending to whistleblower, trigger http egress relay
    if req.sender == "media" {
        let url = "https://newsroom.sandbox.test/inbox/relay";
        let body = serde_json::json!({
            "sessionId": session.id,
            "pseudonym": session.pseudonym,
            "message": req.message,
            "recipient": "{{profile.verified_contacts.email.value}}"
        }).to_string();
        
        if http_with_placeholders_post(url, &body).is_none() {
            return return_string(r#"{"error":"HTTP placeholder relay failed"}"#.to_string());
        }
    }
    
    let response = serde_json::json!({
        "success": true,
        "thread": thread
    });
    
    return_string(response.to_string())
}

#[no_mangle]
pub unsafe extern "C" fn get_thread(ptr: *const u8, len: usize) -> u64 {
    let input = get_input_string(ptr, len);
    log(&format!("Rust get_thread: input={}", input));
    
    let req: GetThreadRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => return return_string(format!(r#"{{"error":"Invalid payload: {}"}}"#, e)),
    };
    
    let thread_key = format!("silo:thread:{}", req.sessionId);
    let thread: Vec<ThreadMessage> = match kv_get(&thread_key) {
        Some(data) => serde_json::from_str(&data).unwrap_or_else(|_| vec![]),
        None => vec![],
    };
    
    let response = serde_json::json!({
        "success": true,
        "thread": thread
    });
    
    return_string(response.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unpack_returned_string(packed: u64) -> (*mut u8, usize) {
        #[cfg(target_arch = "wasm32")]
        {
            ((packed >> 32) as *mut u8, (packed & 0xffffffff) as usize)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            let len = native_mock::STRING_REGISTRY.with(|reg| {
                *reg.borrow().get(&packed).unwrap_or(&0)
            });
            (packed as *mut u8, len)
        }
    }

    fn read_returned_string(packed: u64) -> String {
        unsafe {
            let (result_ptr, result_len) = unpack_returned_string(packed);
            let slice = std::slice::from_raw_parts(result_ptr, result_len);
            let s = String::from_utf8_lossy(slice).into_owned();
            dealloc(result_ptr, result_len);
            s
        }
    }

    #[test]
    fn test_open_drop() {
        let req = r#"{"outletId":"newsroom-main"}"#;
        let s = read_returned_string(unsafe { open_drop(req.as_ptr(), req.len()) });
        println!("Result open_drop: {}", s);
        assert!(s.contains("sessionId"));
    }

    #[test]
    fn test_open_drop_invalid_payload() {
        let req = r#"invalid json"#;
        let s = read_returned_string(unsafe { open_drop(req.as_ptr(), req.len()) });
        println!("Result open_drop invalid: {}", s);
        assert!(s.contains("error"));
        assert!(s.contains("Invalid payload"));
    }

    #[test]
    fn test_attach_evidence_success() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // PDF empty hash is "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        let req_attach = format!(
            r#"{{"sessionId":"{}","fileBase64":"","declaredHash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}}"#,
            session_id
        );
        let s_attach = read_returned_string(unsafe { attach_evidence(req_attach.as_ptr(), req_attach.len()) });
        println!("Result attach: {}", s_attach);
        assert!(s_attach.contains("success"));
        assert!(s_attach.contains("stashRef"));
    }

    #[test]
    fn test_attach_evidence_mismatch() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_attach = format!(
            r#"{{"sessionId":"{}","fileBase64":"","declaredHash":"invalidhash"}}"#,
            session_id
        );
        let s_attach = read_returned_string(unsafe { attach_evidence(req_attach.as_ptr(), req_attach.len()) });
        println!("Result attach mismatch: {}", s_attach);
        assert!(s_attach.contains("error"));
        assert!(s_attach.contains("Mismatched evidence hash"));
    }

    #[test]
    fn test_attach_evidence_invalid_payload() {
        let req = r#"invalid json"#;
        let s = read_returned_string(unsafe { attach_evidence(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Invalid payload"));
    }

    #[test]
    fn test_attach_evidence_session_not_found() {
        let req = r#"{"sessionId":"nonexistent-session","fileBase64":"","declaredHash":""}"#;
        let s = read_returned_string(unsafe { attach_evidence(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Session not found"));
    }

    #[test]
    fn test_attach_evidence_base64_decode_failed() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_attach = format!(
            r#"{{"sessionId":"{}","fileBase64":"invalid-base64-%","declaredHash":""}}"#,
            session_id
        );
        let s_attach = read_returned_string(unsafe { attach_evidence(req_attach.as_ptr(), req_attach.len()) });
        assert!(s_attach.contains("error"));
        assert!(s_attach.contains("Base64 decode failed"));
    }

    #[test]
    fn test_verify_source() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_verify = format!(
            r#"{{"sessionId":"{}","otpCode":"123456"}}"#,
            session_id
        );
        let s_verify = read_returned_string(unsafe { verify_source(req_verify.as_ptr(), req_verify.len()) });
        println!("Result verify: {}", s_verify);
        assert!(s_verify.contains("verified"));
    }

    #[test]
    fn test_verify_source_invalid_payload() {
        let req = r#"invalid json"#;
        let s = read_returned_string(unsafe { verify_source(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Invalid payload"));
    }

    #[test]
    fn test_verify_source_session_not_found() {
        let req = r#"{"sessionId":"nonexistent-session","otpCode":"123456"}"#;
        let s = read_returned_string(unsafe { verify_source(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Session not found"));
    }

    #[test]
    fn test_verify_source_otp_failed() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_verify = format!(
            r#"{{"sessionId":"{}","otpCode":"123"}}"#, // 3-digit is not 6-digit, so otp_verify fails in mock
            session_id
        );
        let s_verify = read_returned_string(unsafe { verify_source(req_verify.as_ptr(), req_verify.len()) });
        assert!(s_verify.contains("error"));
        assert!(s_verify.contains("OTP Verification Failed"));
    }

    #[test]
    fn test_submit_report() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // 1. Attach
        let req_attach = format!(
            r#"{{"sessionId":"{}","fileBase64":"","declaredHash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}}"#,
            session_id
        );
        let _ = read_returned_string(unsafe { attach_evidence(req_attach.as_ptr(), req_attach.len()) });

        // 2. Verify
        let req_verify = format!(
            r#"{{"sessionId":"{}","otpCode":"883391"}}"#,
            session_id
        );
        let _ = read_returned_string(unsafe { verify_source(req_verify.as_ptr(), req_verify.len()) });

        // 3. Submit
        let req_submit = format!(
            r#"{{"sessionId":"{}"}}"#,
            session_id
        );
        let s_submit = read_returned_string(unsafe { submit_report(req_submit.as_ptr(), req_submit.len()) });
        println!("Result submit: {}", s_submit);
        assert!(s_submit.contains("dispatched"));
        assert!(s_submit.contains("manifestSignature"));
    }

    #[test]
    fn test_submit_report_invalid_payload() {
        let req = r#"invalid json"#;
        let s = read_returned_string(unsafe { submit_report(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Invalid payload"));
    }

    #[test]
    fn test_submit_report_session_not_found() {
        let req = r#"{"sessionId":"nonexistent-session"}"#;
        let s = read_returned_string(unsafe { submit_report(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Session not found"));
    }

    #[test]
    fn test_submit_report_unverified() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // Submit directly without verifying
        let req_submit = format!(
            r#"{{"sessionId":"{}"}}"#,
            session_id
        );
        let s_submit = read_returned_string(unsafe { submit_report(req_submit.as_ptr(), req_submit.len()) });
        assert!(s_submit.contains("error"));
        assert!(s_submit.contains("Cannot submit unverified report session"));
    }

    #[test]
    fn test_relay_message_source() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_relay = format!(
            r#"{{"sessionId":"{}","message":"Hello from source","sender":"source"}}"#,
            session_id
        );
        let s_relay = read_returned_string(unsafe { relay_message(req_relay.as_ptr(), req_relay.len()) });
        assert!(s_relay.contains("success"));
        assert!(s_relay.contains("Hello from source"));
    }

    #[test]
    fn test_relay_message_media() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_relay = format!(
            r#"{{"sessionId":"{}","message":"Hello from media","sender":"media"}}"#,
            session_id
        );
        let s_relay = read_returned_string(unsafe { relay_message(req_relay.as_ptr(), req_relay.len()) });
        assert!(s_relay.contains("success"));
        assert!(s_relay.contains("Hello from media"));
    }

    #[test]
    fn test_relay_message_invalid_payload() {
        let req = r#"invalid json"#;
        let s = read_returned_string(unsafe { relay_message(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Invalid payload"));
    }

    #[test]
    fn test_relay_message_session_not_found() {
        let req = r#"{"sessionId":"nonexistent-session","message":"Hello","sender":"source"}"#;
        let s = read_returned_string(unsafe { relay_message(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Session not found"));
    }

    #[test]
    fn test_get_thread() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        let req_get = format!(
            r#"{{"sessionId":"{}"}}"#,
            session_id
        );
        let s_get = read_returned_string(unsafe { get_thread(req_get.as_ptr(), req_get.len()) });
        assert!(s_get.contains("success"));
    }

    #[test]
    fn test_get_thread_invalid_payload() {
        let req = r#"invalid json"#;
        let s = read_returned_string(unsafe { get_thread(req.as_ptr(), req.len()) });
        assert!(s.contains("error"));
        assert!(s.contains("Invalid payload"));
    }

    #[test]
    fn test_open_drop_counter_invalid() {
        native_mock::KV_STORE.with(|store| {
            store.borrow_mut().insert("silo:drop:counter".to_string(), "invalid_int".to_string());
        });
        let req = r#"{"outletId":"newsroom-main"}"#;
        let s = read_returned_string(unsafe { open_drop(req.as_ptr(), req.len()) });
        assert!(s.contains("sessionId"));
    }

    #[test]
    fn test_attach_evidence_stash_failed() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // "ZmFpbA==" is base64 for "fail", which triggers stash failure in mock
        let req_attach = format!(
            r#"{{"sessionId":"{}","fileBase64":"ZmFpbA==","declaredHash":"51280dabfbc880cdc5f92cc2f4f22c8032de5aba401c3268250a11eeb2df1f73"}}"#,
            session_id
        );
        let s_attach = read_returned_string(unsafe { attach_evidence(req_attach.as_ptr(), req_attach.len()) });
        assert!(s_attach.contains("error"));
        assert!(s_attach.contains("Stash storage upload failed"));
    }

    #[test]
    fn test_submit_report_signing_failed() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // Make session ID contain "fail" to fail signing VC
        let session_key = format!("silo:drop:{}", session_id);
        native_mock::KV_STORE.with(|store| {
            let mut s_map = store.borrow_mut();
            let session_data = s_map.get(&session_key).unwrap().clone();
            let mut s_struct: DropSession = serde_json::from_str(&session_data).unwrap();
            s_struct.id = "drop-fail-123".to_string(); // contains "fail"
            s_struct.status = "verified".to_string();
            s_map.insert(format!("silo:drop:{}", s_struct.id), serde_json::to_string(&s_struct).unwrap());
        });

        let req_submit = r#"{"sessionId":"drop-fail-123"}"#;
        let s_submit = read_returned_string(unsafe { submit_report(req_submit.as_ptr(), req_submit.len()) });
        assert!(s_submit.contains("error"));
        assert!(s_submit.contains("Failed to sign report manifest VC"));
    }

    #[test]
    fn test_submit_report_egress_failed() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // Make session pseudonym contain "fail_egress" to fail outbox post
        let session_key = format!("silo:drop:{}", session_id);
        native_mock::KV_STORE.with(|store| {
            let mut s_map = store.borrow_mut();
            let session_data = s_map.get(&session_key).unwrap().clone();
            let mut s_struct: DropSession = serde_json::from_str(&session_data).unwrap();
            s_struct.pseudonym = "fail_egress".to_string();
            s_struct.status = "verified".to_string();
            s_map.insert(session_key.clone(), serde_json::to_string(&s_struct).unwrap());
        });

        let req_submit = format!(
            r#"{{"sessionId":"{}"}}"#,
            session_id
        );
        let s_submit = read_returned_string(unsafe { submit_report(req_submit.as_ptr(), req_submit.len()) });
        assert!(s_submit.contains("error"));
        assert!(s_submit.contains("Failed to dispatch report to media outbox"));
    }

    #[test]
    fn test_relay_message_thread_invalid_json() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // Insert invalid JSON as thread
        let thread_key = format!("silo:thread:{}", session_id);
        native_mock::KV_STORE.with(|store| {
            store.borrow_mut().insert(thread_key, "invalid_json".to_string());
        });

        let req_relay = format!(
            r#"{{"sessionId":"{}","message":"Hello","sender":"source"}}"#,
            session_id
        );
        let s_relay = read_returned_string(unsafe { relay_message(req_relay.as_ptr(), req_relay.len()) });
        assert!(s_relay.contains("success"));
        assert!(s_relay.contains("Hello"));
    }

    #[test]
    fn test_relay_message_media_egress_failed() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // Message contains fail_egress
        let req_relay = format!(
            r#"{{"sessionId":"{}","message":"fail_egress","sender":"media"}}"#,
            session_id
        );
        let s_relay = read_returned_string(unsafe { relay_message(req_relay.as_ptr(), req_relay.len()) });
        assert!(s_relay.contains("error"));
        assert!(s_relay.contains("HTTP placeholder relay failed"));
    }

    #[test]
    fn test_get_thread_invalid_json() {
        let req_open = r#"{"outletId":"newsroom-main"}"#;
        let s_open = read_returned_string(unsafe { open_drop(req_open.as_ptr(), req_open.len()) });
        let json: serde_json::Value = serde_json::from_str(&s_open).unwrap();
        let session_id = json["sessionId"].as_str().unwrap();

        // Insert invalid JSON as thread
        let thread_key = format!("silo:thread:{}", session_id);
        native_mock::KV_STORE.with(|store| {
            store.borrow_mut().insert(thread_key, "invalid_json".to_string());
        });

        let req_get = format!(
            r#"{{"sessionId":"{}"}}"#,
            session_id
        );
        let s_get = read_returned_string(unsafe { get_thread(req_get.as_ptr(), req_get.len()) });
        assert!(s_get.contains("success"));
    }

    #[test]
    fn test_alloc_dealloc() {
        let ptr = alloc(100);
        assert!(!ptr.is_null());
        dealloc(ptr, 100);
    }
}
