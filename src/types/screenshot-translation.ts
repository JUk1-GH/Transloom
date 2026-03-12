import type { RuntimeMode } from '@/domain/translation/provider';

export interface ScreenshotTranslationResponse {
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  mode: RuntimeMode;
  provider: string;
  warning?: string;
  regions: Array<{
    id: string;
    sourceText: string;
    translatedText: string;
    backgroundColor: string;
    fontSize: number;
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}
