#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = findRepoRoot(process.cwd());
const HARNESS_DIR = path.join(ROOT, '.harness');
const CONFIG_DIR = path.join(HARNESS_DIR, 'config');
const PROMPTS_DIR = path.join(HARNESS_DIR, 'prompts');
const STATE_DIR = path.join(HARNESS_DIR, 'state');
const RUNS_DIR = path.join(HARNESS_DIR, 'runs');
const FEATURE_LIST_PATH = path.join(ROOT, 'feature_list.json');
const TASKS_PATH = path.join(STATE_DIR, 'tasks.json');
const EVENTS_PATH = path.join(STATE_DIR, 'events.jsonl');
const RUN_LEDGER_PATH = path.join(STATE_DIR, 'runs.jsonl');
const LOCK_PATH = path.join(STATE_DIR, '.lock');
const POLICY_PATH = path.join(CONFIG_DIR, 'policies.json');
const DEFAULT_OWNER = 'claude-local';
const DEFAULT_ROLE = 'implementer';
const VALID_STATUSES = new Set([
  'queued',
  'implementing',
  'ready_for_verification',
  'verifying',
  'ready_for_review',
  'reviewing',
  'blocked',
  'done',
]);

main();

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'help';
  const args = parseArgs(argv.slice(1));

  try {
    switch (command) {
      case 'bootstrap':
        commandBootstrap(args);
        break;
      case 'doctor':
        commandDoctor(args);
        break;
      case 'status':
        commandStatus(args);
        break;
      case 'lease':
        commandLease(args);
        break;
      case 'heartbeat':
        commandHeartbeat(args);
        break;
      case 'complete':
        commandComplete(args);
        break;
      case 'fail':
        commandFail(args);
        break;
      case 'dispatch':
        commandDispatch(args);
        break;
      case 'supervise-once':
        commandSuperviseOnce(args);
        break;
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

function commandBootstrap(args) {
  const result = bootstrapState({ reset: Boolean(args.reset) });
  if (args.json) {
    printJson(result);
    return;
  }

  console.log('Heavy harness bootstrap complete');
  console.log(`- repo: ${ROOT}`);
  console.log(`- tasks: ${result.tasksCreated}`);
  console.log(`- active features: ${result.activeFeatures}`);
  console.log(`- runtime state: ${TASKS_PATH}`);
}

function commandDoctor(args) {
  ensureRuntimeDirs();
  const policies = readJson(POLICY_PATH, {});
  const tasksState = readJson(TASKS_PATH, { tasks: [] });
  const leaseCount = tasksState.tasks.filter((task) => task.lease).length;
  const gitHead = runCommand('git', ['rev-parse', '--verify', 'HEAD']);
  const gitBranch = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const result = {
    repoRoot: ROOT,
    hasFeatureList: fs.existsSync(FEATURE_LIST_PATH),
    hasPolicies: fs.existsSync(POLICY_PATH),
    hasTasksState: fs.existsSync(TASKS_PATH),
    commands: {
      node: commandExists('node'),
      npm: commandExists('npm'),
      claude: commandExists('claude'),
      git: commandExists('git'),
    },
    git: {
      hasHead: gitHead.ok,
      branch: gitBranch.ok ? gitBranch.stdout.trim() : null,
      worktreeMode: gitHead.ok ? 'eligible' : 'disabled-until-first-commit',
    },
    controlPlane: {
      roles: Object.keys(policies.roles || {}),
      activeLeases: leaseCount,
      taskCount: tasksState.tasks.length,
    },
  };

  if (args.json) {
    printJson(result);
    return;
  }

  console.log('Harness doctor');
  console.log(`- repo: ${result.repoRoot}`);
  console.log(`- feature list: ${yesNo(result.hasFeatureList)}`);
  console.log(`- policies: ${yesNo(result.hasPolicies)}`);
  console.log(`- tasks state: ${yesNo(result.hasTasksState)}`);
  console.log(`- commands: node=${yesNo(result.commands.node)} npm=${yesNo(result.commands.npm)} claude=${yesNo(result.commands.claude)} git=${yesNo(result.commands.git)}`);
  console.log(`- git head: ${yesNo(result.git.hasHead)} (${result.git.worktreeMode})`);
  console.log(`- branch: ${result.git.branch || 'unborn'}`);
  console.log(`- tasks: ${result.controlPlane.taskCount}`);
  console.log(`- active leases: ${result.controlPlane.activeLeases}`);
}

function commandStatus(args) {
  bootstrapIfMissing();
  const policies = readJson(POLICY_PATH, {});
  const state = readJson(TASKS_PATH, { tasks: [] });
  const events = tailJsonl(EVENTS_PATH, 5);
  const tasks = expireLeasesInMemory(state.tasks, policies, { persist: true });
  const summary = summarizeTasks(tasks);
  const queued = tasks.filter((task) => task.status === 'queued').slice(0, 5);
  const review = tasks.filter((task) => task.status === 'ready_for_verification' || task.status === 'ready_for_review').slice(0, 5);
  const active = tasks.filter((task) => task.lease);
  const result = { summary, queued, review, active, recentEvents: events };

  if (args.json) {
    printJson(result);
    return;
  }

  console.log('Harness status');
  console.log(`- queued: ${summary.queued}`);
  console.log(`- implementing: ${summary.implementing}`);
  console.log(`- ready_for_verification: ${summary.ready_for_verification}`);
  console.log(`- ready_for_review: ${summary.ready_for_review}`);
  console.log(`- blocked: ${summary.blocked}`);
  console.log(`- done: ${summary.done}`);
  if (active.length) {
    console.log('- active leases:');
    for (const task of active) {
      console.log(`  - ${task.id} ${task.title} :: ${task.lease.role} owned by ${task.lease.owner} until ${task.lease.expiresAt}`);
    }
  }
  if (queued.length) {
    console.log('- next implementation tasks:');
    for (const task of queued) {
      console.log(`  - ${task.id} [${task.lane}] ${task.title}`);
    }
  }
  if (review.length) {
    console.log('- review queue:');
    for (const task of review) {
      console.log(`  - ${task.id} [${task.status}] ${task.title}`);
    }
  }
  if (events.length) {
    console.log('- recent events:');
    for (const event of events) {
      console.log(`  - ${event.at} ${event.type} ${event.taskId || ''} ${event.note || ''}`.trim());
    }
  }
}

function commandLease(args) {
  bootstrapIfMissing();
  const owner = args.owner || DEFAULT_OWNER;
  const role = args.role || DEFAULT_ROLE;
  const lane = args.lane || null;
  const ttlMinutes = Number(args['ttl-min'] || args.ttl || readPolicies().scheduler.defaultLeaseMinutes || 90);

  const task = withStateLock(() => {
    const policies = readPolicies();
    const state = readJson(TASKS_PATH, { tasks: [] });
    state.tasks = expireLeasesInMemory(state.tasks, policies, { persist: false });
    const nextTask = pickNextTask(state.tasks, role, lane);
    if (!nextTask) {
      return null;
    }

    const leaseId = makeRunId('lease');
    const now = nowIso();
    nextTask.status = statusForLeasedRole(role);
    nextTask.attempts += 1;
    nextTask.updatedAt = now;
    nextTask.lease = {
      leaseId,
      owner,
      role,
      leasedAt: now,
      heartbeatAt: now,
      expiresAt: futureIso(ttlMinutes),
    };
    nextTask.history.push({ at: now, event: 'leased', owner, role, ttlMinutes });
    writeJson(TASKS_PATH, state);
    appendJsonl(EVENTS_PATH, {
      at: now,
      type: 'leased',
      taskId: nextTask.id,
      role,
      owner,
      note: `${nextTask.title}`,
    });
    return nextTask;
  });

  if (!task) {
    console.log('No task available for lease');
    return;
  }

  if (args.json) {
    printJson(task);
    return;
  }

  console.log(`Leased ${task.id}`);
  console.log(`- title: ${task.title}`);
  console.log(`- lane: ${task.lane}`);
  console.log(`- role: ${task.lease.role}`);
  console.log(`- owner: ${task.lease.owner}`);
  console.log(`- expires: ${task.lease.expiresAt}`);
}

function commandHeartbeat(args) {
  bootstrapIfMissing();
  const taskId = args.task || args._[0];
  const owner = args.owner || DEFAULT_OWNER;
  const ttlMinutes = Number(args['ttl-min'] || args.ttl || readPolicies().scheduler.defaultLeaseMinutes || 90);
  if (!taskId) {
    throw new Error('heartbeat requires --task <id>');
  }

  const task = withStateLock(() => {
    const state = readJson(TASKS_PATH, { tasks: [] });
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    if (!task.lease || task.lease.owner !== owner) {
      throw new Error(`task ${taskId} is not leased by ${owner}`);
    }
    const now = nowIso();
    task.lease.heartbeatAt = now;
    task.lease.expiresAt = futureIso(ttlMinutes);
    task.updatedAt = now;
    task.history.push({ at: now, event: 'heartbeat', owner, ttlMinutes });
    writeJson(TASKS_PATH, state);
    appendJsonl(EVENTS_PATH, { at: now, type: 'heartbeat', taskId, owner, note: `lease extended to ${task.lease.expiresAt}` });
    return task;
  });

  if (args.json) {
    printJson(task);
    return;
  }

  console.log(`Heartbeat recorded for ${task.id}`);
  console.log(`- new expiry: ${task.lease.expiresAt}`);
}

function commandComplete(args) {
  bootstrapIfMissing();
  const taskId = args.task || args._[0];
  const role = args.role || DEFAULT_ROLE;
  const owner = args.owner || DEFAULT_OWNER;
  const note = args.note || 'completed';
  const artifacts = toList(args.artifacts);
  if (!taskId) {
    throw new Error('complete requires --task <id>');
  }

  const task = withStateLock(() => {
    const state = readJson(TASKS_PATH, { tasks: [] });
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    assertLeaseOwner(task, owner, role);
    const nextStatus = args['next-status'] || nextStatusForRole(role);
    if (!VALID_STATUSES.has(nextStatus)) {
      throw new Error(`invalid next status: ${nextStatus}`);
    }
    const now = nowIso();
    task.status = nextStatus;
    task.updatedAt = now;
    task.lease = null;
    task.artifacts.push(...artifacts);
    task.history.push({ at: now, event: 'completed', owner, role, nextStatus, note, artifacts });
    writeJson(TASKS_PATH, state);
    appendJsonl(EVENTS_PATH, { at: now, type: 'completed', taskId, owner, role, note: `${note} -> ${nextStatus}` });
    return task;
  });

  if (args.json) {
    printJson(task);
    return;
  }

  console.log(`Completed ${task.id}`);
  console.log(`- next status: ${task.status}`);
}

function commandFail(args) {
  bootstrapIfMissing();
  const taskId = args.task || args._[0];
  const role = args.role || DEFAULT_ROLE;
  const owner = args.owner || DEFAULT_OWNER;
  const reason = args.reason || 'unspecified failure';
  if (!taskId) {
    throw new Error('fail requires --task <id>');
  }

  const task = withStateLock(() => {
    const policies = readPolicies();
    const state = readJson(TASKS_PATH, { tasks: [] });
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }
    assertLeaseOwner(task, owner, role);
    const backoffMinutes = retryBackoffMinutes(task.attempts, policies);
    const exhausted = task.attempts >= task.maxAttempts;
    const now = nowIso();
    task.status = exhausted ? 'blocked' : 'queued';
    task.updatedAt = now;
    task.retryAt = exhausted ? null : futureIso(backoffMinutes);
    task.lastFailure = { at: now, owner, role, reason };
    task.lease = null;
    task.history.push({ at: now, event: 'failed', owner, role, reason, exhausted, retryAt: task.retryAt });
    writeJson(TASKS_PATH, state);
    appendJsonl(EVENTS_PATH, { at: now, type: exhausted ? 'blocked' : 'failed', taskId, owner, role, note: reason });
    return task;
  });

  if (args.json) {
    printJson(task);
    return;
  }

  console.log(`Failed ${task.id}`);
  console.log(`- status: ${task.status}`);
  if (task.retryAt) {
    console.log(`- retry at: ${task.retryAt}`);
  }
}

function commandDispatch(args) {
  bootstrapIfMissing();
  const taskId = args.task || args._[0];
  const role = args.role || DEFAULT_ROLE;
  const owner = args.owner || DEFAULT_OWNER;
  const execMode = Boolean(args.exec);
  const model = args.model || readPolicies().scheduler.defaultModel || null;
  if (!taskId) {
    throw new Error('dispatch requires --task <id>');
  }

  const state = readJson(TASKS_PATH, { tasks: [] });
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new Error(`task not found: ${taskId}`);
  }

  const run = prepareRun(task, { role, owner, model });
  if (execMode) {
    executeRun(run);
  }

  if (args.json) {
    printJson(run);
    return;
  }

  console.log(`Prepared run ${run.runId}`);
  console.log(`- task: ${task.id}`);
  console.log(`- prompt: ${run.promptPath}`);
  console.log(`- metadata: ${run.metadataPath}`);
  console.log(`- log: ${run.logPath}`);
  if (!execMode) {
    console.log(`- exec: claude -p --permission-mode auto "$(cat ${shellEscape(run.promptPath)})"`);
  }
}

