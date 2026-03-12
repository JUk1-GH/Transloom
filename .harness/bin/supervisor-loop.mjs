#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = findRepoRoot(process.cwd());
const CONTROL_PLANE_PATH = path.join(ROOT, '.harness', 'bin', 'control-plane.mjs');
const STATE_DIR = path.join(ROOT, '.harness', 'state');
const TASKS_PATH = path.join(STATE_DIR, 'tasks.json');
const EVENTS_PATH = path.join(STATE_DIR, 'events.jsonl');
const RUN_LEDGER_PATH = path.join(STATE_DIR, 'runs.jsonl');
const DEFAULT_OWNER = 'claude-supervisor';
const DEFAULT_ROLES = ['reviewer', 'verifier', 'implementer'];

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._[0] === 'help') {
    printHelp();
    return;
  }

  const roles = parseRoles(args.roles);
  const owner = args.owner || DEFAULT_OWNER;
  const lane = args.lane || null;
  const ttlMinutes = args['ttl-min'] || args.ttl || null;
  const model = args.model || null;
  const maxRounds = parseNumber(args['max-rounds'], 0);
  const idleSleepMs = parseNumber(args['sleep-ms'], 15000);
  const stopWhenIdle = Boolean(args['stop-when-idle']);

  ensurePrerequisites();

  console.log('Heavy harness supervisor loop');
  console.log(`- repo: ${ROOT}`);
  console.log(`- roles: ${roles.join(', ')}`);
  console.log(`- owner: ${owner}`);
  console.log(`- lane: ${lane || 'all'}`);
  console.log(`- max rounds: ${maxRounds === 0 ? 'unbounded' : maxRounds}`);
  console.log(`- idle sleep ms: ${idleSleepMs}`);

  let rounds = 0;
  while (maxRounds === 0 || rounds < maxRounds) {
    rounds += 1;
    const leasedTask = leaseNextTask({ owner, roles, lane, ttlMinutes });

    if (!leasedTask) {
      const summary = readStatusSummary();
      console.log(`[${nowIso()}] idle round ${rounds} :: ${formatSummary(summary)}`);
      if (stopWhenIdle) {
        break;
      }
      sleep(idleSleepMs);
      continue;
    }

    const role = leasedTask.lease.role;
    console.log(`[${nowIso()}] leased ${leasedTask.id} as ${role}`);
    const run = prepareRun({ taskId: leasedTask.id, role, owner, model });
    console.log(`[${nowIso()}] prepared ${run.runId}`);
    const result = executePreparedRun(run);

    if (result.exitCode !== 0) {
      console.log(`[${nowIso()}] run ${run.runId} failed with exit=${result.exitCode}`);
      failLease({ taskId: leasedTask.id, role, owner, exitCode: result.exitCode, signal: result.signal });
    } else {
      const currentTask = readTask(leasedTask.id);
      if (currentTask?.lease && currentTask.lease.owner === owner && currentTask.lease.role === role) {
        console.log(`[${nowIso()}] warning: ${leasedTask.id} is still leased after a successful run`);
      }
    }

    const summary = readStatusSummary();
    console.log(`[${nowIso()}] queue :: ${formatSummary(summary)}`);
  }

  console.log(`[${nowIso()}] supervisor stopped after ${rounds} round(s)`);
}

function ensurePrerequisites() {
  const doctor = runControlPlane(['doctor', '--json']);
  const status = parseJsonOutput(doctor.stdout);
  if (!status.commands?.claude) {
    throw new Error('claude command not found in PATH');
  }
}

function leaseNextTask({ owner, roles, lane, ttlMinutes }) {
  for (const role of roles) {
    const commandArgs = ['lease', '--role', role, '--owner', owner, '--json'];
    if (lane) {
      commandArgs.push('--lane', lane);
    }
    if (ttlMinutes) {
      commandArgs.push('--ttl-min', String(ttlMinutes));
    }

    const result = runControlPlane(commandArgs, { allowNoTask: true });
    const payload = parseMaybeJson(result.stdout);
    if (payload) {
      return payload;
    }
  }
  return null;
}

function prepareRun({ taskId, role, owner, model }) {
  const commandArgs = ['dispatch', '--task', taskId, '--role', role, '--owner', owner, '--json'];
  if (model) {
    commandArgs.push('--model', model);
  }
  const result = runControlPlane(commandArgs);
  return parseJsonOutput(result.stdout);
}

