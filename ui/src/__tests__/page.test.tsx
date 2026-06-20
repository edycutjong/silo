import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '@/app/page';

// Mock canvas-confetti
jest.mock('canvas-confetti', () => () => null);

describe('Home page', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    // Silence console
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    originalFetch = global.fetch;

    // Polyfill File.prototype.arrayBuffer if needed
    if (!File.prototype.arrayBuffer) {
      File.prototype.arrayBuffer = async function(this: File) {
        return new ArrayBuffer(0);
      };
    }

    // Mock window.crypto
    Object.defineProperty(window, 'crypto', {
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders landing page with title and switcher', async () => {
    // Mock reports and telemetry seed
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/reports')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reports: [] }),
        });
      }
      if (url.includes('/api/seed')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mediaOutlets: [{ id: 'newsroom-main' }], kv: {} }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any;

    render(<Home />);

    expect(screen.getByText('Expose the truth.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Expose the truth/i })).toBeInTheDocument();
    
    // Check tabs
    expect(screen.getByText('Secure Drop Portal')).toBeInTheDocument();
    expect(screen.getByText('Journalist Console')).toBeInTheDocument();
    expect(screen.getByText('System Telemetry')).toBeInTheDocument();
  });

  it('allows whistleblower submission lifecycle (simulate drop, OTP validation, success)', async () => {
    let fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/reports')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reports: [] }),
        });
      }
      if (url.includes('/api/seed')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            mediaOutlets: [{ id: 'newsroom-main' }],
            kv: {
              'silo:meta:session-123': JSON.stringify({ signedVC: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...' }),
            },
          }),
        });
      }
      if (url.includes('/api/drop/open')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ sessionId: 'session-123', pseudonym: 'Source #123', debugOtp: '999999' }),
        });
      }
      if (url.includes('/api/seed/profile')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/api/drop/attach')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ stashRef: 'stash://ref-123' }),
        });
      }
      if (url.includes('/api/drop/verify')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/api/drop/dispatch')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
    global.fetch = fetchMock as any;

    const { container } = render(<Home />);

    // Mock FileReader & File
    const mockFile = new File(['dummy content'], 'forensic_evidence.pdf', { type: 'application/pdf' });
    
    // Find file input via querySelector since label isn't linked via htmlFor
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    // Wait for file reading / processing (specifically waiting for hash representation in DOM)
    await waitFor(() => {
      expect(screen.getByText('CLIENT-SIDE SHA-256:')).toBeInTheDocument();
    });

    // Fill out form by finding elements with initial values
    const subjectInput = screen.getByDisplayValue('Falsified Safety Inspections - ICU Unit');
    fireEvent.change(subjectInput, { target: { value: 'ICU violations' } });

    const contactInput = screen.getByDisplayValue('whistleblower@hospital-safety.org');
    fireEvent.change(contactInput, { target: { value: 'whistleblower@test.com' } });

    const summaryInput = screen.getByDisplayValue('Logs showing safety checklists were auto-completed by management without actual inspector presence.');
    fireEvent.change(summaryInput, { target: { value: 'Summary here...' } });

    // Submit Step 1
    const submitBtn = screen.getByRole('button', { name: /Seal & Open Secure Session/i });
    fireEvent.click(submitBtn);

    // Should transition to Step 2
    await waitFor(() => {
      expect(screen.getByText('Enter OTP Verification Code')).toBeInTheDocument();
    });

    // Fill OTP
    const otpInput = screen.getByPlaceholderText('000000');
    fireEvent.change(otpInput, { target: { value: '999999' } });

    // Submit Step 2
    const verifyBtn = screen.getByRole('button', { name: /Verify & Submit/i });
    fireEvent.click(verifyBtn);

    // Should transition to Step 3
    await waitFor(() => {
      expect(screen.getByText('Report Dispatched Safely')).toBeInTheDocument();
    });
    expect(screen.getByText('Source #123')).toBeInTheDocument();
  });

  it('journalist console displays reports and supports selection and thread verification', async () => {
    const mockReports = [
      {
        inboxId: 'session-777',
        resolvedBody: JSON.stringify({
          pseudonym: 'Source #777',
          evidenceHash: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
          manifestSignature: 'signature123',
          timestamp: Date.now(),
        }),
        originalBody: JSON.stringify({
          pseudonym: 'Source #777',
        }),
        timestamp: Date.now(),
      }
    ];

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/reports')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reports: mockReports }),
        });
      }
      if (url.includes('/api/seed')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            kv: {
              'silo:drop:session-777': JSON.stringify({ stashRef: 'stash://ref-777' }),
            },
            mediaOutlets: [],
          }),
        });
      }
      if (url.includes('/api/drop/thread')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ thread: [{ message: 'Hello from whistleblower', sender: 'source' }] }),
        });
      }
      if (url.includes('/api/admin/download')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ fileBase64: 'ZHVtbXk=' }), // 'dummy' in base64
        });
      }
      if (url.includes('/api/drop/relay')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as any;

    const expectedBytes = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
    ]);

    // Redefine window.crypto specifically for this test to match expected hash
    Object.defineProperty(window, 'crypto', {
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(expectedBytes.buffer),
        },
      },
      writable: true,
      configurable: true,
    });

    render(<Home />);

    // Click Journalist Console Tab
    const journalistTab = screen.getByText('Journalist Console');
    fireEvent.click(journalistTab);

    // Wait for reports to render
    await waitFor(() => {
      expect(screen.getByText('Source #777')).toBeInTheDocument();
    });

    // Select the report
    fireEvent.click(screen.getByText('Source #777'));

    // Check that selected report detail is shown (using SESSION label or similar)
    await waitFor(() => {
      expect(screen.getByText('SESSION: session-777')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Hello from whistleblower')).toBeInTheDocument();
    });

    // Verify Integrity by clicking the "Validate Stash" button
    const verifyIntegrityBtn = screen.getByRole('button', { name: /Validate Stash/i });
    fireEvent.click(verifyIntegrityBtn);

    // Wait for validation success indication "Signature Valid (No Tampering)"
    await waitFor(() => {
      expect(screen.getByText('Signature Valid (No Tampering)')).toBeInTheDocument();
    });

    // Test sending chat message
    const chatInput = screen.getByPlaceholderText(/Send a secure follow-up to/i);
    fireEvent.change(chatInput, { target: { value: 'Response from journalist' } });

    const form = chatInput.closest('form');
    expect(form).toBeInTheDocument();
    fireEvent.submit(form!);

    // It should invoke the relay API
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/drop/relay'), expect.objectContaining({
        method: 'POST',
      }));
    });
  });
});
