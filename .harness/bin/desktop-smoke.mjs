#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = findRepoRoot(process.cwd());
const HARNESS_DIR = path.join(ROOT, '.harness');
const LOGS_DIR = path.join(HARNESS_DIR, 'logs');
const RUNS_DIR = path.join(HARNESS_DIR, 'desktop-smoke');
const DEFAULT_WEB_URL = 'http://127.0.0.1:3003';
const DEFAULT_CONTROL_PORT = 37731;
const DEFAULT_BOOT_TIMEOUT_MS = 120_000;

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  ensureRuntimeDirs();
  const options = parseOptions(process.argv.slice(2));
  const runId = `desktop-smoke-${timestampId()}`;
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const runLogPath = path.join(runDir, 'run.log');
  const webLogPath = path.join(LOGS_DIR, `${runId}.web.log`);
  const electronLogPath = path.join(LOGS_DIR, `${runId}.electron.log`);
  const resultPath = path.join(runDir, 'result.json');

  const result = {
    runId,
    startedAt: nowIso(),
    finishedAt: null,
    status: 'failed',
    webUrl: options.webUrl,
    controlUrl: `http://127.0.0.1:${options.controlPort}`,
    artifacts: {
      runDir,
      runLogPath,
      webLogPath,
      electronLogPath,
      electronInstallLogPath: path.join(runDir, 'electron-install.log'),
      healthBeforePath: path.join(runDir, 'health-before.json'),
      healthAfterPath: path.join(runDir, 'health-after.json'),
      mainWindowPng: path.join(runDir, 'main-window.png'),
      captureWindowPng: path.join(runDir, 'capture-window.png'),
    },
    reusedWebServer: false,
    selection: null,
    capture: null,
    blockers: [],
    notes: [],
  };

  let webChild = null;
  let electronChild = null;

  try {
    appendLog(runLogPath, `desktop smoke started at ${result.startedAt}`);

    if (!(await probeUrlHealth(options.webUrl))) {
      appendLog(runLogPath, `web surface unavailable at ${options.webUrl}; starting npm run dev:web`);
      webChild = spawnLogged('npm', ['run', 'dev:web'], {
        cwd: ROOT,
        logPath: webLogPath,
        env: process.env,
      });
      await waitForUrl(options.webUrl, options.bootTimeoutMs);
    } else {
      result.reusedWebServer = true;
      appendLog(runLogPath, `reusing existing web surface at ${options.webUrl}`);
    }

    appendLog(runLogPath, 'building Electron main process bundle');
    const build = spawnSync('npm', ['run', 'build:electron'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    fs.writeFileSync(path.join(runDir, 'build-electron.log'), `${build.stdout || ''}${build.stderr || ''}`);
    if (build.status !== 0) {
      throw new Error('npm run build:electron failed');
    }

    const { electronBinary, repaired } = ensureElectronBinary(result.artifacts.electronInstallLogPath);
    if (repaired) {
      result.notes.push(`repaired missing Electron binary via ${result.artifacts.electronInstallLogPath}`);
    }

    appendLog(runLogPath, 'launching Electron in harness mode');
    electronChild = spawnLogged(electronBinary, ['.'], {
      cwd: ROOT,
      logPath: electronLogPath,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        TRANSLOOM_WEB_PORT: String(new URL(options.webUrl).port || '3003'),
        ELECTRON_START_URL: options.webUrl,
        TRANSLOOM_HARNESS: '1',
        TRANSLOOM_HARNESS_PORT: String(options.controlPort),
        ELECTRON_ENABLE_LOGGING: '1',
      },
    });

    const healthBefore = await waitForJson(`${result.controlUrl}/health`, options.bootTimeoutMs, electronChild, electronLogPath);
    fs.writeFileSync(result.artifacts.healthBeforePath, `${JSON.stringify(healthBefore, null, 2)}\n`);

    await saveRemotePng(`${result.controlUrl}/window/main/screenshot`, result.artifacts.mainWindowPng).catch((error) => {
      result.notes.push(`main window screenshot unavailable: ${error.message}`);
    });

    await postJson(`${result.controlUrl}/capture/show`, {});
    await sleep(350);

    const selection = createSelection(healthBefore.primaryDisplay);
    result.selection = selection;

    await saveRemotePng(`${result.controlUrl}/window/capture/screenshot`, result.artifacts.captureWindowPng).catch((error) => {
      result.notes.push(`capture window screenshot unavailable: ${error.message}`);
    });

    const capture = await postJson(`${result.controlUrl}/capture/simulate`, { selection });
    result.capture = capture;

    const healthAfter = await getJson(`${result.controlUrl}/health`);
    fs.writeFileSync(result.artifacts.healthAfterPath, `${JSON.stringify(healthAfter, null, 2)}\n`);

    if (capture.status === 'passed') {
      result.status = 'passed';
      result.notes.push(`capture saved to ${capture.result?.filePath || '(missing path)'}`);
    } else if (capture.status === 'blocked') {
      result.status = 'blocked';
      result.blockers.push(capture.reason || 'desktop smoke blocked');
    } else {
      result.status = 'failed';
      result.blockers.push(capture.reason || 'desktop smoke failed');
    }
  } finally {
    result.finishedAt = nowIso();
    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    await terminateChild(electronChild);
    await terminateChild(webChild);
  }

  console.log('Desktop smoke complete');
  console.log(`- status: ${result.status}`);
  console.log(`- run dir: ${runDir}`);
  console.log(`- result: ${resultPath}`);
  if (result.blockers.length) {
    console.log(`- blockers: ${result.blockers.join(' | ')}`);
  }

  process.exitCode = result.status === 'failed' ? 1 : 0;
}

