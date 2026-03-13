#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = findRepoRoot(process.cwd());
const CONTROL_PLANE_PATH = path.join(ROOT, '.harness', 'bin', 'control-plane.mjs');
const STATE_DIR = path.join(ROOT, '.harness', 'state');
const TASKS_PATH = path.join(STATE_DIR, 'tasks.json');
const EVENTS_PATH = path.join(STATE_DIR, 'events.jsonl');
const RUN_LEDGER_PATH = path.join(STATE_DIR, 'runs.jsonl');
const DEFAULT_OWNER = 'claude-supervisor';
const DEFAULT_ROLES = ['reviewer', 'verifier', 'implementer'];
const HISTORY_EVENT_LIMIT = 6;
const DEFAULT_CLAUDE_OPTIONS = Object.freeze({
  permissionMode: 'auto',
  settingSources: 'local',
  outputFormat: 'stream-json',
  includePartialMessages: true,
  disableSlashCommands: true,
  strictMcpConfig: true,
  noSessionPersistence: true,
  heartbeatMs: 60_000,
  idleTimeoutMs: 15 * 60_000,
  maxRuntimeMs: 60 * 60_000,
  killGraceMs: 5_000,
  enableDebugFile: true,
  disableTelemetry: true,
});

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
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
  const claudeOptions = parseClaudeOptions(args);

  ensurePrerequisites();

  console.log('Heavy harness supervisor loop');
  console.log(`- repo: ${ROOT}`);
  console.log(`- roles: ${roles.join(', ')}`);
  console.log(`- owner: ${owner}`);
  console.log(`- lane: ${lane || 'all'}`);
  console.log(`- max rounds: ${maxRounds === 0 ? 'unbounded' : maxRounds}`);
  console.log(`- idle sleep ms: ${idleSleepMs}`);
  console.log(`- claude: settings=${claudeOptions.settingSources} permission=${claudeOptions.permissionMode} output=${claudeOptions.outputFormat}`);
  console.log(`- watchdog: heartbeat=${formatDurationMs(claudeOptions.heartbeatMs)} idle=${formatDurationMs(claudeOptions.idleTimeoutMs)} max=${formatDurationMs(claudeOptions.maxRuntimeMs)}`);

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
    let run = prepareRun({ taskId: leasedTask.id, role, owner, model });
    run = attachResultContract(run);
    run = attachAutomationContext(run, leasedTask);
    console.log(`[${nowIso()}] prepared ${run.runId}`);
    const result = await executePreparedRun(run, claudeOptions);

    if (result.exitCode !== 0) {
      console.log(`[${nowIso()}] run ${run.runId} failed with exit=${result.exitCode}`);
      failLease({
        taskId: leasedTask.id,
        role,
        owner,
        reason: result.reason || `supervisor observed claude exit ${result.exitCode}${result.signal ? ` signal=${result.signal}` : ''}`,
      });
    } else {
      finalizeSuccessfulRun(run);
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

function attachResultContract(run) {
  const resultPath = path.join(path.dirname(run.metadataPath), 'result.json');
  const debugPath = path.join(path.dirname(run.metadataPath), 'claude.debug.log');
  const promptContract = buildResultContract(run, resultPath);
  fs.appendFileSync(run.promptPath, promptContract);

  const metadata = JSON.parse(fs.readFileSync(run.metadataPath, 'utf8'));
  metadata.resultPath = resultPath;
  metadata.debugPath = debugPath;
  fs.writeFileSync(run.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return { ...run, resultPath, debugPath };
}

function attachAutomationContext(run, task) {
  fs.appendFileSync(run.promptPath, buildAutomationContext(task, run));
  return run;
}

function buildResultContract(run, resultPath) {
  const example = {
    taskId: run.taskId,
    role: run.role,
    owner: run.owner,
    disposition: 'complete',
    note: roleSuccessNote(run.role),
    nextStatus: defaultNextStatusForRole(run.role),
    artifacts: [],
  };

  return `\n\n## Supervisor Handoff Contract\n- Before exiting, write JSON to \`${resultPath}\`.\n- If you successfully finish your role, set \`disposition\` to \`complete\` and set \`nextStatus\` to \`${defaultNextStatusForRole(run.role)}\`.\n- If work is blocked, validations fail, or you cannot produce a safe handoff, set \`disposition\` to \`fail\` and include a short \`reason\`.\n- Missing or invalid \`result.json\` is treated as a failed unattended run and the supervisor will requeue or block the task automatically.\n- Do not ask a human for approval. Use the repo state, task history, validations, and current diff to decide.\n\nJSON example:\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\`\n\nFailure example:\n\`\`\`json\n${JSON.stringify({
    taskId: run.taskId,
    role: run.role,
    owner: run.owner,
    disposition: 'fail',
    reason: 'npm run build:desktop still fails',
    artifacts: [],
  }, null, 2)}\n\`\`\`\n`;
}

function buildAutomationContext(task, run) {
  const historyLines = formatTaskHistory(task);
  const manualGateLines = formatManualGates(task);
  const roleChecklist = buildRoleChecklist(run.role);

  return `\n## Unattended Loop Policy\n- You are running inside a fully unattended supervisor loop.\n- Do not wait for human replies, approvals, or manual lease updates.\n- Use the current repository state, task history, validation outputs, and git diff as your evidence.\n- Manual gates are best-effort in unattended mode: execute them when possible; if they cannot be run from this environment, say that clearly in your \`note\` and still choose \`complete\` or \`fail\` based on the best available evidence.\n- A successful unattended handoff must end with a valid \`result.json\` file.\n\n## Role Checklist\n${roleChecklist}\n\n## Recent Task History\n${historyLines}\n\n## Manual Gates For This Task\n${manualGateLines}\n`;
}

async function executePreparedRun(run, claudeOptions) {
  const prompt = fs.readFileSync(run.promptPath, 'utf8');
  const commandArgs = buildClaudeCommandArgs(run, prompt, claudeOptions);

  const startedAt = nowIso();
  appendJsonl(RUN_LEDGER_PATH, { runId: run.runId, taskId: run.taskId, status: 'started', at: startedAt });
  appendJsonl(EVENTS_PATH, { at: startedAt, type: 'run.started', taskId: run.taskId, role: run.role, owner: run.owner, note: run.runId });

  fs.writeFileSync(run.logPath, [
    '# Heavy Harness Session',
    `startedAt: ${startedAt}`,
    `command: claude ${JSON.stringify(commandArgs.slice(0, -1))} <prompt>`,
    '',
  ].join('\n'));

  const logStream = fs.createWriteStream(run.logPath, { flags: 'a' });
  const child = spawn('claude', commandArgs, {
    cwd: ROOT,
    env: buildClaudeEnv(claudeOptions),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const startedAtMs = Date.now();
  let lastActivityAtMs = startedAtMs;
  let watchdogReason = null;
  let forcedSignal = null;
  let childExited = false;

  child.stdout.on('data', (chunk) => {
    lastActivityAtMs = Date.now();
    const text = chunk.toString('utf8');
    logStream.write(`[stdout] ${text}`);
    if (!text.endsWith('\n')) {
      logStream.write('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    lastActivityAtMs = Date.now();
    const text = chunk.toString('utf8');
    logStream.write(`[stderr] ${text}`);
    if (!text.endsWith('\n')) {
      logStream.write('\n');
    }
  });

  const heartbeatTimer = setInterval(() => {
    const elapsed = Date.now() - startedAtMs;
    const quiet = Date.now() - lastActivityAtMs;
    try {
      heartbeatLease(run);
      console.log(`[${nowIso()}] heartbeat ${run.runId} elapsed=${formatDurationMs(elapsed)} quiet=${formatDurationMs(quiet)}`);
    } catch (error) {
      console.log(`[${nowIso()}] heartbeat warning for ${run.runId}: ${error.message}`);
    }
  }, claudeOptions.heartbeatMs);
  heartbeatTimer.unref?.();

  const watchdogTimer = setInterval(() => {
    const now = Date.now();
    if (!watchdogReason && claudeOptions.idleTimeoutMs > 0 && now - lastActivityAtMs > claudeOptions.idleTimeoutMs) {
      watchdogReason = `supervisor watchdog: no Claude output for ${formatDurationMs(now - lastActivityAtMs)}`;
      appendJsonl(EVENTS_PATH, { at: nowIso(), type: 'run.watchdog', taskId: run.taskId, role: run.role, owner: run.owner, note: watchdogReason });
      logStream.write(`[watchdog] ${watchdogReason}\n`);
      forcedSignal = 'SIGTERM';
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        if (!childExited) {
          forcedSignal = 'SIGKILL';
          child.kill('SIGKILL');
        }
      }, claudeOptions.killGraceMs);
      killTimer.unref?.();
      return;
    }
    if (!watchdogReason && claudeOptions.maxRuntimeMs > 0 && now - startedAtMs > claudeOptions.maxRuntimeMs) {
      watchdogReason = `supervisor watchdog: max runtime ${formatDurationMs(claudeOptions.maxRuntimeMs)} exceeded`;
      appendJsonl(EVENTS_PATH, { at: nowIso(), type: 'run.watchdog', taskId: run.taskId, role: run.role, owner: run.owner, note: watchdogReason });
      logStream.write(`[watchdog] ${watchdogReason}\n`);
      forcedSignal = 'SIGTERM';
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        if (!childExited) {
          forcedSignal = 'SIGKILL';
          child.kill('SIGKILL');
        }
      }, claudeOptions.killGraceMs);
      killTimer.unref?.();
    }
  }, 5_000);
  watchdogTimer.unref?.();

  const result = await new Promise((resolve) => {
    let settled = false;

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(heartbeatTimer);
      clearInterval(watchdogTimer);
      resolve(payload);
    };

    child.on('error', (error) => {
      logStream.write(`[spawn-error] ${error.message}\n`);
      finish({ status: 1, signal: null, error });
    });

    child.on('exit', (status, signal) => {
      childExited = true;
      finish({ status, signal });
    });
  });

  await new Promise((resolve) => {
    logStream.end(resolve);
  });

  const finishedAt = nowIso();
  const finalStatus = watchdogReason ? 'errored' : result.status === 0 ? 'finished' : 'errored';
  appendJsonl(RUN_LEDGER_PATH, {
    runId: run.runId,
    taskId: run.taskId,
    status: finalStatus,
    at: finishedAt,
    exitCode: result.status,
    signal: forcedSignal || result.signal,
    logPath: run.logPath,
    debugPath: run.debugPath,
    reason: watchdogReason,
  });
  appendJsonl(EVENTS_PATH, {
    at: finishedAt,
    type: finalStatus === 'finished' ? 'run.finished' : 'run.errored',
    taskId: run.taskId,
    role: run.role,
    owner: run.owner,
    note: watchdogReason || `exit=${result.status}`,
  });

  console.log(`Run finished with exit code ${result.status}`);
  console.log(`- log: ${run.logPath}`);
  if (run.debugPath) {
    console.log(`- debug: ${run.debugPath}`);
  }
  if (watchdogReason) {
    console.log(`- watchdog: ${watchdogReason}`);
  }

  return {
    exitCode: watchdogReason ? 124 : result.status ?? 1,
    signal: forcedSignal || result.signal || null,
    reason: watchdogReason,
  };
}

function finalizeSuccessfulRun(run) {
  const task = readTask(run.taskId);
  if (!isTaskStillLeasedToRun(task, run)) {
    appendJsonl(EVENTS_PATH, {
      at: nowIso(),
      type: 'run.handoff.skipped',
      taskId: run.taskId,
      role: run.role,
      owner: run.owner,
      note: 'lease already released before supervisor auto-close',
    });
    console.log(`[${nowIso()}] lease already released for ${run.taskId}; skipping auto-close`);
    return;
  }

  const handoffFile = readHandoffFile(run.resultPath);
  if (!handoffFile.ok) {
    recordHandoffFailure(run, 'run.handoff.missing', handoffFile.reason);
    failLease({
      taskId: run.taskId,
      role: run.role,
      owner: run.owner,
      reason: `successful run missing handoff: ${handoffFile.reason}`,
    });
    return;
  }

  const validation = validateHandoff(handoffFile.value, run);
  if (!validation.ok) {
    recordHandoffFailure(run, 'run.handoff.invalid', validation.reason);
    failLease({
      taskId: run.taskId,
      role: run.role,
      owner: run.owner,
      reason: `successful run produced invalid handoff: ${validation.reason}`,
    });
    return;
  }

  const handoff = validation.value;
  if (handoff.disposition === 'fail') {
    failLease({
      taskId: run.taskId,
      role: run.role,
      owner: run.owner,
      reason: handoff.reason || handoff.note || 'agent requested requeue',
    });
    return;
  }

  completeLease({
    taskId: run.taskId,
    role: run.role,
    owner: run.owner,
    note: handoff.note,
    nextStatus: handoff.nextStatus,
    artifacts: handoff.artifacts,
  });
}

function recordHandoffFailure(run, type, reason) {
  appendJsonl(EVENTS_PATH, {
    at: nowIso(),
    type,
    taskId: run.taskId,
    role: run.role,
    owner: run.owner,
    note: reason,
  });
  console.log(`[${nowIso()}] warning: ${reason}; auto-failing ${run.taskId}`);
}

function readHandoffFile(resultPath) {
  if (!resultPath || !fs.existsSync(resultPath)) {
    return { ok: false, reason: `missing result file at ${resultPath}` };
  }

  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(resultPath, 'utf8')) };
  } catch {
    return { ok: false, reason: `invalid JSON in ${resultPath}` };
  }
}

