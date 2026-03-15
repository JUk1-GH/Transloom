'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { OverlayDocument, PopupTranslationState, WorkspaceDraftState } from '@/domain/capture/types';
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
    kind: string;
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    enabled?: boolean;
    label?: string;
    region?: string;
    projectId?: string;
  };
};

type ProviderOption = {
  id: string;
  label: string;
  kind: string;
  enabled: boolean;
};

type WorkspaceTab = 'text' | 'popup';
type TranslationTriggerMode = 'manual' | 'auto';

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
  { value: '', label: '自动检测' },
  { value: 'en', label: '英语' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
];

const languageLabels = Object.fromEntries(languageOptions.map((option) => [option.value, option.label]));

const fallbackProviders: ProviderOption[] = [
  { id: 'openai-compatible', label: '当前服务', kind: 'openai-compatible', enabled: true },
];

function getRuntimeModeLabel(isBootstrapping: boolean, runtimeMode?: 'real' | 'mock') {
  if (isBootstrapping) {
    return runtimeMode === 'real' ? '确认真实模式中' : '确认模拟模式中';
  }

  return runtimeMode === 'real' ? '真实模式' : '模拟模式';
}

function getModelStatusLabel(isBootstrapping: boolean, model?: string | null) {
  if (isBootstrapping) {
    return '读取模型中';
  }

  return model ?? '未配置模型';
}

function getTrustStateLabel(
  isBootstrapping: boolean,
  runtime?: RuntimeSnapshot | null,
  translationMode?: 'real' | 'mock' | null,
) {
  if (isBootstrapping) {
    return '确认运行时';
  }

  if (translationMode === 'real') {
    return '真实结果';
  }

  if (translationMode === 'mock') {
    return '模拟回退';
  }

  switch (runtime?.status) {
    case 'provider-missing':
      return '未启用服务';
    case 'model-missing':
      return '缺少模型';
    case 'api-key-missing':
      return '缺少凭证';
    case 'mock-fallback':
      return '模拟回退';
    case 'ready':
      return '真实服务';
    default:
      return runtime?.runtimeMode === 'real' ? '真实服务' : '模拟模式';
  }
}