function commandSuperviseOnce(args) {
  bootstrapIfMissing();
  const leaseArgs = {
    owner: args.owner || DEFAULT_OWNER,
    role: args.role || DEFAULT_ROLE,
    lane: args.lane || null,
    'ttl-min': args['ttl-min'] || args.ttl || null,
  };

  const leased = withStateLock(() => {
    const policies = readPolicies();
    const state = readJson(TASKS_PATH, { tasks: [] });
    state.tasks = expireLeasesInMemory(state.tasks, policies, { persist: false });
    const nextTask = pickNextTask(state.tasks, leaseArgs.role, leaseArgs.lane);
    if (!nextTask) {
      return null;
    }
    const now = nowIso();
    const ttlMinutes = Number(leaseArgs['ttl-min'] || policies.scheduler.defaultLeaseMinutes || 90);
    nextTask.status = statusForLeasedRole(leaseArgs.role);
    nextTask.attempts += 1;
    nextTask.updatedAt = now;
    nextTask.lease = {
      leaseId: makeRunId('lease'),
      owner: leaseArgs.owner,
      role: leaseArgs.role,
      leasedAt: now,
      heartbeatAt: now,
      expiresAt: futureIso(ttlMinutes),
    };
    nextTask.history.push({ at: now, event: 'leased', owner: leaseArgs.owner, role: leaseArgs.role, ttlMinutes });
    writeJson(TASKS_PATH, state);
    appendJsonl(EVENTS_PATH, { at: now, type: 'leased', taskId: nextTask.id, role: leaseArgs.role, owner: leaseArgs.owner, note: nextTask.title });
    return nextTask;
  });

  if (!leased) {
    console.log('No task available for supervise-once');
    return;
  }

  const run = prepareRun(leased, {
    role: leaseArgs.role,
    owner: leaseArgs.owner,
    model: args.model || readPolicies().scheduler.defaultModel || null,
  });

  console.log(`Supervising ${leased.id}`);
  console.log(`- task: ${leased.title}`);
  console.log(`- run: ${run.runId}`);
  if (args.exec) {
    executeRun(run);
  } else {
    console.log(`- prompt pack ready: ${run.promptPath}`);
  }
}

