import { stat } from 'node:fs/promises';
import type { BoundingBox } from '@/domain/ocr/types';
import type { RuntimeMode, TranslateInput } from '@/domain/translation/provider';
import { isLocalScreenshotOcrEngine, type ScreenshotOcrEngine } from '@/lib/ocr/local-ocr-config';
import { openAiVisionProvider } from '@/lib/ocr/providers/openai-vision';
import { runAppleVisionOcr, runLocalPaddleOcr, runRapidOcr } from '@/lib/ocr/providers/local-paddleocr';

interface ScreenshotOcrOptions {
  ocrEngine?: ScreenshotOcrEngine;
  localOcrEndpoint?: string;
  providerConfig?: TranslateInput['providerConfig'];
}

export interface ScreenshotOcrResponse {
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  mode: RuntimeMode;
  provider: string;
  ocrEngine: ScreenshotOcrEngine;
  warning?: string;
  regions: Array<{
    id: string;
    text: string;
    box: BoundingBox;
    backgroundColor: string;
    fontSize: number;
  }>;
}

const KNOWN_TEXT_ONLY_OCR_MODELS = new Set([
  'deepseek-chat',
  'deepseek-reasoner',
]);

function createOcrConfigError(code: string, message: string, status = 400) {
  return Object.assign(new Error(message), {
    code,
    status,
  });
}

function getOcrConfigurationError(providerConfig?: TranslateInput['providerConfig']) {
  if (providerConfig?.kind === 'tencent') {
    return createOcrConfigError(
      'OCR_PROVIDER_NOT_SUPPORTED',
      '腾讯云翻译当前只用于文本翻译。截图 OCR 请切换到本地 OCR 引擎后再试。',
    );
  }

  const baseUrl = providerConfig?.baseUrl?.trim();
  const model = providerConfig?.model?.trim();
  const apiKey = providerConfig?.apiKey?.trim();
  const normalizedModel = model?.toLowerCase();

  if (!baseUrl || !model || !apiKey) {
    return createOcrConfigError(
      'OCR_PROVIDER_NOT_CONFIGURED',
      '截图翻译需要可用的 OCR 配置。请先在设置里填写支持图片输入的 Base URL、Model 和 API Key。',
    );
  }

  if (normalizedModel && KNOWN_TEXT_ONLY_OCR_MODELS.has(normalizedModel)) {
    return createOcrConfigError(
      'OCR_MODEL_NOT_SUPPORTED',
      `当前模型 ${model} 不支持截图 OCR。请在设置里切换到支持图片输入的 OpenAI-compatible 视觉模型后再试。`,
    );
  }

  return null;
}

async function ensureReadableImage(imagePath: string) {
  if (!imagePath.trim()) {
    throw Object.assign(new Error('缺少截图路径，无法执行截屏识别。'), {
      code: 'INVALID_IMAGE_PATH',
      status: 400,
    });
  }

  try {
    const file = await stat(imagePath);
    if (!file.isFile()) {
      throw new Error('NOT_A_FILE');
    }
  } catch {
    throw Object.assign(new Error('截图文件不存在或无法读取。'), {
      code: 'SCREENSHOT_FILE_NOT_FOUND',
      status: 404,
    });
  }
}

export async function runScreenshotOcr(imagePath: string, options: ScreenshotOcrOptions = {}): Promise<ScreenshotOcrResponse> {
  await ensureReadableImage(imagePath);

  const ocr = isLocalScreenshotOcrEngine(options.ocrEngine)
    ? await (async () => {
        switch (options.ocrEngine) {
          case 'rapidocr':
            return runRapidOcr(imagePath, {
              endpoint: options.localOcrEndpoint,
            });
          case 'apple-vision':
            return runAppleVisionOcr(imagePath, {
              endpoint: options.localOcrEndpoint,
            });
          case 'local-paddleocr':
          default:
            return runLocalPaddleOcr(imagePath, {
              endpoint: options.localOcrEndpoint,
            });
        }
      })()
    : await (async () => {
        const ocrConfigError = getOcrConfigurationError(options.providerConfig);
        if (ocrConfigError) {
          throw ocrConfigError;
        }

        return openAiVisionProvider.run(imagePath, options.providerConfig);
      })();

  const mode = 'mode' in ocr && ocr.mode === 'mock' ? 'mock' : 'real';
  const provider = 'provider' in ocr && typeof ocr.provider === 'string' ? ocr.provider : openAiVisionProvider.id;
  const warning = 'warning' in ocr && typeof ocr.warning === 'string' && ocr.warning.trim() ? ocr.warning.trim() : undefined;

  return {
    imagePath,
    imageWidth: ocr.imageWidth,
    imageHeight: ocr.imageHeight,
    mode,
    provider,
    ocrEngine: options.ocrEngine ?? 'cloud-vision',
    warning,
    regions: ocr.regions.map((region) => ({
      id: region.id,
      text: region.text,
      box: region.box,
      backgroundColor: region.style.backgroundColor,
      fontSize: Math.max(16, Math.round(region.box.height * 0.55)),
    })),
  };
}
