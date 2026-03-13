#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = findRepoRoot(process.cwd());
const HARNESS_DIR = path.join(ROOT, '.harness');
const PROMPT_TEMPLATE_PATH = path.join(HARNESS_DIR, 'prompts', 'product-iteration.md');
const PRODUCT_RUNS_DIR = path.join(HARNESS_DIR, 'product-runs');
const LOGS_DIR = path.join(HARNESS_DIR, 'logs');
const STATE_DIR = path.join(HARNESS_DIR, 'state');
const FEATURE_LIST_PATH = path.join(ROOT, 'feature_list.json');
const LOOP_LEDGER_PATH = path.join(STATE_DIR, 'product-loop.rounds.jsonl');
const LOOP_STATE_PATH = path.join(STATE_DIR, 'product-loop.json');
const LOOP_MEMORY_PATH = path.join(STATE_DIR, 'product-memory.json');
const MEMORY_DEFAULTS = Object.freeze({
  historyLimit: 12,
  summaryLimit: 3,
  openThreadLimit: 6,
  winLimit: 4,
  cooldownRounds: 2,
  cooldownFileLimit: 12,
});
const DEFAULTS = Object.freeze({
  owner: 'claude-product-loop',
  permissionMode: 'auto',
  settingSources: 'user,local',
  outputFormat: 'stream-json',
  includePartialMessages: true,
  allowConfiguredMcp: true,
  allowSlashCommands: true,
  allowSessionPersistence: false,
  enableDebugFile: true,
  disableTelemetry: true,
  baseUrl: 'http://127.0.0.1:3000',
  ensureWeb: true,
  webBootTimeoutMs: 120_000,
  sleepMs: 10_000,
  maxRounds: 0,
  maxIterationCycles: 3,
  postResultWaitMs: 20_000,
  stateHeartbeatMs: 15_000,
  heartbeatMs: 60_000,
  idleTimeoutMs: 30 * 60_000,
  maxRuntimeMs: 2 * 60 * 60_000,
  killGraceMs: 5_000,
});
const MAX_RECOVERABLE_ROUND_FAILURES = 3;

let activeWebServer = null;
let activeClaudeChild = null;
let activeRun = null;
let loopState = {};
let stateHeartbeatTimer = null;
let shutdownStarted = false;
let shutdownReason = null;

installProcessHandlers();

runLoopWithRecovery().catch((error) => {
  markLoopState({
    status: 'failed',
    failedAt: nowIso(),
    reason: error.message,
  });
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await cleanupProcesses();
});

async function runLoopWithRecovery() {
  const restartOptions = parseOptions(parseArgs(process.argv.slice(2)));
  let recoverableFailures = 0;

  while (true) {
    try {
      await main();
      return;
    } catch (error) {
      if (!isRecoverableRoundFailure(error)) {
        throw error;
      }
      recoverableFailures += 1;
      if (recoverableFailures > MAX_RECOVERABLE_ROUND_FAILURES) {
        throw new Error(`product loop exceeded ${MAX_RECOVERABLE_ROUND_FAILURES} recoverable round failures: ${error.message}`);
      }

      const restartDelayMs = restartOptions.sleepMs;
      const nextRetryAt = new Date(Date.now() + restartDelayMs).toISOString();
      markLoopState({
        status: 'recovering',
        failedAt: nowIso(),
        reason: error.message,
        recoveryAttempts: recoverableFailures,
        nextRetryAt,
        claudePid: null,
      });
      console.error(`WARN: ${error.message}`);
      console.log(`[${nowIso()}] restarting product loop in ${formatDurationMs(restartDelayMs)} (${recoverableFailures}/${MAX_RECOVERABLE_ROUND_FAILURES})`);
      activeRun = null;
      await cleanupProcesses();
      await sleep(restartDelayMs);
    }
  }
}

function isRecoverableRoundFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('product round ');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._[0] === 'help') {
    printHelp();
    return;
  }

  ensurePrerequisites();
  ensureRuntimeDirs();

  const options = parseOptions(args);
  const web = await ensureWebSurface(options);
  activeWebServer = web.startedByScript ? web : null;

  console.log('Product iteration autopilot');
  console.log(`- repo: ${ROOT}`);
  console.log(`- owner: ${options.owner}`);
  console.log(`- base url: ${options.baseUrl}`);
  console.log(`- web surface: ${web.startedByScript ? 'started by loop' : 'reused existing server or skipped start'}`);
  console.log(`- max rounds: ${options.maxRounds === 0 ? 'unbounded' : options.maxRounds}`);
  console.log(`- iteration cycles per round: ${options.maxIterationCycles}`);
  console.log(`- claude: settings=${options.settingSources} permission=${options.permissionMode} output=${options.outputFormat}`);
  console.log(`- watchdog: heartbeat=${formatDurationMs(options.heartbeatMs)} idle=${formatDurationMs(options.idleTimeoutMs)} max=${formatDurationMs(options.maxRuntimeMs)}`);

  let rounds = 0;
  while (options.maxRounds === 0 || rounds < options.maxRounds) {
    rounds += 1;
    const run = prepareRound({ round: rounds, options, web });
    activeRun = run;
    console.log(`[${nowIso()}] prepared ${run.runId}`);

    markLoopState({
      status: 'running',
      owner: options.owner,
      round: rounds,
      runId: run.runId,
      runDir: run.runDir,
      logPath: run.logPath,
      debugPath: run.debugPath,
      resultPath: run.resultPath,
      baseUrl: options.baseUrl,
      startedAt: nowIso(),
    });
    startStateHeartbeat(options);

    const execution = await executeRound(run, options);
    if (execution.exitCode !== 0) {
      stopStateHeartbeat();
      markLoopState({
        status: 'failed',
        owner: options.owner,
        round: rounds,
        runId: run.runId,
        baseUrl: options.baseUrl,
        failedAt: nowIso(),
        reason: execution.reason || `claude exited ${execution.exitCode}`,
        signal: execution.signal || null,
      });
      appendJsonl(LOOP_LEDGER_PATH, {
        at: nowIso(),
        runId: run.runId,
        round: rounds,
        status: 'failed',
        exitCode: execution.exitCode,
        signal: execution.signal,
        reason: execution.reason,
      });
      throw new Error(`product round ${run.runId} failed: ${execution.reason || `claude exited ${execution.exitCode}`}`);
    }

    const handoff = readHandoff(run.resultPath);
    if (!handoff.ok) {
      stopStateHeartbeat();
      markLoopState({
        status: 'failed',
        owner: options.owner,
        round: rounds,
        runId: run.runId,
        baseUrl: options.baseUrl,
        failedAt: nowIso(),
        reason: handoff.reason,
      });
      appendJsonl(LOOP_LEDGER_PATH, {
        at: nowIso(),
        runId: run.runId,
        round: rounds,
        status: 'invalid_handoff',
        reason: handoff.reason,
      });
      throw new Error(`product round ${run.runId} did not produce a valid result.json: ${handoff.reason}`);
    }

    stopStateHeartbeat();
    appendJsonl(LOOP_LEDGER_PATH, {
      at: nowIso(),
      runId: run.runId,
      round: rounds,
      status: handoff.value.disposition,
      summary: handoff.value.summary,
      continueAutopilot: handoff.value.continueAutopilot,
      changedFiles: handoff.value.changedFiles,
      nextFocus: handoff.value.nextFocus,
    });

    markLoopState({
      status: 'round_completed',
      owner: options.owner,
      round: rounds,
      runId: run.runId,
      baseUrl: options.baseUrl,
      completedAt: nowIso(),
      summary: handoff.value.summary,
      continueAutopilot: handoff.value.continueAutopilot,
      changedFiles: handoff.value.changedFiles,
      nextFocus: handoff.value.nextFocus,
      claudePid: null,
    });
    console.log(`[${nowIso()}] round ${rounds} summary :: ${handoff.value.summary}`);
    if (handoff.value.changedFiles.length) {
      console.log(`- changed files: ${handoff.value.changedFiles.join(', ')}`);
    }
    if (!handoff.value.continueAutopilot) {
      console.log(`[${nowIso()}] stopping after round ${rounds}: handoff requested stop`);
      break;
    }

    console.log(`[${nowIso()}] sleeping ${formatDurationMs(options.sleepMs)} before next round`);
    await sleep(options.sleepMs);
  }

  activeRun = null;
  markLoopState({
    status: 'stopped',
    owner: options.owner,
    round: rounds,
    baseUrl: options.baseUrl,
    stoppedAt: nowIso(),
    claudePid: null,
  });
}

function ensurePrerequisites() {
  if (!commandExists('claude')) {
    throw new Error('claude command not found in PATH');
  }
  if (!commandExists('git')) {
    throw new Error('git command not found in PATH');
  }
  if (!fs.existsSync(PROMPT_TEMPLATE_PATH)) {
    throw new Error(`prompt template not found: ${PROMPT_TEMPLATE_PATH}`);
  }
}

function ensureRuntimeDirs() {
  fs.mkdirSync(PRODUCT_RUNS_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function parseOptions(args) {
  return {
    owner: args.owner || DEFAULTS.owner,
    permissionMode: args['claude-permission-mode'] || DEFAULTS.permissionMode,
    settingSources: args['claude-setting-sources'] || DEFAULTS.settingSources,
    outputFormat: args['claude-output-format'] || DEFAULTS.outputFormat,
    includePartialMessages: !Boolean(args['no-partial-messages']),
    allowConfiguredMcp: !Boolean(args['strict-mcp-config']),
    allowSlashCommands: !Boolean(args['disable-slash-commands']),
    allowSessionPersistence: Boolean(args['allow-session-persistence']),
    enableDebugFile: !Boolean(args['no-debug-file']),
    disableTelemetry: !Boolean(args['allow-telemetry']),
    model: args.model || null,
    baseUrl: args['base-url'] || DEFAULTS.baseUrl,
    ensureWeb: !Boolean(args['no-web-boot']),
    webBootTimeoutMs: parseNumber(args['web-boot-timeout-ms'], DEFAULTS.webBootTimeoutMs),
    sleepMs: parseNumber(args['sleep-ms'], DEFAULTS.sleepMs),
    maxRounds: parseNumber(args['max-rounds'], DEFAULTS.maxRounds),
    maxIterationCycles: parseNumber(args['max-iteration-cycles'], DEFAULTS.maxIterationCycles),
    postResultWaitMs: parseNumber(args['post-result-wait-ms'], DEFAULTS.postResultWaitMs),
    stateHeartbeatMs: parseNumber(args['state-heartbeat-ms'], DEFAULTS.stateHeartbeatMs),
    heartbeatMs: parseNumber(args['heartbeat-ms'], DEFAULTS.heartbeatMs),
    idleTimeoutMs: parseNumber(args['idle-timeout-ms'], DEFAULTS.idleTimeoutMs),
    maxRuntimeMs: parseNumber(args['max-runtime-ms'], DEFAULTS.maxRuntimeMs),
    killGraceMs: parseNumber(args['kill-grace-ms'], DEFAULTS.killGraceMs),
  };
}

async function ensureWebSurface(options) {
  if (!options.ensureWeb) {
    return {
      baseUrl: options.baseUrl,
      startedByScript: false,
      child: null,
      logPath: null,
    };
  }

  const reachable = await isUrlReachable(options.baseUrl);
  if (reachable) {
    return {
      baseUrl: options.baseUrl,
      startedByScript: false,
      child: null,
      logPath: null,
    };
  }

  const url = new URL(options.baseUrl);
  const host = url.hostname || '127.0.0.1';
  const port = url.port || '3000';
  const logPath = path.join(LOGS_DIR, 'product-loop.web.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const child = spawn('npm', ['run', 'dev:web', '--', '--hostname', host, '--port', String(port)], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    logStream.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    logStream.write(chunk);
  });
  child.on('close', () => {
    logStream.end();
  });

  const ready = await waitForUrl(options.baseUrl, options.webBootTimeoutMs);
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`web surface did not boot at ${options.baseUrl}; inspect ${logPath}`);
  }

  return {
    baseUrl: options.baseUrl,
    startedByScript: true,
    child,
    logPath,
  };
}

