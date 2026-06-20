import time
import statistics
import requests
import sys

def run_benchmarks(runs=100):
    latencies = []
    print(f"Starting {runs} benchmark iterations...")
    
    for i in range(runs):
        start = time.perf_counter()
        
        try:
            # 1. Open Session
            r_session = requests.post("http://localhost:3001/api/drop/open", json={"outlet": "newsroom-main"})
            if r_session.status_code != 200:
                print(f"Error opening session: {r_session.text}")
                continue
            session_id = r_session.json()["sessionId"]
            
            # 2. Attach Mock File (empty PDF file hash)
            r_attach = requests.post("http://localhost:3001/api/drop/attach", json={
                "session": session_id, 
                "fileBase64": "", 
                "declaredHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            })
            if r_attach.status_code != 200:
                print(f"Error attaching: {r_attach.text}")
                continue
                
            # 3. Simulate OTP Verification
            r_verify = requests.post("http://localhost:3001/api/drop/verify", json={"session": session_id, "otp": "883391"})
            if r_verify.status_code != 200:
                print(f"Error verifying: {r_verify.text}")
                continue
                
            # 4. Dispatch Report
            r_dispatch = requests.post("http://localhost:3001/api/drop/dispatch", json={"session": session_id})
            if r_dispatch.status_code != 200:
                print(f"Error dispatching: {r_dispatch.text}")
                continue
                
            end = time.perf_counter()
            latencies.append((end - start) * 1000) # milliseconds
        except Exception as e:
            print(f"Iteration {i} failed: {e}")
            continue

    if not latencies:
        print("No benchmarks completed successfully.")
        sys.exit(1)

    print(f"\n--- Benchmark Results ({len(latencies)} runs) ---")
    print(f"Min Latency:  {min(latencies):.2f} ms")
    print(f"Max Latency:  {max(latencies):.2f} ms")
    print(f"Mean Latency: {statistics.mean(latencies):.2f} ms")
    print(f"p50 Latency:  {statistics.median(latencies):.2f} ms")
    print(f"p95 Latency:  {statistics.quantiles(latencies, n=20)[18]:.2f} ms")

if __name__ == "__main__":
    run_benchmarks()
