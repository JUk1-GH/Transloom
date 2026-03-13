#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = findRepoRoot(process.cwd());
const HARNESS_DIR = path.join(ROOT, '.harness');
const BIN_DIR = path.join(HARNESS_DIR, 'bin');
const LOGS_DIR = path.join(HARNESS_DIR, 'logs');
const STATE_DIR = path.join(HARNESS_DIR, 'state');
const PRODUCT_LOOP_PATH = path.join(BIN_DIR, 'product-loop.mjs');
const PID_PATH = path.join(STATE_DIR, 'product-loop.pid');
const LOG_POINTER_PATH = path.join(STATE_DIR, 'product-loop.log');

main();

function main() {
  ensureRuntimeDirs();
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'start';
  const commandArgs = command === 'start' ? args.filter((arg, index) => !(index === 0 && arg === 'start')) : args.slice(1);

  if (command === 'start') {
    startLoop(commandArgs);
    return;
  }

  if (command === 'stop') {
    stopLoop();
    return;
  }

  if (command === 'status') {
    printStatus();
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

function startLoop(extraArgs) {
  const existingPid = readPid();
  if (existingPid && isPidAlive(existingPid)) {
    const existingLog = readText(LOG_POINTER_PATH) || '(unknown log)';
    console.log(`Product loop already running`);
    console.log(`- pid: ${existingPid}`);
    console.log(`- log: ${existingLog}`);
    return;
  }

  const stamp = timestampId();
  const logPath = path.join(LOGS_DIR, `product-autopilot-${stamp}.log`);
  const outputFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [PRODUCT_LOOP_PATH, ...extraArgs], {
    cwd: ROOT,
    env: process.env,
    detached: true,
    stdio: ['ignore', outputFd, outputFd],
  });

  child.unref();
  fs.writeFileSync(PID_PATH, `${child.pid}\n`);
  fs.writeFileSync(LOG_POINTER_PATH, `${logPath}\n`);

  console.log(`Product loop launched`);
  console.log(`- pid: ${child.pid}`);
  console.log(`- log: ${logPath}`);
}

function stopLoop() {
  const pid = readPid();
  if (!pid || !isPidAlive(pid)) {
    console.log('Product loop is not running');
    return;
  }
  process.kill(pid, 'SIGTERM');
  console.log(`Sent SIGTERM to product loop pid ${pid}`);
}

function printStatus() {
  const pid = readPid();
  const logPath = readText(LOG_POINTER_PATH) || '(unknown log)';
  console.log('Product loop status');
  console.log(`- pid: ${pid || 'missing'}`);
  console.log(`- alive: ${pid ? yesNo(isPidAlive(pid)) : 'no'}`);
  console.log(`- log: ${logPath}`);
}

function readPid() {
  const value = readText(PID_PATH);
  if (!value) {
    return null;
  }
  const pid = Number(value.trim());
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureRuntimeDirs() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
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

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function printHelp() {
  console.log(`Product loop launcher

Usage:
  node .harness/bin/product-loop-launcher.mjs [start] [product-loop options...]
  node .harness/bin/product-loop-launcher.mjs stop
  node .harness/bin/product-loop-launcher.mjs status
`);
}