function prepareRound({ round, options, web }) {
  const runId = `product-${timestampId()}`;
  const runDir = path.join(PRODUCT_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const promptPath = path.join(runDir, 'prompt.md');
  const logPath = path.join(runDir, 'session.log');
  const resultPath = path.join(runDir, 'result.json');
  const debugPath = path.join(runDir, 'claude.debug.log');
  const metadataPath = path.join(runDir, 'run.json');
  const prompt = buildPrompt({ runId, round, options, web, resultPath });
  const metadata = {
    runId,
    round,
    owner: options.owner,
    model: options.model,
    baseUrl: options.baseUrl,
    promptPath,
    logPath,
    resultPath,
    debugPath,
    metadataPath,
    createdAt: nowIso(),
  };

  fs.writeFileSync(promptPath, prompt);
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  fs.writeFileSync(logPath, '');

  return {
    ...metadata,
    runDir,
  };
}

function buildPrompt({ runId, round, options, web, resultPath }) {
  const basePrompt = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf8').trim();
  const productRounds = loadProductRoundResults();
  const longTermMemory = buildLongTermMemory(productRounds);
  writeProductMemorySnapshot(longTermMemory);
  const routes = listProductRoutes()
    .map((route) => `- ${route}`)
    .join('\n');
  const featureHints = loadFeatureHints()
    .map((feature) => `- ${feature.name} [${feature.status}] :: ${feature.description} :: next=${feature.nextStep}`)
    .join('\n');
  const previousRounds = loadPreviousRoundSummaries()
    .map((summary) => `- ${summary.runId}: ${summary.summary}${summary.nextFocus ? ` :: next=${summary.nextFocus}` : ''}`)
    .join('\n');
  const gitStatus = getGitStatusLines()
    .map((line) => `- ${line}`)
    .join('\n');
  const branch = getCurrentBranch();

  const resultExample = {
    disposition: 'complete',
    summary: 'Improved one or more high-friction product issues after exercising the real surface.',
    continueAutopilot: true,
    iterations: [
      {
        issue: 'Concrete UX or behavior problem observed from real product use',
        evidence: 'How the issue was observed in the product',
        changes: ['file-or-surface-touched'],
        retest: ['How the affected flow was re-exercised'],
        validations: ['Focused and broad checks that passed'],
      },
    ],
    changedFiles: ['src/app/translate/page.tsx'],
    areasImproved: ['Clearer browser-preview messaging on the most confusing touched surface'],
    areasStillWeak: ['The next most valuable friction that still remains after this fix'],
    decisionReason: 'Why this issue was chosen instead of other open threads in long-term memory',
    revisitJustification: null,
    validations: [
      {
        command: 'npm run test',
        status: 'passed',
        note: 'Broad regression sweep for this round',
      },
    ],
    remainingOpportunities: ['Most valuable remaining issue after this round'],
    nextFocus: 'The next best improvement if another round should run',
  };

  const failureExample = {
    disposition: 'fail',
    summary: 'Blocked before a safe validated improvement could be completed.',
    continueAutopilot: false,
    reason: 'Exact blocker or failing command',
    iterations: [],
    changedFiles: [],
    areasImproved: [],
    areasStillWeak: ['What still looks weak even though this round failed'],
    decisionReason: 'Why this blocked issue was attempted now',
    revisitJustification: null,
    validations: [],
    remainingOpportunities: ['What should be tackled after the blocker is resolved'],
    nextFocus: null,
  };

  return `${basePrompt}

## Round Context
- round: ${round}
- run id: ${runId}
- repo root: ${ROOT}
- branch: ${branch}
- owner: ${options.owner}
- model override: ${options.model || 'default'}
- base url: ${options.baseUrl}
- web surface log: ${web.logPath || 'reused existing server or not started by loop'}
- result path: ${resultPath}
- max improvement cycles this round: ${options.maxIterationCycles}

## Product Surfaces To Exercise
${routes || '- /'}

## Feature Hints
${featureHints || '- feature_list.json not found'}

## Recent Product-Loop Summaries
${previousRounds || '- none yet'}

## Long-Term Product Memory
${formatLongTermMemory(longTermMemory)}

## Current Worktree Snapshot
${gitStatus || '- clean'}

## Product Loop Contract
- This round is not limited to one prewritten FT ticket.
- Use the live product at \`${options.baseUrl}\` as your primary source of truth whenever possible.
- Use the long-term memory above to decide what to continue, what to leave alone, and what still looks unfinished.
- Work through up to ${options.maxIterationCycles} improvement cycles this round.
- In each cycle, observe the product first, then decide what to change.
- Prefer continuing unresolved high-value threads from prior rounds before inventing brand-new work.
- Prefer high-confidence, user-visible improvements over speculative rewrites.
- If you touch an existing function, class, or method, run GitNexus impact analysis first and record the blast radius in your working notes.
- If GitNexus reports HIGH or CRITICAL risk, pick a lower-risk issue unless the fix is essential and you can safely update the direct dependents.
- Treat the recent file cooldown list as active. Do not re-touch those files unless the earlier fix was incomplete, validation exposed a gap, or new product evidence points back there.
- After each meaningful change, re-exercise the affected flow through the product.
- Before finishing the round, run the broadest reasonable validation for the touched surface.
- Use Playwright or the browser-accessible product surface whenever available instead of relying only on static code inspection.
- Protect unrelated changes already present in the worktree.

## Result Contract
- Before exiting, write JSON to \`${resultPath}\`.
- If the round produced safe, validated progress, use \`disposition: "complete"\`.
- If the round is blocked or validation fails, use \`disposition: "fail"\` and include a precise \`reason\`.
- Set \`continueAutopilot\` to \`true\` only when another unattended round should keep iterating safely.
- Include \`areasImproved\`, \`areasStillWeak\`, and \`decisionReason\` so future rounds can use your result as planning memory.
- If you re-touch any file from the recent cooldown list, include \`revisitJustification\` with the concrete new evidence or unfinished gap.
- Missing or invalid \`result.json\` is treated as a failed autopilot round.

Success example:
\`\`\`json
${JSON.stringify(resultExample, null, 2)}
\`\`\`

Failure example:
\`\`\`json
${JSON.stringify(failureExample, null, 2)}
\`\`\`
`;
}

async function executeRound(run, options) {
  const prompt = fs.readFileSync(run.promptPath, 'utf8');
  const commandArgs = buildClaudeCommandArgs(prompt, run, options);
  const startedAt = nowIso();

  fs.writeFileSync(run.logPath, [
    '# Product Loop Session',
    `startedAt: ${startedAt}`,
    `command: claude ${JSON.stringify(commandArgs.slice(0, -1))} <prompt>`,
    '',
  ].join('\n'));

  const logStream = fs.createWriteStream(run.logPath, { flags: 'a' });
  const child = spawn('claude', commandArgs, {
    cwd: ROOT,
    detached: true,
    env: buildClaudeEnv(options),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeClaudeChild = child;
  markLoopState({
    claudePid: child.pid ?? null,
    claudeStartedAt: startedAt,
    runStatus: 'running_claude',
  });

  let lastActivityAtMs = Date.now();
  let watchdogReason = null;
  let forcedSignal = null;
  let childExited = false;
  let watchdogSignalSent = false;
  let stdoutBuffer = '';
  let successfulResultSeen = false;
  let resultEventAt = null;
  let postResultReason = null;
  let successfulHandoffSeen = false;
  let gracefulShutdownRequested = false;
  let postResultWatcher = null;
  const backgroundTasks = new Map();
  let stalledBackgroundTask = null;
  const stalledTaskGraceMs = Math.min(5 * 60_000, Math.max(10_000, Math.floor(options.idleTimeoutMs / 6)));

  const sendClaudeSignal = (signal) => {
    if (childExited) {
      return;
    }
    if (typeof child.pid === 'number' && child.pid > 0) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // fall through to single-process signal
      }
    }
    child.kill(signal);
  };

  const clearStalledBackgroundTask = () => {
    if (!stalledBackgroundTask) {
      return;
    }
    stalledBackgroundTask = null;
    markLoopState({
      stalledTaskId: null,
      stalledTaskDescription: null,
      stalledTaskObservedAt: null,
    });
  };

  const ensureBackgroundTask = (taskId) => {
    if (!backgroundTasks.has(taskId)) {
      backgroundTasks.set(taskId, {
        taskId,
        description: null,
        taskType: 'local_bash',
        startedAtMs: Date.now(),
        lastObservedAtMs: null,
        lastTimeoutWhileRunningAtMs: null,
        status: 'running',
      });
    }
    return backgroundTasks.get(taskId);
  };

  const extractTagValue = (content, tag) => {
    const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return match ? match[1].trim() : null;
  };

  const rememberBackgroundTaskStart = ({ taskId, description, taskType }) => {
    if (!taskId || taskType !== 'local_bash') {
      return;
    }
    const task = ensureBackgroundTask(taskId);
    task.description = description || task.description || null;
    task.taskType = taskType;
    task.startedAtMs = Date.now();
    task.status = 'running';
  };

  const noteBackgroundTaskOutput = (content) => {
    if (typeof content !== 'string' || !content.includes('<task_id>')) {
      return false;
    }
    const taskId = extractTagValue(content, 'task_id');
    if (!taskId) {
      return false;
    }
    const task = ensureBackgroundTask(taskId);
    const status = extractTagValue(content, 'status');
    const retrievalStatus = extractTagValue(content, 'retrieval_status');
    task.lastObservedAtMs = Date.now();
    if (status) {
      task.status = status;
    }
    if (status === 'running' && retrievalStatus === 'timeout') {
      task.lastTimeoutWhileRunningAtMs = Date.now();
      stalledBackgroundTask = {
        taskId,
        description: task.description || null,
        observedAtMs: task.lastTimeoutWhileRunningAtMs,
      };
      markLoopState({
        stalledTaskId: taskId,
        stalledTaskDescription: task.description || null,
        stalledTaskObservedAt: nowIso(),
      });
      logStream.write(`[task-stall] background task ${taskId}${task.description ? ` (${task.description})` : ''} timed out while still running\n`);
      return true;
    }
    if (status && status !== 'running') {
      backgroundTasks.delete(taskId);
      if (stalledBackgroundTask?.taskId === taskId) {
        clearStalledBackgroundTask();
      }
      return false;
    }
    if (stalledBackgroundTask?.taskId === taskId && retrievalStatus && retrievalStatus !== 'timeout') {
      clearStalledBackgroundTask();
    }
    return false;
  };

  const requestGracefulShutdown = (reason) => {
    if (childExited || gracefulShutdownRequested) {
      return;
    }
    gracefulShutdownRequested = true;
    forcedSignal = 'SIGTERM';
    markLoopState({
      runStatus: successfulHandoffSeen ? 'graceful_shutdown_requested' : 'awaiting_handoff_shutdown',
      resultDetectedAt: resultEventAt || nowIso(),
    });
    logStream.write(`[result] ${reason}; sending SIGTERM\n`);
    sendClaudeSignal('SIGTERM');
    setTimeout(() => {
      if (!childExited) {
        forcedSignal = 'SIGKILL';
        logStream.write('[result] child still alive after graceful shutdown grace; sending SIGKILL\n');
        sendClaudeSignal('SIGKILL');
      }
    }, options.killGraceMs);
  };

  const clearPostResultWatcher = () => {
    if (postResultWatcher) {
      clearInterval(postResultWatcher);
      postResultWatcher = null;
    }
  };

  const startPostResultWatcher = () => {
    if (postResultWatcher) {
      return;
    }
    const deadlineAt = Date.now() + options.postResultWaitMs;
    postResultWatcher = setInterval(() => {
      if (childExited) {
        clearPostResultWatcher();
        return;
      }
      const handoff = readHandoff(run.resultPath);
      if (handoff.ok) {
        successfulHandoffSeen = true;
        clearPostResultWatcher();
        requestGracefulShutdown('successful result event and valid result.json detected');
        return;
      }
      if (Date.now() >= deadlineAt) {
        postResultReason = `successful result event observed but result.json was not valid within ${formatDurationMs(options.postResultWaitMs)}`;
        clearPostResultWatcher();
        requestGracefulShutdown(postResultReason);
      }
    }, 500);
  };

  const inspectStdoutLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return;
    }
    const previousStalledObservedAtMs = stalledBackgroundTask?.observedAtMs || null;
    let stallUpdated = false;
    try {
      const payload = JSON.parse(trimmed);
      if (payload.type === 'result' && payload.subtype === 'success' && payload.is_error === false) {
        successfulResultSeen = true;
        resultEventAt = nowIso();
        markLoopState({
          runStatus: 'awaiting_handoff',
          resultDetectedAt: resultEventAt,
        });
        startPostResultWatcher();
      }
      if (payload.type === 'system' && payload.subtype === 'task_started') {
        rememberBackgroundTaskStart({
          taskId: payload.task_id,
          description: payload.description,
          taskType: payload.task_type,
        });
      }
      if (typeof payload.tool_use_result?.backgroundTaskId === 'string') {
        rememberBackgroundTaskStart({
          taskId: payload.tool_use_result.backgroundTaskId,
          description: null,
          taskType: 'local_bash',
        });
      }
      if (Array.isArray(payload.message?.content)) {
        for (const item of payload.message.content) {
          if (typeof item?.content === 'string') {
            stallUpdated = noteBackgroundTaskOutput(item.content) || stallUpdated;
          }
        }
      }
    } catch {
      // ignore non-JSON or partial lines
    }
    if (previousStalledObservedAtMs && stalledBackgroundTask && stalledBackgroundTask.observedAtMs === previousStalledObservedAtMs && !stallUpdated) {
      clearStalledBackgroundTask();
    }
  };

  child.stdout.on('data', (chunk) => {
    lastActivityAtMs = Date.now();
    const text = chunk.toString('utf8');
    logStream.write(`[stdout] ${text}`);
    if (!text.endsWith('\n')) {
      logStream.write('\n');
    }
    stdoutBuffer += text;
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex !== -1) {
      inspectStdoutLine(stdoutBuffer.slice(0, newlineIndex));
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    lastActivityAtMs = Date.now();
    clearStalledBackgroundTask();
    const text = chunk.toString('utf8');
    logStream.write(`[stderr] ${text}`);
    if (!text.endsWith('\n')) {
      logStream.write('\n');
    }
  });

  const startedAtMs = Date.now();
  const heartbeatTimer = setInterval(() => {
    if (childExited) {
      return;
    }
    const runtimeMs = Date.now() - startedAtMs;
    const idleMs = Date.now() - lastActivityAtMs;
    const stalledLabel = stalledBackgroundTask ? ` stalled_task=${stalledBackgroundTask.taskId}` : '';
    const line = `[heartbeat] runtime=${formatDurationMs(runtimeMs)} idle=${formatDurationMs(idleMs)} bg_tasks=${backgroundTasks.size}${stalledLabel}\n`;
    logStream.write(line);
    console.log(`[${nowIso()}] ${run.runId} heartbeat :: runtime=${formatDurationMs(runtimeMs)} idle=${formatDurationMs(idleMs)} bg_tasks=${backgroundTasks.size}${stalledLabel}`);
  }, options.heartbeatMs);

  const watchdogTimer = setInterval(() => {
    if (childExited) {
      return;
    }
    if (gracefulShutdownRequested) {
      return;
    }
    const now = Date.now();
    const idleMs = now - lastActivityAtMs;
    const runtimeMs = now - startedAtMs;
    const stalledTask = stalledBackgroundTask ? backgroundTasks.get(stalledBackgroundTask.taskId) : null;
    if (!watchdogReason && stalledTask?.lastTimeoutWhileRunningAtMs) {
      const stalledForMs = now - stalledTask.lastTimeoutWhileRunningAtMs;
      if (idleMs >= stalledTaskGraceMs && stalledForMs >= stalledTaskGraceMs) {
        watchdogReason = `background task ${stalledTask.taskId}${stalledTask.description ? ` (${stalledTask.description})` : ''} stalled after TaskOutput timeout and ${formatDurationMs(stalledForMs)} without agent output`;
      }
    }
    if (!watchdogReason && idleMs >= options.idleTimeoutMs) {
      watchdogReason = `idle timeout after ${formatDurationMs(idleMs)}`;
    } else if (!watchdogReason && runtimeMs >= options.maxRuntimeMs) {
      watchdogReason = `max runtime exceeded after ${formatDurationMs(runtimeMs)}`;
    }

    if (watchdogReason && !watchdogSignalSent) {
      watchdogSignalSent = true;
      forcedSignal = 'SIGTERM';
      logStream.write(`[watchdog] ${watchdogReason}; sending SIGTERM\n`);
      sendClaudeSignal('SIGTERM');
      setTimeout(() => {
        if (!childExited) {
          forcedSignal = 'SIGKILL';
          logStream.write('[watchdog] process still alive after grace period; sending SIGKILL\n');
          sendClaudeSignal('SIGKILL');
        }
      }, options.killGraceMs);
    }
  }, 1_000);

  const result = await new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        signal: forcedSignal,
        reason: error.message,
      });
    });

    child.on('close', (code, signal) => {
      childExited = true;
      clearInterval(heartbeatTimer);
      clearInterval(watchdogTimer);
      clearPostResultWatcher();
      clearStalledBackgroundTask();
      if (stdoutBuffer.trim()) {
        inspectStdoutLine(stdoutBuffer);
        stdoutBuffer = '';
      }
      logStream.end();
      markLoopState({
        claudePid: null,
        claudeExitedAt: nowIso(),
        runStatus: 'processing_handoff',
      });
      const finalHandoff = readHandoff(run.resultPath);
      const treatAsSuccess =
        finalHandoff.ok &&
        successfulResultSeen &&
        !postResultReason &&
        (code === 0 || gracefulShutdownRequested);
      resolve({
        exitCode: treatAsSuccess ? 0 : code ?? (signal ? 1 : 0),
        signal: treatAsSuccess ? null : forcedSignal || signal,
        reason: treatAsSuccess ? null : postResultReason || watchdogReason,
      });
    });
  });

  activeClaudeChild = null;
  return result;
}

