import { readFile } from 'node:fs/promises';
import type { OcrEngine, OcrRuntimeConfig } from '@/lib/ocr/ocr-engine';
import { estimateBackgroundColor } from '@/lib/image/background-color';

class OcrProviderError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function buildOcrPrompt() {
  return [
    'Extract all visible text from this screenshot.',
    'Return JSON only.',
    'Use this shape: {"imageWidth":number,"imageHeight":number,"regions":[{"id":string,"text":string,"confidence":number,"box":{"x":number,"y":number,"width":number,"height":number},"style":{"backgroundColor":string,"textColor":string}}]}',
    'If exact region boxes are unclear, provide best-effort bounding boxes.',
    'Keep text exactly as seen in the image.',
  ].join(' ');
}

function extractJsonObject(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const normalized = (fencedMatch?.[1] ?? content).trim();
  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new OcrProviderError('INVALID_OCR_JSON', 'OCR provider 返回的内容不是有效 JSON。', 502);
  }

  return normalized.slice(firstBrace, lastBrace + 1);
}

function normalizeOcrResult(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new OcrProviderError('INVALID_OCR_PAYLOAD', 'OCR provider 没有返回有效结果。', 502);
  }

  const result = payload as {
    imageWidth?: number;
    imageHeight?: number;
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
      id: region.id?.trim() || `vision-${index + 1}`,
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
    throw new OcrProviderError('EMPTY_OCR_RESULT', '截图里没有识别到可翻译文本。', 422);
  }

  return {
    imageWidth: typeof result.imageWidth === 'number' ? result.imageWidth : 1280,
    imageHeight: typeof result.imageHeight === 'number' ? result.imageHeight : 720,
    regions,
  };
}

function resolveRuntimeConfig(config?: OcrRuntimeConfig) {
  return {
    baseUrl: config?.baseUrl?.trim(),
    model: config?.model?.trim(),
    apiKey: config?.apiKey?.trim(),
  };
}

export const openAiVisionProvider: OcrEngine = {
  id: 'openai-vision',
  label: 'OpenAI Vision',
  async run(imagePath: string, config?: OcrRuntimeConfig) {
    const { baseUrl, model, apiKey } = resolveRuntimeConfig(config);

    if (!baseUrl || !model || !apiKey) {
      throw new OcrProviderError('OCR_PROVIDER_NOT_CONFIGURED', 'OCR 所需的 OpenAI-compatible vision 配置缺失。', 400);
    }

    const imageBuffer = await readFile(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: buildOcrPrompt(),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analyze this screenshot and extract OCR regions.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string; code?: string };
            choices?: Array<{ message?: { content?: string } }>;
          }
        | null;

      if (!response.ok) {
        throw new OcrProviderError(
          payload?.error?.code || 'OCR_PROVIDER_HTTP_ERROR',
          payload?.error?.message || `OCR provider 返回 ${response.status}。`,
          response.status,
        );
      }

      const content = payload?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new OcrProviderError('EMPTY_OCR_RESPONSE', 'OCR provider 没有返回可解析内容。', 502);
      }

      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(extractJsonObject(content));
      } catch (error) {
        if (error instanceof OcrProviderError) {
          throw error;
        }

        throw new OcrProviderError(
          'INVALID_OCR_JSON',
          'OCR provider 返回了不完整的 JSON，已跳过本次识别。',
          502,
        );
      }

      return normalizeOcrResult(parsedContent);
    } catch (error) {
      if (error instanceof OcrProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OcrProviderError('OCR_TIMEOUT', 'OCR 请求超时，请稍后重试。', 504);
      }

      throw new OcrProviderError('OCR_NETWORK_ERROR', error instanceof Error ? error.message : '无法连接 OCR provider。', 502);
    } finally {
      clearTimeout(timeout);
    }
  },
};