function prepareRun(task, options) {
  ensureRuntimeDirs();
  const runId = makeRunId(task.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, 'prompt.md');
  const metadataPath = path.join(runDir, 'run.json');
  const logPath = path.join(runDir, 'session.log');
  const basePrompt = readPrompt(options.role);
  const prompt = composePrompt({ task, role: options.role, owner: options.owner, model: options.model, basePrompt, runId });
  const metadata = {
    runId,
    taskId: task.id,
    taskTitle: task.title,
    lane: task.lane,
    role: options.role,
    owner: options.owner,
    model: options.model,
    promptPath,
    metadataPath,
    logPath,
    createdAt: nowIso(),
  };
  fs.writeFileSync(promptPath, prompt);
  writeJson(metadataPath, metadata);
  appendJsonl(RUN_LEDGER_PATH, { ...metadata, status: 'prepared' });
  appendJsonl(EVENTS_PATH, { at: metadata.createdAt, type: 'run.prepared', taskId: task.id, role: options.role, owner: options.owner, note: runId });
  return { ...metadata };
}

function executeRun(run) {
  if (!commandExists('claude')) {
    throw new Error('claude command not found in PATH');
  }
  const prompt = fs.readFileSync(run.promptPath, 'utf8');
  const args = ['-p', '--permission-mode', 'auto'];
  if (run.model) {
    args.push('--model', run.model);
  }
  args.push(prompt);

  const startedAt = nowIso();
  appendJsonl(RUN_LEDGER_PATH, { runId: run.runId, taskId: run.taskId, status: 'started', at: startedAt });
  appendJsonl(EVENTS_PATH, { at: startedAt, type: 'run.started', taskId: run.taskId, role: run.role, owner: run.owner, note: run.runId });
  const result = spawnSync('claude', args, {
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
}

function composePrompt({ task, role, owner, model, basePrompt, runId }) {
  const validations = task.validation.commands.map((command) => `- ${command}`).join('\n');
  const manualGates = task.validation.manual.map((gate) => `- ${gate}`).join('\n');
  const files = task.files.map((file) => `- ${file}`).join('\n');
  const acceptance = task.acceptance.map((item) => `- ${item}`).join('\n');
  const repoFacts = [
    `- repo root: ${ROOT}`,
    `- task id: ${task.id}`,
    `- lane: ${task.lane}`,
    `- role: ${role}`,
    `- owner: ${owner}`,
    `- run id: ${runId}`,
    `- model override: ${model || 'default'}`,
    `- mutable queue state: ${TASKS_PATH}`,
    `- event ledger: ${EVENTS_PATH}`,
  ].join('\n');

  return `${basePrompt}\n\n## Task Pack\n- title: ${task.title}\n- current status: ${task.status}\n- source feature: ${task.featureName}\n- source maturity: ${task.sourceStatus}\n- objective: ${task.objective}\n\n## Files In Scope\n${files}\n\n## Acceptance\n${acceptance}\n\n## Validation Commands\n${validations}\n\n## Manual Gates\n${manualGates || '- none'}\n\n## Repo Facts\n${repoFacts}\n\n## Mandatory Guardrails\n- Read and obey AGENTS.md and CLAUDE.md before editing.\n- Before modifying any existing function, class, or method, run GitNexus impact analysis for the symbol and record the blast radius.\n- Warn clearly before touching high-risk symbols if GitNexus reports HIGH or CRITICAL risk.\n- Keep changes scoped to this task. Do not opportunistically refactor unrelated code.\n- Prefer updating queue state via the harness CLI after finishing, not by hand-editing JSON unless recovery is required.\n\n## Exit Report\nWhen you finish, report:\n- what changed\n- validations run and their outcomes\n- any blockers or follow-up tasks\n- whether the task should move to verification, review, or back to queued`; 
}

function bootstrapState({ reset = false } = {}) {
  ensureTrackedFilesExist();
  ensureRuntimeDirs();
  const features = readJson(FEATURE_LIST_PATH, []);
  if (!Array.isArray(features)) {
    throw new Error('feature_list.json must be an array');
  }

  const existing = reset ? { tasks: [] } : readJson(TASKS_PATH, { tasks: [] });
  const existingByFeature = new Map(existing.tasks.map((task) => [task.featureName, task]));
  const tasks = features.map((feature, index) => buildTask(feature, index, existingByFeature.get(feature.name)));

  writeJson(TASKS_PATH, {
    version: 1,
    updatedAt: nowIso(),
    repoRoot: ROOT,
    tasks,
  });

  if (!fs.existsSync(EVENTS_PATH)) {
    fs.writeFileSync(EVENTS_PATH, '');
  }
  if (!fs.existsSync(RUN_LEDGER_PATH)) {
    fs.writeFileSync(RUN_LEDGER_PATH, '');
  }

  return {
    tasksCreated: tasks.length,
    activeFeatures: tasks.filter((task) => task.status !== 'done').length,
  };
}

function buildTask(feature, index, existing) {
  const validationProfile = deriveValidationProfile(feature);
  const now = nowIso();
  const baseStatus = normalizeSourceStatus(feature.status);
  const task = existing ? { ...existing } : {};
  task.id = existing?.id || `FT-${String(index + 1).padStart(3, '0')}`;
  task.featureName = feature.name;
  task.lane = feature.name;
  task.kind = 'implementation';
  task.title = `Close delivery gap for ${feature.name}`;
  task.objective = feature.nextStep || feature.description || 'Advance feature maturity';
  task.sourceStatus = feature.status || 'unknown';
  task.priority = 1000 - index;
  task.files = Array.isArray(feature.files) ? feature.files : [];
  task.validationProfile = validationProfile.name;
  task.validation = validationProfile;
  task.acceptance = buildAcceptance(feature, validationProfile);
  task.maxAttempts = existing?.maxAttempts || 3;
  task.attempts = existing?.attempts || 0;
  task.status = VALID_STATUSES.has(existing?.status) ? existing.status : baseStatus;
  task.lease = existing?.lease || null;
  task.retryAt = existing?.retryAt || null;
  task.lastFailure = existing?.lastFailure || null;
  task.artifacts = Array.isArray(existing?.artifacts) ? existing.artifacts : [];
  task.history = Array.isArray(existing?.history) ? existing.history : [];
  task.updatedAt = now;
  if (!task.history.length) {
    task.history.push({ at: now, event: 'bootstrapped', sourceStatus: task.sourceStatus });
  }
  return task;
}

function buildAcceptance(feature, validationProfile) {
  const acceptance = [
    `Implement the smallest end-to-end slice that satisfies: ${feature.nextStep || feature.description || feature.name}.`,
    `Keep the work primarily within the documented feature files unless validation or impact analysis proves a broader blast radius.`,
    `Leave the repo in a state that passes the required validation profile "${validationProfile.name}".`,
  ];
  if (validationProfile.manual.length) {
    acceptance.push(`Complete manual gates: ${validationProfile.manual.join('; ')}.`);
  }
  return acceptance;
}

function deriveValidationProfile(feature) {
  const files = Array.isArray(feature.files) ? feature.files : [];
  const fileBlob = files.join(' ');
  const name = String(feature.name || 'feature');
  const commands = ['npm run lint', 'npm run typecheck', 'npm run test'];
  const manual = [];

  if (/electron|capture|overlay|desktop/.test(`${name} ${fileBlob}`)) {
    commands.push('npm run build:desktop');
    manual.push('Run desktop shell or screenshot capture smoke test');
    return { name: 'desktop', commands, manual };
  }
  if (/translation|provider|ocr|screenshot/.test(`${name} ${fileBlob}`)) {
    manual.push('Verify the affected translation flow through the UI');
    return { name: 'translation', commands, manual };
  }
  if (/history|glossary|prisma|account|billing/.test(`${name} ${fileBlob}`)) {
    manual.push('Verify persistence reads and writes through the product surface');
    return { name: 'persistence', commands, manual };
  }
  return { name: 'web-core', commands, manual };
}

function normalizeSourceStatus(sourceStatus) {
  if (sourceStatus === 'done' || sourceStatus === 'complete') {
    return 'done';
  }
  return 'queued';
}

function summarizeTasks(tasks) {
  const summary = {
    queued: 0,
    implementing: 0,
    ready_for_verification: 0,
    verifying: 0,
    ready_for_review: 0,
    reviewing: 0,
    blocked: 0,
    done: 0,
  };
  for (const task of tasks) {
    if (summary[task.status] !== undefined) {
      summary[task.status] += 1;
    }
  }
  return summary;
}

function pickNextTask(tasks, role, lane) {
  const eligibleStatuses = eligibleStatusesForRole(role);
  const now = Date.now();
  return tasks
    .filter((task) => eligibleStatuses.includes(task.status))
    .filter((task) => !lane || task.lane === lane)
    .filter((task) => !task.retryAt || Date.parse(task.retryAt) <= now)
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }
      return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    })[0] || null;
}

