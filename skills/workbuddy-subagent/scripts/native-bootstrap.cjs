#!/usr/bin/env node
'use strict';

// Run with WorkBuddy's Electron executable and ELECTRON_RUN_AS_NODE=1.
// Explicit opt-in is checked by workbuddy.py before this file is invoked.
// Never emit native storage material, bootstrap payloads, or environment values.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

function loadBootstrap(appHome, dataDir) {
  const core = require(path.join(appHome, 'Contents/Resources/app.asar/main/process-cpu-sampler.js'));
  for (const key of ['$', '_t', 'nt', 'tt', 'Z', 'X']) {
    if (typeof core[key] !== 'function') throw new Error('Unsupported WorkBuddy bootstrap module contract');
  }
  core.$();
  const storage = process._linkedBinding('electron_browser_workbuddy_storage');
  const decoded = core._t(storage.loggerGet());
  if (decoded.symmetric.status !== 'available') throw new Error('Native credential protection is unavailable');
  const bootstrap = { policy: 'fields', symmetricKey: decoded.symmetric.value };
  if (decoded.developerPublicKey.status === 'available') {
    const userKey = core.nt({ keyblobPath: core.tt(dataDir), protectorKey: bootstrap.symmetricKey,
                             createIfMissing: false });
    if (userKey.status === 'available') {
      bootstrap.userKey = userKey.value;
      bootstrap.developerPublicKey = decoded.developerPublicKey.value;
    } else bootstrap.asymmetricUnavailable = userKey.category;
  } else bootstrap.asymmetricUnavailable = decoded.developerPublicKey.category;
  return { core, bootstrap };
}

function connectAndDeliver(socketPath, message, deadline) {
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() >= deadline) return reject(new Error('CLI bootstrap socket did not become ready'));
      const socket = net.createConnection(socketPath);
      let connected = false;
      let reply = '';
      socket.setTimeout(5000);
      socket.on('connect', () => {
        connected = true;
        socket.write(JSON.stringify(message) + '\n');
      });
      socket.on('data', bytes => {
        reply += bytes.toString('utf8');
        if (reply.length > 4096) socket.destroy(new Error('Oversized bootstrap acknowledgement'));
      });
      socket.on('timeout', () => socket.destroy(new Error('Bootstrap acknowledgement timed out')));
      socket.on('end', () => {
        try {
          const ack = JSON.parse(reply);
          if (ack.ok !== true || ack.policy !== message.bootstrap.policy) throw new Error('Invalid acknowledgement');
          resolve();
        } catch { reject(new Error('CLI rejected credential bootstrap')); }
      });
      socket.on('error', error => {
        if (!connected && ['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
          setTimeout(attempt, 50);
        } else reject(new Error('Local credential bootstrap transport failed'));
      });
    }
    attempt();
  });
}

async function main() {
  if (process.env.WORKBUDDY_NATIVE_BOOTSTRAP !== '1') throw new Error('Native bootstrap requires explicit opt-in');
  const [node, cli, ...args] = process.argv.slice(2);
  if (!node || !cli) throw new Error('Missing CLI launch arguments');
  const appHome = process.env.WORKBUDDY_HOME || '/Applications/WorkBuddy.app';
  const dataDir = process.env.WORKBUDDY_DATA_DIR || path.join(os.homedir(), '.workbuddy');
  const { core, bootstrap } = loadBootstrap(appHome, dataDir);
  const dir = fs.mkdtempSync(path.join('/private/tmp', 'wb-skill-'));
  fs.chmodSync(dir, 0o700);
  const readyPath = path.join(dir, 'r.sock');
  const credentialPath = path.join(dir, 'c.sock');
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  let child;
  let payload;
  let cleaned = false;
  const ready = net.createServer(socket => socket.end('{"ok":true}\n'));
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    core.X(bootstrap);
    if (payload) delete payload.bootstrap;
    ready.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    await new Promise((resolve, reject) => { ready.once('error', reject); ready.listen(readyPath, resolve); });
    const env = { ...process.env, WORKBUDDY_AT_REST_ENCRYPTION: bootstrap.policy,
      CODEBUDDY_SIDECAR_READY_SOCKET: readyPath,
      CODEBUDDY_SIDECAR_CREDENTIAL_BOOTSTRAP_SOCKET: credentialPath,
      CODEBUDDY_SIDECAR_READY_TOKEN: token, CODEBUDDY_SIDECAR_READY_SESSION_ID: sessionId };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.WORKBUDDY_NATIVE_BOOTSTRAP;
    child = spawn(node, [cli, ...args], { env, stdio: 'inherit' });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    });
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
      child.kill(signal);
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    });
    payload = { version: 1, pid: child.pid, sessionId, token, bootstrap: core.Z(bootstrap) };
    await connectAndDeliver(credentialPath, payload, Date.now() + 10000);
    core.X(bootstrap);
    delete payload.bootstrap;
    process.exitCode = await exited;
  } catch (error) {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    throw error;
  } finally { cleanup(); }
}

if (require.main === module) main().catch(() => {
  // Even unexpected errors may contain sensitive native details. Keep diagnostics bounded.
  process.stderr.write('WorkBuddy native bootstrap failed; verify app version and explicit authorization.\n');
  process.exitCode = 1;
});

module.exports = { connectAndDeliver };
