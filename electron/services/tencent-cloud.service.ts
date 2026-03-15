import { createHash, createHmac } from 'node:crypto';

export const TENCENT_CLOUD_ENDPOINT = 'https://tmt.tencentcloudapi.com';
export const TENCENT_CLOUD_ACTION = 'TextTranslate';
export const TENCENT_CLOUD_VERSION = '2018-03-21';
export const TENCENT_CLOUD_DEFAULT_REGION = 'ap-beijing';

const TENCENT_CLOUD_SERVICE = 'tmt';
const TENCENT_CLOUD_CONTENT_TYPE = 'application/json; charset=utf-8';
const TENCENT_CLOUD_SIGNED_HEADERS = 'content-type;host;x-tc-action';

type TencentCloudConfig = {
  secretId?: string;
  secretKey?: string;
  region?: string;
  projectId?: string | number;
};

type TencentCloudResponseEnvelope = {
  Response?: {
    TargetText?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
};

class TencentCloudConnectionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
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

function resolveProjectId(projectId?: string | number) {
  if (projectId === undefined || projectId === null || String(projectId).trim() === '') {
    return 0;
  }

  const normalizedValue = Number(projectId);
  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    throw new TencentCloudConnectionError('INVALID_PROJECT_ID', 'ProjectId 必须是大于等于 0 的整数。', 400);
  }

  return normalizedValue;
}

function createAuthorizationHeader(payload: string, secretId: string, secretKey: string, timestamp: number) {
  const endpointHost = new URL(TENCENT_CLOUD_ENDPOINT).host;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:${TENCENT_CLOUD_CONTENT_TYPE}\nhost:${endpointHost}\nx-tc-action:${TENCENT_CLOUD_ACTION.toLowerCase()}\n`;
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, TENCENT_CLOUD_SIGNED_HEADERS, sha256Hex(payload)].join('\n');
  const credentialScope = `${date}/${TENCENT_CLOUD_SERVICE}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, TENCENT_CLOUD_SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = hmacSha256Hex(secretSigning, stringToSign);

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${TENCENT_CLOUD_SIGNED_HEADERS}, Signature=${signature}`;
}

export async function testTencentCloudConnection(config?: TencentCloudConfig) {
  const secretId = config?.secretId?.trim();
  const secretKey = config?.secretKey?.trim();
  const region = config?.region?.trim() || TENCENT_CLOUD_DEFAULT_REGION;

  if (!secretId || !secretKey) {
    return {
      ok: false,
      code: 'CONFIG_INCOMPLETE',
      message: '请先填写 SecretId、SecretKey 和 Region。',
      runtimeMode: 'mock' as const,
    };
  }

  const payload = JSON.stringify({
    SourceText: 'Hello world',
    Source: 'en',
    Target: 'zh',
    ProjectId: resolveProjectId(config?.projectId),
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(TENCENT_CLOUD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: createAuthorizationHeader(payload, secretId, secretKey, timestamp),
        'Content-Type': TENCENT_CLOUD_CONTENT_TYPE,
        'X-TC-Action': TENCENT_CLOUD_ACTION,
        'X-TC-Region': region,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': TENCENT_CLOUD_VERSION,
      },
      body: payload,
      signal: controller.signal,
    });

    const envelope = (await response.json().catch(() => null)) as TencentCloudResponseEnvelope | null;
    const serviceError = envelope?.Response?.Error;

    if (!response.ok || serviceError) {
      const code = serviceError?.Code || `HTTP_${response.status}`;
      const message = serviceError?.Message || `腾讯云翻译返回了 ${response.status}`;

      if (code === 'AuthFailure.SignatureFailure' || response.status === 401 || response.status === 403) {
        throw new TencentCloudConnectionError('INVALID_CREDENTIAL', '腾讯云凭证无效，或签名校验失败。', response.status || 403);
      }

      if (code === 'RequestLimitExceeded' || response.status === 429) {
        throw new TencentCloudConnectionError('RATE_LIMITED', '腾讯云翻译请求过于频繁，请稍后重试。', 429);
      }

      throw new TencentCloudConnectionError(code, message, response.status || 400);
    }

    return {
      ok: true,
      code: 'OK',
      message: `连接成功。测试译文：${envelope?.Response?.TargetText ?? '可用'}`,
      runtimeMode: 'real' as const,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        code: 'REQUEST_TIMEOUT',
        message: '腾讯云翻译请求超时，请稍后重试。',
        runtimeMode: 'mock' as const,
      };
    }

    return {
      ok: false,
      code: error instanceof TencentCloudConnectionError ? error.code : 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : '连接失败。',
      runtimeMode: 'mock' as const,
    };
  } finally {
    clearTimeout(timeout);
  }
}