function validateHandoff(raw, run) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'handoff payload must be an object' };
  }
  if (raw.taskId !== run.taskId) {
    return { ok: false, reason: `taskId mismatch: expected ${run.taskId}` };
  }
  if (raw.role !== run.role) {
    return { ok: false, reason: `role mismatch: expected ${run.role}` };
  }
  if (raw.owner !== run.owner) {
    return { ok: false, reason: `owner mismatch: expected ${run.owner}` };
  }
  if (!['complete', 'fail'].includes(raw.disposition)) {
    return { ok: false, reason: 'disposition must be complete or fail' };
  }
  if (raw.disposition === 'complete' && raw.nextStatus && !allowedNextStatusesForRole(run.role).includes(raw.nextStatus)) {
    return { ok: false, reason: `invalid nextStatus: ${raw.nextStatus}` };
  }
  if (raw.disposition === 'fail' && typeof raw.reason !== 'string' && typeof raw.note !== 'string') {
    return { ok: false, reason: 'failed handoff requires reason or note' };
  }
  if (raw.disposition === 'complete' && typeof raw.note !== 'string') {
    return { ok: false, reason: 'complete handoff requires note' };
  }
  if (raw.artifacts !== undefined && !Array.isArray(raw.artifacts)) {
    return { ok: false, reason: 'artifacts must be an array when provided' };
  }

  return {
    ok: true,
    value: {
      disposition: raw.disposition,
      nextStatus: raw.nextStatus || defaultNextStatusForRole(run.role),
      note: raw.note || raw.reason || '',
      reason: raw.reason || raw.note || '',
      artifacts: Array.isArray(raw.artifacts)
        ? raw.artifacts.map((artifact) => String(artifact).trim()).filter(Boolean)
        : [],
    },
  };
}

