import { desktopCapturer, screen } from 'electron';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureSelectionPayload } from '@/domain/capture/types';

function normalizeSelection(selection: CaptureSelectionPayload) {
  const width = Math.max(1, Math.round(selection.width));
  const height = Math.max(1, Math.round(selection.height));
  const x = Math.round(selection.x);
  const y = Math.round(selection.y);

  return {
    x,
    y,
    width,
    height,
    displayId: selection.displayId,
  };
}

export function createRegionCaptureService() {
  let activeNativeCapture: ReturnType<typeof spawn> | null = null;

  function buildCaptureFilePath() {
    return path.join(
      process.env.TRANSLOOM_DATA_DIR || process.cwd(),
      'captures',
      `transloom-region-${Date.now()}.png`,
    );
  }

  return {
    async captureSelection(selection: CaptureSelectionPayload) {
      const normalized = normalizeSelection(selection);
      const display = normalized.displayId
        ? screen.getAllDisplays().find((item) => item.id === normalized.displayId) ?? screen.getPrimaryDisplay()
        : screen.getDisplayNearestPoint({ x: normalized.x, y: normalized.y });

      let sources;
      try {
        sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: display.size.width * display.scaleFactor,
            height: display.size.height * display.scaleFactor,
          },
        });
      } catch {
        throw new Error('无法读取屏幕内容。请先在“系统设置 → 隐私与安全性 → 屏幕录制”中允许 Transloom，然后重试。');
      }

      const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
      if (!source) {
        throw new Error('没有可用的屏幕源。请确认已授予屏幕录制权限后再试。');
      }

      const displayBounds = display.bounds;
      const scale = display.scaleFactor;
      const cropX = Math.max(0, Math.round((normalized.x - displayBounds.x) * scale));
      const cropY = Math.max(0, Math.round((normalized.y - displayBounds.y) * scale));
      const cropWidth = Math.max(1, Math.min(source.thumbnail.getSize().width - cropX, Math.round(normalized.width * scale)));
      const cropHeight = Math.max(1, Math.min(source.thumbnail.getSize().height - cropY, Math.round(normalized.height * scale)));

      const cropped = source.thumbnail.crop({
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      });

      const filePath = buildCaptureFilePath();
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, cropped.toPNG());

      return {
        status: 'completed' as const,
        filePath,
        capturedAt: new Date().toISOString(),
      };
    },
    async captureNativeSelection() {
      if (process.platform !== 'darwin') {
        throw Object.assign(new Error('原生截图选区目前仅在 macOS 可用。'), {
          code: 'NATIVE_SCREENSHOT_UNSUPPORTED',
        });
      }

      if (activeNativeCapture) {
        throw Object.assign(new Error('已有截图任务正在进行中，请先完成当前截图。'), {
          code: 'SCREENSHOT_CAPTURE_BUSY',
        });
      }

      const filePath = buildCaptureFilePath();
      await mkdir(path.dirname(filePath), { recursive: true });

      const child = spawn('screencapture', ['-i', '-s', '-x', '-o', '-r', filePath], {
        stdio: 'ignore',
      });
      activeNativeCapture = child;

      return await new Promise<{ status: 'completed'; filePath: string; capturedAt: string }>((resolve, reject) => {
        child.once('error', (error) => {
          activeNativeCapture = null;
          reject(Object.assign(new Error(`无法启动 macOS 原生截图：${error.message}`), {
            code: 'NATIVE_SCREENSHOT_START_FAILED',
          }));
        });

        child.once('exit', async (code, signal) => {
          activeNativeCapture = null;

          if (code === 0) {
            try {
              await access(filePath);
              resolve({
                status: 'completed',
                filePath,
                capturedAt: new Date().toISOString(),
              });
              return;
            } catch {
              reject(Object.assign(new Error('系统截图没有生成图片文件，请重试。'), {
                code: 'NATIVE_SCREENSHOT_FILE_MISSING',
              }));
              return;
            }
          }

          if (code === 1 || signal === 'SIGINT' || signal === 'SIGTERM') {
            reject(Object.assign(new Error('截图已取消。'), {
              code: 'SCREENSHOT_CAPTURE_CANCELLED',
              cancelled: true,
            }));
            return;
          }

          reject(Object.assign(new Error(`macOS 原生截图异常退出（code=${code ?? 'null'} signal=${signal ?? 'null'}）。`), {
            code: 'NATIVE_SCREENSHOT_FAILED',
          }));
        });
      });
    },
    cancelNativeSelection() {
      if (!activeNativeCapture) {
        return false;
      }

      activeNativeCapture.kill('SIGTERM');
      activeNativeCapture = null;
      return true;
    },
  };
}