function buildClaudeCommandArgs(prompt, run, options) {
  const commandArgs = ['-p', '--permission-mode', options.permissionMode];
  if (options.outputFormat === 'stream-json') {
    commandArgs.push('--verbose');
  }
  commandArgs.push('--output-format', options.outputFormat);
  if (options.includePartialMessages && options.outputFormat === 'stream-json') {
    commandArgs.push('--include-partial-messages');
  }
  if (options.settingSources) {
    commandArgs.push('--setting-sources', options.settingSources);
  }
  if (!options.allowSlashCommands) {
    commandArgs.push('--disable-slash-commands');
  }
  if (!options.allowConfiguredMcp) {
    commandArgs.push('--strict-mcp-config');
  }
  if (!options.allowSessionPersistence) {
    commandArgs.push('--no-session-persistence');
  }
  if (options.enableDebugFile) {
    commandArgs.push('--debug-file', run.debugPath);
  }
  if (options.model) {
    commandArgs.push('--model', options.model);
  }
  commandArgs.push(prompt);
  return commandArgs;
}

function buildClaudeEnv(options) {
  const env = { ...process.env };
  if (options.disableTelemetry) {
    env.CLAUDE_CODE_ENABLE_TELEMETRY = '0';
  }
  return env;
}

function readHandoff(resultPath) {
  if (!fs.existsSync(resultPath)) {
    return { ok: false, reason: 'result.json missing' };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    if (!payload || typeof payload !== 'object') {
      return { ok: false, reason: 'result.json is not an object' };
    }
    if (!['complete', 'fail'].includes(payload.disposition)) {
      return { ok: false, reason: 'disposition must be complete or fail' };
    }
    if (typeof payload.summary !== 'string' || !payload.summary.trim()) {
      return { ok: false, reason: 'summary is required' };
    }
    if (typeof payload.continueAutopilot !== 'boolean') {
      return { ok: false, reason: 'continueAutopilot must be boolean' };
    }

    const normalized = normalizeRoundResult({
      runId: path.basename(path.dirname(resultPath)),
      payload,
      mtimeMs: fs.statSync(resultPath).mtimeMs,
    });
    if (!normalized) {
      return { ok: false, reason: 'result.json could not be normalized' };
    }

    const revisitPolicy = validateRevisitPolicy(normalized, resultPath);
    if (!revisitPolicy.ok) {
      return revisitPolicy;
    }

    return {
      ok: true,
      value: normalized,
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function loadFeatureHints() {
  if (!fs.existsSync(FEATURE_LIST_PATH)) {
    return [];
  }
  try {
    const features = JSON.parse(fs.readFileSync(FEATURE_LIST_PATH, 'utf8'));
    if (!Array.isArray(features)) {
      return [];
    }
    return features
      .filter((feature) => feature.status !== 'done')
      .slice(0, 12)
      .map((feature) => ({
        name: feature.name,
        status: feature.status,
        description: feature.description,
        nextStep: feature.nextStep,
      }));
  } catch {
    return [];
  }
}

function loadPreviousRoundSummaries(limit = 3) {
  return loadProductRoundResults(limit).map((round) => ({
    runId: round.runId,
    summary: round.summary,
    nextFocus: round.nextFocus,
    mtimeMs: round.mtimeMs,
  }));
}

function loadProductRoundResults(limit = MEMORY_DEFAULTS.historyLimit, options = {}) {
  if (!fs.existsSync(PRODUCT_RUNS_DIR)) {
    return [];
  }

  const excludeRunId = options.excludeRunId || null;
  return fs.readdirSync(PRODUCT_RUNS_DIR)
    .filter((entry) => entry !== excludeRunId)
    .map((entry) => {
      const resultPath = path.join(PRODUCT_RUNS_DIR, entry, 'result.json');
      if (!fs.existsSync(resultPath)) {
        return null;
      }
      try {
        const payload = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        return normalizeRoundResult({
          runId: entry,
          payload,
          mtimeMs: fs.statSync(resultPath).mtimeMs,
        });
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, limit);
}

function normalizeRoundResult({ runId, payload, mtimeMs }) {
  const summary = normalizeOptionalText(payload.summary);
  if (!summary) {
    return null;
  }

  const changedFiles = toUniqueStringArray(payload.changedFiles);
  const remainingOpportunities = toUniqueStringArray(payload.remainingOpportunities);
  const areasImproved = toUniqueStringArray(payload.areasImproved);
  const areasStillWeak = toUniqueStringArray(payload.areasStillWeak);

  return {
    ...payload,
    runId,
    mtimeMs,
    disposition: payload.disposition,
    summary,
    reason: normalizeOptionalText(payload.reason),
    continueAutopilot: payload.disposition === 'fail' ? false : payload.continueAutopilot,
    changedFiles,
    validations: Array.isArray(payload.validations) ? payload.validations : [],
    iterations: Array.isArray(payload.iterations) ? payload.iterations : [],
    remainingOpportunities,
    nextFocus: normalizeOptionalText(payload.nextFocus),
    areasImproved,
    areasStillWeak,
    decisionReason: normalizeOptionalText(payload.decisionReason),
    revisitJustification: normalizeOptionalText(payload.revisitJustification),
  };
}

function buildLongTermMemory(roundResults) {
  const successfulRounds = roundResults.filter((round) => round.disposition === 'complete');
  const failedRounds = roundResults.filter((round) => round.disposition === 'fail');
  const openThreadMap = new Map();
  const addOpenThread = (text, source, round, score) => {
    const normalizedText = normalizeOptionalText(text);
    if (!normalizedText) {
      return;
    }
    const key = normalizedText.toLowerCase();
    const existing = openThreadMap.get(key);
    const nextItem = existing || {
      text: normalizedText,
      score: 0,
      mentions: 0,
      latestRunId: round.runId,
      latestSummary: round.summary,
      relatedFiles: [],
      sources: [],
    };
    nextItem.score += score;
    nextItem.mentions += 1;
    nextItem.latestRunId = nextItem.latestRunId || round.runId;
    nextItem.latestSummary = nextItem.latestSummary || round.summary;
    nextItem.relatedFiles = toUniqueStringArray([
      ...nextItem.relatedFiles,
      ...round.changedFiles,
    ]).slice(0, 4);
    nextItem.sources = [
      ...nextItem.sources,
      `${round.runId}:${source}`,
    ].slice(0, 4);
    openThreadMap.set(key, nextItem);
  };

  successfulRounds.forEach((round, index) => {
    const recencyScore = Math.max(1, MEMORY_DEFAULTS.historyLimit - index);
    addOpenThread(round.nextFocus, 'nextFocus', round, 5 + recencyScore);
    round.areasStillWeak.forEach((text) => addOpenThread(text, 'areasStillWeak', round, 4 + recencyScore));
    round.remainingOpportunities.forEach((text) => addOpenThread(text, 'remainingOpportunities', round, 3 + recencyScore));
  });

  failedRounds.slice(0, 3).forEach((round, index) => {
    addOpenThread(round.reason, 'failReason', round, 2 + Math.max(1, 3 - index));
  });

  const cooldownFiles = [];
  const cooldownSeen = new Set();
  for (const round of successfulRounds.slice(0, MEMORY_DEFAULTS.cooldownRounds)) {
    for (const file of round.changedFiles) {
      if (cooldownSeen.has(file)) {
        continue;
      }
      cooldownSeen.add(file);
      cooldownFiles.push({
        file,
        runId: round.runId,
        summary: round.summary,
      });
    }
  }

  return {
    generatedAt: nowIso(),
    roundsConsidered: roundResults.length,
    recentSummaries: roundResults.slice(0, MEMORY_DEFAULTS.summaryLimit).map((round) => ({
      runId: round.runId,
      summary: round.summary,
      nextFocus: round.nextFocus,
      disposition: round.disposition,
    })),
    openThreads: [...openThreadMap.values()]
      .sort((left, right) => right.score - left.score || right.mentions - left.mentions || right.latestRunId.localeCompare(left.latestRunId))
      .slice(0, MEMORY_DEFAULTS.openThreadLimit),
    recentWins: successfulRounds.slice(0, MEMORY_DEFAULTS.winLimit).map((round) => ({
      runId: round.runId,
      summary: round.summary,
      changedFiles: round.changedFiles,
      areasImproved: round.areasImproved,
    })),
    cooldownFiles: cooldownFiles.slice(0, MEMORY_DEFAULTS.cooldownFileLimit),
  };
}

function formatLongTermMemory(memory) {
  const openThreads = memory.openThreads.length
    ? memory.openThreads.map((item) => {
      const fileHint = item.relatedFiles.length ? ` :: files=${item.relatedFiles.join(', ')}` : '';
      return `- ${item.text} :: latest=${item.latestRunId} :: mentions=${item.mentions}${fileHint}`;
    }).join('\n')
    : '- none yet';
  const recentWins = memory.recentWins.length
    ? memory.recentWins.map((item) => {
      const fileHint = item.changedFiles.length ? ` :: files=${item.changedFiles.join(', ')}` : '';
      return `- ${item.runId}: ${item.summary}${fileHint}`;
    }).join('\n')
    : '- none yet';
  const cooldownFiles = memory.cooldownFiles.length
    ? memory.cooldownFiles.map((item) => `- ${item.file} :: last touched in ${item.runId} :: ${item.summary}`).join('\n')
    : '- none yet';

  return [
    '- This memory is aggregated from earlier `result.json` handoffs, not only the latest round.',
    '- Continue unfinished threads first and avoid reopening freshly-fixed files without a concrete reason.',
    '',
    '### Open Threads To Continue',
    openThreads,
    '',
    '### Recent Wins',
    recentWins,
    '',
    '### Recent File Cooldown',
    cooldownFiles,
    '',
    '### Revisit Rules',
    '- If you pick a recently touched area again, explain what remained incomplete or what new product evidence changed the decision.',
    '- If you touch a cooldown file, `result.json` must include `revisitJustification`.',
    '- Use `decisionReason` to explain why this round was the best next move relative to the other open threads.',
  ].join('\n');
}

function writeProductMemorySnapshot(memory) {
  fs.writeFileSync(LOOP_MEMORY_PATH, `${JSON.stringify(memory, null, 2)}\n`);
}

function validateRevisitPolicy(handoff, resultPath) {
  if (handoff.disposition !== 'complete' || !handoff.changedFiles.length) {
    return { ok: true };
  }

  const runId = path.basename(path.dirname(resultPath));
  const memory = buildLongTermMemory(loadProductRoundResults(MEMORY_DEFAULTS.historyLimit, { excludeRunId: runId }));
  const cooldownFiles = new Set(memory.cooldownFiles.map((item) => item.file));
  const overlappedFiles = handoff.changedFiles.filter((file) => cooldownFiles.has(file));
  if (overlappedFiles.length && !handoff.revisitJustification) {
    return {
      ok: false,
      reason: `revisitJustification is required when re-touching recent files: ${overlappedFiles.join(', ')}`,
    };
  }
  return { ok: true };
}

function toUniqueStringArray(value) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(source
    .map((item) => normalizeOptionalText(item))
    .filter(Boolean))];
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || null : null;
}

function listProductRoutes() {
  const appDir = path.join(ROOT, 'src', 'app');
  if (!fs.existsSync(appDir)) {
    return ['/'];
  }

  const routes = [];
  walkRoutes(appDir, '');
  return [...new Set(routes)].sort();

  function walkRoutes(dir, currentRoute) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name === 'api') {
          continue;
        }
        const nextRoute = currentRoute ? `${currentRoute}/${entry.name}` : `/${entry.name}`;
        walkRoutes(path.join(dir, entry.name), nextRoute);
        continue;
      }
      if (entry.isFile() && entry.name === 'page.tsx') {
        routes.push(currentRoute || '/');
      }
    }
  }
}

