'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { desktopClient } from '@/lib/ipc/desktop-client';
import {
  DEFAULT_LOCAL_OCR_ENDPOINT,
  OCR_ENDPOINT_STORAGE_KEY,
  OCR_ENGINE_STORAGE_KEY,
  isLocalScreenshotOcrEngine,
  normalizeLocalOcrEndpoint,
  type ScreenshotOcrEngine,
} from '@/lib/ocr/local-ocr-config';

type ProviderPreset = 'deepseek' | 'openai' | 'tencent' | 'custom';
type SettingsSection = 'providers' | 'general' | 'ocr';

type SettingsState = {
  shortcut: string;
  defaultTargetLang: string;
  runtimeMode: 'real' | 'mock';
  runtimeStatus?: 'ready' | 'provider-missing' | 'model-missing' | 'api-key-missing' | 'mock-fallback';
  providerPreset: ProviderPreset;
  provider: {
    kind: 'openai-compatible' | 'tencent';
    baseUrl: string;
    model: string;
    apiKey: string;
    apiKeyMasked?: string;
    hasApiKey: boolean;
    secretId: string;
    secretKey: string;
    secretKeyMasked?: string;
    hasSecretKey: boolean;
    region: string;
    projectId: string;
  };
};

const defaultSettings: SettingsState = {
  shortcut: 'CommandOrControl+Shift+2',
  defaultTargetLang: 'zh-CN',
  runtimeMode: 'mock',
  providerPreset: 'deepseek',
  provider: {
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    model: 'deepseek-r1:7b',
    apiKey: '',
    apiKeyMasked: undefined,
    hasApiKey: false,
    secretId: '',
    secretKey: '',
    secretKeyMasked: undefined,
    hasSecretKey: false,
    region: 'ap-beijing',
    projectId: '0',
  },
};

const targetLanguageOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
] as const;

const screenshotOcrOptions: Array<{ value: ScreenshotOcrEngine; label: string; helper: string; badge: string }> = [
  { value: 'cloud-vision', label: '云端视觉', helper: '直接复用当前翻译服务处理截图 OCR，适合已有视觉模型的场景。', badge: '最省事' },
  { value: 'local-paddleocr', label: 'PaddleOCR 本地', helper: '稳定、免费、完全本地，适合大多数截图翻译用户。', badge: '推荐' },
  { value: 'rapidocr', label: 'RapidOCR', helper: '轻量快速，启动更干脆，适合追求响应速度的本地使用。', badge: '轻量' },
  { value: 'apple-vision', label: 'Apple Vision Framework', helper: '走 macOS 原生 Vision，适合 Apple 设备上的纯本地 OCR。', badge: '原生' },
] as const;

const providerPresetOptions: Array<{
  value: ProviderPreset;
  kind: SettingsState['provider']['kind'];
  label: string;
  title: string;
  baseUrl: string;
  model: string;
  helper: string;
  badge: string;
}> = [
  {
    value: 'deepseek',
    kind: 'openai-compatible',
    label: 'DeepSeek',
    title: 'DeepSeek / 兼容接口',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    helper: '适合希望直接接入 OpenAI 兼容接口，或已经在用本地桥接服务的用户。',
    badge: '兼容',
  },
  {
    value: 'openai',
    kind: 'openai-compatible',
    label: 'OpenAI',
    title: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    helper: '适合想快速用官方接口开箱即用的用户。',
    badge: '官方',
  },
  {
    value: 'tencent',
    kind: 'tencent',
    label: '腾讯云',
    title: '腾讯云机器翻译',
    baseUrl: 'https://tmt.tencentcloudapi.com',
    model: 'TextTranslate',
    helper: '适合明确要用腾讯云 TextTranslate 的用户，配置项和 OpenAI 兼容接口不同。',
    badge: '云服务',
  },
  {
    value: 'custom',
    kind: 'openai-compatible',
    label: '自定义',
    title: '自定义 OpenAI 兼容',
    baseUrl: '',
    model: '',
    helper: '适合 OpenRouter、SiliconFlow、Ollama 桥接，以及其他兼容 OpenAI 的服务。',
    badge: '高级',
  },
] as const;

const sectionItems: Array<{ id: SettingsSection; label: string; description: string }> = [
  { id: 'providers', label: '翻译服务', description: '服务与凭证' },
  { id: 'general', label: '常用偏好', description: '语言与快捷键' },
  { id: 'ocr', label: '截图识别', description: 'OCR 方案' },
] as const;

const shortcutSuggestions = ['CommandOrControl+Shift+2', 'CommandOrControl+Shift+E', 'CommandOrControl+Option+T'] as const;

const selectClassName =
  'h-10 w-full rounded-[12px] border border-[#d7dbe2] bg-white px-3 text-sm text-[#111111] outline-none transition focus:border-[#1ca36f] focus:ring-3 focus:ring-[#d9f7ea]';
const fieldLabelClassName = 'text-[12px] font-semibold uppercase tracking-[0.08em] text-[#707784]';
const inputShellClassName =
  'flex min-h-10 items-center rounded-[12px] border border-[#d7dbe2] bg-white px-3 transition focus-within:border-[#1ca36f] focus-within:ring-3 focus-within:ring-[#d9f7ea]';

function GearIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 4.95A3.05 3.05 0 1 0 8 11.05A3.05 3.05 0 1 0 8 4.95Z' stroke='currentColor' strokeWidth='1.5' />
      <path d='M8 2V3.2' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M8 12.8V14' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M14 8H12.8' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M3.2 8H2' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M11.9 4.1L11.05 4.95' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M4.95 11.05L4.1 11.9' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M11.9 11.9L11.05 11.05' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
      <path d='M4.95 4.95L4.1 4.1' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
    </svg>
  );
}

function SliderIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M3 4H13' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M3 8H13' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M3 12H13' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <circle cx='6' cy='4' r='1.4' fill='white' stroke='currentColor' strokeWidth='1.2' />
      <circle cx='10' cy='8' r='1.4' fill='white' stroke='currentColor' strokeWidth='1.2' />
      <circle cx='7' cy='12' r='1.4' fill='white' stroke='currentColor' strokeWidth='1.2' />
    </svg>
  );
}

function ShortcutIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M5.15 3.15V5.25' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M10.85 10.75V12.85' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M3.15 5.15H5.25' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M10.75 10.85H12.85' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M10.75 5.15H12.85' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M3.15 10.85H5.25' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M5.15 10.75V12.85' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M10.85 3.15V5.25' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M3.1 5.45V3.7C3.1 3.04 3.64 2.5 4.3 2.5H6.05' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M9.95 2.5H11.7C12.36 2.5 12.9 3.04 12.9 3.7V5.45' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M12.9 10.55V12.3C12.9 12.96 12.36 13.5 11.7 13.5H9.95' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M6.05 13.5H4.3C3.64 13.5 3.1 12.96 3.1 12.3V10.55' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8.8 1.9L3.6 8.35H7.25L6.5 14.1L11.95 7.35H8.3L8.8 1.9Z' stroke='currentColor' strokeWidth='1.4' strokeLinejoin='round' />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M3.1 3.3C3.1 2.86 3.46 2.5 3.9 2.5H10.8L12.9 4.6V12.1C12.9 12.54 12.54 12.9 12.1 12.9H3.9C3.46 12.9 3.1 12.54 3.1 12.1V3.3Z' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
      <path d='M5.2 2.9V6H10.4V2.9' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
      <path d='M5.5 10.2H10.5' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M2.1 8C3.45 5.65 5.55 4.45 8 4.45C10.45 4.45 12.55 5.65 13.9 8C12.55 10.35 10.45 11.55 8 11.55C5.55 11.55 3.45 10.35 2.1 8Z' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
      <circle cx='8' cy='8' r='2.05' stroke='currentColor' strokeWidth='1.3' />
    </svg>
  ) : (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M2.4 2.4L13.6 13.6' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <path d='M6.6 4.7C7.05 4.53 7.52 4.45 8 4.45C10.45 4.45 12.55 5.65 13.9 8C13.42 8.83 12.84 9.52 12.17 10.05' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M9.88 10.03C9.35 10.39 8.71 10.58 8 10.58C5.55 10.58 3.45 9.38 2.1 7.03C2.58 6.2 3.17 5.5 3.85 4.97' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 1.8L9.2 5.1L12.5 6.3L9.2 7.5L8 10.8L6.8 7.5L3.5 6.3L6.8 5.1L8 1.8Z' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
      <path d='M12.1 10.4L12.7 12L14.3 12.6L12.7 13.2L12.1 14.8L11.5 13.2L9.9 12.6L11.5 12L12.1 10.4Z' fill='currentColor' />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 2.2L12 3.7V7.55C12 10.1 10.5 12.35 8 13.6C5.5 12.35 4 10.1 4 7.55V3.7L8 2.2Z' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='1.3' />
      <path d='M5.2 8.15L7.1 10.05L10.8 6.35' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='8' cy='8' r='6.2' stroke='currentColor' strokeWidth='1.3' />
      <path d='M2.2 8H13.8' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <path d='M8 1.8C9.75 3.45 10.75 5.65 10.75 8C10.75 10.35 9.75 12.55 8 14.2C6.25 12.55 5.25 10.35 5.25 8C5.25 5.65 6.25 3.45 8 1.8Z' stroke='currentColor' strokeWidth='1.3' />
    </svg>
  );
}

function getSectionIcon(section: SettingsSection) {
  switch (section) {
    case 'providers':
      return <GearIcon />;
    case 'general':
      return <SliderIcon />;
    case 'ocr':
      return <CaptureIcon />;
  }
}

function getRuntimeModeLabel(runtimeMode: 'real' | 'mock') {
  return runtimeMode === 'real' ? '真实模式' : '模拟模式';
}

function getSurfaceLabel(desktopAvailable: boolean) {
  return desktopAvailable ? '桌面应用' : '浏览器预览';
}

function getRuntimeStatusText(runtimeStatus: SettingsState['runtimeStatus'], runtimeMode: SettingsState['runtimeMode']) {
  switch (runtimeStatus) {
    case 'provider-missing':
      return '未启用服务';
    case 'model-missing':
      return '缺少模型';
    case 'api-key-missing':
      return '缺少凭证';
    case 'mock-fallback':
      return '模拟回退';
    case 'ready':
      return '服务已就绪';
    default:
      return runtimeMode === 'real' ? '服务已就绪' : '模拟回退';
  }
}

function getRuntimeTone(runtimeStatus: SettingsState['runtimeStatus'], runtimeMode: SettingsState['runtimeMode']) {
  if (runtimeStatus === 'ready' || (!runtimeStatus && runtimeMode === 'real')) {
    return {
      wrapper: 'border-[#bfe8d7] bg-[#effcf5] text-[#0f6f4e]',
      dot: 'bg-[#10b981]',
    };
  }

  if (runtimeStatus === 'provider-missing' || runtimeStatus === 'api-key-missing' || runtimeStatus === 'model-missing') {
    return {
      wrapper: 'border-[#f4dfb6] bg-[#fff7e5] text-[#9a6610]',
      dot: 'bg-[#f4b740]',
    };
  }

  return {
    wrapper: 'border-[#d9e1ea] bg-[#f5f7fa] text-[#516070]',
    dot: 'bg-[#8a97a7]',
  };
}

function getProviderPreset(providerKind?: string | null, baseUrl?: string | null): ProviderPreset {
  if (providerKind === 'tencent') {
    return 'tencent';
  }

  if (baseUrl?.includes('deepseek.com')) {
    return 'deepseek';
  }

  if (baseUrl?.includes('openai.com')) {
    return 'openai';
  }

  return 'custom';
}

function getEditableProviderKind(providerKind?: string | null): SettingsState['provider']['kind'] {
  return providerKind === 'tencent' ? 'tencent' : 'openai-compatible';
}