function eligibleStatusesForRole(role) {
  if (role === 'verifier') {
    return ['ready_for_verification'];
  }
  if (role === 'reviewer') {
    return ['ready_for_review'];
  }
  return ['queued'];
}

function statusForLeasedRole(role) {
  if (role === 'verifier') {
    return 'verifying';
  }
  if (role === 'reviewer') {
    return 'reviewing';
  }
  return 'implementing';
}

function nextStatusForRole(role) {
  if (role === 'verifier') {
    return 'ready_for_review';
  }
  if (role === 'reviewer') {
    return 'done';
  }
  return 'ready_for_verification';
}

function expireLeasesInMemory(tasks, policies, { persist }) {
  const now = Date.now();
  let changed = false;
  for (const task of tasks) {
    if (!task.lease) {
      continue;
    }
    if (Date.parse(task.lease.expiresAt) > now) {
      continue;
    }
    const expiredRole = task.lease.role;
    task.history.push({ at: nowIso(), event: 'lease_expired', owner: task.lease.owner, role: expiredRole });
    task.lease = null;
    task.status = expiredRole === 'verifier' ? 'ready_for_verification' : expiredRole === 'reviewer' ? 'ready_for_review' : 'queued';
    task.updatedAt = nowIso();
    changed = true;
  }
  if (changed && persist) {
    writeJson(TASKS_PATH, { version: 1, updatedAt: nowIso(), repoRoot: ROOT, tasks });
  }
  return tasks;
}