function getGitStatusLines() {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const lines = (result.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return lines.slice(0, 50);
}

function getCurrentBranch() {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return (result.stdout || '').trim() || 'unknown';
}

async function isUrlReachable(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_500) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isUrlReachable(url)) {
      return true;
    }
    await sleep(1_000);
  }
  return false;
}

function writeLoopState(payload) {
  fs.writeFileSync(LOOP_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

async function cleanupProcesses() {
  stopStateHeartbeat();
  if (activeClaudeChild) {
    await terminateChild(activeClaudeChild, { processGroup: true });
    activeClaudeChild = null;
  }

  if (activeWebServer?.child) {
    await terminateChild(activeWebServer.child);
  }
  activeWebServer = null;
}

async function terminateChild(child, options = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  sendSignalToChild(child, 'SIGTERM', options.processGroup);
  await sleep(500);
  if (child.exitCode === null && child.signalCode === null) {
    sendSignalToChild(child, 'SIGKILL', options.processGroup);
  }
}

function sendSignalToChild(child, signal, processGroup = false) {
  if (!child) {
    return;
  }
  if (processGroup && typeof child.pid === 'number' && child.pid > 0) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // fall through to direct child signal
    }
  }
  try {
    child.kill(signal);
  } catch {
    // ignore shutdown races
  }
}

