# Silo — Developer Experience (DX) Friction Log

This document outlines the friction points, compilation hurdles, and runtime bugs encountered while integrating with the **Terminal 3 Agent Dev Kit (ADK)** host APIs, along with the engineering mitigations implemented in Silo.

---

## 1. WebAssembly Compilation & Linker Namespace Snags

### Friction
When target-compiling Rust to WebAssembly, using default toolchains (like `wasm32-wasip2`) creates structured module imports (e.g. `wasi:cli/environment`). However, standard enclave host systems require a flat namespace (`env`) to resolve imported host functions (`host_kv_store_get`, `host_otp_verify`, etc.) directly from the enclave runtime.

### Mitigation
We forced the cargo build target to `wasm32-unknown-unknown` rather than WASI targets, which correctly forces flat `env` namespaces for all external C imports, allowing direct bindings:
```rust
extern "C" {
    fn host_kv_store_get(key_ptr: *const u8, key_len: usize, val_buf_ptr: *mut u8, val_buf_len: usize) -> i32;
}
```

---

## 2. Memory Boundaries & Heap Allocator Crash (SIGSEGV)

### Friction
At first, passing strings back and forth across the WASM boundary resulted in heap corruption and intermittent segment faults (`unreachable` / `SIGSEGV`).
The initial implementation of `dealloc` reconstructed the allocated `String` using `Vec::from_raw_parts(ptr, 0, len)`. In Rust, a `String`'s capacity does not necessarily equal its length, and deallocating with mismatched capacity corrupts the memory allocator state:
```rust
// CRASH PRODUCING
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _buf = Vec::from_raw_parts(ptr, 0, size);
    }
}
```

### Mitigation
We refactored `return_string` and `dealloc` to use the Boxed Slice pattern. By converting the string into an explicit boxed slice `Box<[u8]>`, the size is precisely matched, and standard deallocation frees it safely without corrupting the heap:
```rust
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _slice = Box::from_raw(std::slice::from_raw_parts_mut(ptr, size));
    }
}

fn return_string(s: String) -> u64 {
    let bytes = s.into_bytes();
    let len = bytes.len();
    let mut boxed = bytes.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    std::mem::forget(boxed);
    ((ptr as u64) << 32) | (len as u64)
}
```

---

## 3. 64-Bit Host Pointer Truncation during Native Unit Tests

### Friction
Running native Rust unit tests (`cargo test`) on 64-bit architectures (macOS arm64 / Linux x86_64) caused immediate crashes.
Because pointers on a 64-bit system are 64 bits wide, shifting the pointer left by 32 bits (`(ptr as u64) << 32`) discards the upper 32 bits of the address space. Reconstructing it later in the test runner resulted in a truncated, invalid memory pointer, causing a SIGSEGV.

### Mitigation
We introduced target-dependent compilation blocks. 
- When building for WebAssembly (`wasm32`), we use the 32-bit packing format (`pointer << 32 | length`).
- When running native tests on 64-bit systems, we register the full 64-bit address in a thread-local string registry along with its length, and return only the raw address:
```rust
#[cfg(not(target_arch = "wasm32"))]
fn return_string(s: String) -> u64 {
    let bytes = s.into_bytes();
    let len = bytes.len();
    let mut boxed = bytes.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    let addr = ptr as u64;
    std::mem::forget(boxed);
    native_mock::STRING_REGISTRY.with(|reg| {
        reg.borrow_mut().insert(addr, len);
    });
    addr
}
```
The test suite then uses `unpack_returned_string` to check the target architecture and query the registry natively, preventing pointer truncation.

---

## 4. API Falsy Check Snags in Egress Relay

### Friction
In Express JS gateways, empty string values (e.g. `fileBase64: ""` for a metadata-only submission) are falsy. A simple validation check `if (!fileBase64)` rejected valid empty base64 strings in the Express router endpoint, breaking mock attachments.

### Mitigation
We tightened router validations from general falsy checks to explicit `undefined` checks:
```typescript
if (!session || fileBase64 === undefined || !declaredHash) { ... }
```
This lets developers attach empty strings for verification and benchmarking while keeping validation strict.
