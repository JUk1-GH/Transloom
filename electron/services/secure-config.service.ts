import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProviderKind } from '@/domain/translation/provider';
import {
  TENCENT_CLOUD_ACTION,
  TENCENT_CLOUD_DEFAULT_REGION,
  TENCENT_CLOUD_ENDPOINT,
  testTencentCloudConnection,
} from './tencent-cloud.service';

export type RuntimeMode = 'real' | 'mock';
type SecureProviderKind = Extract<ProviderKind, 'openai-compatible' | 'tencent'>;

interface SecureProviderSettings {
  kind: SecureProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  secretId?: string;
  secretKey?: string;
  region: string;
  projectId: string;
}

export interface SecureSettingsData {
  provider: SecureProviderSettings;
  defaultTargetLang: string;
  shortcut: string;
}

type SecureSettingsUpdate = {
  provider?: Partial<SecureSettingsData['provider']>;
  defaultTargetLang?: string;
  shortcut?: string;
};

const DEFAULT_SETTINGS: SecureSettingsData = {
  provider: {
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    region: TENCENT_CLOUD_DEFAULT_REGION,
    projectId: '0',
  },
  defaultTargetLang: 'zh-CN',
  shortcut: 'CommandOrControl+Shift+2',
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'secure-settings.json');
}

function normalizeProjectId(value?: string | number | null) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return '0';
  }

  const normalizedValue = Number(value);
  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    return '0';
  }

  return String(normalizedValue);
}

function inferProviderKind(raw?: Partial<SecureProviderSettings>): SecureProviderKind {
  if (raw?.kind === 'tencent' || raw?.kind === 'openai-compatible') {
    return raw.kind;
  }

  if (raw?.secretId?.trim() || raw?.secretKey?.trim()) {
    return 'tencent';
  }

  return 'openai-compatible';
}

function normalizeSettings(raw?: Partial<SecureSettingsData>): SecureSettingsData {
  const providerKind = inferProviderKind(raw?.provider);

  return {
    provider: {
      baseUrl: raw?.provider?.baseUrl?.trim() || DEFAULT_SETTINGS.provider.baseUrl,
      model: raw?.provider?.model?.trim() || DEFAULT_SETTINGS.provider.model,
      kind: providerKind,
      apiKey: raw?.provider?.apiKey?.trim() || undefined,
      secretId: raw?.provider?.secretId?.trim() || undefined,
      secretKey: raw?.provider?.secretKey?.trim() || undefined,
      region: raw?.provider?.region?.trim() || DEFAULT_SETTINGS.provider.region,
      projectId: normalizeProjectId(raw?.provider?.projectId),
    },
    defaultTargetLang: raw?.defaultTargetLang?.trim() || DEFAULT_SETTINGS.defaultTargetLang,
    shortcut: raw?.shortcut?.trim() || DEFAULT_SETTINGS.shortcut,
  };
}

async function readStoredSettings() {
  try {
    const file = await fs.readFile(getSettingsPath());
    const raw = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(file) : file.toString('utf8');
    return normalizeSettings(JSON.parse(raw) as Partial<SecureSettingsData>);
  } catch {
    return normalizeSettings();
  }
}

async function writeStoredSettings(settings: SecureSettingsData) {
  await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  const serialized = JSON.stringify(settings, null, 2);
  const payload = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(serialized) : Buffer.from(serialized, 'utf8');
  await fs.writeFile(getSettingsPath(), payload);
}

function getEffectiveProvider(provider: SecureProviderSettings) {
  return {
    kind: provider.kind,
    baseUrl: provider.kind === 'tencent' ? TENCENT_CLOUD_ENDPOINT : provider.baseUrl.trim(),
    model: provider.kind === 'tencent' ? TENCENT_CLOUD_ACTION : provider.model.trim(),
    apiKey: provider.apiKey?.trim() || undefined,
    secretId: provider.secretId?.trim() || undefined,
    secretKey: provider.secretKey?.trim() || undefined,
    region: provider.region.trim() || TENCENT_CLOUD_DEFAULT_REGION,
    projectId: normalizeProjectId(provider.projectId),
  };
}

