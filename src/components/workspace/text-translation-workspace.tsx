'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  { value: '', label: 'Auto Detect' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const fallbackProviders: ProviderOption[] = [
  { id: 'openai-compatible', label: '当前服务', kind: 'openai-compatible', enabled: true },
];

const selectClassName = 'h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-400 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.10)]';

export function TextTranslationWorkspace({
  hero,
  sidebarBottom,
  initialSource = 'The user interface of Transloom is designed to be both powerful and elegant.',
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
          const [nextRuntime, savedSettings, nextProviders, workspaceDraft] = await Promise.all([
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
          if (workspaceDraft) {
            applyWorkspaceDraft(workspaceDraft);
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
  const targetLanguageLabel = languageOptions.find((option) => option.value === targetLang)?.label ?? targetLang;
  const sourceLanguageLabel = languageOptions.find((option) => option.value === sourceLang)?.label ?? 'Auto Detect';
  const selectedProvider = providerOptions.find((item) => item.kind === selectedProviderId) ?? fallbackProviders[0];
  const runtimeBanner = isBootstrapping
    ? {
        tone: 'slate',
        title: '正在读取翻译运行时配置',
        detail: '稍后即可确认 provider、模型与 API Key 状态。',
      }
    : runtime?.runtimeMode === 'mock'
      ? {
          tone: 'amber',
          title: '当前处于 Mock 模式',
          detail: '现在更适合验证界面与调用链路，正式翻译前请补齐真实 provider 配置。',
        }
      : runtime?.hasApiKey
        ? {
            tone: 'emerald',
            title: '翻译引擎已就绪',
            detail: `正在使用 ${runtime?.model ?? '已配置模型'}，可以直接开始真实翻译。`,
          }
        : {
            tone: 'violet',
            title: '已连接 provider，但仍缺少 API Key',
            detail: '可以继续预览界面，但提交真实翻译前建议先去设置页补齐密钥。',
          };
  const translateDisabledReason = isBootstrapping
    ? '正在读取运行时配置，翻译按钮稍后可用。'
    : isLoading
      ? '翻译请求正在进行中，请等待当前结果返回。'
      : !source.trim()
        ? '请先输入或粘贴要翻译的文本。'
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

  return (
    <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]'>
      <div className='space-y-5'>
        {hero}
        <div className={`rounded-[16px] border px-3.5 py-2 shadow-sm ${runtimeBanner.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : runtimeBanner.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : runtimeBanner.tone === 'violet' ? 'border-violet-200 bg-violet-50 text-violet-900' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
          <div className='flex flex-wrap items-center gap-2 text-[13px]'>
            <span className='text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70'>Runtime</span>
            <span className='font-semibold'>{runtimeBanner.title}</span>
          </div>
        </div>
        <section className='overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]'>
          {capture ? (
            <div className='border-b border-slate-200 bg-slate-50/60 px-5 py-3'>
              <div className='flex flex-wrap items-center gap-2 text-xs'>
                <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600'>截图输入</span>
                <span className='rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700'>与文本共用同一双栏</span>
                <span className='text-slate-500'>{capture.message}</span>
              </div>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Button variant='secondary' size='sm' onClick={capture.onOpenCapture}>打开框选窗口</Button>
                <Button variant='secondary' size='sm' onClick={capture.onRetranslateLatest} disabled={!capture.latestCapturePath || capture.isLoading}>重新翻译最近截图</Button>
                {!capture.desktopAvailable && capture.onPreviewMockOverlay ? <Button variant='secondary' size='sm' onClick={capture.onPreviewMockOverlay}>预览 Mock Overlay</Button> : null}
              </div>
              {capture.actionDisabledReason ? <div className='mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>{capture.actionDisabledReason}</div> : null}
            </div>
          ) : null}
          <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-2.5'>
            <div className='flex flex-wrap items-center gap-2 text-[11px] text-slate-500'>
              <span>{isBootstrapping ? '读取配置中' : runtime?.runtimeMode === 'real' ? '已连接真实服务' : 'Mock 模式'}</span>
            </div>
            <div className='text-[11px] uppercase tracking-[0.16em] text-slate-400'>Chars {sourceCharacters}</div>
          </div>

          <div className='flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-2.5'>
            <select aria-label='Source language' value={sourceLang} onChange={(event) => setSourceLang(event.target.value)} className={selectClassName}>
              {languageOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
            </select>
            <Button variant='ghost' className='h-9 rounded-full border border-slate-200 bg-white px-3 text-slate-600 hover:bg-slate-50' onClick={handleSwapLanguages} disabled={!sourceLang || !targetLang}>
              ⇄
            </Button>
            <select aria-label='Target language' value={targetLang} onChange={(event) => setTargetLang(event.target.value)} className={selectClassName}>
              {languageOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Button variant='secondary' size='sm' onClick={() => { setSource(''); setTranslatedText(''); setError(null); setWarning(null); setCharactersBilled(null); }}>
                清空
              </Button>
              <Button size='sm' onClick={() => void handleTranslate()} disabled={Boolean(translateDisabledReason)}>
                {isLoading ? '翻译中...' : '翻译'}
              </Button>
            </div>
            {translateDisabledReason ? <div className='w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>{translateDisabledReason}</div> : null}
          </div>

          <div className='grid min-h-[660px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
            <div className='border-b border-slate-200 bg-white xl:border-b-0 xl:border-r'>
              <div className='flex items-center justify-between px-6 py-3 text-xs uppercase tracking-[0.16em] text-slate-400'>
                <span>{sourceLanguageLabel}</span>
                <span>{sourceCharacters} chars</span>
              </div>
              <div className='px-6 pb-6'>
                <Textarea value={source} onChange={(event) => setSource(event.target.value)} className='min-h-[560px] resize-none border-0 bg-transparent px-0 py-0 font-serif text-[22px] leading-10 text-slate-900 shadow-none focus:border-0 focus:shadow-none' placeholder='输入、粘贴，或从其它应用选中后唤起 Transloom。' />
              </div>
            </div>

            <div className='bg-white'>
              <div className='flex items-center justify-between px-6 py-3 text-xs uppercase tracking-[0.16em] text-slate-400'>
                <span>{targetLanguageLabel}</span>
                <span>{charactersBilled ?? 0} billed</span>
              </div>
              <div className='px-6 pb-6'>
                <div className='min-h-[560px] whitespace-pre-wrap break-words font-serif text-[22px] leading-10 text-slate-900'>
                  {translatedText || '译文会显示在这里，你可以在统一工作区里继续对照截图、草稿或小窗结果。'}
                </div>
              </div>
            </div>
          </div>
        </section>
        {capture ? (
          <section className='rounded-[16px] border border-slate-200 bg-slate-50/60 px-3.5 py-3.5'>
            <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <div className='text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400'>Capture Inspector</div>
                <div className='mt-1 text-sm text-slate-500'>用于校验截图 overlay，不改变主双栏翻译路径。</div>
              </div>
              <div className='flex flex-wrap gap-1.5 text-[11px] text-slate-500'>
                <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>截图任务</span>
                {capture.overlay ? <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>已生成 overlay</span> : null}
              </div>
            </div>
            <div className='space-y-3'>
              {capture.overlay ? (
                <TranslationOverlay overlay={capture.overlay} />
              ) : (
                <div className='rounded-xl border border-dashed border-slate-200 bg-white p-5 text-sm leading-6 text-slate-500'>
                  {capture.isLoading ? '已收到截图，正在执行 OCR 与翻译，请稍候。' : capture.latestCapturePath ? '最近截图已就绪，你可以重新翻译或继续在双栏中编辑聚合后的文本。' : '还没有截图任务，点击上方“打开框选窗口”即可把截图翻译结果并入当前双栏工作区。'}
                </div>
              )}
              {capture.overlay?.warning ? <div className='rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700'>{capture.overlay.warning}</div> : null}
            </div>
          </section>
        ) : null}
      </div>

      <div className='grid gap-2 xl:grid-cols-[minmax(0,1fr)_244px]'>
        <section className='space-y-2'>
          <div className='rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-600'>
            <div className='text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400'>Support</div>
            <div className='mt-1.5 flex flex-wrap gap-1.5 text-[11px]'>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>模式：{isBootstrapping ? '读取中...' : runtime?.runtimeMode === 'real' ? 'Real' : 'Mock'}</span>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>Provider：{selectedProvider.label}</span>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>模型：{runtime?.model ?? '未配置'}</span>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>目标语言：{targetLanguageLabel}</span>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5'>计费字符：{charactersBilled ?? 0}</span>
            </div>
          </div>
          {error ? <div className='rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>{error}</div> : null}
          {warning ? <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700'>{warning}</div> : null}
          <div className='rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>API Key：{runtime?.hasApiKey ? '已保存' : '未保存'}</div>
          {sidebarBottom}
        </section>
      </div>
    </div>
  );
}