function parseOptions(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, 'true');
    }
  }

  return {
    webUrl: args.get('web-url') || DEFAULT_WEB_URL,
    controlPort: Number(args.get('control-port') || DEFAULT_CONTROL_PORT),
    bootTimeoutMs: Number(args.get('boot-timeout-ms') || DEFAULT_BOOT_TIMEOUT_MS),
  };
}

function createSelection(primaryDisplay) {
  const workArea = primaryDisplay?.workArea || primaryDisplay?.bounds || { x: 0, y: 0, width: 1440, height: 900 };
  const scaleFactor = primaryDisplay?.scaleFactor || 1;
  const width = Math.max(320, Math.round(workArea.width * 0.28));
  const height = Math.max(220, Math.round(workArea.height * 0.24));
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
    scaleFactor,
    displayId: primaryDisplay?.id,
  };
}

function ensureRuntimeDirs() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function spawnLogged(command, args, { cwd, logPath, env }) {
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    logStream.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    logStream.write(chunk);
  });
  child.on('error', (error) => {
    logStream.write(`[spawn-error] ${error.stack || error.message}\n`);
  });
  child.on('close', () => {
    logStream.end();
  });

  return child;
}

async function terminateChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return;
    }
    await sleep(100);
  }

  child.kill('SIGKILL');
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeUrlHealth(url)) {
      return;
    }
    await sleep(500);
  }

  throw new Error(`timed out waiting for ${url}`);
}

async function probeUrlHealth(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForJson(url, timeoutMs, child = null, childLogPath = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`process exited before ${url} became ready${childLogPath ? `; see ${childLogPath}` : ''}`);
    }
    try {
      return await getJson(url);
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`timed out waiting for JSON at ${url}`);
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return await response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok && body?.status !== 'blocked') {
    throw new Error(body?.reason || body?.error || `POST ${url} failed with ${response.status}`);
  }
  return body;
}

async function saveRemotePng(url, destinationPath) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, buffer);
}

function appendLog(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function timestampId() {
  const now = new Date();
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git')) || fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function resolveElectronBinary() {
  const electronDir = path.join(ROOT, 'node_modules', 'electron');
  const pathFile = path.join(electronDir, 'path.txt');
  if (!fs.existsSync(pathFile)) {
    return null;
  }

  const relativePath = fs.readFileSync(pathFile, 'utf8').trim();
  if (!relativePath) {
    return null;
  }

  const binaryPath = path.join(electronDir, 'dist', relativePath);
  return fs.existsSync(binaryPath) ? binaryPath : null;
}

function ensureElectronBinary(installLogPath) {
  let electronBinary = resolveElectronBinary();
  if (electronBinary) {
    return { electronBinary, repaired: false };
  }

  const installScript = path.join(ROOT, 'node_modules', 'electron', 'install.js');
  const install = spawnSync(process.execPath, [installScript], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  fs.writeFileSync(installLogPath, `${install.stdout || ''}${install.stderr || ''}`);

  electronBinary = resolveElectronBinary();
  if (install.status !== 0 || !electronBinary) {
    throw new Error(`Electron binary is missing and repair failed; see ${installLogPath}`);
  }

  return { electronBinary, repaired: true };
}