function isTaskStillLeasedToRun(task, run) {
  return Boolean(
    task?.lease &&
    task.lease.owner === run.owner &&
    task.lease.role === run.role,
  );
}

function completeLease({ taskId, role, owner, note, nextStatus, artifacts }) {
  const commandArgs = ['complete', '--task', taskId, '--role', role, '--owner', owner, '--note', note];
  if (nextStatus) {
    commandArgs.push('--next-status', nextStatus);
  }
  if (artifacts?.length) {
    commandArgs.push('--artifacts', artifacts.join(','));
  }
  const result = runControlPlane(commandArgs);
  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }
}

function failLease({ taskId, role, owner, reason }) {
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

function heartbeatLease(run) {
  runControlPlane([
    'heartbeat',
    '--task',
    run.taskId,
    '--owner',
    run.owner,
  ]);
}

function defaultNextStatusForRole(role) {
  if (role === 'reviewer') {
    return 'done';
  }
  if (role === 'verifier') {
    return 'ready_for_review';
  }
  return 'ready_for_verification';
}

function allowedNextStatusesForRole(role) {
  if (role === 'reviewer') {
    return ['done'];
  }
  if (role === 'verifier') {
    return ['ready_for_review'];
  }
  return ['ready_for_verification'];
}

function roleSuccessNote(role) {
  if (role === 'reviewer') {
    return 'Reviewed the task, verified the evidence, and approved it for done.';
  }
  if (role === 'verifier') {
    return 'Re-ran validations, checked the scope, and approved the task for final review.';
  }
  return 'Implemented the slice, ran the required automated validations, and handed off to verification.';
}

function buildRoleChecklist(role) {
  if (role === 'reviewer') {
    return [
      '- Review the verifier evidence, current diff, and resulting repo state.',
      '- Confirm the task scope matches the objective and no obvious cleanup is missing.',
      '- Write `result.json` with `disposition: "complete"` and `nextStatus: "done"` only when the task is genuinely ready to close.',
      '- Otherwise write `disposition: "fail"` with the smallest corrective next step.',
    ].join('\n');
  }

  if (role === 'verifier') {
    return [
      '- Re-run the required validation commands from the task pack.',
      '- Exercise manual gates when possible from this environment.',
      '- If a manual gate cannot be run unattended, say that explicitly in the `note` instead of waiting for a human.',
      '- Write `result.json` with `disposition: "complete"` and `nextStatus: "ready_for_review"` only when the evidence is strong enough.',
    ].join('\n');
  }

  return [
    '- Implement the smallest viable slice that satisfies the task objective.',
    '- Run the required automated validations before handoff.',
    '- Use `disposition: "complete"` only when the task is ready for independent verification.',
    '- If the implementation is not ready, write `disposition: "fail"` with the exact failing command or blocker.',
  ].join('\n');
}

function formatTaskHistory(task) {
  const history = Array.isArray(task?.history) ? task.history.slice(-HISTORY_EVENT_LIMIT) : [];
  if (!history.length) {
    return '- no prior history';
  }

  return history.map((entry) => {
    const details = [
      entry.event,
      entry.owner ? `owner=${entry.owner}` : null,
      entry.role ? `role=${entry.role}` : null,
      entry.nextStatus ? `next=${entry.nextStatus}` : null,
      entry.reason ? `reason=${entry.reason}` : null,
      entry.note ? `note=${entry.note}` : null,
    ].filter(Boolean).join(' | ');
    return `- ${entry.at || 'unknown time'} :: ${details}`;
  }).join('\n');
}

function formatManualGates(task) {
  const manual = Array.isArray(task?.validation?.manual) ? task.validation.manual : [];
  if (!manual.length) {
    return '- none';
  }

  return manual.map((gate) => `- ${gate}`).join('\n');
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

function buildClaudeCommandArgs(run, prompt, claudeOptions) {
  const commandArgs = ['-p', '--permission-mode', claudeOptions.permissionMode];
  if (claudeOptions.outputFormat === 'stream-json') {
    commandArgs.push('--verbose');
  }
  commandArgs.push('--output-format', claudeOptions.outputFormat);
  if (claudeOptions.includePartialMessages && claudeOptions.outputFormat === 'stream-json') {
    commandArgs.push('--include-partial-messages');
  }
  if (claudeOptions.settingSources) {
    commandArgs.push('--setting-sources', claudeOptions.settingSources);
  }
  if (claudeOptions.disableSlashCommands) {
    commandArgs.push('--disable-slash-commands');
  }
  if (claudeOptions.strictMcpConfig) {
    commandArgs.push('--strict-mcp-config');
  }
  if (claudeOptions.noSessionPersistence) {
    commandArgs.push('--no-session-persistence');
  }
  if (claudeOptions.enableDebugFile && run.debugPath) {
    commandArgs.push('--debug-file', run.debugPath);
  }
  if (run.model) {
    commandArgs.push('--model', run.model);
  }
  commandArgs.push(prompt);
  return commandArgs;
}

function buildClaudeEnv(claudeOptions) {
  const env = { ...process.env };
  if (claudeOptions.disableTelemetry) {
    env.CLAUDE_CODE_ENABLE_TELEMETRY = '0';
  }
  return env;
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

function parseClaudeOptions(args) {
  return {
    permissionMode: args['claude-permission-mode'] || DEFAULT_CLAUDE_OPTIONS.permissionMode,
    settingSources: args['claude-setting-sources'] || DEFAULT_CLAUDE_OPTIONS.settingSources,
    outputFormat: args['claude-output-format'] || DEFAULT_CLAUDE_OPTIONS.outputFormat,
    includePartialMessages: !Boolean(args['no-partial-messages']),
    disableSlashCommands: !Boolean(args['allow-slash-commands']),
    strictMcpConfig: !Boolean(args['allow-configured-mcp']),
    noSessionPersistence: !Boolean(args['allow-session-persistence']),
    heartbeatMs: parseNumber(args['heartbeat-ms'], DEFAULT_CLAUDE_OPTIONS.heartbeatMs),
    idleTimeoutMs: parseNumber(args['idle-timeout-ms'], DEFAULT_CLAUDE_OPTIONS.idleTimeoutMs),
    maxRuntimeMs: parseNumber(args['max-runtime-ms'], DEFAULT_CLAUDE_OPTIONS.maxRuntimeMs),
    killGraceMs: parseNumber(args['kill-grace-ms'], DEFAULT_CLAUDE_OPTIONS.killGraceMs),
    enableDebugFile: !Boolean(args['no-debug-file']),
    disableTelemetry: !Boolean(args['allow-telemetry']),
  };
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

function formatDurationMs(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h${remainingMinutes}m`;
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
  console.log(`Heavy harness supervisor loop\n\nUsage:\n  node .harness/bin/supervisor-loop.mjs [--roles reviewer,verifier,implementer] [--owner NAME] [--lane NAME]\n\nOptions:\n  --roles ROLE1,ROLE2,ROLE3     Role priority order. Default drains reviewer -> verifier -> implementer.\n  --owner NAME                  Lease owner recorded in queue state. Default: claude-supervisor.\n  --lane NAME                   Restrict leasing to one lane.\n  --ttl-min N                   Override lease TTL in minutes.\n  --model MODEL                 Pass through Claude model override.\n  --max-rounds N                Stop after N leasing attempts. 0 means unbounded.\n  --sleep-ms N                  Idle polling interval in milliseconds. Default: 15000.\n  --stop-when-idle              Exit as soon as no task can be leased.\n  --heartbeat-ms N              Extend the active lease while Claude is still running. Default: 60000.\n  --idle-timeout-ms N           Kill Claude after N ms without stdout/stderr activity. Default: 900000.\n  --max-runtime-ms N            Kill Claude after N ms total runtime. Default: 3600000.\n  --kill-grace-ms N             Wait after SIGTERM before SIGKILL. Default: 5000.\n  --claude-permission-mode MODE Claude permission mode. Default: auto.\n  --claude-setting-sources SRC  Claude setting sources. Default: local.\n  --claude-output-format FMT    Claude output format. Default: stream-json.\n  --allow-slash-commands        Keep slash commands/skills enabled for the child run.\n  --allow-configured-mcp        Keep configured MCP servers enabled for the child run.\n  --allow-session-persistence   Let Claude persist headless sessions on disk.\n  --no-partial-messages         Disable partial message events in stream-json output.\n  --no-debug-file               Skip per-run Claude debug log capture.\n  --allow-telemetry             Do not disable Claude telemetry for the child run.\n\nAuto-close:\n  Successful runs auto-close only from a valid result.json handoff.\n  Missing or invalid handoffs are treated as failed unattended runs and are requeued or blocked automatically.`);
}
