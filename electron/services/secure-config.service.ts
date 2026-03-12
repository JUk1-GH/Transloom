import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export type RuntimeMode = 'real' | 'mock';

export interface SecureSettingsData {
  provider: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  };
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
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
  },
  defaultTargetLang: 'zh-CN',
  shortcut: 'CommandOrControl+Shift+2',
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'secure-settings.json');
}

function normalizeSettings(raw?: Partial<SecureSettingsData>): SecureSettingsData {
  return {
    provider: {
      baseUrl: raw?.provider?.baseUrl?.trim() || DEFAULT_SETTINGS.provider.baseUrl,
      model: raw?.provider?.model?.trim() || DEFAULT_SETTINGS.provider.model,
      apiKey: raw?.provider?.apiKey?.trim() || undefined,
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

function buildRuntimeSnapshot(settings: SecureSettingsData) {
  const hasApiKey = Boolean(settings.provider.apiKey?.trim());
  const hasCompleteProvider = Boolean(settings.provider.baseUrl.trim() && settings.provider.model.trim() && settings.provider.apiKey?.trim());

  return {
    runtimeMode: (hasCompleteProvider ? 'real' : 'mock') as RuntimeMode,
    baseUrl: settings.provider.baseUrl || null,
    model: settings.provider.model || null,
    hasApiKey,
    provider: {
      baseUrl: settings.provider.baseUrl,
      model: settings.provider.model,
      hasApiKey,
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
          apiKey: input.provider?.apiKey === undefined ? current.provider.apiKey : input.provider.apiKey?.trim() || undefined,
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
      const provider = {
        ...settings.provider,
        ...input,
        baseUrl: input?.baseUrl?.trim() || settings.provider.baseUrl,
        model: input?.model?.trim() || settings.provider.model,
        apiKey: input?.apiKey?.trim() || settings.provider.apiKey,
      };

      if (!provider.baseUrl?.trim() || !provider.model?.trim() || !provider.apiKey?.trim()) {
        return {
          ok: false,
          code: 'CONFIG_INCOMPLETE',
          message: '请先填写 Base URL、Model 和 API Key。',
          runtimeMode: 'mock' as RuntimeMode,
        };
      }

      try {
        const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/models`, {
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
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
