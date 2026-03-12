import type { TranslateInput, TranslateResult, TranslationProvider } from '@/domain/translation/provider';

class TranslationProviderError extends Error {
  code: string;
  detail?: string;
  status: number;

  constructor(code: string, message: string, status = 400, detail?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function buildSystemPrompt(targetLang: string, sourceLang?: string) {
  const sourceHint = sourceLang ? `Source language: ${sourceLang}.` : 'Detect the source language automatically.';
  return `You are a translation engine. ${sourceHint} Translate the user text into ${targetLang}. Return only the translated text.`;
}

export const customOpenAiCompatibleProvider: TranslationProvider = {
  id: 'openai-compatible',
  label: 'Custom OpenAI-Compatible',
  async translate(input: TranslateInput): Promise<TranslateResult> {
    const baseUrl = input.providerConfig?.baseUrl?.trim();
    const model = input.providerConfig?.model?.trim();
    const apiKey = input.providerConfig?.apiKey?.trim();

    if (!baseUrl || !model || !apiKey) {
      throw new TranslationProviderError('PROVIDER_NOT_CONFIGURED', 'OpenAI-compatible provider 尚未完成配置。', 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(input.targetLang, input.sourceLang),
            },
            {
              role: 'user',
              content: input.text,
            },
          ],
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string; code?: string; type?: string };
            choices?: Array<{ message?: { content?: string } }>;
            usage?: { total_tokens?: number };
          }
        | null;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new TranslationProviderError('INVALID_API_KEY', 'API Key 无效或已失效。', response.status, payload?.error?.message);
        }

        if (response.status === 429) {
          throw new TranslationProviderError('RATE_LIMITED', '请求过于频繁，provider 已返回 429。', 429, payload?.error?.message);
        }

        throw new TranslationProviderError(
          payload?.error?.code || 'PROVIDER_HTTP_ERROR',
          payload?.error?.message || `OpenAI-compatible provider 返回 ${response.status}。`,
          response.status,
          payload?.error?.type,
        );
      }

      const text = payload?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new TranslationProviderError('EMPTY_TRANSLATION', 'provider 没有返回可用译文。', 502);
      }

      return {
        text,
        provider: 'openai-compatible',
        mode: 'real',
        detectedSourceLang: input.sourceLang || undefined,
        charactersBilled: payload?.usage?.total_tokens ?? input.text.length,
      };
    } catch (error) {
      if (error instanceof TranslationProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TranslationProviderError('REQUEST_TIMEOUT', '翻译请求超时，请稍后重试。', 504);
      }

      throw new TranslationProviderError('NETWORK_ERROR', '无法连接到 OpenAI-compatible provider。', 502, error instanceof Error ? error.message : undefined);
    } finally {
      clearTimeout(timeout);
    }
  },
  supportsVision: true,
};
