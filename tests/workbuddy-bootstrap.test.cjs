'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { connectAndDeliver, terminateChild } = require('../skills/workbuddy-subagent/scripts/native-bootstrap.cjs');

// These tests never call native storage or load real WorkBuddy key material.
async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-test-'));
  const socket = path.join(dir, 'b.sock');
  const server = net.createServer();
  try { await fn(server, socket); }
  finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
}

test('delivers only to local socket and requires policy acknowledgement', async () => {
  await fixture(async (server, socket) => {
    const message = { version: 1, pid: 1, sessionId: 'test', token: 'fake', bootstrap: { policy: 'fields' } };
    server.on('connection', connection => connection.once('data', bytes => {
      assert.deepEqual(JSON.parse(bytes), message);
      connection.end('{"ok":true,"policy":"fields"}\n');
    }));
    await new Promise(resolve => server.listen(socket, resolve));
    await connectAndDeliver(socket, message, Date.now() + 1000);
  });
});

test('rejects a mismatched acknowledgement', async () => {
  await fixture(async (server, socket) => {
    server.on('connection', connection => connection.once('data', () => connection.end('{"ok":true,"policy":"off"}\n')));
    await new Promise(resolve => server.listen(socket, resolve));
    await assert.rejects(connectAndDeliver(socket, { bootstrap: { policy: 'fields' } }, Date.now() + 1000));
  });
});

for (const ignoresTerm of [false, true]) {
  test(`termination awaits child exit${ignoresTerm ? ' and escalates when SIGTERM is ignored' : ''}`, { timeout: 5000 }, async () => {
    const program = `${ignoresTerm ? "process.on('SIGTERM', () => {});" : ''}process.stdout.write('ready');setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ['-e', program], { stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      await once(child.stdout, 'data');
      const start = Date.now();
      await terminateChild(child, 50);
      assert.equal(child.signalCode, ignoresTerm ? 'SIGKILL' : 'SIGTERM');
      assert.ok(Date.now() - start < 2000);
      // Cleanup must also be safe after a child has already exited.
      await terminateChild(child, 50);
    } finally { child.kill('SIGKILL'); }
  });
}

test('termination handles a failed spawn without waiting for a nonexistent process', async () => {
  const child = spawn('/nonexistent/workbuddy-test-command');
  await once(child, 'error');
  await terminateChild(child, 50);
});
