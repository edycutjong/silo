#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const program = new Command();
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3001';

let version = '1.0.0';
try {
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    version = pkg.version;
  }
} catch (_err) {
  // fallback to default version
}

program
  .name('silo')
  .description('Silo CLI — Command Line Interface for Whistleblower Submissions')
  .version(version);

// 1. Open Session
program
  .command('open')
  .description('Open a new anonymous whistleblower drop session')
  .option('--outlet <id>', 'Unique identifier for media outlet', 'newsroom-main')
  .action(async (options) => {
    try {
      const response = await fetch(`${AGENT_URL}/api/drop/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlet: options.outlet })
      });

      if (!response.ok) {
        console.error(`\u2717 Failed to open session. Status: ${response.status}`);
        process.exit(1);
      }

      const result = await response.json() as any;
      console.log(`\u2713 Session opened successfully.`);
      console.log(`  Session ID: ${result.sessionId}`);
      console.log(`  Pseudonym:  ${result.pseudonym}`);
      console.log(`  Debug OTP:  ${result.debugOtp}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// 2. Attach Evidence
program
  .command('attach')
  .description('Attach forensic evidence file to a session')
  .requiredOption('--session <id>', 'Active session ID')
  .requiredOption('--file <path>', 'Path to the evidence file')
  .action(async (options) => {
    try {
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found at ${filePath}`);
        process.exit(1);
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileBase64 = fileBuffer.toString('base64');
      
      const hasher = crypto.createHash('sha256');
      hasher.update(fileBuffer);
      const declaredHash = hasher.digest('hex');

      const response = await fetch(`${AGENT_URL}/api/drop/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: options.session,
          fileBase64,
          declaredHash
        })
      });

      if (!response.ok) {
        console.error(`\u2717 Failed to attach evidence. Status: ${response.status}`);
        process.exit(1);
      }

      const result = await response.json() as any;
      console.log(`\u2713 Evidence attached successfully.`);
      console.log(`  File Hash:  ${result.fileHash}`);
      console.log(`  Stash Ref:  ${result.stashRef}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// 3. Verify OTP
program
  .command('verify')
  .description('Submit OTP verification code to secure enclave')
  .requiredOption('--session <id>', 'Active session ID')
  .requiredOption('--otp <code>', '6-digit verification code')
  .action(async (options) => {
    try {
      const response = await fetch(`${AGENT_URL}/api/drop/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: options.session,
          otp: options.otp
        })
      });

      if (!response.ok) {
        console.error(`\u2717 OTP Verification Failed. Status: ${response.status}`);
        process.exit(1);
      }

      const result = await response.json() as any;
      console.log(`\u2713 Source identity verified successfully.`);
      console.log(`  Status: ${result.status}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// 4. Dispatch Report
program
  .command('dispatch')
  .description('Finalize and dispatch the report to media outbox')
  .requiredOption('--session <id>', 'Active session ID')
  .action(async (options) => {
    try {
      const response = await fetch(`${AGENT_URL}/api/drop/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: options.session })
      });

      if (!response.ok) {
        console.error(`\u2717 Dispatch Failed. Status: ${response.status}`);
        process.exit(1);
      }

      const result = await response.json() as any;
      console.log(`\u2713 Report dispatched successfully to journalist.`);
      console.log(`  Pseudonym:  ${result.pseudonym}`);
      console.log(`  Signature:  ${result.manifestSignature}`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// 5. Relay Message
program
  .command('relay')
  .description('Send a message to the two-way secure thread')
  .requiredOption('--session <id>', 'Active session ID')
  .requiredOption('--message <text>', 'Message content')
  .requiredOption('--sender <sender>', 'Sender identifier ("source" or "media")')
  .action(async (options) => {
    try {
      const response = await fetch(`${AGENT_URL}/api/drop/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: options.session,
          message: options.message,
          sender: options.sender
        })
      });

      if (!response.ok) {
        console.error(`\u2717 Message relay failed. Status: ${response.status}`);
        process.exit(1);
      }

      console.log(`\u2713 Message relayed successfully.`);
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

// 6. View Thread
program
  .command('thread')
  .description('Fetch and display all messages in the secure thread')
  .requiredOption('--session <id>', 'Active session ID')
  .action(async (options) => {
    try {
      const response = await fetch(`${AGENT_URL}/api/drop/thread?session=${options.session}`);

      if (!response.ok) {
        console.error(`\u2717 Failed to fetch thread. Status: ${response.status}`);
        process.exit(1);
      }

      const result = await response.json() as any;
      console.log(`--- Secure Thread Log (${result.thread.length} messages) ---`);
      for (const msg of result.thread) {
        console.log(`[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.sender.toUpperCase()}: ${msg.message}`);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

if (process.env.NODE_ENV !== 'test') {
  program.parse(process.argv);
}

export { program };
