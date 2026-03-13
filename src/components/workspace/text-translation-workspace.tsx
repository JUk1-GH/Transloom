'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { OverlayDocument, WorkspaceDraftState } from '@/domain/capture/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { desktopClient } from '@/lib/ipc/desktop-client';

type GlossarySummary = {
  id: string;
  name: string;
  entries: number;
  sourceLang: string;
  targetLang: string;
  updatedAt: string;
};

type RuntimeSnapshot = {
  runtimeMode: 'real' | 'mock';
  status?: 'ready' | 'provider-missing' | 'model-missing' | 'api-key-missing' | 'mock-fallback';
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  provider?: {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    enabled?: boolean;
    label?: string;
  };
};

type ProviderOption = {
  id: string;
  label: string;
  kind: string;
  enabled: boolean;
};

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return {
    message: text.trim() || `接口返回了 ${response.status}，但没有可读取的 JSON 内容。`,
  };
}

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

function getRuntimeModeLabel(isBootstrapping: boolean, runtimeMode?: 'real' | 'mock') {
  if (isBootstrapping) {
    return runtimeMode === 'real' ? '正在确认真实模式' : '正在确认 Mock 模式';
  }

  return runtimeMode === 'real' ? '真实模式' : 'Mock 模式';
}

function getModelStatusLabel(isBootstrapping: boolean, model?: string | null) {
  if (isBootstrapping) {
    return '正在读取模型';
  }

  return model ?? '未配置模型';
}

