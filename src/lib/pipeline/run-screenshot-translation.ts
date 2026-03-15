import { stat } from 'node:fs/promises';
import type { TranslateInput } from '@/domain/translation/provider';
import { buildOverlayLayout } from '@/lib/layout/overlay-layout';
import { isLocalScreenshotOcrEngine, type ScreenshotOcrEngine } from '@/lib/ocr/local-ocr-config';
import { openAiVisionProvider } from '@/lib/ocr/providers/openai-vision';
import { runAppleVisionOcr, runLocalPaddleOcr, runRapidOcr } from '@/lib/ocr/providers/local-paddleocr';
import { recordScreenshotHistory } from '@/server/history/service';
import { translateText } from '@/server/translation/translate-text';
import { recordUsage } from '@/server/usage/service';

interface ScreenshotTranslationOptions {
  targetLang?: string;
  providerId?: string;
  ocrEngine?: ScreenshotOcrEngine;
  localOcrEndpoint?: string;
  providerConfig?: TranslateInput['providerConfig'];
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
    throw Object.assign(new Error('缺少截图路径，无法执行截屏翻译。'), {
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

export async function runScreenshotTranslation(imagePath: string, options: ScreenshotTranslationOptions = {}) {
  await ensureReadableImage(imagePath);

  const targetLang = options.targetLang ?? 'zh-CN';
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

  const translatedRegions = await Promise.all(
    ocr.regions.map(async (region) => {
      const translation = await translateText({
        text: region.text,
        targetLang,
        providerId: options.providerId,
        providerConfig: options.providerConfig,
        persistHistory: false,
        persistUsage: false,
      });

      return {
        id: region.id,
        translatedText: translation.text,
        provider: translation.provider,
        mode: translation.mode,
        warning: translation.warning,
        charactersUsed: translation.charactersBilled ?? region.text.length,
      };
    }),
  );

  const overlay = buildOverlayLayout(imagePath, ocr, translatedRegions);
  const overlayMode = (('mode' in ocr && ocr.mode === 'mock') || translatedRegions.some((region) => region.mode === 'mock')) ? 'mock' : 'real';
  const primaryProvider = translatedRegions[0]?.provider ?? ('provider' in ocr ? ocr.provider : openAiVisionProvider.id);
  const totalCharactersUsed = translatedRegions.reduce((total, region) => total + region.charactersUsed, 0);
  const warningMessages = Array.from(
    new Set(
      translatedRegions
        .map((region) => region.warning)
        .filter((message): message is string => Boolean(message)),
    ),
  );
  const warning = warningMessages.join('；') || undefined;

  if (overlay.regions.length > 0) {
    await Promise.all([
      recordUsage({
        charactersTranslated: totalCharactersUsed,
        mode: 'screenshot',
      }),
      recordScreenshotHistory({
        sourceText: overlay.regions.map((region) => region.sourceText).join('\n'),
        translatedText: overlay.regions.map((region) => region.translatedText).join('\n'),
        provider: primaryProvider,
        screenshotPath: imagePath,
        targetLang,
        charactersUsed: totalCharactersUsed,
        success: true,
      }),
    ]);
  }

  return {
    ...overlay,
    mode: overlayMode,
    provider: primaryProvider,
    warning,
  };
}