function executePreparedRun(run) {
  const prompt = fs.readFileSync(run.promptPath, 'utf8');
  const commandArgs = ['-p', '--permission-mode', 'auto'];
  if (run.model) {
    commandArgs.push('--model', run.model);
  }
  commandArgs.push(prompt);

  const startedAt = nowIso();
  appendJsonl(RUN_LEDGER_PATH, { runId: run.runId, taskId: run.taskId, status: 'started', at: startedAt });
  appendJsonl(EVENTS_PATH, { at: startedAt, type: 'run.started', taskId: run.taskId, role: run.role, owner: run.owner, note: run.runId });

  const result = spawnSync('claude', commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const finishedAt = nowIso();
  const log = [`# stdout\n${result.stdout || ''}`, `\n# stderr\n${result.stderr || ''}`].join('\n');
  fs.writeFileSync(run.logPath, log);
  appendJsonl(RUN_LEDGER_PATH, {
    runId: run.runId,
    taskId: run.taskId,
    status: result.status === 0 ? 'finished' : 'errored',
    at: finishedAt,
    exitCode: result.status,
    signal: result.signal,
    logPath: run.logPath,
  });
  appendJsonl(EVENTS_PATH, {
    at: finishedAt,
    type: result.status === 0 ? 'run.finished' : 'run.errored',
    taskId: run.taskId,
    role: run.role,
    owner: run.owner,
    note: `exit=${result.status}`,
  });

  console.log(`Run finished with exit code ${result.status}`);
  console.log(`- log: ${run.logPath}`);

  return { exitCode: result.status ?? 1, signal: result.signal || null };
}

function failLease({ taskId, role, owner, exitCode, signal }) {
  const reason = `supervisor observed claude exit ${exitCode}${signal ? ` signal=${signal}` : ''}`;
  const result = runControlPlane([
    'fail',
    '--task',
    taskId,
    '--role',
    role,
    '--owner',
    owner,
    '--reason',
    reason,
  ]);
  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }
}

function readStatusSummary() {
  const result = runControlPlane(['status', '--json']);
  return parseJsonOutput(result.stdout).summary;
}

function readTask(taskId) {
  if (!fs.existsSync(TASKS_PATH)) {
    return null;
  }
  const state = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
  return state.tasks.find((task) => task.id === taskId) || null;
}

function formatSummary(summary = {}) {
  return [
    `queued=${summary.queued || 0}`,
    `implementing=${summary.implementing || 0}`,
    `ready_for_verification=${summary.ready_for_verification || 0}`,
    `ready_for_review=${summary.ready_for_review || 0}`,
    `blocked=${summary.blocked || 0}`,
    `done=${summary.done || 0}`,
  ].join(' ');
}

function runControlPlane(commandArgs, options = {}) {
  const result = spawnSync(process.execPath, [CONTROL_PLANE_PATH, ...commandArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const stderr = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(stderr || `control-plane exited with ${result.status}`);
  }

  if (options.allowNoTask && /No task available for lease/.test(result.stdout)) {
    return result;
  }

  return result;
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`expected JSON output, received: ${stdout.trim()}`);
  }
}

function parseMaybeJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed || trimmed === 'No task available for lease') {
    return null;
  }
  return parseJsonOutput(trimmed);
}

function parseRoles(rawValue) {
  const roles = String(rawValue || DEFAULT_ROLES.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueRoles = [...new Set(roles)];
  const invalidRoles = uniqueRoles.filter((role) => !['implementer', 'verifier', 'reviewer'].includes(role));
  if (invalidRoles.length) {
    throw new Error(`invalid roles: ${invalidRoles.join(', ')}`);
  }
  return uniqueRoles;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        args[token.slice(2)] = true;
        continue;
      }
      args[token.slice(2)] = next;
      index += 1;
      continue;
    }
    args._.push(token);
  }
  return args;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`invalid numeric value: ${value}`);
  }
  return parsed;
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'feature_list.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function printHelp() {
  console.log(`Heavy harness supervisor loop\n\nUsage:\n  node .harness/bin/supervisor-loop.mjs [--roles reviewer,verifier,implementer] [--owner NAME] [--lane NAME]\n\nOptions:\n  --roles ROLE1,ROLE2,ROLE3  Role priority order. Default drains reviewer -> verifier -> implementer.\n  --owner NAME               Lease owner recorded in queue state. Default: claude-supervisor.\n  --lane NAME                Restrict leasing to one lane.\n  --ttl-min N                Override lease TTL in minutes.\n  --model MODEL              Pass through Claude model override.\n  --max-rounds N             Stop after N leasing attempts. 0 means unbounded.\n  --sleep-ms N               Idle polling interval in milliseconds. Default: 15000.\n  --stop-when-idle           Exit as soon as no task can be leased.`);
}
