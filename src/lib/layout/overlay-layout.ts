import type { OcrResult } from '@/domain/ocr/types';
import type { OverlayDocument } from '@/domain/capture/types';

export function buildOverlayLayout(
  imagePath: string,
  ocr: OcrResult,
  translatedRegions?: Array<{ id: string; translatedText: string }>,
): OverlayDocument {
  const translatedTextByRegionId = new Map(translatedRegions?.map((region) => [region.id, region.translatedText]) ?? []);

  return {
    imagePath,
    imageWidth: ocr.imageWidth,
    imageHeight: ocr.imageHeight,
    mode: 'real',
    provider: 'pending',
    regions: ocr.regions.map((region) => ({
      id: region.id,
      sourceText: region.text,
      translatedText: translatedTextByRegionId.get(region.id) ?? `中译：${region.text}`,
      box: region.box,
      backgroundColor: region.style.backgroundColor,
      fontSize: Math.max(16, Math.round(region.box.height * 0.55)),
    })),
  };
}