function normalizeLanguage(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function formatElapsedTime(elapsedMs: number) {
  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  if (elapsedMs < 10_000) {
    return `${(elapsedMs / 1000).toFixed(2)}s`;
  }

  return `${(elapsedMs / 1000).toFixed(1)}s`;
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
  popup,
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
    actionDisabledReason?: string | null;
    desktopAvailable: boolean;
  };
  popup?: {
    onOpen: () => void;
    desktopAvailable: boolean;
    state?: PopupTranslationState | null;
  };
}) {
  const autoCaptureTranslateRef = useRef<string | null>(null);
  const autoTranslateArmedRef = useRef(false);
  const translationRequestIdRef = useRef(0);
  const sourceRef = useRef(initialSource);
  const translationTriggerModeRef = useRef<TranslationTriggerMode>('manual');
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>(fallbackProviders);
  const [selectedProviderId, setSelectedProviderId] = useState('openai-compatible');
  const [source, setSource] = useState(initialSource);
  const [sourceLang, setSourceLang] = useState('');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [translationTriggerMode, setTranslationTriggerMode] = useState<TranslationTriggerMode>('manual');
  const [glossaryOptions, setGlossaryOptions] = useState<GlossarySummary[]>([]);
  const [selectedGlossaryId, setSelectedGlossaryId] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translationMode, setTranslationMode] = useState<'real' | 'mock' | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [charactersBilled, setCharactersBilled] = useState<number | null>(null);
  const [ocrElapsedMs, setOcrElapsedMs] = useState<number | null>(workspaceDraft?.ocrElapsedMs ?? null);
  const [translationElapsedMs, setTranslationElapsedMs] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    workspaceDraft?.sourceType === 'popup'
      ? 'popup'
      : 'text',
  );

  const invalidatePendingTranslation = useCallback(() => {
    translationRequestIdRef.current += 1;
    setIsLoading(false);
  }, []);

  const applyWorkspaceDraft = useCallback((draft: WorkspaceDraftState) => {
    autoTranslateArmedRef.current = false;
    invalidatePendingTranslation();
    setSource(draft.sourceText);
    setTranslatedText(draft.translatedText ?? '');
    setTranslationMode(null);
    setTargetLang(draft.targetLang);
    setSourceLang(draft.sourceLang ?? '');
    setWarning(draft.warning ?? null);
    setError(null);
    setCharactersBilled(null);
    setOcrElapsedMs(draft.ocrElapsedMs ?? null);
    setTranslationElapsedMs(null);
  }, [invalidatePendingTranslation]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    translationTriggerModeRef.current = translationTriggerMode;
  }, [translationTriggerMode]);

  const syncTranslationTriggerMode = useCallback(async () => {
    if (!desktopClient.isAvailable()) {
      return;
    }

    const savedSettings = await desktopClient.getSettings();
    if (!savedSettings) {
      return;
    }

    const nextMode: TranslationTriggerMode = savedSettings.translationTriggerMode === 'auto' ? 'auto' : 'manual';
    setTranslationTriggerMode(nextMode);
    autoTranslateArmedRef.current = nextMode === 'auto'
      ? translationTriggerModeRef.current !== 'auto' && Boolean(sourceRef.current.trim())
      : false;
  }, []);

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

          const nextTriggerMode: TranslationTriggerMode = savedSettings?.translationTriggerMode === 'auto' ? 'auto' : 'manual';
          setTranslationTriggerMode(nextTriggerMode);
          autoTranslateArmedRef.current = nextTriggerMode === 'auto'
            && translationTriggerModeRef.current !== 'auto'
            && Boolean((nextWorkspaceDraft?.sourceText ?? sourceRef.current).trim());

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
  }, [applyWorkspaceDraft]);

  useEffect(() => {
    if (!desktopClient.isAvailable()) {
      return;
    }

    const handleFocus = () => {
      void syncTranslationTriggerMode();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncTranslationTriggerMode();
      }
    };

    void syncTranslationTriggerMode();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncTranslationTriggerMode]);

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
  const glossaryBadge = isBootstrapping
    ? '术语表：读取中'
    : !glossaryOptions.length
      ? '暂无术语表'
      : activeGlossary
        ? `术语表：${activeGlossary.name}`
        : availableGlossaries.length
          ? '术语表：未启用'
          : '术语表：当前语言无匹配';
  const runtimeBanner = isBootstrapping
    ? {
        title: '正在读取翻译运行时',
        detail: '即将确认翻译服务、模型和 API Key 状态。',
      }
    : runtime?.status === 'provider-missing'
      ? {
          title: '还没有启用翻译服务',
          detail: '先在设置里启用一个翻译服务，再决定是否切到真实翻译。',
        }
      : runtime?.status === 'model-missing'
        ? {
            title: '当前缺少模型配置',
            detail: '先补全模型名称，当前只会返回模拟结果用于预览链路。',
          }
        : runtime?.status === 'api-key-missing'
          ? {
              title: '当前缺少真实凭证',
              detail: '先补齐密钥或云端凭证，当前只会返回模拟结果用于预览链路。',
            }
          : runtime?.runtimeMode === 'mock'
            ? {
                title: '当前是模拟模式',
                detail: '当前服务暂时回退到模拟结果，适合先确认界面与链路。',
              }
            : {
                title: '翻译引擎已就绪',
                detail: `正在使用 ${runtime?.model ?? '已配置模型'} 处理请求。`,
              };
  const runtimeModeLabel = getRuntimeModeLabel(isBootstrapping, runtime?.runtimeMode);
  const modelStatusLabel = getModelStatusLabel(isBootstrapping, runtime?.model);
  const trustStateLabel = getTrustStateLabel(isBootstrapping, runtime, translationMode);
  const targetLanguageLabel = languageLabels[targetLang] ?? targetLang;
  const sourceLanguageLabel = languageLabels[sourceLang] ?? '自动检测';
  const translateDisabledReason = isBootstrapping
    ? '正在读取运行时配置。'
    : isLoading
      ? '翻译请求正在进行中。'
      : !source.trim()
        ? '请先输入要翻译的文本。'
        : null;

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
  }, [applyWorkspaceDraft]);

  useEffect(() => {
    if (workspaceDraft) {
      applyWorkspaceDraft(workspaceDraft);
    }
  }, [applyWorkspaceDraft, workspaceDraft]);

  useEffect(() => {
    if (workspaceDraft?.sourceType === 'popup') {
      setActiveTab('popup');
      return;
    }

    setActiveTab('text');
  }, [workspaceDraft?.sourceType, workspaceDraft?.updatedAt]);

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

    invalidatePendingTranslation();
    autoTranslateArmedRef.current = translationTriggerMode === 'auto';
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSource(translatedText || source);
    setTranslatedText(source);
    setError(null);
    setWarning(null);
  }

  const handleTranslate = useCallback(async (options?: {
    sourceText?: string;
    sourceLang?: string;
    targetLang?: string;
    glossaryId?: string;
    captureImagePath?: string;
  }) => {
    const sourceText = (options?.sourceText ?? source).trim();
    const requestedSourceLang = options?.sourceLang ?? sourceLang;
    const requestedTargetLang = options?.targetLang ?? targetLang;
    const requestedGlossaryId = options?.glossaryId ?? selectedGlossaryId;
    const captureImagePath = options?.captureImagePath
      ?? (workspaceDraft?.sourceType === 'capture' ? workspaceDraft.capture?.imagePath : undefined);

    if (!sourceText) {
      invalidatePendingTranslation();
      setTranslatedText('');
      setCharactersBilled(null);
      setWarning(null);
      setError('请输入要翻译的文本。');
      setTranslationElapsedMs(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);
    setTranslationMode(null);
    setTranslationElapsedMs(null);
    const requestId = translationRequestIdRef.current + 1;
    translationRequestIdRef.current = requestId;

    try {
      const providerSecret = desktopClient.isAvailable() ? await desktopClient.getProviderSecret() : undefined;
      const providerConfig = providerSecret && selectedProviderId === providerSecret.kind
        ? {
            kind: providerSecret.kind,
            baseUrl: providerSecret.baseUrl,
            model: providerSecret.model,
            apiKey: providerSecret.apiKey ?? undefined,
            secretId: providerSecret.secretId ?? undefined,
            secretKey: providerSecret.secretKey ?? undefined,
            region: providerSecret.region,
            projectId: providerSecret.projectId,
          }
        : undefined;
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const response = await fetch(captureImagePath ? '/api/capture/workspace-translate' : '/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(captureImagePath ? { imagePath: captureImagePath } : {}),
          text: sourceText,
          sourceLang: requestedSourceLang || undefined,
          targetLang: requestedTargetLang,
          glossaryId: requestedGlossaryId || undefined,
          providerId: selectedProviderId,
          providerConfig,
        }),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message ?? result.code ?? '翻译失败');
      }

      if (requestId !== translationRequestIdRef.current) {
        return;
      }

      setTranslatedText(result.text ?? '');
      setTranslationMode(result.mode === 'mock' ? 'mock' : 'real');
      setWarning(result.warning ?? null);
      setCharactersBilled(result.charactersBilled ?? null);
      setTranslationElapsedMs(Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)));
    } catch (translateError) {
      if (requestId !== translationRequestIdRef.current) {
        return;
      }

      setTranslatedText('');
      setTranslationMode(null);
      setCharactersBilled(null);
      setTranslationElapsedMs(null);
      setError(translateError instanceof Error ? translateError.message : '翻译失败');
    } finally {
      if (requestId === translationRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [invalidatePendingTranslation, selectedGlossaryId, selectedProviderId, source, sourceLang, targetLang, workspaceDraft?.capture?.imagePath, workspaceDraft?.sourceType]);

  useEffect(() => {
    if (isBootstrapping || !workspaceDraft || workspaceDraft.sourceType !== 'capture') {
      return;
    }

    if (!workspaceDraft.sourceText.trim() || workspaceDraft.translatedText?.trim()) {
      return;
    }

    if (autoCaptureTranslateRef.current === workspaceDraft.updatedAt) {
      return;
    }

    autoCaptureTranslateRef.current = workspaceDraft.updatedAt;

    const preferredGlossaryId = selectedGlossaryId
      || pickGlossaryForLanguages(glossaryOptions, workspaceDraft.sourceLang ?? '', workspaceDraft.targetLang)?.id
      || '';

    void handleTranslate({
      sourceText: workspaceDraft.sourceText,
      sourceLang: workspaceDraft.sourceLang ?? '',
      targetLang: workspaceDraft.targetLang,
      glossaryId: preferredGlossaryId,
      captureImagePath: workspaceDraft.capture?.imagePath,
    });
  }, [glossaryOptions, handleTranslate, isBootstrapping, selectedGlossaryId, workspaceDraft]);

  useEffect(() => {
    if (translationTriggerMode !== 'auto') {
      autoTranslateArmedRef.current = false;
      return;
    }

    if (isBootstrapping || isLoading || !source.trim() || !autoTranslateArmedRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      autoTranslateArmedRef.current = false;
      void handleTranslate();
    }, 520);

    return () => window.clearTimeout(timeoutId);
  }, [handleTranslate, isBootstrapping, isLoading, source, sourceLang, targetLang, selectedGlossaryId, translationTriggerMode]);

  const mockStatusDetail = runtime?.status === 'model-missing'
    ? '当前缺少模型配置，所以本次结果来自模拟回退。'
    : runtime?.status === 'api-key-missing'
      ? '当前缺少真实凭证，所以本次结果来自模拟回退。'
      : runtime?.status === 'provider-missing'
        ? '当前还没有启用翻译服务，所以本次结果来自模拟回退。'
        : '当前服务暂时回退到模拟结果，适合先确认界面与链路。';
  const statusMessage = error
    ?? (translationMode === 'mock' ? mockStatusDetail : null)
    ?? warning
    ?? runtimeBanner.detail;
  const statusTone = error ? 'text-[#a45322]' : warning ? 'text-[#8c6b12]' : 'text-[#5a5a5a]';
  const shouldShowMissingProvider = !isBootstrapping && runtime?.status === 'provider-missing';
  const hasEnabledProvider = Boolean(runtime?.provider?.enabled) || providerOptions.some((item) => item.enabled);
  const providerLabel = shouldShowMissingProvider
    ? '未启用'
    : hasEnabledProvider
      ? (runtime?.provider?.label?.trim() || selectedProvider.label)
      : '未启用';
  const isCaptureWorkspace = workspaceDraft?.sourceType === 'capture';
  const sourcePlaceholder = isCaptureWorkspace ? 'OCR 识别内容会显示在这里。' : '在这里输入或粘贴要翻译的内容...';
  const providerMetaLabel = translatedText
    ? `${providerLabel} · ${translationMode === 'mock' ? '模拟' : modelStatusLabel}`
    : `${providerLabel} · ${runtimeModeLabel}`;
  const footerStatusMessage = capture?.actionDisabledReason ?? statusMessage;
  const footerStatusTone = capture?.actionDisabledReason ? 'text-[#8c6b12]' : statusTone;
  const translateButtonLabel = isLoading ? '翻译中...' : translationTriggerMode === 'auto' ? '立即翻译' : translatedText ? '重新翻译' : '翻译';
  const shouldShowFooter = Boolean(error || warning || capture?.actionDisabledReason);
  const popupPreview = popup?.state ?? null;

  function handleClear() {
    invalidatePendingTranslation();
    autoTranslateArmedRef.current = false;
    setSource('');
    setTranslatedText('');
    setTranslationMode(null);
    setError(null);
    setWarning(null);
    setCharactersBilled(null);
    setOcrElapsedMs(null);
    setTranslationElapsedMs(null);
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      {hero ? <div className='pb-2'>{hero}</div> : null}

      <section className='flex min-h-0 flex-1 flex-col'>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-4'>
          <div className='shrink-0'>
            <h1 className='text-[24px] font-semibold tracking-[-0.03em] text-[#262626]'>主翻译区</h1>
          </div>

          {hero ? <div className='min-w-[280px] flex-1'>{hero}</div> : <div className='hidden flex-1 md:block' />}

          {capture ? (
            <Button
              size='sm'
              onClick={() => capture.onOpenCapture()}
              disabled={Boolean(capture.actionDisabledReason) || capture.isLoading}
              className='h-10 shrink-0 rounded-[10px] border-[#242529] bg-[#242529] px-4 text-[14px] text-white hover:border-[#191a1d] hover:bg-[#191a1d]'
            >
              <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
                <path d='M3.1 5.45V3.7C3.1 3.04 3.64 2.5 4.3 2.5H6.05' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
                <path d='M9.95 2.5H11.7C12.36 2.5 12.9 3.04 12.9 3.7V5.45' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
                <path d='M12.9 10.55V12.3C12.9 12.96 12.36 13.5 11.7 13.5H9.95' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
                <path d='M6.05 13.5H4.3C3.64 13.5 3.1 12.96 3.1 12.3V10.55' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
              </svg>
              {capture.isLoading ? '截图处理中...' : '截图'}
            </Button>
          ) : null}

          <div className='shrink-0 flex items-center gap-1 rounded-[10px] border border-[#d6d8dd] bg-[#f5f5f6] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
            <button
              type='button'
              onClick={() => setActiveTab('text')}
              className={clsx(
                'inline-flex h-9 items-center gap-2 rounded-[8px] px-3.5 py-2 text-[14px] font-medium transition-all',
                activeTab === 'text'
                  ? 'bg-white text-[#222326] shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  : 'text-[#70747c] hover:bg-white hover:text-[#2c2c2e]',
              )}
            >
              <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
                <rect x='2.25' y='3' width='11.5' height='3.5' rx='0.9' stroke='currentColor' strokeWidth='1.4' />
                <rect x='2.25' y='9.5' width='5' height='3.5' rx='0.9' stroke='currentColor' strokeWidth='1.4' />
                <rect x='8.75' y='9.5' width='5' height='3.5' rx='0.9' stroke='currentColor' strokeWidth='1.4' />
              </svg>
              文本
            </button>

            {popup ? (
              <button
                type='button'
                onClick={() => setActiveTab('popup')}
                className={clsx(
                  'inline-flex h-9 items-center gap-2 rounded-[8px] px-3.5 py-2 text-[14px] font-medium transition-all',
                  activeTab === 'popup'
                    ? 'bg-white text-[#222326] shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                    : 'text-[#70747c] hover:bg-white hover:text-[#2c2c2e]',
                )}
              >
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
                快捷弹窗
              </button>
            ) : null}
          </div>
        </div>

        {activeTab === 'text' ? (
          <>
            <div className='mb-4 flex items-center justify-between gap-3 overflow-x-auto rounded-[10px] border border-[#d9dbe1] bg-[#fafafa] px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]'>
              <div className='flex shrink-0 items-center gap-1.5'>
                <select
                  aria-label='源语言'
                  value={sourceLang}
                  onChange={(event) => {
                    invalidatePendingTranslation();
                    autoTranslateArmedRef.current = translationTriggerMode === 'auto' && Boolean(source.trim());
                    setSourceLang(event.target.value);
                  }}
                  className='h-8 w-[94px] rounded-[8px] border border-transparent bg-transparent px-2.5 text-[15px] font-medium text-[#2f3541] outline-none transition hover:bg-[#f0f2f5] focus:border-[#dde2e8] focus:bg-white'
                >
                  {languageOptions.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.value ? option.label : '自动检测'}
                    </option>
                  ))}
                </select>

                <button
                  type='button'
                  onClick={handleSwapLanguages}
                  disabled={!sourceLang || !targetLang}
                  className='inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#727782] transition hover:bg-[#f0f2f5] hover:text-[#2f3541] disabled:cursor-not-allowed disabled:opacity-45'
                >
                  <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
                    <path d='M4 5.2H11.7' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
                    <path d='M9.5 3L11.9 5.2L9.5 7.4' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                    <path d='M12 10.8H4.3' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
                    <path d='M6.5 13L4.1 10.8L6.5 8.6' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
                  </svg>
                </button>

                <select
                  aria-label='目标语言'
                  value={targetLang}
                  onChange={(event) => {
                    invalidatePendingTranslation();
                    autoTranslateArmedRef.current = translationTriggerMode === 'auto' && Boolean(source.trim());
                    setTargetLang(event.target.value);
                  }}
                  className='h-8 w-[124px] rounded-[8px] border border-transparent bg-transparent px-2.5 text-[15px] font-medium text-[#2f3541] outline-none transition hover:bg-[#f0f2f5] focus:border-[#dde2e8] focus:bg-white'
                >
                  {languageOptions.filter((option) => option.value).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className='flex shrink-0 items-center gap-3.5 text-[14px] text-[#727782]'>
                <div className='flex items-center gap-2.5'>
                  <span className='text-[13px] text-[#7c8189]'>术语表：</span>
                  <select
                    aria-label='术语表'
                    value={selectedGlossaryId}
                    onChange={(event) => {
                      invalidatePendingTranslation();
                      autoTranslateArmedRef.current = translationTriggerMode === 'auto' && Boolean(source.trim());
                      setSelectedGlossaryId(event.target.value);
                    }}
                    className='h-8 w-[112px] rounded-[8px] border border-transparent bg-transparent px-2 text-[14px] text-[#39414d] outline-none transition hover:bg-[#f0f2f5] focus:border-[#dde2e8] focus:bg-white'
                    disabled={isBootstrapping || glossaryOptions.length === 0}
                  >
                    <option value=''>
                      不使用
                    </option>
                    {availableGlossaries.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} · {option.entries} 条
                      </option>
                    ))}
                  </select>
                </div>

                <div className='h-4 w-px bg-[#d7d7d7]' />

                <button
                  type='button'
                  onClick={handleClear}
                  className='inline-flex items-center gap-1.5 text-[13px] font-medium text-[#7a7f87] transition hover:text-[#2f3541]'
                >
                  <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
                    <path d='M3.5 3.5L10.5 10.5' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
                    <path d='M10.5 3.5L3.5 10.5' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
                  </svg>
                  清空
                </button>
              </div>
            </div>

            <div className='grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
              <div className='relative min-h-[440px] overflow-hidden rounded-[14px] border border-[#d8dbe1] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all focus-within:ring-2 focus-within:ring-[#22c55e]/20'>
                <Textarea
                  value={source}
                  onChange={(event) => {
                    invalidatePendingTranslation();
                    autoTranslateArmedRef.current = translationTriggerMode === 'auto' && Boolean(event.target.value.trim());
                    setSource(event.target.value);
                    if (ocrElapsedMs !== null) {
                      setOcrElapsedMs(null);
                    }
                  }}
                  className='h-full min-h-[440px] resize-none border-0 bg-transparent p-5 pb-20 text-[15px] leading-relaxed text-[#2b2f36] shadow-none focus:border-0 focus-visible:ring-0'
                  placeholder={sourcePlaceholder}
                  spellCheck={false}
                />

                <div className='pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-3 text-[12px] text-[#a0a5ae]'>
                  <span>{sourceCharacters} 字符</span>
                  {ocrElapsedMs !== null ? <span>OCR {formatElapsedTime(ocrElapsedMs)}</span> : null}
                </div>

                {source.trim() && translationTriggerMode === 'manual' ? (
                  <Button
                    size='sm'
                    onClick={() => void handleTranslate()}
                    disabled={Boolean(translateDisabledReason)}
                    className='absolute bottom-4 right-4 rounded-[8px] border-[#1c1d20] bg-[#242529] px-4 text-[14px] text-white hover:border-[#191a1d] hover:bg-[#191a1d]'
                  >
                    {translateButtonLabel}
                  </Button>
                ) : null}
              </div>

              <div className='relative min-h-[440px] overflow-hidden rounded-[14px] border border-[#d8dbe1] bg-[#fafafa] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
                <div className='h-full overflow-auto p-5 pb-20 text-[15px] leading-relaxed'>
                  {isLoading ? (
                    <div className='flex items-center gap-2 text-[#8f95a0]'>
                      <span className='h-2 w-2 rounded-full bg-[#8f95a0]' />
                      <span>{isCaptureWorkspace ? '正在处理截图结果...' : '正在翻译...'}</span>
                    </div>
                  ) : translatedText ? (
                    <div className='whitespace-pre-wrap break-words text-[#2b2f36]'>{translatedText}</div>
                  ) : (
                    <p className='italic text-[#b0b5bd]'>翻译结果会显示在这里...</p>
                  )}
                </div>

                {translatedText || isLoading ? (
                  <div className='pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-2 text-[12px] text-[#9aa0aa]'>
                    <span>{providerMetaLabel}</span>
                    {translationMode === 'real' ? <span className='text-[#1b8d53]'>• 真实</span> : null}
                    {translationMode === 'mock' ? <span className='text-[#b07d12]'>• 模拟</span> : null}
                    {translationElapsedMs !== null && translationMode ? <span>· {formatElapsedTime(translationElapsedMs)}</span> : null}
                  </div>
                ) : null}

                {charactersBilled !== null && translatedText ? (
                  <div className='absolute bottom-4 right-4 rounded-full border border-[#dce1e8] bg-white px-2.5 py-1 text-[11px] text-[#737984]'>
                    {charactersBilled} 字符
                  </div>
                ) : null}
              </div>
            </div>

            {shouldShowFooter ? (
              <div className='mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e1e4e8] bg-[#fafafa] px-4 py-2.5 text-[12px]'>
                <div className={clsx('leading-5', footerStatusTone)}>
                  {footerStatusMessage}
                </div>
                <div className='flex flex-wrap items-center gap-2 text-[#7a7f87]'>
                  <span>{sourceLanguageLabel} → {targetLanguageLabel}</span>
                  <span>•</span>
                  <span>{glossaryBadge}</span>
                  <span>•</span>
                  <span>{trustStateLabel}</span>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === 'popup' && popup ? (
          <div className='flex min-h-0 flex-1 items-center justify-center rounded-[18px] border border-dashed border-[#d9dbe1] bg-[#fafafa] p-8'>
            <div className='w-full max-w-[540px] rounded-[22px] border border-[#d9dbe1] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)]'>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div>
                  <div className='text-[13px] font-semibold tracking-[0.08em] text-[#8a8176]'>快捷弹窗</div>
                  <div className='mt-1 text-[18px] font-medium tracking-[-0.02em] text-[#252931]'>划词翻译预览</div>
                </div>
                <Button variant='secondary' size='sm' onClick={() => popup.onOpen()} disabled={!popup.desktopAvailable} className='rounded-full'>
                  打开弹窗
                </Button>
              </div>

              {popupPreview?.error ? (
                <div className='mb-3 rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700'>
                  {popupPreview.error}
                </div>
              ) : null}

              {popupPreview?.warning ? (
                <div className='mb-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-700'>
                  {popupPreview.warning}
                </div>
              ) : null}

              <div className='grid gap-3'>
                <div className='rounded-[16px] bg-[#f7f4ef] px-4 py-3'>
                  <div className='mb-1.5 text-[11px] font-medium tracking-[0.08em] text-[#8a8176]'>原文</div>
                  <div className='whitespace-pre-wrap text-[14px] leading-6 text-[#5b544c]'>
                    {popupPreview?.sourceText || '在任意应用中选中文本后，使用全局快捷键打开弹窗。'}
                  </div>
                </div>

                <div className='rounded-[16px] bg-[#fcf8ef] px-4 py-3'>
                  <div className='mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium tracking-[0.08em] text-[#8a6d2f]'>
                    <span>译文</span>
                    <span>{popupPreview?.isLoading ? '处理中' : popupPreview?.targetLang ?? '目标语言'}</span>
                  </div>
                  <div className='whitespace-pre-wrap text-[16px] leading-7 text-[#18181b]'>
                    {popupPreview?.isLoading ? '正在翻译所选文本…' : popupPreview?.translatedText || '翻译结果会显示在这里。'}
                  </div>
                </div>
              </div>

              <div className='mt-4 text-[13px] leading-6 text-[#737a86]'>
                如果你希望不离开当前应用就翻译选中文本，可以使用这个快捷弹窗。
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {sidebarBottom ? <div className='pt-2'>{sidebarBottom}</div> : null}
    </div>
  );
}
