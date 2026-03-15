import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { accessSync } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type EmbeddedLocalOcrEngine = 'paddleocr' | 'rapidocr' | 'apple-vision';

type EmbeddedLocalOcrRequest =
  | {
      id: number;
      action: 'health';
    }
  | {
      id: number;
      action: 'ocr';
      imagePath: string;
      engine: EmbeddedLocalOcrEngine;
    };

type EmbeddedLocalOcrDispatchRequest =
  | {
      action: 'health';
    }
  | {
      action: 'ocr';
      imagePath: string;
      engine: EmbeddedLocalOcrEngine;
    };

type EmbeddedLocalOcrResponse =
  | {
      id: number;
      ok: true;
      result: unknown;
    }
  | {
      id: number;
      ok: false;
      error?: {
        code?: string;
        message?: string;
        status?: number;
      };
    };

type PendingWorkerRequest = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
};

function createEmbeddedOcrError(code: string, message: string, status = 502) {
  return Object.assign(new Error(message), {
    code,
    status,
  });
}

const LOCAL_OCR_HOME_DIR = process.env.TRANSLOOM_LOCAL_OCR_HOME?.trim()
  || path.join(os.homedir(), 'Library', 'Application Support', 'transloom-local-ocr');
const LOCAL_OCR_VENV_DIR = path.join(LOCAL_OCR_HOME_DIR, '.venv');
const LOCAL_OCR_VENV_PYTHON = path.join(LOCAL_OCR_VENV_DIR, 'bin', 'python');
const WORKER_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;
const WORKER_HEALTH_TIMEOUT_MS = 45 * 1000;

let workerProcess: ChildProcessWithoutNullStreams | null = null;
let workerStdoutBuffer = '';
let workerStderrBuffer = '';
let workerStartupPromise: Promise<void> | null = null;
let workerEnvironmentPromise: Promise<string> | null = null;
let nextWorkerRequestId = 1;
const pendingWorkerRequests = new Map<number, PendingWorkerRequest>();

function appendWorkerStderr(chunk: string) {
  workerStderrBuffer = `${workerStderrBuffer}${chunk}`.slice(-12000);
}

function clearWorkerState(processRef?: ChildProcessWithoutNullStreams | null) {
  if (!processRef || workerProcess === processRef) {
    workerProcess = null;
    workerStdoutBuffer = '';
  }
}

function rejectPendingWorkerRequests(error: Error) {
  for (const [id, pending] of pendingWorkerRequests) {
    clearTimeout(pending.timer);
    pendingWorkerRequests.delete(id);
    pending.reject(error);
  }
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once('error', (error) => {
      reject(error);
    });

    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          stderr.trim()
            || stdout.trim()
            || `${command} ${args.join(' ')} exited with code ${code ?? 'null'}.`,
        ),
      );
    });
  });
}

async function resolvePythonBinary() {
  const candidates = [
    process.env.PYTHON_BIN?.trim(),
    'python3.11',
    '/opt/homebrew/bin/python3.11',
    '/usr/local/bin/python3.11',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const { stdout } = await runCommand(candidate, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))']);
      const [major, minor] = stdout.trim().split('.').map((value) => Number(value));
      if (major === 3 && minor === 11) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw createEmbeddedOcrError(
    'LOCAL_OCR_PYTHON_NOT_FOUND',
    '内置本地 OCR 需要 Python 3.11。请先安装 Python 3.11，再重新尝试截图识别。',
  );
}

function resolveLocalOcrResourceDir() {
  const explicit = process.env.TRANSLOOM_LOCAL_OCR_RESOURCE_DIR?.trim();
  const candidates = [explicit].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const resolvedCandidate = path.resolve(candidate);
    const workerPath = path.join(resolvedCandidate, 'worker.py');
    const requirementsPath = path.join(resolvedCandidate, 'requirements.txt');
    try {
      accessSync(workerPath);
      accessSync(requirementsPath);
      return resolvedCandidate;
    } catch {
      // Keep looking.
    }
  }

  throw createEmbeddedOcrError(
    'LOCAL_OCR_RESOURCE_MISSING',
    '应用没有找到内置本地 OCR 资源目录，无法启动截图识别引擎。',
  );
}

async function installEmbeddedLocalOcrEnvironment(pythonBinary: string, resourceDir: string) {
  await mkdir(LOCAL_OCR_HOME_DIR, { recursive: true });

  await runCommand(pythonBinary, ['-m', 'venv', LOCAL_OCR_VENV_DIR], {
    env: {
      ...process.env,
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK ?? 'True',
    },
  });

  await runCommand(LOCAL_OCR_VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
    env: {
      ...process.env,
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK ?? 'True',
    },
  });

  await runCommand(LOCAL_OCR_VENV_PYTHON, ['-m', 'pip', 'install', '-r', path.join(resourceDir, 'requirements.txt')], {
    cwd: resourceDir,
    env: {
      ...process.env,
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK ?? 'True',
    },
  });
}