function buildRuntimeSnapshot(settings: SecureSettingsData) {
  const provider = getEffectiveProvider(settings.provider);
  const hasCredential = provider.kind === 'tencent'
    ? Boolean(provider.secretId && provider.secretKey)
    : Boolean(provider.apiKey);
  const hasCompleteProvider = provider.kind === 'tencent'
    ? Boolean(provider.region && provider.secretId && provider.secretKey)
    : Boolean(provider.baseUrl && provider.model && provider.apiKey);

  return {
    runtimeMode: (hasCompleteProvider ? 'real' : 'mock') as RuntimeMode,
    baseUrl: provider.baseUrl || null,
    model: provider.model || null,
    hasApiKey: hasCredential,
    provider: {
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      hasApiKey: hasCredential,
      region: provider.region,
      projectId: provider.projectId,
    },
  };
}

export function createSecureConfigService() {
  return {
    async getSettings() {
      return readStoredSettings();
    },
    async saveSettings(input: SecureSettingsUpdate) {
      const current = await readStoredSettings();
      const nextSettings = normalizeSettings({
        ...current,
        ...input,
        provider: {
          ...current.provider,
          ...input.provider,
          kind: input.provider?.kind ?? current.provider.kind,
          apiKey: input.provider?.apiKey === undefined ? current.provider.apiKey : input.provider.apiKey?.trim() || undefined,
          secretKey: input.provider?.secretKey === undefined ? current.provider.secretKey : input.provider.secretKey?.trim() || undefined,
        },
      });

      await writeStoredSettings(nextSettings);
      return nextSettings;
    },
    async getRuntimeMode() {
      const settings = await readStoredSettings();
      return buildRuntimeSnapshot(settings);
    },
    async testProviderConnection(input?: Partial<SecureSettingsData['provider']>) {
      const settings = await readStoredSettings();
      const provider = normalizeSettings({
        provider: {
          ...settings.provider,
          ...input,
          kind: input?.kind ?? settings.provider.kind,
          apiKey: input?.apiKey === undefined ? settings.provider.apiKey : input.apiKey?.trim() || undefined,
          secretKey: input?.secretKey === undefined ? settings.provider.secretKey : input.secretKey?.trim() || undefined,
        },
      }).provider;
      const effectiveProvider = getEffectiveProvider(provider);

      if (effectiveProvider.kind === 'tencent') {
        if (!effectiveProvider.secretId || !effectiveProvider.secretKey) {
          return {
            ok: false,
            code: 'CONFIG_INCOMPLETE',
            message: '请先填写 SecretId、SecretKey 和 Region。',
            runtimeMode: 'mock' as RuntimeMode,
          };
        }

        return testTencentCloudConnection({
          secretId: effectiveProvider.secretId,
          secretKey: effectiveProvider.secretKey,
          region: effectiveProvider.region,
          projectId: effectiveProvider.projectId,
        });
      }

      const openAiCompatibleProvider = effectiveProvider;

      if (!openAiCompatibleProvider.baseUrl?.trim() || !openAiCompatibleProvider.model?.trim() || !openAiCompatibleProvider.apiKey?.trim()) {
        return {
          ok: false,
          code: 'CONFIG_INCOMPLETE',
          message: '请先填写 Base URL、Model 和 API Key。',
          runtimeMode: 'mock' as RuntimeMode,
        };
      }

      try {
        const response = await fetch(`${openAiCompatibleProvider.baseUrl.replace(/\/$/, '')}/models`, {
          headers: {
            Authorization: `Bearer ${openAiCompatibleProvider.apiKey}`,
          },
        });

        if (!response.ok) {
          return {
            ok: false,
            code: `HTTP_${response.status}`,
            message: `连接失败，服务返回 ${response.status}`,
            runtimeMode: 'mock' as RuntimeMode,
          };
        }

        return {
          ok: true,
          code: 'OK',
          message: '连接成功。',
          runtimeMode: 'real' as RuntimeMode,
        };
      } catch (error) {
        return {
          ok: false,
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '连接失败。',
          runtimeMode: 'mock' as RuntimeMode,
        };
      }
    },
  };
}