function getBrowserPreviewStatusMessage(runtimeStatus: SettingsState['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'ready':
      return '浏览器预览只能读取当前摘要，真正保存配置和测试连接仍然需要桌面应用。';
    case 'api-key-missing':
      return '浏览器预览已识别出服务摘要，但还缺少真实凭证。';
    case 'model-missing':
      return '浏览器预览已识别出服务项，但模型或地址还不完整。';
    case 'provider-missing':
      return '当前还没有启用任何翻译服务。';
    case 'mock-fallback':
      return '当前服务摘要存在，但运行时仍处于模拟回退。';
    default:
      return '浏览器预览只能查看当前配置概况。';
  }
}

function getBrowserPreviewConnectionMessage(runtimeStatus: SettingsState['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'ready':
      return '当前摘要看起来已经完整。如果你要测试真实连接，请切换到桌面应用。';
    case 'api-key-missing':
      return '请先在桌面应用中补全真实凭证，再进行连接测试。';
    case 'model-missing':
      return '请先补全模型或服务地址，再在桌面应用里测试。';
    case 'provider-missing':
      return '请先选一个服务，再保存到桌面应用。';
    case 'mock-fallback':
      return '当前仍在模拟模式，真实连接测试需要桌面环境。';
    default:
      return '真实连接测试只在桌面模式下可用。';
  }
}

function getProviderDisplayName(settings: SettingsState) {
  if (settings.provider.kind === 'tencent' || settings.providerPreset === 'tencent') {
    return '腾讯云机器翻译';
  }

  if (settings.providerPreset === 'deepseek') {
    return settings.provider.baseUrl.includes('localhost') || settings.provider.baseUrl.includes('127.0.0.1')
      ? '本地 DeepSeek API'
      : 'DeepSeek 服务';
  }

  if (settings.providerPreset === 'openai') {
    return 'OpenAI API';
  }

  return settings.provider.baseUrl.includes('localhost') || settings.provider.baseUrl.includes('127.0.0.1')
    ? '本地 OpenAI 兼容 API'
    : '自定义 OpenAI 兼容 API';
}

function getProviderSummaryText(settings: SettingsState) {
  if (settings.provider.kind === 'tencent') {
    return `Region：${settings.provider.region || '未填写'} · ProjectId：${settings.provider.projectId || '0'}`;
  }

  if (!settings.provider.baseUrl.trim() && !settings.provider.model.trim()) {
    return '还没有填写服务地址和模型。';
  }

  return `${settings.provider.baseUrl || '未填写地址'} · ${settings.provider.model || '未填写模型'}`;
}

function getProviderCredentialLabel(settings: SettingsState) {
  if (settings.provider.kind === 'tencent') {
    return settings.provider.secretId.trim() || settings.provider.hasSecretKey ? '已填写腾讯云凭证' : '还未填写腾讯云凭证';
  }

  return settings.provider.apiKey.trim() || settings.provider.hasApiKey ? 'API Key 已填写' : '还未填写 API Key';
}

function getProviderActionHint(settings: SettingsState) {
  if (settings.provider.kind === 'tencent') {
    return '腾讯云只用于文本翻译。截图 OCR 建议切到本地 OCR。';
  }

  if (settings.providerPreset === 'custom') {
    return '如果你接的是兼容接口，先确认 `/models` 能正常响应，再测试连接。';
  }

  if (settings.providerPreset === 'deepseek') {
    return '如果你用的是本地 DeepSeek 或 Ollama 桥接，Base URL 和模型名最容易填错。';
  }

  return '建议先点“测试连接”，确认通过后再保存配置。';
}

function getOcrSummary(engine: ScreenshotOcrEngine) {
  switch (engine) {
    case 'cloud-vision':
      return '截图 OCR 会直接走当前翻译服务';
    case 'local-paddleocr':
      return '截图 OCR 会走本地 PaddleOCR 服务';
    case 'rapidocr':
      return '截图 OCR 会走本地 RapidOCR';
    case 'apple-vision':
      return '截图 OCR 会走 Apple Vision Framework';
  }
}

function getOcrCompatibilityMessage(settings: SettingsState, ocrEngine: ScreenshotOcrEngine, endpoint: string) {
  if (ocrEngine === 'cloud-vision') {
    if (settings.provider.kind === 'tencent') {
      return '当前翻译服务是腾讯云。它只用于文本翻译，截图 OCR 请改用本地 OCR 引擎。';
    }

    if (!settings.provider.hasApiKey && !settings.provider.apiKey.trim()) {
      return '当前翻译服务还缺少凭证，截图 OCR 暂时无法进入真实模式。';
    }

    return '截图 OCR 会复用当前翻译服务。只要当前模型支持图片输入，就能直接使用。';
  }

  return `当前会通过本地 OCR 端点 ${endpoint} 处理截图识别，翻译结果再交给你当前选中的翻译服务。`;
}

function getSectionTip(activeSection: SettingsSection) {
  switch (activeSection) {
    case 'providers':
      return '先把翻译服务配通，再去调 OCR 或快捷键，整个体验会顺很多。';
    case 'general':
      return '这里放每天最常改的默认项，不需要到处找。';
    case 'ocr':
      return '如果你追求稳定和免费，本地 OCR 通常比云端视觉更适合日常截图翻译。';
  }
}

function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'neutral';
}) {
  const className =
    tone === 'success'
      ? 'border-[#bfe8d7] bg-[#effcf5] text-[#0f6f4e]'
      : tone === 'warning'
        ? 'border-[#f4dfb6] bg-[#fff7e5] text-[#9a6610]'
        : 'border-[#d9e1ea] bg-[#f5f7fa] text-[#5b6775]';

  return (
    <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em]', className)}>
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className='rounded-[22px] border border-[#d9e1e8] bg-white/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur'>
      <div className='flex items-center justify-between gap-3'>
        <div className='text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7b8492]'>{label}</div>
        <div className='flex h-8 w-8 items-center justify-center rounded-[12px] bg-[#f0f5f3] text-[#17654b]'>{icon}</div>
      </div>
      <div className='mt-2 text-[17px] font-semibold text-[#21262d]'>{value}</div>
      <div className='mt-1 text-[13px] leading-6 text-[#6f7783]'>{detail}</div>
    </div>
  );
}