function assertLeaseOwner(task, owner, role) {
  if (!task.lease) {
    throw new Error(`task ${task.id} is not currently leased`);
  }
  if (task.lease.owner !== owner) {
    throw new Error(`task ${task.id} is leased by ${task.lease.owner}, not ${owner}`);
  }
  if (role && task.lease.role !== role) {
    throw new Error(`task ${task.id} is leased for role ${task.lease.role}, not ${role}`);
  }
}

function retryBackoffMinutes(attempts, policies) {
  const schedule = policies.scheduler.retryBackoffMinutes || [15, 60, 240];
  const index = Math.min(Math.max(attempts - 1, 0), schedule.length - 1);
  return schedule[index];
}

function ensureTrackedFilesExist() {
  if (!fs.existsSync(POLICY_PATH)) {
    throw new Error(`missing policies file: ${POLICY_PATH}`);
  }
  if (!fs.existsSync(path.join(PROMPTS_DIR, 'implementer.md'))) {
    throw new Error(`missing prompt file: ${path.join(PROMPTS_DIR, 'implementer.md')}`);
  }
  if (!fs.existsSync(FEATURE_LIST_PATH)) {
    throw new Error(`missing feature list: ${FEATURE_LIST_PATH}`);
  }
}

function bootstrapIfMissing() {
  if (!fs.existsSync(TASKS_PATH)) {
    bootstrapState();
  }
}

