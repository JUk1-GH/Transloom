'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desktopClient } from '@/lib/ipc/desktop-client';

type ProviderPreset = 'deepseek' | 'openai' | 'custom';

type SettingsState = {
  shortcut: string;
  defaultTargetLang: string;
  runtimeMode: 'real' | 'mock';
  runtimeStatus?: 'ready' | 'provider-missing' | 'model-missing' | 'api-key-missing' | 'mock-fallback';
  providerPreset: ProviderPreset;
  provider: {
    baseUrl: string;
    model: string;
    apiKey: string;
    apiKeyMasked?: string;
    hasApiKey: boolean;
  };
};

const defaultSettings: SettingsState = {
  shortcut: 'CommandOrControl+Shift+2',
  defaultTargetLang: 'zh-CN',
  runtimeMode: 'mock',
  providerPreset: 'deepseek',
  provider: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: '',
    apiKeyMasked: undefined,
    hasApiKey: false,
  },
};

const targetLanguageOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
] as const;

const providerPresetOptions: Array<{ value: ProviderPreset; label: string; baseUrl: string; model: string; helper: string }> = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', helper: '适合日常翻译与低成本桌面使用。' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', helper: '使用 OpenAI 官方兼容接口。' },
  { value: 'custom', label: '自定义兼容接口', baseUrl: '', model: '', helper: '适用于 OpenRouter、SiliconFlow 或其他兼容 OpenAI 的服务。' },
];

const selectClassName = 'h-10 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-sm text-[#111111] outline-none transition focus:border-[#8cb3f5]';

function getRuntimeModeLabel(runtimeMode: 'real' | 'mock') {
  return runtimeMode === 'real' ? '真实模式' : 'Mock 模式';
}

function getSurfaceLabel(desktopAvailable: boolean) {
  return desktopAvailable ? 'Electron 桌面端' : '浏览器预览';
}

function getRuntimeStatusText(runtimeStatus: SettingsState['runtimeStatus'], runtimeMode: SettingsState['runtimeMode']) {
  switch (runtimeStatus) {
    case 'provider-missing':
      return '未启用 provider';
    case 'model-missing':
      return '缺少模型配置';
    case 'api-key-missing':
      return '缺少 API Key';
    case 'mock-fallback':
      return 'Mock 回退';
    case 'ready':
      return '真实 provider 已就绪';
    default:
      return runtimeMode === 'real' ? '真实 provider 已就绪' : 'Mock 回退';
  }
}

