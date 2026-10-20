// execFile wrapper (design doc §12 gotcha 4): no shell, ever. Handles the Windows .cmd/.bat
// shim problem (Node refuses shell:false for them since 18.20/20.12 — EINVAL, CVE-2024-27980)
// by retrying through cmd.exe with a fixed argument array. Every arg passed through this
// module must be a constant supplied by adlc-lib code — never user or model input.
import { execFile as execFileCb, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);
const DEFAULT_TIMEOUT_MS = 10_000;

/** Runs a fixed, argv-array command with shell:false. Returns { stdout, stderr } on success,
 * or null if the command is missing (ENOENT) or can't be spawned without a shell on this
 * platform (EINVAL) even after the Windows cmd.exe retry below. Never throws for those two
 * cases — callers treat null as "this credential source isn't available" and move on. */
export async function runFixedCommand(command, args = [], { env = process.env, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    return await execFileAsync(command, args, { shell: false, env, windowsHide: true, timeout });
  } catch (err) {
    if (err?.code === 'EINVAL' && process.platform === 'win32') {
      try {
        return await execFileAsync('cmd.exe', ['/d', '/s', '/c', command, ...args], { shell: false, env, windowsHide: true, timeout });
      } catch {
        return null;
      }
    }
    if (err?.code === 'ENOENT') return null;
    return null;
  }
}

/** Like runFixedCommand but for commands whose non-zero exit is a normal result (test runners):
 * returns { code, stdout, stderr, timedOut } for ANY exit code, or null when the command is
 * missing (ENOENT) or cannot be spawned without a shell. Same no-shell rule as above: every arg
 * must be a constant or validated by the caller; the Windows cmd.exe retry only exists for
 * .cmd/.bat shims, so callers should prefer real executables (dotnet, node). */
export async function runCapture(command, args = [], { cwd, env = process.env, timeout = 600_000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const attempt = async (cmd, cmdArgs) => {
    try {
      const r = await execFileAsync(cmd, cmdArgs, { shell: false, cwd, env, windowsHide: true, timeout, maxBuffer });
      return { code: 0, stdout: r.stdout, stderr: r.stderr, timedOut: false };
    } catch (err) {
      if (err?.code === 'ENOENT') return null;
      if (err?.code === 'EINVAL') return 'EINVAL';
      return {
        code: typeof err?.code === 'number' ? err.code : 1,
        stdout: err?.stdout ?? '',
        stderr: err?.stderr ?? '',
        timedOut: err?.killed === true,
      };
    }
  };
  let result = await attempt(command, args);
  if (result === 'EINVAL' && process.platform === 'win32') result = await attempt('cmd.exe', ['/d', '/s', '/c', command, ...args]);
  return result === 'EINVAL' ? null : result;
}

/** Runs a fixed command and writes `input` to its stdin (used for `git credential fill`).
 * Same null-on-unavailable contract as runFixedCommand; a non-zero exit is also treated as
 * unavailable (git credential fill exits 1 when it has no answer). */
export function runWithStdin(command, args, input, { env = process.env, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { shell: false, env, windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeout);
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? { stdout, stderr } : null));
    child.stdin?.on('error', () => {}); // EPIPE if the process exits before we finish writing
    child.stdin?.write(input);
    child.stdin?.end();
  });
}