function PanelCard({
  title,
  description,
  children,
  action,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('rounded-[18px] border border-[#d9e1e8] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]', className)}>
      <div className='mb-2.5 flex flex-wrap items-start justify-between gap-2.5'>
        <div>
          <h2 className='text-[17px] font-semibold tracking-[-0.03em] text-[#1f252c]'>{title}</h2>
          {description ? <p className='mt-1 max-w-[760px] text-[13px] leading-5 text-[#6f7783]'>{description}</p> : null}
        </div>
        {action ? <div className='shrink-0'>{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function FieldBlock({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <label className='grid gap-1.5'>
      <div className='space-y-0.5'>
        <div className={fieldLabelClassName}>{label}</div>
        {description ? <div className='text-[12px] leading-5 text-[#747d89]'>{description}</div> : null}
      </div>
      {children}
    </label>
  );
}

function NoticeCard({
  tone = 'neutral',
  title,
  message,
}: {
  tone?: 'success' | 'warning' | 'neutral';
  title: string;
  message: string;
}) {
  const className =
    tone === 'success'
      ? 'border-[#bfe8d7] bg-[#f1fcf6] text-[#135f44]'
      : tone === 'warning'
        ? 'border-[#f4dfb6] bg-[#fff8e8] text-[#8c620e]'
        : 'border-[#d9e1ea] bg-[#f5f7fa] text-[#5b6775]';

  return (
    <div className={clsx('rounded-[16px] border p-3', className)}>
      <div className='text-[13px] font-semibold'>{title}</div>
      <div className='mt-1 text-[12px] leading-5'>{message}</div>
    </div>
  );
}

function Keycap({ value }: { value: string }) {
  return <span className='rounded-[12px] border border-[#d9e1e8] bg-white px-3 py-1.5 font-mono text-[12px] text-[#404852]'>{value}</span>;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [activeSection, setActiveSection] = useState<SettingsSection>('providers');
  const [statusMessage, setStatusMessage] = useState('正在同步服务摘要...');
  const [connectionMessage, setConnectionMessage] = useState(
    desktopClient.isAvailable()
      ? '建议先测试连接，再保存配置。'
      : getBrowserPreviewConnectionMessage(defaultSettings.runtimeStatus),
  );
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [captureOcrEngine, setCaptureOcrEngine] = useState<ScreenshotOcrEngine>('cloud-vision');
  const [captureLocalOcrEndpoint, setCaptureLocalOcrEndpoint] = useState(DEFAULT_LOCAL_OCR_ENDPOINT);
  const [captureOcrReady, setCaptureOcrReady] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const desktopAvailable = desktopClient.isAvailable();
  const normalizedCaptureLocalOcrEndpoint = normalizeLocalOcrEndpoint(captureLocalOcrEndpoint);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedEngine = window.localStorage.getItem(OCR_ENGINE_STORAGE_KEY);
    if (savedEngine === 'cloud-vision' || savedEngine === 'local-paddleocr' || savedEngine === 'rapidocr' || savedEngine === 'apple-vision') {
      setCaptureOcrEngine(savedEngine);
    }

    const savedEndpoint = window.localStorage.getItem(OCR_ENDPOINT_STORAGE_KEY);
    if (savedEndpoint?.trim()) {
      setCaptureLocalOcrEndpoint(savedEndpoint.trim());
    }

    setCaptureOcrReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncViewportHeight = () => setViewportHeight(window.innerHeight);

    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight);
    return () => window.removeEventListener('resize', syncViewportHeight);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !captureOcrReady) {
      return;
    }

    window.localStorage.setItem(OCR_ENGINE_STORAGE_KEY, captureOcrEngine);
    window.localStorage.setItem(OCR_ENDPOINT_STORAGE_KEY, normalizedCaptureLocalOcrEndpoint);
  }, [captureOcrEngine, captureOcrReady, normalizedCaptureLocalOcrEndpoint]);

  useEffect(() => {
    async function bootstrap() {
      try {
        if (!desktopAvailable) {
          const [runtime, providers] = await Promise.all([
            fetch('/api/provider-runtime', { cache: 'no-store' }).then((response) => response.json()),
            fetch('/api/providers', { cache: 'no-store' }).then((response) => response.json()).catch(() => []),
          ]);

          const enabledProvider = Array.isArray(providers)
            ? providers.find((item) => item?.enabled) ?? providers[0]
            : null;
          const providerBaseUrl = runtime?.provider?.baseUrl ?? enabledProvider?.baseUrl ?? defaultSettings.provider.baseUrl;
          const providerModel = runtime?.provider?.model ?? enabledProvider?.model ?? defaultSettings.provider.model;
          const providerHasApiKey = Boolean(runtime?.provider?.hasApiKey ?? enabledProvider?.hasApiKey);
          const providerKind = getEditableProviderKind(runtime?.provider?.kind ?? enabledProvider?.kind ?? defaultSettings.provider.kind);
          const runtimeStatus = runtime?.status ?? (providerHasApiKey ? 'mock-fallback' : 'provider-missing');

          setSettings((current) => ({
            ...current,
            runtimeMode: runtime?.runtimeMode === 'real' ? 'real' : 'mock',
            runtimeStatus,
            providerPreset: getProviderPreset(providerKind, providerBaseUrl),
            provider: {
              ...current.provider,
              kind: providerKind,
              baseUrl: providerBaseUrl,
              model: providerModel,
              apiKey: '',
              apiKeyMasked: enabledProvider?.apiKeyMasked,
              hasApiKey: providerHasApiKey,
              secretId: '',
              secretKey: '',
              secretKeyMasked: undefined,
              hasSecretKey: providerKind === 'tencent' ? providerHasApiKey : false,
              region: runtime?.provider?.region ?? current.provider.region,
              projectId: runtime?.provider?.projectId ?? current.provider.projectId,
            },
          }));
          setStatusMessage(getBrowserPreviewStatusMessage(runtimeStatus));
          setConnectionMessage(getBrowserPreviewConnectionMessage(runtimeStatus));
          setIsHydrating(false);
          return;
        }

        const [saved, runtime] = await Promise.all([desktopClient.getSettings(), desktopClient.getRuntimeMode()]);
        if (!saved || !runtime) {
          setStatusMessage('读取本地设置失败。');
          return;
        }

        const nextState: SettingsState = {
          shortcut: saved.shortcut,
          defaultTargetLang: saved.defaultTargetLang,
          runtimeMode: runtime.runtimeMode,
          runtimeStatus: runtime.status,
          providerPreset: getProviderPreset(saved.provider.kind, saved.provider.baseUrl),
          provider: {
            kind: getEditableProviderKind(saved.provider.kind),
            baseUrl: saved.provider.baseUrl,
            model: saved.provider.model,
            apiKey: '',
            apiKeyMasked: saved.provider.apiKeyMasked,
            hasApiKey: saved.provider.hasApiKey,
            secretId: saved.provider.secretId ?? '',
            secretKey: '',
            secretKeyMasked: saved.provider.secretKeyMasked,
            hasSecretKey: saved.provider.hasSecretKey ?? false,
            region: saved.provider.region ?? defaultSettings.provider.region,
            projectId: saved.provider.projectId ?? defaultSettings.provider.projectId,
          },
        };

        setSettings(nextState);
        setStatusMessage(
          runtime.status === 'ready'
            ? '服务已就绪，桌面应用现在可以使用真实端点。'
            : runtime.status === 'api-key-missing'
              ? '仍然缺少凭证，请先补齐后再切换到真实服务。'
              : runtime.status === 'model-missing'
                ? '模型配置还不完整，请先补全后再切换到真实模式。'
                : runtime.status === 'provider-missing'
                  ? '还没有启用任何服务，请先保存一组有效的服务配置。'
                  : '当前运行时仍处于模拟模式，但你可以先验证界面和流程。'
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '读取本地设置失败。');
      } finally {
        setIsHydrating(false);
      }
    }

    void bootstrap();
  }, [desktopAvailable]);

  const formDisabled = desktopAvailable ? isHydrating : false;
  const activePreset = useMemo(
    () => providerPresetOptions.find((item) => item.value === settings.providerPreset) ?? providerPresetOptions[0],
    [settings.providerPreset],
  );
  const activeOcrOption = useMemo(
    () => screenshotOcrOptions.find((option) => option.value === captureOcrEngine) ?? screenshotOcrOptions[0],
    [captureOcrEngine],
  );
  const isTencentProvider = settings.provider.kind === 'tencent';
  const isLocalProvider = !isTencentProvider && (settings.provider.baseUrl.includes('localhost') || settings.provider.baseUrl.includes('127.0.0.1'));
  const runtimeTone = getRuntimeTone(settings.runtimeStatus, settings.runtimeMode);
  const viewportScale = viewportHeight !== null && viewportHeight < 820 ? 0.82 : viewportHeight !== null && viewportHeight < 900 ? 0.92 : 1;
  const hasFilledCredential = isTencentProvider
    ? Boolean(settings.provider.secretId.trim() && (settings.provider.secretKey.trim() || settings.provider.hasSecretKey))
    : Boolean(settings.provider.apiKey.trim() || settings.provider.hasApiKey);

  async function handleSave() {
    if (!desktopAvailable) {
      setStatusMessage('当前环境无法保存本地设置。');
      return;
    }

    setIsSaving(true);
    setStatusMessage('正在保存本地设置...');

    try {
      const result = await desktopClient.saveSettings({
        shortcut: settings.shortcut.trim(),
        defaultTargetLang: settings.defaultTargetLang,
        provider: isTencentProvider
          ? {
              kind: 'tencent',
              secretId: settings.provider.secretId.trim() || undefined,
              secretKey: settings.provider.secretKey.trim() || undefined,
              region: settings.provider.region.trim(),
              projectId: settings.provider.projectId.trim() || '0',
            }
          : {
              kind: 'openai-compatible',
              baseUrl: settings.provider.baseUrl.trim(),
              model: settings.provider.model.trim(),
              apiKey: settings.provider.apiKey.trim() || undefined,
            },
      });

      if (!result) {
        throw new Error('save-settings 返回了空结果');
      }

      const providerConfigResponse = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `provider-${result.provider.kind}`,
          kind: getEditableProviderKind(result.provider.kind),
          label: activePreset.label,
          enabled: true,
          baseUrl: result.provider.baseUrl,
          model: result.provider.model,
          apiKeyMasked: result.provider.kind === 'tencent' ? result.provider.secretKeyMasked : result.provider.apiKeyMasked,
          hasApiKey: result.provider.kind === 'tencent' ? (result.provider.hasSecretKey ?? result.provider.hasApiKey) : result.provider.hasApiKey,
          supportsVision: result.provider.kind !== 'tencent',
        }),
      });

      if (!providerConfigResponse.ok) {
        const providerPayload = await providerConfigResponse.json().catch(() => null);
        throw new Error(providerPayload?.message ?? providerPayload?.code ?? '本地设置已保存，但服务元数据同步失败。');
      }

      const nextState: SettingsState = {
        shortcut: result.shortcut,
        defaultTargetLang: result.defaultTargetLang,
        runtimeMode: result.runtimeMode,
        runtimeStatus: result.runtimeMode === 'real' ? 'ready' : 'mock-fallback',
        providerPreset: settings.providerPreset,
        provider: {
          kind: getEditableProviderKind(result.provider.kind),
          baseUrl: result.provider.baseUrl,
          model: result.provider.model,
          apiKey: '',
          apiKeyMasked: result.provider.apiKeyMasked,
          hasApiKey: result.provider.hasApiKey,
          secretId: result.provider.secretId ?? settings.provider.secretId,
          secretKey: '',
          secretKeyMasked: result.provider.secretKeyMasked,
          hasSecretKey: result.provider.hasSecretKey ?? false,
          region: result.provider.region ?? settings.provider.region,
          projectId: result.provider.projectId ?? settings.provider.projectId,
        },
      };

      setSettings(nextState);
      setStatusMessage(result.runtimeMode === 'real' ? '配置已保存，真实服务已就绪。' : '配置已保存，但运行时仍处于模拟模式。');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!desktopAvailable) {
      setConnectionMessage('浏览器预览无法测试本地服务连接。');
      return;
    }

    setIsTesting(true);
    setConnectionMessage('正在测试连接...');

    try {
      const result = await desktopClient.testProviderConnection({
        kind: settings.provider.kind,
        baseUrl: settings.provider.baseUrl.trim(),
        model: settings.provider.model.trim(),
        apiKey: settings.provider.apiKey.trim() || undefined,
        secretId: settings.provider.secretId.trim() || undefined,
        secretKey: settings.provider.secretKey.trim() || undefined,
        region: settings.provider.region.trim(),
        projectId: settings.provider.projectId.trim() || '0',
      });

      const nextRuntimeStatus: SettingsState['runtimeStatus'] = result?.runtimeMode === 'real'
        ? 'ready'
        : !isTencentProvider && (!settings.provider.baseUrl.trim() || !settings.provider.model.trim())
          ? 'model-missing'
          : hasFilledCredential || isLocalProvider
            ? 'mock-fallback'
            : 'api-key-missing';

      setConnectionMessage(result?.message ?? '连接测试失败。');
      setSettings((current) => ({
        ...current,
        runtimeMode: result?.runtimeMode ?? current.runtimeMode,
        runtimeStatus: nextRuntimeStatus,
        provider: {
          ...current.provider,
          hasApiKey: hasFilledCredential,
          hasSecretKey: isTencentProvider ? hasFilledCredential : current.provider.hasSecretKey,
          apiKeyMasked: !isTencentProvider && hasFilledCredential
            ? current.provider.apiKeyMasked ?? '已在当前表单中填写'
            : current.provider.apiKeyMasked,
          secretKeyMasked: isTencentProvider && hasFilledCredential
            ? current.provider.secretKeyMasked ?? '已在当前表单中填写'
            : current.provider.secretKeyMasked,
        },
      }));
    } catch {
      setConnectionMessage('连接测试失败，请检查网络或服务配置。');
    } finally {
      setIsTesting(false);
    }
  }

  function renderProviderSection() {
    return (
      <PanelCard
        title='翻译服务'
        description={undefined}
        action={
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <StatusBadge label={settings.runtimeStatus === 'ready' ? '已可用' : desktopAvailable ? '待测试' : '预览中'} tone={settings.runtimeStatus === 'ready' ? 'success' : 'neutral'} />
            <StatusBadge label={hasFilledCredential ? '凭证已填' : '待填凭证'} tone={hasFilledCredential ? 'success' : 'warning'} />
            <Button
              variant='secondary'
              onClick={() => void handleTestConnection()}
              disabled={isHydrating || isTesting || !desktopAvailable}
              className='h-9 rounded-[11px] border-[#d5e9df] bg-[#effcf5] px-3 text-[#0f6f4e] hover:border-[#bfe8d7] hover:bg-[#e5f8ef]'
            >
              <BoltIcon />
              {isTesting ? '测试中' : '测试连接'}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={isHydrating || isSaving || !desktopAvailable}
              className='h-9 rounded-[11px] border-[#11a36f] bg-[#11a36f] px-3 text-white hover:border-[#0d875c] hover:bg-[#0d875c]'
            >
              <SaveIcon />
              {isSaving ? '保存中' : '保存设置'}
            </Button>
          </div>
        }
      >
        <div className='space-y-3'>
          <div className='rounded-[14px] border border-[#e2e8ee] bg-[#f8fbf9] px-3 py-2.5'>
            <div className='flex items-center justify-between gap-3 text-[13px] font-semibold text-[#1f252c]'>
              <span>{getProviderDisplayName(settings)}</span>
              <span className={clsx('h-2.5 w-2.5 rounded-full', runtimeTone.dot)} />
            </div>
            <div className='mt-0.5 text-[12px] leading-5 text-[#6f7783]'>{getProviderSummaryText(settings)}</div>
          </div>

          <div className='grid gap-2 grid-cols-2 xl:grid-cols-4'>
            {providerPresetOptions.map((option) => {
              const active = settings.providerPreset === option.value;

              return (
                <button
                  key={option.value}
                  type='button'
                  disabled={formDisabled}
                  onClick={() => {
                    setSettings((current) => ({
                      ...current,
                      providerPreset: option.value,
                      provider: {
                        ...current.provider,
                        kind: option.kind,
                        baseUrl: option.value === 'custom' ? current.provider.baseUrl : option.baseUrl,
                        model: option.value === 'custom' ? current.provider.model : option.model,
                        region: option.kind === 'tencent' ? (current.provider.region || 'ap-beijing') : current.provider.region,
                        projectId: option.kind === 'tencent' ? (current.provider.projectId || '0') : current.provider.projectId,
                      },
                    }));
                  }}
                  className={clsx(
                    'rounded-[14px] border px-3 py-2.5 text-left transition',
                    active
                      ? 'border-[#1ca36f] bg-[#effcf5]'
                      : 'border-[#d9e1e8] bg-white hover:border-[#c9d5e0] hover:bg-[#fbfcfd]',
                  )}
                >
                  <div className='flex items-center justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='text-[14px] font-semibold text-[#1f252c]'>{option.label}</div>
                      <div className='mt-0.5 text-[11px] text-[#6e7784]'>{option.badge}</div>
                    </div>
                    {active ? <StatusBadge label='当前' tone='success' /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className='space-y-3'>
            <div>
              {isTencentProvider ? (
                <div className='grid gap-3 md:grid-cols-2'>
                  <div className='rounded-[16px] border border-[#dce5ec] bg-[#fbfcfe] p-4 md:col-span-2'>
                    <div className='mb-3 text-[14px] font-semibold text-[#1f252c]'>腾讯云参数</div>
                    <div className='grid gap-3 md:grid-cols-2'>
                      <FieldBlock label='SecretId'>
                        <Input
                          id='provider-secret-id'
                          name='provider-secret-id'
                          autoComplete='off'
                          spellCheck={false}
                          value={settings.provider.secretId}
                          disabled={formDisabled}
                          onChange={(event) => setSettings((current) => ({
                            ...current,
                            provider: { ...current.provider, secretId: event.target.value },
                          }))}
                          placeholder='输入腾讯云 SecretId'
                          className='h-10 rounded-[12px] border-[#d7dbe2]'
                        />
                      </FieldBlock>

                      <FieldBlock label='SecretKey'>
                        <div className={inputShellClassName}>
                          <input
                            id='provider-secret-key'
                            name='provider-secret-key'
                            type={showApiKey ? 'text' : 'password'}
                            autoComplete='new-password'
                            spellCheck={false}
                            value={settings.provider.secretKey}
                            disabled={formDisabled}
                            onChange={(event) => setSettings((current) => ({
                              ...current,
                              provider: { ...current.provider, secretKey: event.target.value },
                            }))}
                              placeholder={settings.provider.secretKeyMasked ?? '输入腾讯云 SecretKey'}
                            className='h-full min-h-10 flex-1 border-0 bg-transparent text-[14px] text-[#2f3541] outline-none placeholder:text-[#8f95a0]'
                          />
                          <button
                            type='button'
                            onClick={() => setShowApiKey((current) => !current)}
                            className='inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#98a0ab] transition hover:bg-[#f5f7f9] hover:text-[#4d5560]'
                            aria-label={showApiKey ? '隐藏 SecretKey' : '显示 SecretKey'}
                          >
                            <EyeIcon open={showApiKey} />
                          </button>
                        </div>
                      </FieldBlock>

                      <FieldBlock label='Region'>
                        <Input
                          id='provider-region'
                          name='provider-region'
                          autoComplete='off'
                          spellCheck={false}
                          value={settings.provider.region}
                          disabled={formDisabled}
                          onChange={(event) => setSettings((current) => ({
                            ...current,
                            provider: { ...current.provider, region: event.target.value },
                          }))}
                          placeholder='ap-beijing'
                          className='h-10 rounded-[12px] border-[#d7dbe2]'
                        />
                      </FieldBlock>

                      <FieldBlock label='ProjectId'>
                        <Input
                          id='provider-project-id'
                          name='provider-project-id'
                          autoComplete='off'
                          inputMode='numeric'
                          value={settings.provider.projectId}
                          disabled={formDisabled}
                          onChange={(event) => setSettings((current) => ({
                            ...current,
                            provider: { ...current.provider, projectId: event.target.value },
                          }))}
                          placeholder='0'
                          className='h-10 rounded-[12px] border-[#d7dbe2]'
                        />
                      </FieldBlock>
                    </div>
                  </div>
                </div>
              ) : (
                <div className='rounded-[16px] border border-[#dce5ec] bg-[#fbfcfe] p-4'>
                  <div className='mb-3 text-[14px] font-semibold text-[#1f252c]'>兼容接口参数</div>
                  <div className='grid gap-3 md:grid-cols-2'>
                    <FieldBlock label='服务地址'>
                        <Input
                          id='provider-base-url'
                          name='provider-base-url'
                          autoComplete='url'
                          spellCheck={false}
                          value={settings.provider.baseUrl}
                          disabled={formDisabled}
                          onChange={(event) => setSettings((current) => ({
                            ...current,
                            providerPreset: 'custom',
                            provider: { ...current.provider, kind: 'openai-compatible', baseUrl: event.target.value },
                          }))}
                          className='h-10 rounded-[12px] border-[#d7dbe2]'
                        />
                      </FieldBlock>

                      <FieldBlock label='模型名称'>
                        <Input
                          id='provider-model'
                          name='provider-model'
                          autoComplete='off'
                          spellCheck={false}
                          value={settings.provider.model}
                          disabled={formDisabled}
                          onChange={(event) => setSettings((current) => ({
                            ...current,
                            providerPreset: 'custom',
                            provider: { ...current.provider, kind: 'openai-compatible', model: event.target.value },
                          }))}
                          className='h-10 rounded-[12px] border-[#d7dbe2]'
                        />
                      </FieldBlock>

                    <div className='md:col-span-2'>
                      <FieldBlock label={isLocalProvider ? 'API Key（本地可选）' : 'API Key'}>
                        <div className={inputShellClassName}>
                          <input
                            id='provider-api-key'
                            name='provider-api-key'
                            type={showApiKey ? 'text' : 'password'}
                            autoComplete='new-password'
                            spellCheck={false}
                            value={settings.provider.apiKey}
                            disabled={formDisabled}
                            onChange={(event) => setSettings((current) => ({
                              ...current,
                              provider: { ...current.provider, apiKey: event.target.value },
                            }))}
                            placeholder={settings.provider.apiKeyMasked ?? '输入 API Key'}
                            className='h-full min-h-10 flex-1 border-0 bg-transparent text-[14px] text-[#2f3541] outline-none placeholder:text-[#8f95a0]'
                          />
                          <button
                            type='button'
                            onClick={() => setShowApiKey((current) => !current)}
                            className='inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#98a0ab] transition hover:bg-[#f5f7f9] hover:text-[#4d5560]'
                            aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                          >
                            <EyeIcon open={showApiKey} />
                          </button>
                        </div>
                      </FieldBlock>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className='grid gap-2 md:grid-cols-[auto_1fr] md:items-center'>
              <div className='flex flex-wrap gap-2'>
                <StatusBadge label={getProviderCredentialLabel(settings)} tone={hasFilledCredential ? 'success' : 'warning'} />
                <StatusBadge label={getRuntimeStatusText(settings.runtimeStatus, settings.runtimeMode)} tone={settings.runtimeStatus === 'ready' ? 'success' : 'neutral'} />
              </div>
              <div className='text-[12px] leading-5 text-[#6f7783]'>{connectionMessage}</div>
            </div>
          </div>
        </div>
      </PanelCard>
    );
  }

  function renderGeneralSection() {
    return (
      <PanelCard
        title='常用偏好'
        description={undefined}
        action={<StatusBadge label={getSurfaceLabel(desktopAvailable)} tone='neutral' />}
      >
        <div className='space-y-3'>
          <FieldBlock label='默认目标语言'>
            <select
              id='default-target-language'
              name='default-target-language'
              value={settings.defaultTargetLang}
              disabled={formDisabled}
              onChange={(event) => setSettings((current) => ({ ...current, defaultTargetLang: event.target.value }))}
              className={selectClassName}
            >
              {targetLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FieldBlock>

          <FieldBlock label='全局快捷键'>
            <Input
              id='global-shortcut'
              name='global-shortcut'
              autoComplete='off'
              spellCheck={false}
              value={settings.shortcut}
              disabled={formDisabled}
              onChange={(event) => setSettings((current) => ({ ...current, shortcut: event.target.value }))}
              className='h-10 rounded-[12px] border-[#d7dbe2]'
            />
          </FieldBlock>

          <div className='flex flex-wrap gap-1.5'>
            {shortcutSuggestions.map((shortcut) => (
              <button
                key={shortcut}
                type='button'
                onClick={() => setSettings((current) => ({ ...current, shortcut }))}
                className={clsx(
                  'rounded-[10px] border px-2.5 py-1 text-[11px] font-medium transition',
                  settings.shortcut === shortcut
                    ? 'border-[#1ca36f] bg-[#effcf5] text-[#0f6f4e]'
                    : 'border-[#d9e1e8] bg-white text-[#596574] hover:bg-[#f7faf9]',
                )}
              >
                {shortcut}
              </button>
            ))}
          </div>
        </div>
      </PanelCard>
    );
  }

  function renderOcrSection() {
    return (
      <PanelCard
        title='截图识别'
        description={undefined}
        action={<StatusBadge label={activeOcrOption.badge} tone={captureOcrEngine === 'local-paddleocr' ? 'success' : 'neutral'} />}
      >
        <div className='space-y-3'>
          <div className='grid grid-cols-2 gap-2'>
            {screenshotOcrOptions.map((option) => {
              const active = captureOcrEngine === option.value;

              return (
                <button
                  key={option.value}
                  type='button'
                  onClick={() => setCaptureOcrEngine(option.value)}
                  className={clsx(
                    'rounded-[14px] border px-3 py-2.5 text-left transition',
                    active
                      ? 'border-[#1ca36f] bg-[#effcf5]'
                      : 'border-[#d9e1e8] bg-white hover:border-[#c9d5e0] hover:bg-[#fbfcfd]',
                  )}
                >
                  <div className='flex items-center justify-between gap-3'>
                    <div>
                      <div className='text-[13px] font-semibold text-[#1f252c]'>{option.label}</div>
                      <div className='mt-0.5 text-[11px] text-[#6f7783]'>{option.badge}</div>
                    </div>
                    {active ? <StatusBadge label='当前' tone='success' /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className='space-y-3'>
              {isLocalScreenshotOcrEngine(captureOcrEngine) ? (
                <div className='rounded-[16px] border border-[#dce5ec] bg-[#fbfcfe] p-4'>
                  <FieldBlock label='本地 OCR 地址'>
                    <Input
                      id='local-ocr-endpoint'
                      name='local-ocr-endpoint'
                      autoComplete='url'
                      spellCheck={false}
                      value={captureLocalOcrEndpoint}
                      onChange={(event) => setCaptureLocalOcrEndpoint(event.target.value)}
                      placeholder={DEFAULT_LOCAL_OCR_ENDPOINT}
                      className='h-10 rounded-[12px] border-[#d7dbe2]'
                    />
                  </FieldBlock>
                </div>
              ) : (
                <NoticeCard tone='neutral' title='云端视觉' message='云端视觉会直接复用当前翻译服务；如果当前模型不支持图片输入，截图识别就会失败。' />
              )}
              <div className='text-[12px] leading-5 text-[#6f7783]'>
                {getOcrCompatibilityMessage(settings, captureOcrEngine, normalizedCaptureLocalOcrEndpoint)}
              </div>
          </div>
        </div>
      </PanelCard>
    );
  }

  function renderSectionContent() {
    switch (activeSection) {
      case 'general':
        return renderGeneralSection();
      case 'ocr':
        return renderOcrSection();
      case 'providers':
      default:
        return renderProviderSection();
    }
  }

  return (
    <AppShell title='设置' contentClassName='!p-0'>
      <div className='bg-[#f4f7fb] md:h-full md:overflow-hidden'>
        <div
          className='mx-auto flex min-h-full max-w-[1320px] flex-col gap-3 px-3 py-3 md:h-full'
          style={
            viewportScale < 1
              ? {
                  transform: `scale(${viewportScale})`,
                  transformOrigin: 'top left',
                  width: `${100 / viewportScale}%`,
                  height: `${100 / viewportScale}%`,
                }
              : undefined
          }
        >
          <section className='rounded-[20px] border border-[#d9e1e8] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <div className='mr-2 text-[22px] font-semibold tracking-[-0.04em] text-[#1b2128]'>设置</div>
              <StatusBadge label={getSurfaceLabel(desktopAvailable)} tone='neutral' />
              <StatusBadge label={getRuntimeStatusText(settings.runtimeStatus, settings.runtimeMode)} tone={settings.runtimeStatus === 'ready' ? 'success' : 'neutral'} />
              <StatusBadge label={activeOcrOption.label} tone='neutral' />
            </div>
          </section>

          <section className='rounded-[18px] border border-[#d9e1e8] bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.04)]'>
            <div className='grid gap-2 md:grid-cols-3'>
              {sectionItems.map((section) => {
                const active = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type='button'
                    onClick={() => setActiveSection(section.id)}
                    className={clsx(
                      'flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition',
                      active ? 'bg-[#effcf5] text-[#0f6f4e]' : 'bg-[#f7f9fb] text-[#5b6775] hover:bg-[#eef3f8]',
                    )}
                  >
                    <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px]', active ? 'bg-white' : 'bg-white/80')}>
                      {getSectionIcon(section.id)}
                    </span>
                    <span className='min-w-0'>
                      <span className='block text-[13px] font-semibold'>{section.label}</span>
                      <span className='block text-[11px] text-inherit/75'>{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {!desktopAvailable && activeSection === 'providers' ? <NoticeCard tone='warning' title='当前是浏览器预览' message={getBrowserPreviewStatusMessage(settings.runtimeStatus)} /> : null}

          <section className='min-h-0 flex-1'>{renderSectionContent()}</section>
        </div>
      </div>
    </AppShell>
  );
}
