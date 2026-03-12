import type { OcrResult } from '@/domain/ocr/types';

export function buildMockOcrResult(imagePath: string, warning?: string): OcrResult & { mode: 'mock'; provider: string; warning?: string } {
  const basename = imagePath.split('/').pop() || 'screenshot';

  return {
    imageWidth: 1280,
    imageHeight: 720,
    mode: 'mock',
    provider: 'mock-ocr',
    warning: warning ?? 'OCR provider 不可用，已自动切换到 Mock OCR。',
    regions: [
      {
        id: 'mock-region-1',
        text: `Mock OCR content from ${basename}`,
        confidence: 0.7,
        box: {
          x: 64,
          y: 80,
          width: 780,
          height: 88,
        },
        style: {
          backgroundColor: '#111827',
          textColor: '#f8fafc',
        },
      },
    ],
  };
}
