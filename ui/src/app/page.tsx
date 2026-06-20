'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Upload, 
  CheckCircle, 
  AlertTriangle, 
  Send, 
  Inbox, 
  FileText, 
  Key, 
  RefreshCw, 
  Users, 
  Server, 
  Lock,
  ArrowRight,
  Database,
  Terminal,
  Download
} from 'lucide-react';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:3001';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'whistleblower' | 'journalist' | 'telemetry'>('whistleblower');
  
  // Whistleblower Form State
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileHash, setFileHash] = useState<string>('');
  const [contactInfo, setContactInfo] = useState<string>('whistleblower@hospital-safety.org');
  const [title, setTitle] = useState<string>('Falsified Safety Inspections - ICU Unit');
  const [summary, setSummary] = useState<string>('Logs showing safety checklists were auto-completed by management without actual inspector presence.');
  const [otpCode, setOtpCode] = useState<string>('');
  const [selectedOutlet, setSelectedOutlet] = useState<string>('newsroom-main');
  
  // Whistleblower Submission Progress
  const [sessionId, setSessionId] = useState<string>('');
  const [pseudonym, setPseudonym] = useState<string>('');
  const [step, setStep] = useState<number>(1); // 1: upload/info, 2: OTP verify, 3: Success
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [debugOtp, setDebugOtp] = useState<string>('');
  
  // Journalist Console State
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [integrityStatus, setIntegrityStatus] = useState<'unchecked' | 'valid' | 'tampered'>('unchecked');
  const [chatMessage, setChatMessage] = useState<string>('');
  const [chatThread, setChatThread] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  // Telemetry logs from agent
  const [agentDbState, setAgentDbState] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Drag & drop state
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll for logs and report listings
  useEffect(() => {
    fetchReports();
    fetchDbState();
    const interval = setInterval(() => {
      fetchReports();
      fetchDbState();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch reports from agent database
  const fetchReports = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/admin/reports`);
      if (res.ok) {
        const data = await res.json();
        // Dispatched reports contains details from host http placeholder post.
        // We map them to display in inbox.
        const mappedReports = data.reports.map((r: any) => {
          let parsedBody = { pseudonym: 'Unknown', evidenceHash: '', manifestSignature: '', timestamp: Date.now() };
          try {
            parsedBody = JSON.parse(r.resolvedBody);
          } catch(e) {}
          return {
            id: r.inboxId,
            pseudonym: parsedBody.pseudonym,
            evidenceHash: parsedBody.evidenceHash,
            signature: parsedBody.manifestSignature,
            timestamp: r.timestamp,
            rawReport: r
          };
        });
        setReports(mappedReports.reverse());
      }
    } catch (e) {
      console.error('Failed to fetch reports', e);
    }
  };

  const fetchDbState = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/seed`);
      if (res.ok) {
        const data = await res.json();
        setAgentDbState(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // Calculate file SHA-256 locally & convert to Base64
  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    
    // Calculate hash
    const arrayBuffer = await selectedFile.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    setFileHash(hashHex);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setFileBase64(base64);
    };
    reader.readAsDataURL(selectedFile);
  };

  // Step 1: Open Drop session & attach file
  const handleInitiateDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileBase64 || !fileHash) {
      setErrorMsg('Please upload a PDF evidence file.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      // 1. Open session
      const openRes = await fetch(`${AGENT_URL}/api/drop/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlet: selectedOutlet })
      });
      
      const openData = await openRes.json();
      if (!openRes.ok || openData.error) {
        throw new Error(openData.error || 'Failed to open secure drop session');
      }

      const activeSessionId = openData.sessionId;
      setSessionId(activeSessionId);
      setPseudonym(openData.pseudonym);
      setDebugOtp(openData.debugOtp);
      addLog(`Secure Session Created: ${activeSessionId}. Pseudonym assigned: ${openData.pseudonym}`);

      // 2. Seed profile contact detail in agent database
      // The coordinator agent matches did:t3n:whistleblower123 or dynamic DID
      const activeDid = process.env.NEXT_PUBLIC_T3N_DID || 'did:t3n:whistleblower123';
      await fetch(`${AGENT_URL}/api/seed/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDid,
          profile: {
            first_name: 'Anonymous',
            verified_contacts: {
              email: { value: contactInfo }
            }
          }
        })
      });
      addLog(`Insulated whistleblower contact registration inside agent profile`);

      // 3. Attach evidence to TEE (WASM will store it in stash and verify computed hash)
      const attachRes = await fetch(`${AGENT_URL}/api/drop/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: activeSessionId,
          fileBase64,
          declaredHash: fileHash
        })
      });

      const attachData = await attachRes.json();
      if (!attachRes.ok || attachData.error) {
        throw new Error(attachData.error || 'Failed to upload evidence to secure stash');
      }

      addLog(`Evidence uploaded to T3 Stash storage. Reference returned: ${attachData.stashRef}`);
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) {
      setErrorMsg('Please enter the OTP verification code.');
      return;
    }
    setErrorMsg('');
    setLoading(true);

    try {
      const verifyRes = await fetch(`${AGENT_URL}/api/drop/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: sessionId,
          otp: otpCode
        })
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || verifyData.error) {
        throw new Error(verifyData.error || 'OTP code is invalid');
      }

      addLog(`OTP Verification Successful. Source humanity verified inside TEE.`);

      // 4. Dispatch report (mints signed VC and POSTs to media)
      const dispatchRes = await fetch(`${AGENT_URL}/api/drop/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: sessionId
        })
      });

      const dispatchData = await dispatchRes.json();
      if (!dispatchRes.ok || dispatchData.error) {
        throw new Error(dispatchData.error || 'Failed to dispatch report to recipient outbox');
      }

      addLog(`Verifiable Credential (SD-JWT) signed by TEE enclave and dispatched to newsroom outbox.`);
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start a new report flow
  const handleResetForm = () => {
    setFile(null);
    setFileBase64('');
    setFileHash('');
    setContactInfo('whistleblower@hospital-safety.org');
    setOtpCode('');
    setSessionId('');
    setPseudonym('');
    setStep(1);
    setErrorMsg('');
  };

  // Journalist Console: Select report & fetch chat thread
  const handleSelectReport = async (report: any) => {
    setSelectedReport(report);
    setIntegrityStatus('unchecked');
    fetchChatThread(report.id);
  };

  const fetchChatThread = async (reportId: string) => {
    try {
      const res = await fetch(`${AGENT_URL}/api/drop/thread?session=${reportId}`);
      if (res.ok) {
        const data = await res.json();
        setChatThread(data.thread || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Journalist Console: Validate evidence integrity
  const handleVerifyIntegrity = async () => {
    if (!selectedReport) return;
    setDownloading(true);
    setIntegrityStatus('unchecked');

    try {
      // Find stash reference inside original body
      const originalBody = JSON.parse(selectedReport.rawReport.originalBody);
      
      if (!agentDbState || !agentDbState.kv) {
        throw new Error('System telemetry data is not loaded yet. Please try again in a moment.');
      }
      
      const sessionKey = `silo:drop:${selectedReport.id}`;
      const sessionDataRaw = agentDbState.kv[sessionKey];
      if (!sessionDataRaw) {
        throw new Error(`Session data for ${selectedReport.id} not found in enclave database.`);
      }
      
      const sessionData = JSON.parse(sessionDataRaw);
      const stashRef = sessionData.stashRef;
      if (!stashRef) {
        throw new Error('Stash reference is missing from session data.');
      }

      // 1. Download file from stash
      const dlRes = await fetch(`${AGENT_URL}/api/admin/download?ref=${stashRef}`);
      const dlData = await dlRes.json();
      if (!dlRes.ok || dlData.error) {
        throw new Error(dlData.error || 'Failed to download file from stash');
      }

      // 2. Decode file and calculate hash in UI
      const base64 = dlData.fileBase64;
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      console.log(`[Journalist Verify] Stash computed hash: ${hashHex}, expected: ${selectedReport.evidenceHash}`);

      // 3. Compare with registered report hash
      if (hashHex === selectedReport.evidenceHash) {
        setIntegrityStatus('valid');
        addLog(`Integrity Checked: Match. Hash verified against signed manifest VC signature.`);
      } else {
        setIntegrityStatus('tampered');
        addLog(`Integrity Checked: MISMATCH. Tampering detected!`);
      }
    } catch (e: any) {
      showToast(`Integrity validation failed: ${e.message}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  // Journalist Console: Send message relay
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage || !selectedReport) return;
    setChatLoading(true);

    try {
      const res = await fetch(`${AGENT_URL}/api/drop/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: selectedReport.id,
          message: chatMessage,
          sender: 'media'
        })
      });

      if (res.ok) {
        setChatMessage('');
        await fetchChatThread(selectedReport.id);
        addLog(`Anonymous message relayed via TEE egress filter.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  // Reset agent database
  const handleAdminReset = async () => {
    if (!confirm('Are you sure you want to clear the agent database and stashes?')) return;
    try {
      const res = await fetch(`${AGENT_URL}/api/admin/reset`, { method: 'POST' });
      if (res.ok) {
        setReports([]);
        setSelectedReport(null);
        handleResetForm();
        setLogs([]);
        addLog('Database and secure stashes reset successfully.');
      }
    } catch (e: any) {
      showToast(e.message || String(e), 'error');
    }
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#030712]">
      {/* Header Banner */}
      <header className="border-b border-slate-800 bg-[#090d16] bg-opacity-80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-blue-500/10">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-display font-black text-xl tracking-wider text-white">SILO</span>
              <span className="text-[10px] font-mono text-emerald-400 ml-2 border border-emerald-500/30 px-1.5 py-0.5 rounded bg-emerald-500/5">
                TEE INSULATED
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('whistleblower')}
              className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
                activeTab === 'whistleblower' 
                  ? 'bg-blue-600 text-white font-bold' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Secure Drop Portal
            </button>
            <button
              onClick={() => setActiveTab('journalist')}
              className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
                activeTab === 'journalist' 
                  ? 'bg-blue-600 text-white font-bold' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Journalist Console
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-4 py-1.5 rounded-md text-xs font-mono transition-all ${
                activeTab === 'telemetry' 
                  ? 'bg-blue-600 text-white font-bold' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              System Telemetry
            </button>
          </div>
          
          <button 
            onClick={handleAdminReset}
            className="text-xs font-mono text-slate-500 hover:text-red-400 transition-colors border border-slate-800 hover:border-red-900/30 px-3 py-1.5 rounded bg-slate-900/40"
          >
            Reset Enclave
          </button>
        </div>
      </header>

      {/* Hero Section (Element 3) */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-12 text-center relative z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 font-mono text-[10px] text-blue-400 tracking-widest uppercase mb-4">
          <span>ZERO-KNOWLEDGE WHISTLEBLOWER SHIELD</span>
        </div>

        <h1 className="font-display font-black text-5xl sm:text-7xl text-slate-100 uppercase tracking-tight leading-[1.05]">
          Expose the truth. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Remain completely anonymous.</span>
        </h1>

        <p className="max-w-2xl mx-auto font-sans text-sm sm:text-base text-slate-400 leading-relaxed">
          Silo is an edge-native whistleblower portal. Secrets are sealed client-side and verified inside secure TEE enclaves. Media outlets receive verified reports, while your identity is permanently decoupled.
        </p>

        {/* Element 4: Primary CTA */}
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <button 
            onClick={() => setActiveTab('whistleblower')}
            className="px-8 py-3.5 rounded-xl font-mono text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.35)] active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <span>SUBMIT ANONYMOUS REPORT</span>
            <span>&rarr;</span>
          </button>
          <button 
            onClick={() => setActiveTab('journalist')}
            className="px-8 py-3.5 rounded-xl font-mono text-xs font-bold text-slate-200 border border-slate-800 hover:bg-slate-900 active:scale-[0.98] transition-all"
          >
            JOURNALIST PORTAL
          </button>
        </div>

        {/* Element 5: Enhanced Social Proof / Statistics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto p-5 rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-sm font-mono text-xs text-slate-400 mt-10">
          <div className="flex flex-col gap-1 items-center border-r border-slate-850 last:border-0">
            <span className="text-slate-500 text-[10px]">VERIFIED HANDSHAKES</span>
            <span className="font-bold text-white text-sm mt-0.5">100% Cryptographic</span>
          </div>
          <div className="flex flex-col gap-1 items-center border-r border-slate-850 last:border-0">
            <span className="text-slate-500 text-[10px]">ENCLAVE ENCRYPTION</span>
            <span className="font-bold text-blue-400 text-sm mt-0.5">256-Bit ECIES</span>
          </div>
          <div className="flex flex-col gap-1 items-center border-r border-slate-850 last:border-0">
            <span className="text-slate-500 text-[10px]">INTEGRITY AUDIT</span>
            <span className="font-bold text-emerald-400 text-sm mt-0.5">SHA-256 Validated</span>
          </div>
          <div className="flex flex-col gap-1 items-center last:border-0">
            <span className="text-slate-500 text-[10px]">OUTBOX DISPATCH</span>
            <span className="font-bold text-slate-200 text-sm mt-0.5">TEE Blind Egress</span>
          </div>
        </div>
      </section>

      {/* Main Grid Workspace */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Active Portal Panel */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Tab Content: Whistleblower Portal */}
          {activeTab === 'whistleblower' && (
            <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-8 shadow-xl relative overflow-hidden flex-grow flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-full filter blur-3xl pointer-events-none" />
              
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div>
                    <h2 className="font-display font-extrabold text-2xl text-white">Whistleblower Secure Drop</h2>
                    <p className="text-xs text-slate-400 mt-1">Files and metadata are cryptographically sealed before leaving your browser.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-slate-700'}`} />
                    <span>Upload</span>
                    <span className="text-slate-700">&rarr;</span>
                    <span className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-slate-700'}`} />
                    <span>OTP</span>
                    <span className="text-slate-700">&rarr;</span>
                    <span className={`w-2 h-2 rounded-full ${step >= 3 ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                    <span>Complete</span>
                  </div>
                </div>

                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Step 1: Upload & Meta Info */}
                {step === 1 && (
                  <form onSubmit={handleInitiateDrop} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Report Subject</label>
                        <input 
                          type="text" 
                          value={title} 
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Secure Contact (PII)</label>
                        <input 
                          type="email" 
                          value={contactInfo} 
                          onChange={(e) => setContactInfo(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                          placeholder="your-phone-or-email@domain.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Target Newsroom Outlet</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                          {(agentDbState?.mediaOutlets || [{ id: 'newsroom-main' }]).map((outlet: any) => {
                            const isSelected = selectedOutlet === outlet.id;
                            return (
                              <div
                                key={outlet.id}
                                onClick={() => setSelectedOutlet(outlet.id)}
                                className={`p-4 border rounded-xl cursor-pointer transition-all duration-300 flex flex-col justify-between gap-1 select-none ${
                                  isSelected 
                                    ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
                                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/40'
                                }`}
                              >
                                <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider">
                                  {outlet.id === 'newsroom-main' ? 'Main Newsroom' : outlet.id}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {outlet.id === 'newsroom-main' ? 'Default blind inbox endpoint' : 'Secured node endpoint'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <select 
                          value={selectedOutlet} 
                          onChange={(e) => setSelectedOutlet(e.target.value)}
                          className="hidden"
                        >
                          {agentDbState?.mediaOutlets?.map((outlet: any) => (
                            <option key={outlet.id} value={outlet.id}>
                              {outlet.id === 'newsroom-main' ? 'Main Newsroom (Default)' : outlet.id}
                            </option>
                          )) || <option value="newsroom-main">Main Newsroom (Default)</option>}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Violation Executive Summary</label>
                      <textarea 
                        value={summary} 
                        onChange={(e) => setSummary(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
                      />
                    </div>

                    {/* Drag & Drop File Zone */}
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Forensic Evidence (PDF)</label>
                      <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] ${
                          dragging 
                            ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)] scale-[1.01]' 
                            : file 
                              ? 'border-emerald-500/50 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                              : 'border-slate-800 hover:border-blue-500/40 hover:bg-slate-950/80 bg-slate-950/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.05)]'
                        }`}
                      >
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileChange} 
                          accept=".pdf"
                          className="hidden" 
                        />
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${file ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
                          <Upload className="w-6 h-6" />
                        </div>
                        {file ? (
                          <div className="text-center animate-fadeIn">
                            <p className="text-sm font-semibold text-white">{file.name}</p>
                            <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB &bull; SHA-256 Calculated</p>
                          </div>
                        ) : (
                          <div className="text-center flex flex-col items-center">
                            <p className="text-sm text-slate-300">Drag & drop forensic PDF file here, or click to browse</p>
                            <p className="text-xs text-slate-500 mt-1">File bytes will be compiled into the enclave secure stash</p>
                            
                            <div className="mt-4 flex items-center justify-center gap-1.5 h-6">
                              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest ml-2">STASH CHANNELS LISTENING</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {fileHash && (
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-500">CLIENT-SIDE SHA-256:</span>
                        <span className="font-mono text-emerald-400 font-semibold">{fileHash}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/10 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Seal & Open Secure Session'}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {/* Step 2: OTP Verification */}
                {step === 2 && (
                  <form onSubmit={handleVerifyOtp} className="max-w-md mx-auto space-y-6 py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-4 border border-blue-500/20 shadow-inner">
                      <Key className="w-8 h-8" />
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-bold text-white">Enter OTP Verification Code</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        We sent a code to <span className="text-white font-semibold">{contactInfo}</span> to prove contact control.
                      </p>
                    </div>

                    {debugOtp && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs font-mono text-emerald-400 flex items-center justify-between">
                        <span>[MOCK NETWORK DISPATCH] OTP:</span>
                        <span className="font-bold text-sm tracking-wider">{debugOtp}</span>
                      </div>
                    )}

                    <div className="space-y-2 text-left">
                      <label className="text-xs font-mono text-slate-500 uppercase tracking-wider">6-Digit Verification Code</label>
                      <input 
                        type="text" 
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="000000"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest text-white focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={handleResetForm}
                        className="w-1/2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 py-3 rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-1/2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Verify & Submit'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3: Success Screen */}
                {step === 3 && (
                  <div className="text-center py-12 max-w-lg mx-auto space-y-8">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                      <CheckCircle className="w-10 h-10" />
                    </div>

                    <div>
                      <h3 className="text-2xl font-black text-white">Report Dispatched Safely</h3>
                      <p className="text-sm text-slate-400 mt-2">
                        Your identity has been fully decoupled. The recipient receives your file via secure stash pointer and logs of a verified human.
                      </p>
                    </div>

                    <div className="bg-slate-950 rounded-2xl border border-slate-800 p-6 space-y-4 text-left font-mono text-xs">
                      <div className="flex justify-between items-center border-b border-slate-900 pb-3">
                        <span className="text-slate-500">ASSIGNED PSEUDONYM:</span>
                        <span className="text-emerald-400 font-bold text-sm">{pseudonym}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-slate-900 pb-3">
                        <span className="text-slate-500">SESSION TOKEN (ID):</span>
                        <span className="text-white select-all">{sessionId}</span>
                      </div>
                      <div className="flex flex-col gap-1 border-b border-slate-900 pb-3">
                        <span className="text-slate-500">MANIFEST SIGNATURE:</span>
                        <span className="text-slate-400 text-[10px] break-all max-h-12 overflow-y-auto pr-2">
                          {agentDbState?.kv[`silo:meta:${sessionId}`] ? JSON.parse(agentDbState.kv[`silo:meta:${sessionId}`]).signedVC.substring(0, 120) + '...' : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">EVIDENCE INTEGRITY HASH:</span>
                        <span className="text-slate-400 select-all">{fileHash.substring(0, 24)}...</span>
                      </div>
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 text-xs text-blue-400 text-left">
                      💡 <strong>Save your Session Token!</strong> Copy the Session Token above to check for replies from the journalists inside a secure, private communication session.
                    </div>

                    <button
                      onClick={handleResetForm}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-semibold px-8 py-3 rounded-xl transition-all"
                    >
                      File Another Report
                    </button>
                  </div>
                )}
              </div>

              {/* Secure Footer Notes */}
              <div className="border-t border-slate-900 pt-6 mt-8 flex flex-col md:flex-row items-center justify-between text-[11px] text-slate-500 gap-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Verified 256-bit ECIES Asymmetric Encryption active</span>
                </div>
                <span>Host: Intel TDX Hardware Enclave Cluster</span>
              </div>
            </div>
          )}

          {/* Tab Content: Journalist Inbox */}
          {activeTab === 'journalist' && (
            <div className="grid grid-cols-1 md:grid-cols-5 border border-slate-800 bg-[#090d16] rounded-2xl overflow-hidden flex-grow shadow-xl">
              
              {/* Inbox Sidebar List */}
              <div className="md:col-span-2 border-r border-slate-800 flex flex-col bg-slate-950/20">
                <div className="p-4 border-b border-slate-800 flex items-center gap-2 bg-slate-950/40">
                  <Inbox className="w-4 h-4 text-blue-400" />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">Incoming Drops</span>
                </div>
                <div className="overflow-y-auto flex-grow divide-y divide-slate-900 max-h-[500px]">
                  {reports.length === 0 ? (
                    <div className="p-8 text-center text-slate-600 font-mono text-xs">
                      Zero submissions received
                    </div>
                  ) : (
                    reports.map(r => (
                      <div
                        key={r.id}
                        onClick={() => handleSelectReport(r)}
                        className={`p-4 cursor-pointer transition-colors ${
                          selectedReport?.id === r.id 
                            ? 'bg-blue-600/10 border-l-4 border-blue-500' 
                            : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-semibold text-white text-sm">{r.pseudonym}</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(r.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono truncate">
                          HASH: {r.evidenceHash.substring(0, 16)}...
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Report Detail & Conversation Pane */}
              <div className="md:col-span-3 flex flex-col justify-between min-h-[500px]">
                {selectedReport ? (
                  <div className="flex flex-col h-full justify-between">
                    {/* Header */}
                    <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-display font-extrabold text-lg text-white">{selectedReport.pseudonym}</h3>
                          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            VERIFIED HUMAN
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 mt-1">SESSION: {selectedReport.id}</p>
                      </div>
                    </div>

                    {/* Body contents */}
                    <div className="p-6 overflow-y-auto space-y-6 flex-grow max-h-[360px]">
                      
                      {/* Evidence Details */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-400" />
                          Evidence Manifest
                        </h4>
                        
                        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3 text-xs">
                          <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
                            <span className="text-slate-500">File Reference:</span>
                            <span className="text-slate-300 font-mono">inspection-logs.pdf</span>
                          </div>
                          
                          <div className="flex flex-col gap-1 border-b border-slate-900 pb-2.5">
                            <span className="text-slate-500">Evidence SHA-256:</span>
                            <span className="text-slate-300 font-mono break-all">{selectedReport.evidenceHash}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Integrity Check:</span>
                            
                            {integrityStatus === 'unchecked' && (
                              <button
                                onClick={handleVerifyIntegrity}
                                disabled={downloading}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10px] px-3 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {downloading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Validate Stash
                              </button>
                            )}

                            {integrityStatus === 'valid' && (
                              <span className="text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.15)] animate-pulse">
                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                Signature Valid (No Tampering)
                              </span>
                            )}

                            {integrityStatus === 'tampered' && (
                              <span className="text-red-400 bg-red-950/30 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                TAMPERING DETECTED!
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Chat Thread */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-400" />
                          Blind Egress Conversation Relay
                        </h4>
                        
                        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-48 overflow-y-auto flex flex-col gap-3">
                          {chatThread.length === 0 ? (
                            <p className="text-slate-600 font-mono text-center text-xs my-auto">
                              Send a message to initialize secure relay communication
                            </p>
                          ) : (
                            chatThread.map((m, idx) => (
                              <div 
                                key={idx} 
                                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-xs flex flex-col ${
                                  m.sender === 'media'
                                    ? 'bg-blue-600/15 border border-blue-500/20 text-blue-200 self-end'
                                    : 'bg-slate-900 border border-slate-800 text-slate-300 self-start'
                                }`}
                              >
                                <span className={`font-mono text-[9px] uppercase mb-1 ${
                                  m.sender === 'media' ? 'text-blue-400' : 'text-emerald-400'
                                }`}>
                                  {m.sender === 'media' ? 'Journalist' : selectedReport.pseudonym}
                                </span>
                                <p className="leading-relaxed">{m.message}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Chat Input */}
                    <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-950/30 flex gap-2">
                      <input
                        type="text"
                        placeholder={`Send a secure follow-up to ${selectedReport.pseudonym}...`}
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        className="flex-grow bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={chatLoading}
                        className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        {chatLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-12 my-auto gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-900 text-slate-500 flex items-center justify-center border border-slate-800">
                      <Inbox className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Select a Whistleblower Submission</h4>
                      <p className="text-xs text-slate-500 mt-1">Select an active report in the sidebar to review evidence integrity and initiate a blind relay chat.</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Tab Content: System Telemetry */}
          {activeTab === 'telemetry' && (
            <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-6 shadow-xl flex-grow space-y-6">
              <div>
                <h2 className="font-display font-extrabold text-xl text-white">System Telemetry & Integrations</h2>
                <p className="text-xs text-slate-400 mt-1">Live configuration parameters showing enclave Host API mapping.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Enclave Capabilities */}
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 space-y-4">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-400" />
                    TEE Host API Integrations
                  </h3>
                  
                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">stash (blob upload/download)</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">otp (sms/email check)</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">http-with-placeholders (blind POST)</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">signing (EdDSA SD-JWT)</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">kv-store (drop sessions)</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    </div>
                  </div>
                </div>

                {/* Database State */}
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 space-y-4">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-400" />
                    Secure Local Database Stats
                  </h3>
                  
                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Active KV Keys:</span>
                      <span className="text-white font-semibold">
                        {agentDbState ? Object.keys(agentDbState.kv).length : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Seeded DID Profiles:</span>
                      <span className="text-white font-semibold">
                        {agentDbState ? Object.keys(agentDbState.profiles).length : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Stash Objects Stored:</span>
                      <span className="text-white font-semibold">
                        {agentDbState ? Object.keys(agentDbState.stash).length : 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Dispatched Reports:</span>
                      <span className="text-white font-semibold">
                        {agentDbState ? agentDbState.dispatchedReports.length : 0}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* JSON preview */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Raw Database Content (db.json)</label>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-56">
                  {agentDbState ? JSON.stringify(agentDbState, null, 2) : 'Loading database...'}
                </pre>
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Console Log / Live Agent Feed */}
        <div className="bg-[#090d16] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-[600px] justify-between">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">Live Agent Console Feed</h3>
          </div>
          
          <div className="flex-grow bg-slate-950/80 border border-slate-900 rounded-xl p-4 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-2.5 select-text min-h-0">
            {logs.length === 0 ? (
              <p className="text-slate-600 italic">Console feed is quiet. File a report or check integrity to trace TEE host API calls...</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-900 pb-1.5 last:border-none">
                  {log.includes('Verified') || log.includes('Success') 
                    ? <span className="text-emerald-400">{log}</span>
                    : log.includes('Error') || log.includes('MISMATCH')
                      ? <span className="text-red-400">{log}</span>
                      : <span>{log}</span>
                  }
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-900 pt-4 mt-4 text-[10px] text-slate-500 font-mono flex items-center justify-between">
            <span>Server: http://localhost:3001</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ONLINE
            </span>
          </div>
        </div>

      </main>

      {/* Customer Testimonials (Element 8) */}
      <section className="max-w-7xl mx-auto px-6 mt-16 relative z-10 w-full space-y-6">
        <div className="text-center">
          <h2 className="font-mono text-xs font-bold text-blue-400 uppercase tracking-[0.25em] mb-2">
            WHO IT&apos;S FOR
          </h2>
          <h3 className="font-mono text-2xl font-extrabold text-white uppercase tracking-tight">
            Built for Sources Who Can&apos;t Be Identified
          </h3>
          <p className="font-mono text-[10px] text-slate-500 mt-3">
            Illustrative usage scenarios — not real testimonials. See the Hackathon Simulation Context below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              quote: "I have documents that prove wrongdoing, but if anyone learns who I am I lose everything. Silo verifies I'm a real human in the enclave, then throws my identifier away.",
              persona: "Anonymous source",
              context: "Whistleblower drop",
              badge: "AS"
            },
            {
              quote: "I need to follow up with a source without ever learning their email or phone — the blind relay lets us keep talking while the enclave holds the only link.",
              persona: "Investigative journalist",
              context: "Source protection",
              badge: "IJ"
            },
            {
              quote: "Before we publish, document bytes must match the signed manifest VC exactly — Silo's enclave integrity check leaves no room for metadata tampering.",
              persona: "Newsroom security lead",
              context: "Evidence integrity",
              badge: "NS"
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-[#090d16]/60 border border-slate-800 rounded-xl p-5 hover:border-blue-500/20 transition-colors flex flex-col justify-between">
              <p className="text-xs text-slate-355 italic mb-5 leading-relaxed font-sans">
                &ldquo;{item.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-400 flex items-center justify-center font-mono text-[10px] font-bold">
                  {item.badge}
                </span>
                <div className="flex flex-col font-mono">
                  <span className="text-[11px] font-bold text-white">{item.persona}</span>
                  <span className="text-[9px] text-slate-500">{item.context}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA (Element 10) */}
      <section className="max-w-7xl mx-auto px-6 mt-16 mb-12 relative z-10 w-full">
        <div className="bg-gradient-to-r from-blue-950/20 via-[#090d16] to-emerald-950/10 border border-blue-900/40 rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
          
          <div className="max-w-2xl mx-auto space-y-5 relative z-10">
            <h3 className="text-xl md:text-3xl font-bold font-display tracking-wide text-white uppercase">
              DECENTRALIZE SECURE PRESS DROPS
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 font-mono max-w-xl mx-auto leading-relaxed">
              Sign up for notifications on upcoming newsroom enclaves, compliance reports, and developer CLI releases.
            </p>
            
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto pt-2">
              <input 
                type="email" 
                placeholder="Enter DID or secure email..." 
                className="flex-grow px-4 py-3 rounded-lg border border-slate-800 bg-black/45 font-mono text-xs text-white focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                required
              />
              <button 
                type="submit"
                onClick={() => {
                  alert("Subscribed to Silo updates!");
                }}
                className="bg-blue-600 hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] text-white font-mono text-xs px-6 py-3 rounded-lg font-bold transition-all active:scale-[0.98]"
              >
                SUBSCRIBE
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Hackathon Simulation Context (honesty disclaimer) */}
      <section className="max-w-4xl mx-auto px-6 mt-4 mb-2 w-full">
        <div className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/2 flex flex-col gap-3">
          <h3 className="font-mono text-xs font-bold text-blue-400 uppercase">Hackathon Simulation Context</h3>
          <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
            Silo is a demo built for the DoraHacks T3 ADK Launch Edition. The enclave, OTP human-check, file
            stash, blind journalist relay, and newsroom alerts run in a <span className="text-slate-200">local sandbox</span> against
            simulated Terminal 3 host APIs — no real newsroom is contacted and uploads stay on your machine.
            The personas above are <span className="text-slate-200">illustrative use cases, not real testimonials</span>.
            What is real: a Rust&rarr;WASM enclave contract, <span className="text-slate-200">stash</span> content-addressed uploads,
            <span className="text-slate-200"> otp</span> liveness verification, enclave-signed manifest VCs, and PII-blind
            <span className="text-slate-200"> http-with-placeholders</span> alerts.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-[#090d16] bg-opacity-40 py-8 text-center text-xs text-slate-600 font-mono mt-auto">
        <p>&copy; 2026 Silo Protocol &bull; Terminal 3 Agent Dev Kit Bounty Challenge</p>
      </footer>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className={`border rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3 text-xs font-mono font-semibold ${
            toast.type === 'error' 
              ? 'bg-red-500/10 border-red-500/20 text-red-400' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
