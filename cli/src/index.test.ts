import * as path from 'path';

// Mock fs to allow simulating read errors for the version check
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn((p) => {
      if (typeof p === 'string' && p.includes('package.json') && (global as any).throwFsError) {
        throw new Error('Disk read error');
      }
      return actualFs.existsSync(p);
    })
  };
});

import { program } from './index';
import * as fs from 'fs';

describe('Silo CLI Suite', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    originalFetch = global.fetch;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    global.fetch = originalFetch;
    (global as any).throwFsError = false;
  });

  test('version is loaded from package.json', () => {
    expect(program.version()).toBe('1.0.0');
  });

  test('open command success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'session-123',
        pseudonym: 'Source #7',
        debugOtp: '123456'
      })
    });

    await program.parseAsync(['node', 'silo', 'open', '--outlet', 'newsroom-main']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Session opened successfully'));
  });

  test('open command fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    await expect(program.parseAsync(['node', 'silo', 'open']))
      .rejects.toThrow('process.exit called');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });

  test('open command status not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(program.parseAsync(['node', 'silo', 'open']))
      .rejects.toThrow('process.exit called');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Status: 500'));
  });

  test('attach command success', async () => {
    const mockFile = path.resolve(__dirname, 'test-evidence.txt');
    fs.writeFileSync(mockFile, 'test data');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fileHash: 'mock-hash',
        stashRef: 'stash://mock-ref'
      })
    });

    await program.parseAsync(['node', 'silo', 'attach', '--session', 'session-123', '--file', mockFile]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Evidence attached successfully'));

    fs.unlinkSync(mockFile);
  });

  test('attach command file missing', async () => {
    await expect(program.parseAsync(['node', 'silo', 'attach', '--session', 'session-123', '--file', 'nonexistent.txt']))
      .rejects.toThrow('process.exit called');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
  });

  test('attach command fetch error', async () => {
    const mockFile = path.resolve(__dirname, 'test-evidence-error.txt');
    fs.writeFileSync(mockFile, 'test data');
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(program.parseAsync(['node', 'silo', 'attach', '--session', 'session-123', '--file', mockFile]))
      .rejects.toThrow('process.exit called');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'));

    fs.unlinkSync(mockFile);
  });

  test('attach command status not ok', async () => {
    const mockFile = path.resolve(__dirname, 'test-evidence-fail.txt');
    fs.writeFileSync(mockFile, 'test data');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });

    await expect(program.parseAsync(['node', 'silo', 'attach', '--session', 'session-123', '--file', mockFile]))
      .rejects.toThrow('process.exit called');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Status: 400'));

    fs.unlinkSync(mockFile);
  });

  test('verify command success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'verified' })
    });

    await program.parseAsync(['node', 'silo', 'verify', '--session', 'session-123', '--otp', '123456']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('verified successfully'));
  });

  test('verify command fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    await expect(program.parseAsync(['node', 'silo', 'verify', '--session', 'session-123', '--otp', '123456']))
      .rejects.toThrow('process.exit called');
  });

  test('verify command status not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(program.parseAsync(['node', 'silo', 'verify', '--session', 'session-123', '--otp', '123456']))
      .rejects.toThrow('process.exit called');
  });

  test('dispatch command success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pseudonym: 'Source #7', manifestSignature: 'sig-123' })
    });

    await program.parseAsync(['node', 'silo', 'dispatch', '--session', 'session-123']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('dispatched successfully'));
  });

  test('dispatch command fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    await expect(program.parseAsync(['node', 'silo', 'dispatch', '--session', 'session-123']))
      .rejects.toThrow('process.exit called');
  });

  test('dispatch command status not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(program.parseAsync(['node', 'silo', 'dispatch', '--session', 'session-123']))
      .rejects.toThrow('process.exit called');
  });

  test('relay command success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    await program.parseAsync(['node', 'silo', 'relay', '--session', 'session-123', '--message', 'hello', '--sender', 'source']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('relayed successfully'));
  });

  test('relay command fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    await expect(program.parseAsync(['node', 'silo', 'relay', '--session', 'session-123', '--message', 'hello', '--sender', 'source']))
      .rejects.toThrow('process.exit called');
  });

  test('relay command status not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(program.parseAsync(['node', 'silo', 'relay', '--session', 'session-123', '--message', 'hello', '--sender', 'source']))
      .rejects.toThrow('process.exit called');
  });

  test('thread command success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        thread: [
          { sender: 'source', message: 'hello', timestamp: 1234567890 }
        ]
      })
    });

    await program.parseAsync(['node', 'silo', 'thread', '--session', 'session-123']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Secure Thread Log'));
  });

  test('thread command fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    await expect(program.parseAsync(['node', 'silo', 'thread', '--session', 'session-123']))
      .rejects.toThrow('process.exit called');
  });

  test('thread command status not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(program.parseAsync(['node', 'silo', 'thread', '--session', 'session-123']))
      .rejects.toThrow('process.exit called');
  });

  test('non-test environment parsing', () => {
    const origEnv = process.env.NODE_ENV;
    const origArgv = process.argv;
    try {
      process.env.NODE_ENV = 'development';
      process.argv = ['node', 'silo'];
      
      jest.isolateModules(() => {
        const Command = require('commander').Command;
        const parseSpy = jest.spyOn(Command.prototype, 'parse').mockImplementation(function(this: any) {
          return this;
        });
        
        require('./index');
        expect(parseSpy).toHaveBeenCalled();
        parseSpy.mockRestore();
      });
    } finally {
      process.env.NODE_ENV = origEnv;
      process.argv = origArgv;
    }
  });

  test('version error fallback', () => {
    (global as any).throwFsError = true;
    jest.isolateModules(() => {
      const { program: localProgram } = require('./index');
      expect(localProgram.version()).toBe('1.0.0');
    });
  });
});
