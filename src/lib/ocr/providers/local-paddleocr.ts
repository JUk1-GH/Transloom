import type { OcrResult } from '@/domain/ocr/types';
import { estimateBackgroundColor } from '@/lib/image/background-color';
import { runEmbeddedLocalOcr } from '@/lib/ocr/providers/embedded-local-ocr';

type LocalOcrProviderId = 'local-paddleocr' | 'rapidocr' | 'apple-vision';
type LocalOcrServiceEngine = 'paddleocr' | 'rapidocr' | 'apple-vision';

type LocalOcrResult = OcrResult & {
  provider: LocalOcrProviderId;
  warning?: string;
};

function createLocalOcrError(code: string, message: string, status = 502) {
  return Object.assign(new Error(message), {
    code,
    status,
  });
}

function normalizeLocalOcrResult(
  payload: unknown,
  fallbackProvider: LocalOcrProviderId,
  emptyResultMessage: string,
): LocalOcrResult {
  if (!payload || typeof payload !== 'object') {
    throw createLocalOcrError('LOCAL_OCR_INVALID_PAYLOAD', `${fallbackProvider} 没有返回有效结果。`);
  }

  const result = payload as {
    imageWidth?: number;
    imageHeight?: number;
    provider?: string;
    warning?: string;
    regions?: Array<{
      id?: string;
      text?: string;
      confidence?: number;
      box?: { x?: number; y?: number; width?: number; height?: number };
      style?: { backgroundColor?: string; textColor?: string };
    }>;
  };

  const regions = (result.regions ?? [])
    .filter((region) => typeof region?.text === 'string' && region.text.trim().length > 0)
    .map((region, index) => ({
      id: region.id?.trim() || `local-${index + 1}`,
      text: region.text!.trim(),
      confidence: typeof region.confidence === 'number' ? region.confidence : 0.85,
      box: {
        x: typeof region.box?.x === 'number' ? region.box.x : 48,
        y: typeof region.box?.y === 'number' ? region.box.y : 48 + index * 72,
        width: typeof region.box?.width === 'number' ? region.box.width : 420,
        height: typeof region.box?.height === 'number' ? region.box.height : 56,
      },
      style: {
        backgroundColor: region.style?.backgroundColor || estimateBackgroundColor(),
        textColor: region.style?.textColor || '#f8fafc',
      },
    }));

  if (regions.length === 0) {
    throw createLocalOcrError('LOCAL_OCR_EMPTY_RESULT', emptyResultMessage, 422);
  }

  const provider = result.provider === 'local-paddleocr' || result.provider === 'rapidocr' || result.provider === 'apple-vision'
    ? result.provider
    : fallbackProvider;

  return {
    imageWidth: typeof result.imageWidth === 'number' ? result.imageWidth : 1280,
    imageHeight: typeof result.imageHeight === 'number' ? result.imageHeight : 720,
    provider,
    warning: typeof result.warning === 'string' && result.warning.trim() ? result.warning.trim() : undefined,
    regions,
  };
}

async function runLocalOcr(
  imagePath: string,
  options: {
    engine: LocalOcrServiceEngine;
    provider: LocalOcrProviderId;
    displayName: string;
  },
) {
  try {
    const payload = await runEmbeddedLocalOcr<unknown>({
      imagePath,
      engine: options.engine,
    });

    return normalizeLocalOcrResult(
      payload,
      options.provider,
      `${options.displayName} 没有识别到可翻译文本。`,
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      throw error;
    }

    throw createLocalOcrError(
      'LOCAL_OCR_EMBEDDED_ERROR',
      `${options.displayName} 当前不可用。应用会自动管理本地 OCR 引擎；如果首次启动失败，请稍后重试。`,
    );
  }
}

export async function runLocalPaddleOcr(imagePath: string, options?: { endpoint?: string }) {
  return runLocalOcr(imagePath, {
    engine: 'paddleocr',
    provider: 'local-paddleocr',
    displayName: '本地 PaddleOCR',
  });
}

export async function runRapidOcr(imagePath: string, options?: { endpoint?: string }) {
  return runLocalOcr(imagePath, {
    engine: 'rapidocr',
    provider: 'rapidocr',
    displayName: 'RapidOCR',
  });
}

export async function runAppleVisionOcr(imagePath: string, options?: { endpoint?: string }) {
  return runLocalOcr(imagePath, {
    engine: 'apple-vision',
    provider: 'apple-vision',
    displayName: 'Apple Vision Framework',
  });
}