function markLoopState(patch) {
  const stampedPatch = {
    ...patch,
    pid: process.pid,
    ppid: process.ppid,
    updatedAt: nowIso(),
  };
  loopState = { ...loopState, ...stampedPatch };
  writeLoopState(loopState);
}

function startStateHeartbeat(options) {
  stopStateHeartbeat();
  markLoopState({
    lastHeartbeatAt: nowIso(),
  });
  stateHeartbeatTimer = setInterval(() => {
    markLoopState({
      lastHeartbeatAt: nowIso(),
      runId: activeRun?.runId ?? null,
      runDir: activeRun?.runDir ?? null,
      logPath: activeRun?.logPath ?? null,
      debugPath: activeRun?.debugPath ?? null,
      resultPath: activeRun?.resultPath ?? null,
    });
  }, options.stateHeartbeatMs);
}

function stopStateHeartbeat() {
  if (stateHeartbeatTimer) {
    clearInterval(stateHeartbeatTimer);
    stateHeartbeatTimer = null;
  }
}

function installProcessHandlers() {
  process.on('SIGINT', () => {
    void handleTermination('SIGINT', 130);
  });

  process.on('SIGTERM', () => {
    void handleTermination('SIGTERM', 143);
  });

  process.on('uncaughtException', (error) => {
    markLoopState({
      status: 'failed',
      failedAt: nowIso(),
      reason: error.message,
    });
    console.error(error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    markLoopState({
      status: 'failed',
      failedAt: nowIso(),
      reason: `unhandled rejection: ${message}`,
    });
    console.error(reason);
    process.exit(1);
  });

  process.on('exit', (code) => {
    if (shutdownStarted) {
      return;
    }
    markLoopState({
      status: code === 0 ? 'stopped' : 'terminated',
      stoppedAt: nowIso(),
      reason: shutdownReason || `process exited with code ${code}`,
      claudePid: null,
    });
  });
}

async function handleTermination(signal, exitCode) {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  shutdownReason = `received ${signal}`;
  markLoopState({
    status: 'terminated',
    stoppedAt: nowIso(),
    signal,
    reason: shutdownReason,
    claudePid: activeClaudeChild?.pid ?? null,
    runStatus: 'terminating',
  });
  appendJsonl(LOOP_LEDGER_PATH, {
    at: nowIso(),
    runId: activeRun?.runId ?? null,
    round: loopState.round ?? null,
    status: 'terminated',
    signal,
    reason: shutdownReason,
  });
  await cleanupProcesses();
  markLoopState({
    status: 'terminated',
    stoppedAt: nowIso(),
    signal,
    reason: shutdownReason,
    claudePid: null,
    runStatus: 'terminated',
  });
  process.exit(exitCode);
}

function commandExists(command) {
  const result = spawnSync('/bin/zsh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
  });
  return result.status === 0;
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
    '-',
    pad(now.getMilliseconds(), 3),
  ].join('');
}