const browserPreviewStatusMessage = '当前是浏览器预览，真实连接测试、保存设置与密钥写入仅在 Electron 桌面端可用。';
const browserPreviewConnectionMessage = '浏览器里先确认推荐配置；需要落盘或测连时再切回桌面端。';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [statusMessage, setStatusMessage] = useState(desktopClient.isAvailable() ? '正在读取本机设置...' : browserPreviewStatusMessage);
  const [connectionMessage, setConnectionMessage] = useState(desktopClient.isAvailable() ? '保存前可先测试 provider 连接。' : browserPreviewConnectionMessage);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const desktopAvailable = desktopClient.isAvailable();

  useEffect(() => {
    async function bootstrap() {
      if (!desktopAvailable) {
        setStatusMessage(browserPreviewStatusMessage);
        setConnectionMessage(browserPreviewConnectionMessage);
        setIsHydrating(false);
        return;
      }

      try {
        const [saved, runtime] = await Promise.all([desktopClient.getSettings(), desktopClient.getRuntimeMode()]);
        if (!saved || !runtime) {
          setStatusMessage('读取本机设置失败。');
          return;
        }

        const nextState: SettingsState = {
          shortcut: saved.shortcut,
          defaultTargetLang: saved.defaultTargetLang,
          runtimeMode: runtime.runtimeMode,
          runtimeStatus: runtime.status,
          providerPreset: saved.provider.baseUrl.includes('deepseek.com') ? 'deepseek' : saved.provider.baseUrl.includes('openai.com') ? 'openai' : 'custom',
          provider: {
            baseUrl: saved.provider.baseUrl,
            model: saved.provider.model,
            apiKey: '',
            apiKeyMasked: saved.provider.apiKeyMasked,
            hasApiKey: saved.provider.hasApiKey,
          },
        };

        setSettings(nextState);
        setStatusMessage(
          runtime.status === 'ready'
            ? '真实模式可用。当前设置已经能直连 provider。'
            : runtime.status === 'api-key-missing'
              ? '当前缺少 API Key。补齐密钥后才能切到真实模式。'
              : runtime.status === 'model-missing'
                ? '当前缺少模型配置。补全模型后才能切到真实模式。'
                : runtime.status === 'provider-missing'
                  ? '当前还没有启用 provider。先保存一个可用服务。'
                  : '当前处于 Mock 模式，可先验证界面与链路。'
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '读取本机设置失败。');
      } finally {
        setIsHydrating(false);
      }
    }

    void bootstrap();
  }, [desktopAvailable]);

  const formDisabled = desktopAvailable ? isHydrating : false;

  async function handleSave() {
    if (!desktopAvailable) {
      setStatusMessage('当前环境无法保存本机设置。');
      return;
    }

    setIsSaving(true);
    setStatusMessage('正在保存本机设置...');

    try {
      const result = await desktopClient.saveSettings({
        shortcut: settings.shortcut.trim(),
        defaultTargetLang: settings.defaultTargetLang,
        provider: {
          baseUrl: settings.provider.baseUrl.trim(),
          model: settings.provider.model.trim(),
          apiKey: settings.provider.apiKey.trim() || undefined,
        },
      });

      if (!result) {
        throw new Error('save-settings returned empty result');
      }

      const providerConfigResponse = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'provider-openai-compatible',
          kind: 'openai-compatible',
          label: providerPresetOptions.find((item) => item.value === settings.providerPreset)?.label ?? '自定义兼容接口',
          enabled: true,
          baseUrl: result.provider.baseUrl,
          model: result.provider.model,
          apiKeyMasked: result.provider.apiKeyMasked,
          hasApiKey: result.provider.hasApiKey,
          supportsVision: true,
        }),
      });

      if (!providerConfigResponse.ok) {
        const providerPayload = await providerConfigResponse.json().catch(() => null);
        throw new Error(providerPayload?.message ?? providerPayload?.code ?? '本机设置已保存，但 provider 元数据同步失败。');
      }

      const nextState: SettingsState = {
        shortcut: result.shortcut,
        defaultTargetLang: result.defaultTargetLang,
        runtimeMode: result.runtimeMode,
        runtimeStatus: result.runtimeMode === 'real' ? 'ready' : 'mock-fallback',
        providerPreset: settings.providerPreset,
        provider: {
          baseUrl: result.provider.baseUrl,
          model: result.provider.model,
          apiKey: '',
          apiKeyMasked: result.provider.apiKeyMasked,
          hasApiKey: result.provider.hasApiKey,
        },
      };

      setSettings(nextState);
      setStatusMessage(result.runtimeMode === 'real' ? '设置已保存，本机已处于真实模式。' : '设置已保存，但当前仍处于 Mock 模式。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!desktopAvailable) {
      setConnectionMessage('浏览器预览环境无法测试本机 provider 连接。');
      return;
    }

    setIsTesting(true);
    setConnectionMessage('正在测试连接...');

    try {
      const result = await desktopClient.testProviderConnection({
        baseUrl: settings.provider.baseUrl.trim(),
        model: settings.provider.model.trim(),
        apiKey: settings.provider.apiKey.trim() || undefined,
      });

      const hasTypedApiKey = Boolean(settings.provider.apiKey.trim() || settings.provider.hasApiKey);
      const nextRuntimeStatus: SettingsState['runtimeStatus'] = result?.runtimeMode === 'real'
        ? 'ready'
        : !settings.provider.baseUrl.trim() || !settings.provider.model.trim()
          ? 'model-missing'
          : hasTypedApiKey
            ? 'mock-fallback'
            : 'api-key-missing';

      setConnectionMessage(result?.message ?? '连接测试失败。');
      setSettings((current) => ({
        ...current,
        runtimeMode: result?.runtimeMode ?? current.runtimeMode,
        runtimeStatus: nextRuntimeStatus,
        provider: {
          ...current.provider,
          hasApiKey: hasTypedApiKey,
          apiKeyMasked: hasTypedApiKey
            ? current.provider.apiKeyMasked ?? '已在当前表单输入'
            : current.provider.apiKeyMasked,
        },
      }));
    } catch {
      setConnectionMessage('连接测试失败，请检查网络或配置。');
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <AppShell title='设置'>
      <div className='flex h-full min-h-0 flex-col gap-2'>
        <section className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='flex shrink-0 items-start justify-between gap-3 border-b border-[#dddddd] px-4 py-3'>
            <div className='min-w-0'>
              <div className='text-[15px] font-medium text-[#111111]'>Provider 配置</div>
              <div className='mt-1 text-[13px] text-[#666666]'>先确认当前服务，再决定是否切到真实 provider。</div>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <div className='rounded-[999px] border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs text-[#666666]'>
                {getSurfaceLabel(desktopAvailable)}
              </div>
            </div>
          </div>

          <div className='custom-scrollbar min-h-0 flex-1 overflow-y-auto'>
            <div className='grid gap-2 p-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(228px,0.82fr)]'>
              <div className='space-y-2'>
                <div className='rounded-[12px] border border-[#d8d8d8] bg-white'>
                  <div className='border-b border-[#ececec] px-4 py-3 text-sm font-medium text-[#111111]'>服务预设</div>
                  <div className='space-y-3 px-4 py-3'>
                    <div className='space-y-2'>
                      <label htmlFor='provider-preset' className='text-xs text-[#777777]'>服务预设</label>
                      <select
                        id='provider-preset'
                        value={settings.providerPreset}
                        disabled={formDisabled}
                        onChange={(event) => {
                          const preset = providerPresetOptions.find((item) => item.value === event.target.value as ProviderPreset);
                          setSettings((current) => ({
                            ...current,
                            providerPreset: event.target.value as ProviderPreset,
                            provider: {
                              ...current.provider,
                              baseUrl: preset?.baseUrl || current.provider.baseUrl,
                              model: preset?.model || current.provider.model,
                            },
                          }));
                        }}
                        className={selectClassName}
                      >
                        {providerPresetOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className='flex flex-wrap gap-2 text-xs text-[#555555]'>
                      <div className='rounded-full border border-[#d9d9d9] bg-[#fafafa] px-3 py-1.5'>
                        {providerPresetOptions.find((item) => item.value === settings.providerPreset)?.helper}
                      </div>
                    </div>
                  </div>
                </div>

                <div className='rounded-[12px] border border-[#d8d8d8] bg-white'>
                  <div className='border-b border-[#ececec] px-4 py-3 text-sm font-medium text-[#111111]'>连接参数</div>
                  <div className='space-y-3 px-4 py-3'>
                    <div className='grid gap-3 md:grid-cols-2'>
                      <div className='space-y-2'>
                        <label htmlFor='provider-base-url' className='text-xs text-[#777777]'>Base URL</label>
                        <Input id='provider-base-url' value={settings.provider.baseUrl} disabled={formDisabled} onChange={(event) => setSettings((current) => ({ ...current, providerPreset: 'custom', provider: { ...current.provider, baseUrl: event.target.value } }))} />
                      </div>
                      <div className='space-y-2'>
                        <label htmlFor='provider-model' className='text-xs text-[#777777]'>Model</label>
                        <Input id='provider-model' value={settings.provider.model} disabled={formDisabled} onChange={(event) => setSettings((current) => ({ ...current, providerPreset: 'custom', provider: { ...current.provider, model: event.target.value } }))} />
                      </div>
                    </div>

                    <div className='space-y-2'>
                      <label htmlFor='provider-api-key' className='text-xs text-[#777777]'>API Key</label>
                      <Input id='provider-api-key' type='password' value={settings.provider.apiKey} disabled={formDisabled} onChange={(event) => setSettings((current) => ({ ...current, provider: { ...current.provider, apiKey: event.target.value } }))} placeholder={settings.provider.apiKeyMasked ?? '输入新的 API Key'} />
                    </div>
                  </div>
                </div>
              </div>

              <div className='space-y-2'>
                <div className='rounded-[12px] border border-[#d8d8d8] bg-white'>
                  <div className='border-b border-[#ececec] px-4 py-3 text-sm font-medium text-[#111111]'>运行状态与默认项</div>
                  <div className='space-y-3 px-4 py-3'>
                    <div className='rounded-[10px] border border-[#d9d9d9] bg-[#fafafa] px-3 py-2.5 text-sm text-[#555555]'>{statusMessage}</div>

                    <div className='grid gap-2 text-sm text-[#555555]'>
                      <div>运行模式：{getRuntimeModeLabel(settings.runtimeMode)}</div>
                      <div>运行状态：{getRuntimeStatusText(settings.runtimeStatus, settings.runtimeMode)}</div>
                      <div>已存 API Key：{settings.provider.hasApiKey ? settings.provider.apiKeyMasked ?? '已保存' : '未保存'}</div>
                      <div className='truncate'>模型：{settings.provider.model || '未填写'}</div>
                    </div>

                    <div className='flex flex-wrap gap-2 text-xs text-[#555555]'>
                      <div className='rounded-full border border-[#d6d6d6] bg-[#fafafa] px-3 py-1.5'>
                        预设 · {providerPresetOptions.find((item) => item.value === settings.providerPreset)?.label}
                      </div>
                      <div className='rounded-full border border-[#d6d6d6] bg-[#fafafa] px-3 py-1.5'>
                        {desktopAvailable ? '会直接写入当前桌面客户端。' : '浏览器里仅预览推荐配置。'}
                      </div>
                    </div>

                    <div className='grid gap-3'>
                      <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                        <div className='space-y-2'>
                          <label htmlFor='default-target-lang' className='text-xs text-[#777777]'>默认目标语言</label>
                          <select id='default-target-lang' value={settings.defaultTargetLang} disabled={formDisabled} onChange={(event) => setSettings((current) => ({ ...current, defaultTargetLang: event.target.value }))} className={selectClassName}>
                            {targetLanguageOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className='space-y-2'>
                          <label htmlFor='global-shortcut' className='text-xs text-[#777777]'>全局快捷键</label>
                          <Input id='global-shortcut' value={settings.shortcut} disabled={formDisabled} onChange={(event) => setSettings((current) => ({ ...current, shortcut: event.target.value }))} />
                        </div>
                      </div>

                      <div className='rounded-[10px] border border-[#d9d9d9] bg-[#fafafa] px-3 py-2.5 text-sm text-[#555555]'>
                        {connectionMessage}
                      </div>

                      <div className='flex flex-wrap gap-2'>
                        <Button variant='secondary' onClick={() => void handleTestConnection()} disabled={isHydrating || isTesting || !desktopAvailable}>
                          {isTesting ? '测试中...' : '测试连接'}
                        </Button>
                        <Button onClick={() => void handleSave()} disabled={isHydrating || isSaving || !desktopAvailable}>
                          {isSaving ? '保存中...' : '保存设置'}
                        </Button>
                      </div>

                      <div className='grid gap-2 md:grid-cols-2'>
                        <Link href='/' className='block rounded-[10px] border border-[#d1d1d1] bg-[#fafafa] px-3 py-2.5 text-sm transition hover:bg-white'>去统一工作区验证文本</Link>
                        <Link href='/' className='block rounded-[10px] border border-[#d1d1d1] bg-[#fafafa] px-3 py-2.5 text-sm transition hover:bg-white'>去统一工作区验证截图</Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
