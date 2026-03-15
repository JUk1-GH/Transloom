import { createHash, createHmac } from 'node:crypto';
import type { TranslateInput, TranslateProviderConfig, TranslateResult, TranslationProvider } from '@/domain/translation/provider';

export const TENCENT_CLOUD_ENDPOINT = 'https://tmt.tencentcloudapi.com';
export const TENCENT_CLOUD_ACTION = 'TextTranslate';
export const TENCENT_CLOUD_VERSION = '2018-03-21';
export const TENCENT_CLOUD_DEFAULT_REGION = 'ap-beijing';

const TENCENT_CLOUD_SERVICE = 'tmt';
const TENCENT_CLOUD_CONTENT_TYPE = 'application/json; charset=utf-8';
const TENCENT_CLOUD_SIGNED_HEADERS = 'content-type;host;x-tc-action';
const TENCENT_CLOUD_DEFAULT_PROJECT_ID = 0;

const TENCENT_LANGUAGE_MAP: Record<string, string> = {
  auto: 'auto',
  ar: 'ar',
  de: 'de',
  en: 'en',
  es: 'es',
  fr: 'fr',
  hi: 'hi',
  id: 'id',
  it: 'it',
  ja: 'ja',
  ko: 'ko',
  pt: 'pt',
  'pt-br': 'pt',
  ru: 'ru',
  th: 'th',
  tr: 'tr',
  vi: 'vi',
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh-TW',
  'zh-tw': 'zh-TW',
};

class TencentCloudTranslationError extends Error {
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

interface TencentCloudRuntimeConfig {
  secretId: string;
  secretKey: string;
  region: string;
  projectId: number;
}

interface TencentCloudResponseEnvelope {
  Response?: {
    RequestId?: string;
    Source?: string;
    TargetText?: string;
    UsedAmount?: number;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacSha256Hex(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function resolveProjectId(projectId?: TranslateProviderConfig['projectId']) {
  if (projectId === undefined || projectId === null || String(projectId).trim() === '') {
    return TENCENT_CLOUD_DEFAULT_PROJECT_ID;
  }

  const normalizedValue = Number(projectId);
  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    throw new TencentCloudTranslationError('INVALID_PROJECT_ID', 'ProjectId 必须是大于等于 0 的整数。', 400);
  }

  return normalizedValue;
}

function resolveTencentRuntimeConfig(config?: TranslateProviderConfig): TencentCloudRuntimeConfig {
  const secretId = config?.secretId?.trim();
  const secretKey = config?.secretKey?.trim();
  const region = config?.region?.trim() || TENCENT_CLOUD_DEFAULT_REGION;

  if (!secretId || !secretKey) {
    throw new TencentCloudTranslationError('PROVIDER_NOT_CONFIGURED', '腾讯云翻译尚未完成配置，请先填写 SecretId 和 SecretKey。', 400);
  }

  return {
    secretId,
    secretKey,
    region,
    projectId: resolveProjectId(config?.projectId),
  };
}

function mapLanguage(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return TENCENT_LANGUAGE_MAP[normalized.toLowerCase()] ?? normalized;
}

function createAuthorizationHeader(payload: string, config: TencentCloudRuntimeConfig, timestamp: number) {
  const endpointHost = new URL(TENCENT_CLOUD_ENDPOINT).host;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:${TENCENT_CLOUD_CONTENT_TYPE}\nhost:${endpointHost}\nx-tc-action:${TENCENT_CLOUD_ACTION.toLowerCase()}\n`;
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, TENCENT_CLOUD_SIGNED_HEADERS, sha256Hex(payload)].join('\n');
  const credentialScope = `${date}/${TENCENT_CLOUD_SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const secretDate = hmacSha256(`TC3${config.secretKey}`, date);
  const secretService = hmacSha256(secretDate, TENCENT_CLOUD_SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256Hex(secretSigning, stringToSign);

  return `TC3-HMAC-SHA256 Credential=${config.secretId}/${credentialScope}, SignedHeaders=${TENCENT_CLOUD_SIGNED_HEADERS}, Signature=${signature}`;
}

async function callTencentCloudTextTranslate(input: TranslateInput) {
  const runtimeConfig = resolveTencentRuntimeConfig(input.providerConfig);
  const payload = JSON.stringify({
    SourceText: input.text,
    Source: mapLanguage(input.sourceLang, 'auto'),
    Target: mapLanguage(input.targetLang, input.targetLang),
    ProjectId: runtimeConfig.projectId,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(TENCENT_CLOUD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: createAuthorizationHeader(payload, runtimeConfig, timestamp),
        'Content-Type': TENCENT_CLOUD_CONTENT_TYPE,
        'X-TC-Action': TENCENT_CLOUD_ACTION,
        'X-TC-Region': runtimeConfig.region,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': TENCENT_CLOUD_VERSION,
      },
      body: payload,
      signal: controller.signal,
    });

    const envelope = (await response.json().catch(() => null)) as TencentCloudResponseEnvelope | null;
    const serviceError = envelope?.Response?.Error;

    if (!response.ok || serviceError) {
      const status = response.ok ? 400 : response.status;
      const code = serviceError?.Code || `HTTP_${response.status}`;
      const detail = serviceError?.Message;

      if (code === 'AuthFailure.SignatureFailure' || status === 401 || status === 403) {
        throw new TencentCloudTranslationError('INVALID_CREDENTIAL', '腾讯云凭证无效，或签名校验失败。', status, detail);
      }

      if (code === 'RequestLimitExceeded' || status === 429) {
        throw new TencentCloudTranslationError('RATE_LIMITED', '腾讯云翻译请求过于频繁，请稍后重试。', 429, detail);
      }

      throw new TencentCloudTranslationError(
        code || 'TENCENT_CLOUD_ERROR',
        detail || `腾讯云翻译返回了 ${response.status}。`,
        status,
        detail,
      );
    }

    const translatedText = envelope?.Response?.TargetText?.trim();
    if (!translatedText) {
      throw new TencentCloudTranslationError('EMPTY_TRANSLATION', '腾讯云翻译没有返回可用译文。', 502);
    }

    return {
      text: translatedText,
      detectedSourceLang: envelope?.Response?.Source,
      charactersBilled: envelope?.Response?.UsedAmount ?? input.text.length,
    };
  } catch (error) {
    if (error instanceof TencentCloudTranslationError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new TencentCloudTranslationError('REQUEST_TIMEOUT', '腾讯云翻译请求超时，请稍后重试。', 504);
    }

    throw new TencentCloudTranslationError(
      'NETWORK_ERROR',
      '无法连接到腾讯云翻译服务。',
      502,
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function testTencentCloudConnection(config?: TranslateProviderConfig) {
  try {
    const result = await callTencentCloudTextTranslate({
      text: 'Hello world',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      providerConfig: config,
    });

    return {
      ok: true,
      code: 'OK',
      message: `连接成功。测试译文：${result.text}`,
      runtimeMode: 'real' as const,
    };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof TencentCloudTranslationError ? error.code : 'TENCENT_CLOUD_ERROR',
      message: error instanceof Error ? error.message : '连接失败。',
      runtimeMode: 'mock' as const,
    };
  }
}

export const tencentCloudProvider: TranslationProvider = {
  id: 'tencent',
  label: '腾讯云机器翻译',
  async translate(input: TranslateInput): Promise<TranslateResult> {
    const result = await callTencentCloudTextTranslate(input);

    return {
      text: result.text,
      provider: 'tencent',
      mode: 'real',
      detectedSourceLang: result.detectedSourceLang,
      charactersBilled: result.charactersBilled,
    };
  },
};
