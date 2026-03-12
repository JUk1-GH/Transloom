'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desktopClient } from '@/lib/ipc/desktop-client';

type ProviderPreset = 'deepseek' | 'openai' | 'custom';

type SettingsState = {
  shortcut: string;
  defaultTargetLang: string;
  runtimeMode: 'real' | 'mock';
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<SettingsState>(defaultSettings);
  const [statusMessage, setStatusMessage] = useState('正在读取本机设置...');
  const [connectionMessage, setConnectionMessage] = useState('保存前可先测试 provider 连接。');
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const desktopAvailable = desktopClient.isAvailable();

  useEffect(() => {
    async function bootstrap() {
      if (!desktopAvailable) {
        setStatusMessage('当前运行在浏览器预览环境，只有 Electron 桌面客户端才能保存本机配置与密钥。');
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
        setSavedSettings(nextState);
        setStatusMessage(runtime.runtimeMode === 'real' ? '真实模式可用。当前设置已经能直连 provider。' : '当前处于 Mock 模式。请补全或修复 API Key 后再切换到真实模式。');
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '读取本机设置失败。');
      } finally {
        setIsHydrating(false);
      }
    }

    void bootstrap();
  }, [desktopAvailable]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify({ ...settings, provider: { ...settings.provider, apiKey: settings.provider.apiKey ? 'changed' : '' } }) !== JSON.stringify({
      ...savedSettings,
      provider: { ...savedSettings.provider, apiKey: '' },
    });
  }, [savedSettings, settings]);

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
      setSavedSettings(nextState);
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

      setConnectionMessage(result?.message ?? '连接测试失败。');
      setSettings((current) => ({ ...current, runtimeMode: result?.runtimeMode ?? current.runtimeMode }));
    } catch {
      setConnectionMessage('连接测试失败，请检查网络或配置。');
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <AppShell title='设置' description='本机 provider、默认语言和快捷键都在这里。'>
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
        <div className='space-y-4'>
          <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
            <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>Provider 配置</div>
            <div className='space-y-4 px-4 py-4'>
              <div className='space-y-2'>
                <label htmlFor='provider-preset' className='text-xs text-[#777777]'>服务预设</label>
                <select
                  id='provider-preset'
                  value={settings.providerPreset}
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
                <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3 text-sm text-[#555555]'>
                  {providerPresetOptions.find((item) => item.value === settings.providerPreset)?.helper}
                </div>
              </div>

              <div className='grid gap-3 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label htmlFor='provider-base-url' className='text-xs text-[#777777]'>Base URL</label>
                  <Input id='provider-base-url' value={settings.provider.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, providerPreset: 'custom', provider: { ...current.provider, baseUrl: event.target.value } }))} />
                </div>
                <div className='space-y-2'>
                  <label htmlFor='provider-model' className='text-xs text-[#777777]'>Model</label>
                  <Input id='provider-model' value={settings.provider.model} onChange={(event) => setSettings((current) => ({ ...current, providerPreset: 'custom', provider: { ...current.provider, model: event.target.value } }))} />
                </div>
              </div>

              <div className='space-y-2'>
                <label htmlFor='provider-api-key' className='text-xs text-[#777777]'>API Key</label>
                <Input id='provider-api-key' type='password' value={settings.provider.apiKey} onChange={(event) => setSettings((current) => ({ ...current, provider: { ...current.provider, apiKey: event.target.value } }))} placeholder={settings.provider.apiKeyMasked ?? '输入新的 API Key'} />
              </div>

              <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3 text-sm text-[#555555]'>
                {connectionMessage}
              </div>

              <div className='flex flex-wrap gap-2'>
                <Button variant='secondary' onClick={() => void handleTestConnection()} disabled={isHydrating || isTesting || !desktopAvailable}>
                  {isTesting ? '测试中...' : '测试连接'}
                </Button>
                <Button onClick={() => void handleSave()} disabled={isHydrating || isSaving || !hasUnsavedChanges || !desktopAvailable}>
                  {isSaving ? '保存中...' : '保存设置'}
                </Button>
              </div>
            </div>
          </section>

          <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
            <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>应用默认项</div>
            <div className='grid gap-3 px-4 py-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <label htmlFor='default-target-lang' className='text-xs text-[#777777]'>默认目标语言</label>
                <select id='default-target-lang' value={settings.defaultTargetLang} onChange={(event) => setSettings((current) => ({ ...current, defaultTargetLang: event.target.value }))} className={selectClassName}>
                  {targetLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className='space-y-2'>
                <label htmlFor='global-shortcut' className='text-xs text-[#777777]'>全局快捷键</label>
                <Input id='global-shortcut' value={settings.shortcut} onChange={(event) => setSettings((current) => ({ ...current, shortcut: event.target.value }))} />
              </div>
            </div>
          </section>
        </div>

        <div className='space-y-4'>
          <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
            <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>当前状态</div>
            <div className='space-y-2 px-4 py-4 text-sm text-[#555555]'>
              <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3'>{statusMessage}</div>
              <div>环境：{desktopAvailable ? 'Electron desktop' : 'Browser preview'}</div>
              <div>运行模式：{settings.runtimeMode === 'real' ? 'Real' : 'Mock'}</div>
              <div>已存 API Key：{settings.provider.hasApiKey ? settings.provider.apiKeyMasked ?? '已保存' : '未保存'}</div>
              <div>默认语言：{targetLanguageOptions.find((item) => item.value === settings.defaultTargetLang)?.label ?? settings.defaultTargetLang}</div>
            </div>
          </section>

          <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
            <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>验证入口</div>
            <div className='space-y-2 px-4 py-4 text-sm text-[#555555]'>
              <Link href='/translate' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>去文本翻译验证</Link>
              <Link href='/capture' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>去截图翻译验证</Link>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