async function ensureEmbeddedLocalOcrEnvironment() {
  if (workerEnvironmentPromise) {
    return workerEnvironmentPromise;
  }

  workerEnvironmentPromise = (async () => {
    try {
      await access(LOCAL_OCR_VENV_PYTHON);
      return LOCAL_OCR_VENV_PYTHON;
    } catch {
      const pythonBinary = await resolvePythonBinary();
      const resourceDir = resolveLocalOcrResourceDir();
      await installEmbeddedLocalOcrEnvironment(pythonBinary, resourceDir);
      return LOCAL_OCR_VENV_PYTHON;
    }
  })();

  try {
    return await workerEnvironmentPromise;
  } finally {
    workerEnvironmentPromise = null;
  }
}

function createWorkerExitError() {
  return createEmbeddedOcrError(
    'LOCAL_OCR_WORKER_EXITED',
    workerStderrBuffer.trim() || '内置本地 OCR 进程已退出，无法继续处理截图识别。',
  );
}

function handleWorkerStdout(chunk: Buffer | string) {
  workerStdoutBuffer += chunk.toString();

  while (workerStdoutBuffer.includes('\n')) {
    const lineBreakIndex = workerStdoutBuffer.indexOf('\n');
    const rawLine = workerStdoutBuffer.slice(0, lineBreakIndex).trim();
    workerStdoutBuffer = workerStdoutBuffer.slice(lineBreakIndex + 1);

    if (!rawLine) {
      continue;
    }

    let payload: EmbeddedLocalOcrResponse;
    try {
      payload = JSON.parse(rawLine) as EmbeddedLocalOcrResponse;
    } catch {
      continue;
    }

    const pending = pendingWorkerRequests.get(payload.id);
    if (!pending) {
      continue;
    }

    clearTimeout(pending.timer);
    pendingWorkerRequests.delete(payload.id);

    if (payload.ok) {
      pending.resolve(payload.result);
      continue;
    }

    pending.reject(
      createEmbeddedOcrError(
        payload.error?.code || 'LOCAL_OCR_WORKER_ERROR',
        payload.error?.message || '内置本地 OCR 没有返回有效结果。',
        payload.error?.status || 502,
      ),
    );
  }
}

function bindWorkerProcess(processRef: ChildProcessWithoutNullStreams) {
  workerStdoutBuffer = '';
  workerStderrBuffer = '';

  processRef.stdout.on('data', handleWorkerStdout);
  processRef.stderr.on('data', (chunk: Buffer | string) => {
    appendWorkerStderr(chunk.toString());
  });
  processRef.once('exit', () => {
    clearWorkerState(processRef);
    rejectPendingWorkerRequests(createWorkerExitError());
  });
  processRef.once('error', (error) => {
    clearWorkerState(processRef);
    rejectPendingWorkerRequests(
      createEmbeddedOcrError(
        'LOCAL_OCR_WORKER_START_FAILED',
        `内置本地 OCR 无法启动：${error.message}`,
      ),
    );
  });
}

function dispatchWorkerRequest<T>(request: EmbeddedLocalOcrDispatchRequest, timeoutMs = WORKER_REQUEST_TIMEOUT_MS) {
  if (!workerProcess || workerProcess.killed || workerProcess.exitCode !== null || !workerProcess.stdin.writable) {
    throw createEmbeddedOcrError('LOCAL_OCR_WORKER_UNAVAILABLE', '内置本地 OCR 当前不可用。');
  }

  const id = nextWorkerRequestId++;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingWorkerRequests.delete(id);
      reject(
        createEmbeddedOcrError(
          'LOCAL_OCR_TIMEOUT',
          '本地 OCR 处理超时。首次启动本地 OCR 可能需要额外准备时间，请稍后再试。',
          504,
        ),
      );
    }, timeoutMs);

    pendingWorkerRequests.set(id, { resolve, reject, timer });

    workerProcess!.stdin.write(`${JSON.stringify({ id, ...request })}\n`, (error) => {
      if (!error) {
        return;
      }

      clearTimeout(timer);
      pendingWorkerRequests.delete(id);
      reject(
        createEmbeddedOcrError(
          'LOCAL_OCR_REQUEST_WRITE_FAILED',
          `无法向内置本地 OCR 发送请求：${error.message}`,
        ),
      );
    });
  });
}

async function startWorkerProcess() {
  const pythonBinary = await ensureEmbeddedLocalOcrEnvironment();
  const resourceDir = resolveLocalOcrResourceDir();
  const workerPath = path.join(resourceDir, 'worker.py');

  const processRef = spawn(pythonBinary, ['-u', workerPath], {
    cwd: resourceDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK ?? 'True',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  bindWorkerProcess(processRef);
  workerProcess = processRef;

  try {
    await dispatchWorkerRequest({ action: 'health' }, WORKER_HEALTH_TIMEOUT_MS);
  } catch (error) {
    processRef.kill('SIGTERM');
    throw error;
  }
}

async function ensureWorkerProcess() {
  if (workerProcess && workerProcess.exitCode === null && !workerProcess.killed) {
    return;
  }

  if (workerStartupPromise) {
    return workerStartupPromise;
  }

  workerStartupPromise = startWorkerProcess();

  try {
    await workerStartupPromise;
  } finally {
    workerStartupPromise = null;
  }
}

export async function runEmbeddedLocalOcr<T>(payload: {
  imagePath: string;
  engine: EmbeddedLocalOcrEngine;
}) {
  await ensureWorkerProcess();

  return dispatchWorkerRequest<T>({
    action: 'ocr',
    imagePath: payload.imagePath,
    engine: payload.engine,
  });
}