function formatDurationMs(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
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

function printHelp() {
  console.log(`Product iteration autopilot

Usage:
  node .harness/bin/product-loop.mjs [options]

Options:
  --owner NAME                    Run owner label. Default: ${DEFAULTS.owner}
  --model MODEL                   Claude model override.
  --base-url URL                  Product base URL to exercise. Default: ${DEFAULTS.baseUrl}
  --no-web-boot                   Do not auto-start the web surface if the URL is down.
  --max-rounds N                  Maximum autopilot rounds. 0 means unbounded.
  --max-iteration-cycles N        Maximum product-improvement cycles inside one Claude round.
  --post-result-wait-ms N         How long to wait for valid result.json after Claude reports success. Default: ${DEFAULTS.postResultWaitMs}
  --state-heartbeat-ms N          State-file heartbeat interval. Default: ${DEFAULTS.stateHeartbeatMs}
  --sleep-ms N                    Delay between completed rounds. Default: ${DEFAULTS.sleepMs}
  --heartbeat-ms N                Heartbeat logging interval. Default: ${DEFAULTS.heartbeatMs}
  --idle-timeout-ms N             Kill Claude after N ms without output. Default: ${DEFAULTS.idleTimeoutMs}
  --max-runtime-ms N              Kill Claude after N ms total runtime. Default: ${DEFAULTS.maxRuntimeMs}
  --kill-grace-ms N               Wait after SIGTERM before SIGKILL. Default: ${DEFAULTS.killGraceMs}
  --claude-permission-mode MODE   Claude permission mode. Default: ${DEFAULTS.permissionMode}
  --claude-setting-sources SRC    Claude setting sources. Default: ${DEFAULTS.settingSources}
  --claude-output-format FMT      Claude output format. Default: ${DEFAULTS.outputFormat}
  --strict-mcp-config             Disable configured MCP servers for the child run.
  --disable-slash-commands        Disable slash commands and plugin commands for the child run.
  --allow-session-persistence     Allow Claude to persist sessions on disk.
  --no-partial-messages           Disable partial stream-json events.
  --no-debug-file                 Skip per-run Claude debug logs.
  --allow-telemetry               Do not disable Claude telemetry.
`);
}
