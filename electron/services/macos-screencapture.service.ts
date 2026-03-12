import { access, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type MacOsScreencaptureResult =
  | { status: 'completed'; filePath: string; capturedAt: string }
  | { status: 'cancelled'; filePath: null }
  | { status: 'failed'; filePath: null; message: string };

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    const details = await stat(filePath);
    return details.size > 0;
  } catch {
    return false;
  }
}

export async function runMacOsScreencapture(outputPath: string): Promise<MacOsScreencaptureResult> {
  try {
    await execFileAsync('screencapture', ['-i', '-x', outputPath]);

    if (await fileExists(outputPath)) {
      return {
        status: 'completed',
        filePath: outputPath,
        capturedAt: new Date().toISOString(),
      };
    }

    return {
      status: 'cancelled',
      filePath: null,
    };
  } catch (error) {
    if (await fileExists(outputPath)) {
      return {
        status: 'completed',
        filePath: outputPath,
        capturedAt: new Date().toISOString(),
      };
    }

    const message = error instanceof Error ? error.message : '系统截图失败。';

    if (/cancel/i.test(message) || /user canceled/i.test(message)) {
      return {
        status: 'cancelled',
        filePath: null,
      };
    }

    return {
      status: 'failed',
      filePath: null,
      message,
    };
  }
}