function ensureRuntimeDirs() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function readPolicies() {
  return readJson(POLICY_PATH, {});
}

function readPrompt(role) {
  const promptPath = path.join(PROMPTS_DIR, `${role}.md`);
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf8');
  }
  return fs.readFileSync(path.join(PROMPTS_DIR, 'implementer.md'), 'utf8');
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function tailJsonl(filePath, limit) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => JSON.parse(line));
}

function withStateLock(fn) {
  ensureRuntimeDirs();
  const started = Date.now();
  while (true) {
    try {
      const handle = fs.openSync(LOCK_PATH, 'wx');
      try {
        return fn();
      } finally {
        fs.closeSync(handle);
        fs.unlinkSync(LOCK_PATH);
      }
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - started > 5000) {
        throw new Error('timed out waiting for harness state lock');
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
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

function runCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function commandExists(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0;
}

function toList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function shellEscape(value) {
  return String(value).replace(/'/g, `'\\''`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function makeRunId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
}

function printHelp() {
  console.log(`Heavy harness control plane\n\nCommands:\n  bootstrap [--reset]\n  doctor [--json]\n  status [--json]\n  lease --role <implementer|verifier|reviewer> [--owner NAME] [--lane NAME]\n  heartbeat --task FT-001 [--owner NAME]\n  complete --task FT-001 --role implementer [--owner NAME] [--note TEXT]\n  fail --task FT-001 --role implementer [--owner NAME] --reason TEXT\n  dispatch --task FT-001 --role implementer [--owner NAME] [--exec]\n  supervise-once --role implementer [--owner NAME] [--lane NAME] [--exec]`);
}
