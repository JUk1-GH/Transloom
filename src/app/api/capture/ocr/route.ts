import { NextResponse } from 'next/server';
import type { ScreenshotOcrEngine } from '@/lib/ocr/local-ocr-config';
import { runScreenshotOcr } from '@/lib/pipeline/run-screenshot-ocr';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imagePath?: string;
      ocrEngine?: ScreenshotOcrEngine;
      localOcrEndpoint?: string;
      providerConfig?: {
        kind?: 'deepl' | 'openai' | 'google' | 'openai-compatible' | 'tencent';
        baseUrl?: string;
        model?: string;
        apiKey?: string;
        secretId?: string;
        secretKey?: string;
        region?: string;
        projectId?: string | number;
      };
    };

    if (!body.imagePath?.trim()) {
      return NextResponse.json(
        {
          code: 'INVALID_REQUEST',
          message: '缺少截图路径，无法执行截屏识别。',
        },
        { status: 400 },
      );
    }

    const result = await runScreenshotOcr(body.imagePath, {
      ocrEngine: body.ocrEngine,
      localOcrEndpoint: body.localOcrEndpoint,
      providerConfig: body.providerConfig,
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'SCREENSHOT_OCR_FAILED';

    return NextResponse.json(
      {
        code,
        message: error instanceof Error ? error.message : '截图识别失败，请稍后重试。',
      },
      { status },
    );
  }
}
