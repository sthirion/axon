import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, describe, it } from 'node:test';

const isWindows = process.platform === 'win32';
const WEB = 'http://127.0.0.1:5173';
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 2_000;
const KILL_GRACE_MS = 10_000;

let child;
let exited = false;

function probe(path) {
  return fetch(`${WEB}${path}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(new Error(`port ${port} already in use — stop other dev servers`)),
    );
    server.listen(port, '127.0.0.1', () => server.close(() => resolve()));
  });
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) throw new Error('npm run dev exited before the dev servers were ready');
    try {
      const res = await probe('/healthz');
      if (res.ok) {
        assert.ok(
          child.exitCode === null && child.signalCode === null,
          'npm run dev exited while the dev servers were reported ready',
        );
        return;
      }
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      // not listening yet or probe timed out
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`dev servers were not ready within ${READY_TIMEOUT_MS / 1000}s`);
}

async function stopDev() {
  if (!child || exited) return;
  const group = -child.pid;
  const closed = once(child, 'exit');
  process.kill(group, 'SIGTERM');
  const timer = sleep(KILL_GRACE_MS, 'timeout');
  if ((await Promise.race([closed.then(() => 'closed'), timer])) === 'timeout') {
    try {
      process.kill(group, 'SIGKILL');
    } catch {
      // group already gone
    }
    await closed;
  }
}

describe(
  'npm run dev',
  { skip: isWindows ? 'process-group handling is POSIX only' : false },
  () => {
    before(async () => {
      await assertPortFree(3000);
      await assertPortFree(5173);
      child = spawn('npm', ['run', 'dev'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, PORT: '3000' },
      });
      child.on('exit', () => {
        exited = true;
      });
      child.on('error', () => {
        exited = true;
      });
      await waitUntilReady();
    });

    after(stopDev);

    it('proxies /healthz to the server', async () => {
      const res = await probe('/healthz');

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'ok' });
    });

    it('proxies /api to the server 404 JSON', async () => {
      const res = await probe('/api/does-not-exist');

      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { code: 'NOT_FOUND', message: 'Not found' });
    });

    it('proxies /socket.io polling to Socket.IO, not the SPA', async () => {
      const res = await probe('/socket.io/?EIO=4&transport=polling');

      assert.equal(res.status, 200);
      assert.doesNotMatch(res.headers.get('content-type') ?? '', /text\/html/);
    });
  },
);
