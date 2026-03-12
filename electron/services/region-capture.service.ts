import { desktopCapturer, screen } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
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

      const filePath = path.join(process.env.TRANSLOOM_DATA_DIR || process.cwd(), 'captures', `transloom-region-${Date.now()}.png`);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, cropped.toPNG());

      return {
        status: 'completed' as const,
        filePath,
        capturedAt: new Date().toISOString(),
      };
    },
  };
}
