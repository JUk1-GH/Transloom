'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    <AppShell title='本机设置中心' description='首发版仅保留本地单机、BYOK 和 OpenAI-compatible 配置。所有敏感信息只保存在本机 Electron 环境。'>
      <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_360px]'>
        <div className='grid gap-5'>
          <Card title='兼容接口服务配置' eyebrow='BYOK'>
            <div className='space-y-4'>
              <div className='space-y-2'>
                <label htmlFor='provider-preset' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>服务商预设</label>
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
                  className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-400 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.10)]'
                >
                  {providerPresetOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-slate-600'>
                  {providerPresetOptions.find((item) => item.value === settings.providerPreset)?.helper}
                </div>
              </div>
              <div className='grid gap-3 md:grid-cols-2'>
                <div className='space-y-2'>
                  <label htmlFor='provider-base-url' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Base URL</label>
                  <Input id='provider-base-url' value={settings.provider.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, providerPreset: 'custom', provider: { ...current.provider, baseUrl: event.target.value } }))} placeholder='https://api.deepseek.com' />
                </div>
                <div className='space-y-2'>
                  <label htmlFor='provider-model' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Model</label>
                  <Input id='provider-model' value={settings.provider.model} onChange={(event) => setSettings((current) => ({ ...current, providerPreset: 'custom', provider: { ...current.provider, model: event.target.value } }))} placeholder='deepseek-chat' />
                </div>
              </div>
              <div className='space-y-2'>
                <label htmlFor='provider-api-key' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>API Key</label>
                <Input id='provider-api-key' type='password' value={settings.provider.apiKey} onChange={(event) => setSettings((current) => ({ ...current, provider: { ...current.provider, apiKey: event.target.value } }))} placeholder={settings.provider.apiKeyMasked ?? '输入新的 API Key'} />
              </div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-slate-600'>{connectionMessage}</div>
              <div className='flex flex-wrap gap-3'>
                <Button variant='secondary' onClick={() => void handleTestConnection()} disabled={isHydrating || isTesting || !desktopAvailable}>{isTesting ? '测试中...' : '测试连接'}</Button>
                <Button onClick={() => void handleSave()} disabled={isHydrating || isSaving || !hasUnsavedChanges || !desktopAvailable}>{isSaving ? '保存中...' : '保存本机设置'}</Button>
              </div>
            </div>
          </Card>

          <Card title='应用默认项' eyebrow='Preferences'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <label htmlFor='default-target-lang' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Default target language</label>
                <select id='default-target-lang' value={settings.defaultTargetLang} onChange={(event) => setSettings((current) => ({ ...current, defaultTargetLang: event.target.value }))} className='h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-400 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.10)]'>
                  {targetLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className='space-y-2'>
                <label htmlFor='global-shortcut' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Global shortcut</label>
                <Input id='global-shortcut' value={settings.shortcut} onChange={(event) => setSettings((current) => ({ ...current, shortcut: event.target.value }))} aria-label='Global shortcut' />
              </div>
            </div>
          </Card>
        </div>

        <div className='grid gap-5'>
          <Card title='当前状态' eyebrow='Runtime'>
            <div className='space-y-3'>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>{statusMessage}</div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>环境：{desktopAvailable ? 'Electron desktop' : 'Browser preview'}</div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>运行模式：{settings.runtimeMode === 'real' ? 'Real' : 'Mock'}</div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>已存 API Key：{settings.provider.hasApiKey ? settings.provider.apiKeyMasked ?? '已保存' : '未保存'}</div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>默认目标语言：{targetLanguageOptions.find((item) => item.value === settings.defaultTargetLang)?.label ?? settings.defaultTargetLang}</div>
            </div>
          </Card>

          <Card title='验证入口' eyebrow='Actions'>
            <div className='space-y-3'>
              <Link href='/translate' className='flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700'>
                <span>去文本翻译验证</span>
                <span>→</span>
              </Link>
              <Link href='/capture' className='flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700'>
                <span>去截屏翻译验证</span>
                <span>→</span>
              </Link>
            </div>
          </Card>

          <Card title='当前策略' eyebrow='Notes'>
            <ul className='space-y-3'>
              <li>- 配置中心是唯一 provider 来源。</li>
              <li>- 缺 Key 或连通失败时，应用继续以 Mock 模式可用。</li>
              <li>- 术语表、历史、用量都保存在本地 SQLite。</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
