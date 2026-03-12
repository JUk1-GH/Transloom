'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { OverlayDocument, WorkspaceDraftState } from '@/domain/capture/types';
import { TranslationOverlay } from '@/components/overlay/TranslationOverlay';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { desktopClient } from '@/lib/ipc/desktop-client';

type RuntimeSnapshot = {
  runtimeMode: 'real' | 'mock';
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  provider?: {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  };
};

type ProviderOption = {
  id: string;
  label: string;
  kind: string;
  enabled: boolean;
};

const languageOptions = [
  { value: '', label: '检测语言' },
  { value: 'en', label: '英语' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
];

const fallbackProviders: ProviderOption[] = [
  { id: 'openai-compatible', label: '当前服务', kind: 'openai-compatible', enabled: true },
];

const selectClassName = 'h-9 rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-sm text-[#111111] outline-none transition focus:border-[#8cb3f5]';

export function TextTranslationWorkspace({
  hero,
  sidebarBottom,
  initialSource = '',
  workspaceDraft,
  capture,
}: {
  hero?: ReactNode;
  sidebarBottom?: ReactNode;
  initialSource?: string;
  workspaceDraft?: WorkspaceDraftState | null;
  capture?: {
    message: string;
    overlay: OverlayDocument | null;
    isLoading: boolean;
    latestCapturePath: string | null;
    onOpenCapture: () => void;
    onRetranslateLatest: () => void;
    onPreviewMockOverlay?: () => void;
    actionDisabledReason?: string | null;
    desktopAvailable: boolean;
  };
}) {
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>(fallbackProviders);
  const [selectedProviderId, setSelectedProviderId] = useState('openai-compatible');
  const [source, setSource] = useState(initialSource);
  const [sourceLang, setSourceLang] = useState('');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [translatedText, setTranslatedText] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [charactersBilled, setCharactersBilled] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);

      try {
        if (desktopClient.isAvailable()) {
          const [nextRuntime, savedSettings, nextProviders, nextWorkspaceDraft] = await Promise.all([
            desktopClient.getRuntimeMode(),
            desktopClient.getSettings(),
            fetch('/api/providers', { cache: 'no-store' }).then((response) => response.json()).catch(() => []),
            desktopClient.getWorkspaceDraft(),
          ]);

          if (cancelled) {
            return;
          }

          if (nextRuntime) {
            setRuntime(nextRuntime);
          }

          if (Array.isArray(nextProviders) && nextProviders.length > 0) {
            const normalizedProviders = nextProviders.map((item) => ({
              id: item.id ?? item.kind,
              label: item.kind === 'openai-compatible' ? '当前服务' : (item.label ?? item.kind),
              kind: item.kind,
              enabled: Boolean(item.enabled),
            }));
            setProviderOptions(normalizedProviders);
            setSelectedProviderId(normalizedProviders.find((item) => item.enabled)?.kind ?? normalizedProviders[0]?.kind ?? 'openai-compatible');
          }

          if (savedSettings?.defaultTargetLang) {
            setTargetLang(savedSettings.defaultTargetLang);
          }

          if (nextWorkspaceDraft) {
            applyWorkspaceDraft(nextWorkspaceDraft);
          }
        } else {
          const [nextRuntime, nextProviders] = await Promise.all([
            fetch('/api/provider-runtime', { cache: 'no-store' }).then((response) => response.json()),
            fetch('/api/providers', { cache: 'no-store' }).then((response) => response.json()).catch(() => []),
          ]);

          if (cancelled) {
            return;
          }

          setRuntime(nextRuntime);

          if (Array.isArray(nextProviders) && nextProviders.length > 0) {
            const normalizedProviders = nextProviders.map((item) => ({
              id: item.id ?? item.kind,
              label: item.kind === 'openai-compatible' ? '当前服务' : (item.label ?? item.kind),
              kind: item.kind,
              enabled: Boolean(item.enabled),
            }));
            setProviderOptions(normalizedProviders);
            setSelectedProviderId(normalizedProviders.find((item) => item.enabled)?.kind ?? normalizedProviders[0]?.kind ?? 'openai-compatible');
          }
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : '读取运行时配置失败。');
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceCharacters = useMemo(() => source.trim().length, [source]);
  const selectedProvider = providerOptions.find((item) => item.kind === selectedProviderId) ?? fallbackProviders[0];
  const runtimeBanner = isBootstrapping
    ? {
        title: '正在读取翻译运行时',
        detail: '马上就能确认当前 provider、模型和 API Key 状态。',
      }
    : runtime?.runtimeMode === 'mock'
      ? {
          title: '当前是 Mock 模式',
          detail: '现在更适合确认界面和链路，真实翻译前请补齐 provider 配置。',
        }
      : runtime?.hasApiKey
        ? {
            title: '翻译引擎已就绪',
            detail: `正在使用 ${runtime?.model ?? '已配置模型'} 处理请求。`,
          }
        : {
            title: '已连接 provider，但还缺 API Key',
            detail: '补齐密钥后就能直接开始真实翻译。',
          };
  const runtimeModeLabel = isBootstrapping ? '读取中' : runtime?.runtimeMode === 'real' ? 'Real' : 'Mock';
  const translateDisabledReason = isBootstrapping
    ? '正在读取运行时配置。'
    : isLoading
      ? '翻译请求正在进行中。'
      : !source.trim()
        ? '请先输入要翻译的文本。'
        : null;

  function applyWorkspaceDraft(draft: WorkspaceDraftState) {
    setSource(draft.sourceText);
    setTranslatedText(draft.translatedText ?? '');
    setTargetLang(draft.targetLang);
    setSourceLang(draft.sourceLang ?? '');
    setWarning(draft.warning ?? null);
    setError(null);
  }

  useEffect(() => {
    if (!desktopClient.isAvailable()) {
      return;
    }

    const dispose = desktopClient.onWorkspaceDraftUpdated((draft) => {
      applyWorkspaceDraft(draft);
    });

    return () => {
      dispose();
    };
  }, []);

  useEffect(() => {
    if (workspaceDraft) {
      applyWorkspaceDraft(workspaceDraft);
    }
  }, [workspaceDraft]);

  function handleSwapLanguages() {
    if (!sourceLang || !targetLang) {
      return;
    }

    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSource(translatedText || source);
    setTranslatedText(source);
    setError(null);
    setWarning(null);
  }

  async function handleTranslate() {
    if (!source.trim()) {
      setTranslatedText('');
      setCharactersBilled(null);
      setWarning(null);
      setError('请输入要翻译的文本。');
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);

    try {
      const providerSecret = desktopClient.isAvailable() ? await desktopClient.getProviderSecret() : undefined;
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: source.trim(),
          sourceLang: sourceLang || undefined,
          targetLang,
          providerId: selectedProviderId,
          providerConfig: selectedProviderId === 'openai-compatible'
            ? {
                baseUrl: providerSecret?.baseUrl ?? runtime?.provider?.baseUrl,
                model: providerSecret?.model ?? runtime?.provider?.model,
                apiKey: providerSecret?.apiKey ?? undefined,
              }
            : undefined,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? result.code ?? '翻译失败');
      }

      setTranslatedText(result.text ?? '');
      setWarning(result.warning ?? null);
      setCharactersBilled(result.charactersBilled ?? null);
    } catch (translateError) {
      setTranslatedText('');
      setCharactersBilled(null);
      setError(translateError instanceof Error ? translateError.message : '翻译失败');
    } finally {
      setIsLoading(false);
    }
  }

  const statusMessage = error ?? warning ?? runtimeBanner.detail;
  const statusTone = error ? 'text-[#a45322]' : warning ? 'text-[#8c6b12]' : 'text-[#5a5a5a]';

  return (
    <div className='space-y-4'>
      {hero}

      {capture ? (
        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6] px-4 py-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-medium text-[#111111]'>截图翻译</span>
            <span className='text-sm text-[#666666]'>{capture.message}</span>
            <div className='ml-auto flex flex-wrap gap-2'>
              <Button variant='secondary' size='sm' onClick={capture.onOpenCapture}>开始截图</Button>
              <Button variant='secondary' size='sm' onClick={capture.onRetranslateLatest} disabled={!capture.latestCapturePath || capture.isLoading}>重新翻译最近截图</Button>
              {!capture.desktopAvailable && capture.onPreviewMockOverlay ? (
                <Button variant='secondary' size='sm' onClick={capture.onPreviewMockOverlay}>预览 Mock</Button>
              ) : null}
            </div>
          </div>
          {capture.actionDisabledReason ? (
            <div className='mt-3 rounded-[10px] border border-[#e3d7b6] bg-[#fbf7ec] px-3 py-2 text-sm text-[#7a6931]'>
              {capture.actionDisabledReason}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className='overflow-hidden rounded-[16px] border border-[#d2d2d2] bg-[#f6f6f6]'>
        <div className='flex flex-wrap items-center gap-2 border-b border-[#d9d9d9] bg-[#efefef] px-4 py-3'>
          <select aria-label='Source language' value={sourceLang} onChange={(event) => setSourceLang(event.target.value)} className={selectClassName}>
            {languageOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <Button variant='ghost' className='h-9 rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[#4d4d4d]' onClick={handleSwapLanguages} disabled={!sourceLang || !targetLang}>
            ⇄
          </Button>

          <select aria-label='Target language' value={targetLang} onChange={(event) => setTargetLang(event.target.value)} className={selectClassName}>
            {languageOptions.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <span className='hidden text-xs text-[#666666] lg:inline'>
              {selectedProvider.label} · {runtime?.model ?? '未配置模型'} · {runtimeModeLabel}
            </span>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => {
                setSource('');
                setTranslatedText('');
                setError(null);
                setWarning(null);
                setCharactersBilled(null);
              }}
            >
              清空
            </Button>
            <Button size='sm' onClick={() => void handleTranslate()} disabled={Boolean(translateDisabledReason)}>
              {isLoading ? '翻译中...' : '翻译'}
            </Button>
          </div>
        </div>

        <div className='grid min-h-[640px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]'>
          <div className='flex min-h-[320px] flex-col bg-[#f8f8f8]'>
            <div className='flex items-center justify-between border-b border-[#dddddd] px-5 py-3'>
              <span className='text-sm font-medium text-[#2a2a2a]'>原文</span>
              <span className='text-xs text-[#7a7a7a]'>{sourceCharacters} 字</span>
            </div>
            <div className='flex-1 px-5 py-4'>
              <Textarea
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className='min-h-[520px] resize-none border-0 bg-transparent px-0 py-0 text-[17px] leading-8 text-[#161616] shadow-none focus:border-0'
                placeholder='输入或粘贴文本以开始翻译。'
              />
            </div>
          </div>

          <div className='hidden bg-[#d6d6d6] md:block' />

          <div className='flex min-h-[320px] flex-col bg-[#fbfbfb]'>
            <div className='flex items-center justify-between border-t border-[#dddddd] px-5 py-3 md:border-t-0 md:border-b'>
              <span className='text-sm font-medium text-[#2a2a2a]'>译文</span>
              <span className='text-xs text-[#7a7a7a]'>{charactersBilled ?? 0} 计费字符</span>
            </div>
            <div className='flex-1 px-5 py-4'>
              <div
                className={clsx(
                  'min-h-[520px] whitespace-pre-wrap break-words text-[17px] leading-8',
                  translatedText ? 'text-[#161616]' : 'text-[#9c9c9c]',
                )}
              >
                {translatedText || '译文会显示在右侧。'}
              </div>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-3 border-t border-[#d9d9d9] bg-[#efefef] px-4 py-3 text-xs text-[#666666]'>
          <div className='flex flex-wrap gap-x-4 gap-y-2'>
            <span>{runtimeBanner.title}</span>
            <span>Provider：{selectedProvider.label}</span>
            <span>模式：{runtimeModeLabel}</span>
            <span>目标语言：{languageOptions.find((option) => option.value === targetLang)?.label ?? targetLang}</span>
          </div>
          <div className={clsx('max-w-full text-right', statusTone)}>
            {statusMessage}
          </div>
        </div>
      </section>

      {capture?.overlay ? (
        <section className='overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3'>
            <div className='text-[15px] font-medium text-[#111111]'>最近截图结果</div>
          </div>
          <div className='p-4'>
            <TranslationOverlay overlay={capture.overlay} />
          </div>
        </section>
      ) : null}

      {sidebarBottom}
    </div>
  );
}
