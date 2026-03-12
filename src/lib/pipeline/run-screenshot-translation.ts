import { stat } from 'node:fs/promises';
import type { TranslateInput } from '@/domain/translation/provider';
import { buildOverlayLayout } from '@/lib/layout/overlay-layout';
import { buildMockOcrResult } from '@/lib/ocr/mock';
import { openAiVisionProvider } from '@/lib/ocr/providers/openai-vision';
import { recordScreenshotHistory } from '@/server/history/service';
import { translateText } from '@/server/translation/translate-text';
import { recordUsage } from '@/server/usage/service';

interface ScreenshotTranslationOptions {
  targetLang?: string;
  providerId?: string;
  providerConfig?: TranslateInput['providerConfig'];
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

  let ocr: Awaited<ReturnType<typeof openAiVisionProvider.run>> | ReturnType<typeof buildMockOcrResult>;
  let ocrWarning: string | undefined;

  try {
    ocr = await openAiVisionProvider.run(imagePath, options.providerConfig);
  } catch (error) {
    ocrWarning = error instanceof Error ? error.message : 'OCR provider 不可用，已切换到 Mock OCR。';
    ocr = buildMockOcrResult(imagePath, ocrWarning);
  }

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
  const warning = [ocrWarning, ...translatedRegions.map((region) => region.warning).filter(Boolean)].filter(Boolean).join('；') || undefined;

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