function normalizeLanguage(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function pickGlossaryForLanguages(options: GlossarySummary[], sourceLang: string, targetLang: string) {
  const normalizedSource = normalizeLanguage(sourceLang);
  const normalizedTarget = normalizeLanguage(targetLang);

  return options.find((option) => {
    const optionTarget = normalizeLanguage(option.targetLang);
    if (optionTarget !== normalizedTarget) {
      return false;
    }

    const optionSource = normalizeLanguage(option.sourceLang);
    return !normalizedSource || optionSource === normalizedSource;
  }) ?? null;
}

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
  const [glossaryOptions, setGlossaryOptions] = useState<GlossarySummary[]>([]);
  const [selectedGlossaryId, setSelectedGlossaryId] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translationMode, setTranslationMode] = useState<'real' | 'mock' | null>(null);
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
          const [nextRuntime, savedSettings, nextProviders, nextWorkspaceDraft, glossaryPayload] = await Promise.all([
            desktopClient.getRuntimeMode(),
            desktopClient.getSettings(),
            fetch('/api/providers', { cache: 'no-store' }).then((response) => response.json()).catch(() => []),
            desktopClient.getWorkspaceDraft(),
            fetch('/api/glossary', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ summaries: [] })),
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

          if (Array.isArray(glossaryPayload?.summaries)) {
            setGlossaryOptions(glossaryPayload.summaries);
            const preferredGlossary = pickGlossaryForLanguages(
              glossaryPayload.summaries,
              nextWorkspaceDraft?.sourceLang ?? '',
              savedSettings?.defaultTargetLang ?? 'zh-CN',
            );
            setSelectedGlossaryId(preferredGlossary?.id ?? glossaryPayload.summaries[0]?.id ?? '');
          }

          if (nextWorkspaceDraft) {
            applyWorkspaceDraft(nextWorkspaceDraft);
          }
        } else {
          const [nextRuntime, nextProviders, glossaryPayload] = await Promise.all([
            fetch('/api/provider-runtime', { cache: 'no-store' }).then((response) => response.json()),
            fetch('/api/providers', { cache: 'no-store' }).then((response) => response.json()).catch(() => []),
            fetch('/api/glossary', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({ summaries: [] })),
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

          if (Array.isArray(glossaryPayload?.summaries)) {
            setGlossaryOptions(glossaryPayload.summaries);
            const preferredGlossary = pickGlossaryForLanguages(glossaryPayload.summaries, '', 'zh-CN');
            setSelectedGlossaryId(preferredGlossary?.id ?? glossaryPayload.summaries[0]?.id ?? '');
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
  const availableGlossaries = useMemo(() => {
    const normalizedTarget = normalizeLanguage(targetLang);
    const normalizedSource = normalizeLanguage(sourceLang);

    return glossaryOptions.filter((option) => {
      if (normalizeLanguage(option.targetLang) !== normalizedTarget) {
        return false;
      }

      const optionSource = normalizeLanguage(option.sourceLang);
      return !normalizedSource || optionSource === normalizedSource;
    });
  }, [glossaryOptions, sourceLang, targetLang]);
  const activeGlossary = glossaryOptions.find((option) => option.id === selectedGlossaryId) ?? null;
  const glossaryBadge = !glossaryOptions.length
    ? '暂无术语表'
    : activeGlossary
      ? `术语表：${activeGlossary.name}`
      : availableGlossaries.length
        ? '术语表：未启用'
        : '术语表：当前语言无匹配';
  const runtimeBanner = isBootstrapping
    ? {
        title: '正在读取翻译运行时',
        detail: '马上就能确认当前 provider、模型和 API Key 状态。',
      }
    : runtime?.status === 'provider-missing'
      ? {
          title: '还没有启用 provider',
          detail: '先在设置里启用一个服务，再决定是否切到真实翻译。',
        }
      : runtime?.status === 'model-missing'
        ? {
            title: '当前缺少模型配置',
            detail: '先补全模型名称，当前只会返回 Mock 结果用于预览链路。',
          }
        : runtime?.status === 'api-key-missing'
          ? {
              title: '当前缺少 API Key',
              detail: '先补齐密钥，当前只会返回 Mock 结果用于预览链路。',
            }
          : runtime?.runtimeMode === 'mock'
            ? {
                title: '当前是 Mock 模式',
                detail: '当前 provider 暂时回退到 Mock 结果，适合先确认界面与链路。',
              }
            : {
                title: '翻译引擎已就绪',
                detail: `正在使用 ${runtime?.model ?? '已配置模型'} 处理请求。`,
              };
  const runtimeModeLabel = getRuntimeModeLabel(isBootstrapping, runtime?.runtimeMode);
  const modelStatusLabel = getModelStatusLabel(isBootstrapping, runtime?.model);
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
    setTranslationMode(null);
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

  useEffect(() => {
    if (!glossaryOptions.length) {
      if (selectedGlossaryId) {
        setSelectedGlossaryId('');
      }
      return;
    }

    if (selectedGlossaryId === '') {
      return;
    }

    const currentSelectionStillAvailable = availableGlossaries.some((option) => option.id === selectedGlossaryId);
    if (currentSelectionStillAvailable) {
      return;
    }

    const preferredGlossary = pickGlossaryForLanguages(glossaryOptions, sourceLang, targetLang);
    setSelectedGlossaryId(preferredGlossary?.id ?? '');
  }, [availableGlossaries, glossaryOptions, selectedGlossaryId, sourceLang, targetLang]);

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
    setTranslationMode(null);

    try {
      const providerSecret = desktopClient.isAvailable() ? await desktopClient.getProviderSecret() : undefined;
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: source.trim(),
          sourceLang: sourceLang || undefined,
          targetLang,
          glossaryId: selectedGlossaryId || undefined,
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

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message ?? result.code ?? '翻译失败');
      }

      setTranslatedText(result.text ?? '');
      setTranslationMode(result.mode === 'mock' ? 'mock' : 'real');
      setWarning(result.warning ?? null);
      setCharactersBilled(result.charactersBilled ?? null);
    } catch (translateError) {
      setTranslatedText('');
      setTranslationMode(null);
      setCharactersBilled(null);
      setError(translateError instanceof Error ? translateError.message : '翻译失败');
    } finally {
      setIsLoading(false);
    }
  }

  const mockStatusDetail = runtime?.status === 'model-missing'
    ? '当前缺少模型配置，所以本次结果来自 Mock 回退。'
    : runtime?.status === 'api-key-missing'
      ? '当前缺少 API Key，所以本次结果来自 Mock 回退。'
      : runtime?.status === 'provider-missing'
        ? '当前还没有启用 provider，所以本次结果来自 Mock 回退。'
        : '当前 provider 暂时回退到 Mock 结果，适合先确认界面与链路。';
  const statusMessage = error
    ?? (translationMode === 'mock' ? mockStatusDetail : null)
    ?? warning
    ?? runtimeBanner.detail;
  const statusTone = error ? 'text-[#a45322]' : warning ? 'text-[#8c6b12]' : 'text-[#5a5a5a]';
  const providerStatus = translationMode === 'mock'
    ? '本次结果来自 Mock 回退'
    : translationMode === 'real'
      ? '本次结果来自真实 provider'
      : runtimeBanner.title;
  const shouldShowMissingProvider = !isBootstrapping && runtime?.status === 'provider-missing';
  const hasEnabledProvider = Boolean(runtime?.provider?.enabled) || providerOptions.some((item) => item.enabled);
  const providerLabel = shouldShowMissingProvider
    ? '未启用'
    : hasEnabledProvider
      ? (runtime?.provider?.label?.trim() || selectedProvider.label)
      : '未启用';

  return (
    <div className='flex h-full min-h-0 flex-col'>
      {hero ? <div className='pb-2'>{hero}</div> : null}

      <section className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#d2d2d2] bg-[#f6f6f6]'>
        <div className='flex flex-wrap items-center gap-2 border-b border-[#d9d9d9] bg-[#efefef] px-3 py-2'>
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
            {capture ? (
              <>
                <span className='hidden max-w-[220px] truncate text-xs text-[#666666] lg:inline'>
                  {capture.message}
                </span>
                {capture.desktopAvailable ? (
                  <>
                    <Button
                      variant='secondary'
                      size='sm'
                      onClick={capture.onOpenCapture}
                      disabled={Boolean(capture.actionDisabledReason)}
                    >
                      开始截图
                    </Button>
                    <Button variant='secondary' size='sm' onClick={capture.onRetranslateLatest} disabled={!capture.latestCapturePath || capture.isLoading}>
                      最近截图
                    </Button>
                  </>
                ) : capture.onPreviewMockOverlay ? (
                  <Button variant='secondary' size='sm' onClick={capture.onPreviewMockOverlay}>预览 Mock</Button>
                ) : null}
              </>
            ) : null}
            <span className='hidden text-xs text-[#666666] xl:inline'>
              {providerLabel} · {modelStatusLabel} · {runtimeModeLabel}
            </span>
            <select
              aria-label='Glossary'
              value={selectedGlossaryId}
              onChange={(event) => setSelectedGlossaryId(event.target.value)}
              className={clsx(selectClassName, 'max-w-[180px] text-xs')}
              disabled={isBootstrapping || availableGlossaries.length === 0}
            >
              <option value=''>不使用术语表</option>
              {availableGlossaries.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {option.entries} 条
                </option>
              ))}
            </select>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => {
                setSource('');
                setTranslatedText('');
                setTranslationMode(null);
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

        <div className='grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]'>
          <div className='flex min-h-[240px] min-w-0 flex-col bg-[#f8f8f8]'>
            <div className='flex items-center justify-between border-b border-[#dddddd] px-4 py-2.5'>
              <span className='text-sm font-medium text-[#2a2a2a]'>原文</span>
              <span className='text-xs text-[#7a7a7a]'>{sourceCharacters} 字</span>
            </div>
            <div className='flex-1 overflow-auto px-4 py-3'>
              <Textarea
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className='min-h-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-6 text-[#161616] shadow-none focus:border-0'
                placeholder='输入或粘贴文本以开始翻译。'
              />
            </div>
          </div>

          <div className='hidden bg-[#d6d6d6] md:block' />

          <div className='flex min-h-[240px] min-w-0 flex-col bg-[#fbfbfb]'>
            <div className='flex items-center justify-between border-t border-[#dddddd] px-4 py-2.5 md:border-t-0 md:border-b'>
              <span className='text-sm font-medium text-[#2a2a2a]'>译文</span>
              <div className='flex items-center gap-2 text-xs text-[#7a7a7a]'>
                {translationMode ? (
                  <span
                    className={clsx(
                      'rounded-full border px-2 py-1 text-[11px] font-medium',
                      translationMode === 'mock'
                        ? 'border-[#e6d9b4] bg-[#fbf6e8] text-[#8c6b12]'
                        : 'border-[#cfe2d4] bg-[#f0f8f2] text-[#2d6a3d]',
                    )}
                  >
                    {translationMode === 'mock' ? 'Mock 结果' : '真实结果'}
                  </span>
                ) : null}
                <span>{charactersBilled ?? 0} 计费字符</span>
              </div>
            </div>
            <div className='flex-1 overflow-auto px-4 py-3'>
              <div
                className={clsx(
                  'min-h-full whitespace-pre-wrap break-words rounded-[12px] px-3 py-2 text-[15px] leading-6',
                  translatedText
                    ? translationMode === 'mock'
                      ? 'border border-[#f0e1b7] bg-[#fffaf0] text-[#161616]'
                      : 'text-[#161616]'
                    : 'text-[#9c9c9c]',
                )}
              >
                {translatedText || '译文会显示在右侧。'}
              </div>
            </div>
          </div>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[#d9d9d9] bg-[#efefef] px-3 py-2 text-xs text-[#666666]'>
          <div className='flex flex-wrap gap-x-3 gap-y-1.5'>
            <span>{providerStatus}</span>
            <span>Provider：{providerLabel}</span>
            <span>模式：{runtimeModeLabel}</span>
            <span>目标语言：{languageOptions.find((option) => option.value === targetLang)?.label ?? targetLang}</span>
            <span>{glossaryBadge}</span>
          </div>
          <div className={clsx('max-w-full text-right text-[11px]', statusTone)}>
            {statusMessage}
          </div>
        </div>
      </section>

      {sidebarBottom ? <div className='pt-2'>{sidebarBottom}</div> : null}
    </div>
  );
}
