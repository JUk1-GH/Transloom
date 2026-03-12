import type { OcrResult } from "@/domain/ocr/types";
import type { TranslateInput } from "@/domain/translation/provider";

export interface OcrRuntimeConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface OcrEngine {
  id: string;
  label: string;
  run(imagePath: string, config?: OcrRuntimeConfig | TranslateInput["providerConfig"]): Promise<OcrResult>;
}
