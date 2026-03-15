export type ScreenshotOcrEngine = 'cloud-vision' | 'local-paddleocr' | 'rapidocr' | 'apple-vision';

export const DEFAULT_LOCAL_OCR_ENDPOINT = process.env.NEXT_PUBLIC_TRANSLOOM_LOCAL_OCR_URL?.trim() || 'http://127.0.0.1:8000/ocr';

export const OCR_ENGINE_STORAGE_KEY = 'transloom.capture.ocr-engine';
export const OCR_ENDPOINT_STORAGE_KEY = 'transloom.capture.local-ocr-endpoint';

export function isLocalScreenshotOcrEngine(engine?: ScreenshotOcrEngine | null) {
  return engine === 'local-paddleocr' || engine === 'rapidocr' || engine === 'apple-vision';
}

export function normalizeLocalOcrEndpoint(endpoint?: string | null) {
  const raw = endpoint?.trim() || DEFAULT_LOCAL_OCR_ENDPOINT;

  try {
    const url = new URL(raw);
    const pathname = url.pathname === '/' ? '/ocr' : url.pathname.replace(/\/+$/, '');
    url.pathname = pathname || '/ocr';
    return url.toString();
  } catch {
    return raw;
  }
}
