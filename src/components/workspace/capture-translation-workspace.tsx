'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { OverlayDocument } from '@/domain/capture/types';
import { PermissionOnboarding, type DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { Button } from '@/components/ui/button';
import { desktopClient } from '@/lib/ipc/desktop-client';
import {
  DEFAULT_LOCAL_OCR_ENDPOINT,
  OCR_ENDPOINT_STORAGE_KEY,
  OCR_ENGINE_STORAGE_KEY,
  isLocalScreenshotOcrEngine,
  normalizeLocalOcrEndpoint,
  type ScreenshotOcrEngine,
} from '@/lib/ocr/local-ocr-config';

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

const languageLabels: Record<string, string> = {
  'zh-CN': '简体中文',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  en: '英语',
};

const mockOverlay: OverlayDocument = {
  imagePath: 'mock://overlay-preview',
  imageWidth: 960,
  imageHeight: 600,
  mode: 'mock',
  provider: 'openai-compatible',
  regions: [
    { id: 'region-1', sourceText: 'Settings', translatedText: '设置', box: { x: 72, y: 94, width: 180, height: 52 }, backgroundColor: 'rgba(255,255,255,0.88)', fontSize: 18 },
    { id: 'region-2', sourceText: 'Start translating', translatedText: '开始翻译', box: { x: 118, y: 190, width: 240, height: 56 }, backgroundColor: 'rgba(196,181,253,0.9)', fontSize: 18 },
  ],
};

const selectClassName = 'h-8 w-full rounded-[9px] border border-[#d1d1d1] bg-white px-3 text-sm text-[#111111] outline-none transition focus:border-[#8cb3f5]';

function getProviderLabel(providerId?: string | null) {
  switch (providerId) {
    case 'local-paddleocr':
      return '本地 PaddleOCR';
    case 'rapidocr':
      return 'RapidOCR';
    case 'apple-vision':
      return 'Apple Vision Framework';
    case 'openai-compatible':
      return '当前服务';
    case 'openai':
      return 'OpenAI';
    case 'deepl':
      return 'DeepL';
    case 'google':
      return 'Google Translate';
    case 'tencent':
      return '腾讯云';
    default:
      return providerId ?? '未选择';
  }
}

function joinScreenshotText(
  overlay: OverlayDocument | null,
  key: 'sourceText' | 'translatedText',
) {
  if (!overlay) {
    return '';
  }

  return overlay.regions
    .map((region) => region[key]?.trim())
    .filter((text): text is string => Boolean(text))
    .join('\n');
}

function getRuntimeModeLabel(isBootstrapping: boolean, desktopAvailable: boolean, runtimeMode?: 'real' | 'mock') {
  if (!desktopAvailable) {
    return '浏览器示例';
  }

  if (isBootstrapping) {
    return '读取中';
  }

  return runtimeMode === 'real' ? '真实模式' : '截图预演';
}

function getSurfaceLabel(desktopAvailable: boolean) {
  return desktopAvailable ? 'Electron 桌面端' : '浏览器预览';
}

function getCaptureOcrWarning(runtime: RuntimeSnapshot | null, desktopAvailable: boolean, ocrEngine: ScreenshotOcrEngine) {
  if (!desktopAvailable || !runtime) {
    return null;
  }

  if (isLocalScreenshotOcrEngine(ocrEngine)) {
    if (!runtime.hasApiKey) {
      const engineLabel = ocrEngine === 'rapidocr'
        ? 'RapidOCR'
        : ocrEngine === 'apple-vision'
          ? 'Apple Vision Framework'
          : '本地 PaddleOCR';
      return `当前已切到 ${engineLabel}。OCR 会在本机执行，但翻译 provider 还缺少真实凭证，译文会回退到 Mock。`;
    }

    return null;
  }

  if (!runtime.hasApiKey) {
    return '当前 provider 还缺少真实凭证，截图 OCR 暂时无法进入真实模式。';
  }

  if (runtime.provider?.kind === 'tencent') {
    return '腾讯云当前只用于文本翻译。若要做截图 OCR，请切换到本地 OCR 引擎。';
  }

  const model = runtime.provider?.model?.trim();
  if (model === 'deepseek-chat' || model === 'deepseek-reasoner') {
    return `当前模型 ${model} 只适合文本翻译，不支持截图 OCR。请到设置里切换到支持图片输入的模型。`;
  }

  return null;
}

export function CaptureTranslationWorkspace({
  capabilities,
  refreshing,
  onRefreshCapabilitiesAction,
  onOpenAccessibilitySettingsAction,
  onOpenScreenRecordingSettingsAction,
  compact = false,
}: {
  capabilities?: DesktopCapabilities | null;
  refreshing?: boolean;
  onRefreshCapabilitiesAction?: () => void;
  onOpenAccessibilitySettingsAction?: () => void;
  onOpenScreenRecordingSettingsAction?: () => void;
  compact?: boolean;
}) {
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [overlay, setOverlay] = useState<OverlayDocument | null>(() => (desktopClient.isAvailable() ? null : mockOverlay));
  const [message, setMessage] = useState(() => (
    desktopClient.isAvailable() ? '点击“开始截图”选择屏幕区域。' : '当前为浏览器预览，左侧已载入内置示例输入。'
  ));
  const [latestCapturePath, setLatestCapturePath] = useState<string | null>(null);
  const [recentCaptureIssue, setRecentCaptureIssue] = useState<string | null>(null);
  const [captureWindowState, setCaptureWindowState] = useState<'idle' | 'open'>('idle');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [ocrEngine, setOcrEngine] = useState<ScreenshotOcrEngine>('cloud-vision');
  const [localOcrEndpoint, setLocalOcrEndpoint] = useState(DEFAULT_LOCAL_OCR_ENDPOINT);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const desktopAvailable = desktopClient.isAvailable();
  const normalizedLocalOcrEndpoint = normalizeLocalOcrEndpoint(localOcrEndpoint);
  const captureDisabledReason = desktopAvailable && isBootstrapping
    ? '正在读取桌面运行时和最近截图。'
    : !desktopAvailable
      ? null
      : !capabilities?.screenRecording?.granted
        ? '还没有屏幕录制权限。'
        : isTranslating
          ? '当前正在处理截图翻译。'
          : null;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedEngine = window.localStorage.getItem(OCR_ENGINE_STORAGE_KEY);
    if (savedEngine === 'cloud-vision' || savedEngine === 'local-paddleocr' || savedEngine === 'rapidocr' || savedEngine === 'apple-vision') {
      setOcrEngine(savedEngine);
    }

    const savedEndpoint = window.localStorage.getItem(OCR_ENDPOINT_STORAGE_KEY);
    if (savedEndpoint?.trim()) {
      setLocalOcrEndpoint(savedEndpoint.trim());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);
      try {
        if (desktopAvailable) {
          const [nextRuntime, savedSettings, latestCapture] = await Promise.all([
            desktopClient.getRuntimeMode(),
            desktopClient.getSettings(),
            desktopClient.getLatestCapture(),
          ]);

          if (cancelled) {
            return;
          }

          if (nextRuntime) {
            setRuntime(nextRuntime);
          }

          if (savedSettings?.defaultTargetLang) {
            setTargetLang(savedSettings.defaultTargetLang);
          }

          if (latestCapture?.filePath) {
            setLatestCapturePath(latestCapture.filePath);
            setRecentCaptureIssue(null);
          } else {
            setLatestCapturePath(null);
            setRecentCaptureIssue('最近没有可恢复的截图。');
          }
        } else {
          const nextRuntime = await fetch('/api/provider-runtime', { cache: 'no-store' }).then((response) => response.json());

          if (cancelled) {
            return;
          }

          setRuntime(nextRuntime);
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setMessage(bootstrapError instanceof Error ? bootstrapError.message : '读取桌面运行时失败。');
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
  }, [desktopAvailable]);

  const runCaptureTranslation = useCallback(async (imagePath: string) => {
    setLatestCapturePath(imagePath);
    setRecentCaptureIssue(null);
    setOverlay(null);
    setIsTranslating(true);
    setMessage('正在执行 OCR 与翻译...');

    try {
      const providerSecret = desktopClient.isAvailable() ? await desktopClient.getProviderSecret() : undefined;
      const response = await fetch('/api/capture/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePath,
          targetLang,
          ocrEngine,
          localOcrEndpoint: isLocalScreenshotOcrEngine(ocrEngine) ? normalizedLocalOcrEndpoint : undefined,
          providerId: providerSecret?.kind ?? 'openai-compatible',
          providerConfig: {
            kind: providerSecret?.kind,
            baseUrl: providerSecret?.baseUrl ?? runtime?.provider?.baseUrl,
            model: providerSecret?.model ?? runtime?.provider?.model,
            apiKey: providerSecret?.apiKey ?? undefined,
            secretId: providerSecret?.secretId ?? undefined,
            secretKey: providerSecret?.secretKey ?? undefined,
            region: providerSecret?.region ?? runtime?.provider?.region,
            projectId: providerSecret?.projectId ?? runtime?.provider?.projectId,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === 'SCREENSHOT_FILE_NOT_FOUND') {
          setLatestCapturePath(null);
          setRecentCaptureIssue(payload.message ?? '最近截图已失效，请重新截图。');
        }

        setMessage(payload.message ?? payload.code ?? '截屏翻译失败。');
        return;
      }

      setOverlay(payload as OverlayDocument);
      setMessage(payload.warning ?? (payload.mode === 'mock' ? '已使用 Mock 截图翻译完成。' : '截图翻译完成。'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '截屏翻译失败。');
    } finally {
      setIsTranslating(false);
    }
  }, [normalizedLocalOcrEndpoint, ocrEngine, runtime, targetLang]);

  useEffect(() => {
    if (!desktopAvailable) {
      return;
    }

    const disposeCompleted = desktopClient.onCaptureCompleted((payload) => {
      setCaptureWindowState('idle');
      setMessage(`已接收截图：${payload.filePath}`);
      setRecentCaptureIssue(null);
      void runCaptureTranslation(payload.filePath);
    });

    const disposeCancelled = desktopClient.onCaptureCancelled((payload) => {
      setCaptureWindowState('idle');
      setMessage(payload.message ?? '截图已取消。');
      setIsTranslating(false);
    });

    const disposeClosed = desktopClient.onCaptureWindowClosed((payload) => {
      setCaptureWindowState('idle');
      if (!isTranslating) {
        setMessage(payload.message ?? '截图窗口已关闭。');
      }
    });

    return () => {
      disposeCompleted();
      disposeCancelled();
      disposeClosed();
    };
  }, [desktopAvailable, isTranslating, runCaptureTranslation]);

  async function handleOpenCaptureWindow() {
    setCaptureWindowState('open');
    setRecentCaptureIssue(null);
    setMessage('框选窗口已打开，请拖拽选择区域。');
    await desktopClient.showCaptureWindow();
  }

  const overlayEmptyState = overlay
    ? null
    : isTranslating
      ? {
          title: '正在生成结果',
          detail: '已收到截图，正在执行 OCR 和翻译。',
        }
      : latestCapturePath
        ? {
            title: '可以重新生成结果',
            detail: '最近一张截图还在，你可以直接重新生成当前截图结果。',
          }
        : recentCaptureIssue
          ? {
              title: '最近截图不可恢复',
              detail: `${recentCaptureIssue} 请重新开始一次截图。`,
            }
          : !desktopAvailable
            ? {
                title: '已载入 Mock 结果',
                detail: '浏览器预览默认展示内置 mock 输入与截图结果，方便直接检查这条链路。',
              }
            : {
                title: '尚未开始截图',
                detail: '打开框选窗口后，结果会显示在这里。',
              };

  const runtimeModeLabel = getRuntimeModeLabel(isBootstrapping, desktopAvailable, runtime?.runtimeMode);
  const surfaceLabel = getSurfaceLabel(desktopAvailable);
  const resultModeLabel = overlay?.mode === 'real' ? '真实模式' : overlay?.mode === 'mock' ? (desktopAvailable ? 'Mock 回退' : '浏览器示例') : null;
  const captureOcrWarning = getCaptureOcrWarning(runtime, desktopAvailable, ocrEngine);
  const showPermissionOnboarding = Boolean(capabilities && (!capabilities.accessibility.granted || !capabilities.screenRecording?.granted));
  const latestCaptureName = latestCapturePath ? latestCapturePath.split(/[/\\]/).pop() ?? latestCapturePath : null;
  const sourceStateLabel = overlay
    ? latestCapturePath
      ? '已生成结果'
      : desktopAvailable
        ? '等待截图'
        : '示例已载入'
    : latestCapturePath
      ? '已准备重译'
      : desktopAvailable
        ? '等待截图'
        : '示例已载入';
  const sourcePreviewTitle = latestCaptureName
    ?? (!desktopAvailable
      ? '内置示例输入'
      : '等待新的截图区域');
  const sourcePreviewDetail = latestCaptureName
    ? '最近一次截图仍可直接重新生成当前结果。'
    : !desktopAvailable
      ? '左侧固定展示内置示例输入，右侧同步展示截图结果，避免把预览误认成真实桌面截图。'
      : '点击“开始截图”后，源内容会在这里更新。';
  const recognizedText = joinScreenshotText(overlay, 'sourceText');
  const translatedText = joinScreenshotText(overlay, 'translatedText');
  const resultRegionCount = overlay?.regions.length ?? 0;

  return (
    <div className={compact ? 'space-y-3' : 'grid gap-2 md:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] md:items-start'}>
      <div className='space-y-2'>
        <section className='overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='flex flex-wrap items-center justify-between gap-2 border-b border-[#dddddd] px-3 py-2'>
            <div>
              <div className='text-[15px] font-medium text-[#111111]'>源内容</div>
              <div className='mt-1 text-[12px] text-[#666666]'>左侧保持源输入和截图控制，右侧持续显示识别与翻译结果。</div>
            </div>
            <span className='shrink-0 rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-1 text-[11px] text-[#666666]'>{sourceStateLabel}</span>
          </div>

          <div className='space-y-2 px-2.5 py-2.5'>
            <div className='rounded-[12px] border border-[#d8d8d8] bg-white p-2.5'>
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <div className='text-[13px] font-medium text-[#111111]'>当前输入</div>
                    {latestCaptureName ? (
                      <span className='rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-0.5 text-[11px] text-[#666666]'>
                        最近截图
                      </span>
                    ) : null}
                  </div>
                  <div className='mt-1 text-[13px] font-medium text-[#111111]'>{sourcePreviewTitle}</div>
                </div>
                <div className='shrink-0 rounded-full border border-[#d7d7d7] bg-[#f7f7f7] px-2 py-1 text-[11px] text-[#666666]'>
                  {desktopAvailable ? (captureWindowState === 'open' ? '截图进行中' : '等待截图') : '浏览器示例'}
                </div>
              </div>

              <div className='mt-2.5 flex min-h-[148px] flex-col justify-between rounded-[12px] border border-dashed border-[#d8d8d8] bg-[linear-gradient(180deg,#fcfcfc_0%,#f4f4f4_100%)] p-3'>
                <div>
                  <div className='text-[12px] text-[#777777]'>{desktopAvailable ? '截图预览区' : '示例输入预览区'}</div>
                  <div className='mt-2 text-[17px] font-medium tracking-[-0.02em] text-[#111111]'>{sourceStateLabel}</div>
                  <div className='mt-2 max-w-[36ch] text-[13px] leading-5 text-[#666666]'>{sourcePreviewDetail}</div>
                </div>

                <div className='mt-3 flex flex-wrap gap-1 text-[11px] text-[#666666]'>
                  <span className='rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-1'>环境：{surfaceLabel}</span>
                  <span className='rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-1'>模式：{runtimeModeLabel}</span>
                  <span className='rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-1'>OCR：{ocrEngine === 'local-paddleocr' ? '本地 PaddleOCR' : ocrEngine === 'rapidocr' ? 'RapidOCR' : ocrEngine === 'apple-vision' ? 'Apple Vision' : '云端视觉'}</span>
                  {desktopAvailable ? (
                    <span className='rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-1'>状态：{captureWindowState === 'open' ? '截图进行中' : '等待截图'}</span>
                  ) : (
                    <span className='rounded-full border border-[#d7d7d7] bg-[#fafafa] px-2 py-1'>示例模式</span>
                  )}
                </div>
              </div>
            </div>

            <div className='rounded-[12px] border border-[#d8d8d8] bg-white p-2.5'>
              <div className='grid gap-2'>
                <div className='grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                  <div className='min-w-[132px] flex-1 space-y-1'>
                    <label htmlFor='capture-target-lang' className='block text-[11px] text-[#777777]'>目标语言</label>
                    <select id='capture-target-lang' value={targetLang} onChange={(event) => setTargetLang(event.target.value)} className={selectClassName}>
                      {Object.entries(languageLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className='min-w-[132px] flex-1 space-y-1'>
                    <div className='block text-[11px] text-[#777777]'>OCR 引擎</div>
                    <div className='flex h-8 items-center rounded-[9px] border border-[#d1d1d1] bg-[#fafafa] px-3 text-sm text-[#444444]'>
                      {ocrEngine === 'local-paddleocr'
                        ? '本地 PaddleOCR'
                        : ocrEngine === 'rapidocr'
                          ? 'RapidOCR'
                          : ocrEngine === 'apple-vision'
                            ? 'Apple Vision Framework'
                            : '云端视觉 OCR'}
                    </div>
                  </div>
                </div>

                <div className='flex flex-wrap items-end justify-end gap-1.5'>
                  <Button
                    onClick={desktopAvailable
                      ? () => void handleOpenCaptureWindow()
                      : () => {
                          setOverlay(mockOverlay);
                          setRecentCaptureIssue(null);
                          setMessage('当前为浏览器示例，已重新载入内置示例输入与截图结果。');
                        }}
                    disabled={Boolean(captureDisabledReason)}
                    className='min-w-[124px] justify-center'
                  >
                    {desktopAvailable ? '开始截图' : '重载浏览器示例'}
                  </Button>
                  <Button variant='secondary' onClick={() => latestCapturePath && void runCaptureTranslation(latestCapturePath)} disabled={!latestCapturePath || isTranslating} className='min-w-[132px] justify-center'>
                    重新生成结果
                  </Button>
                  <Link href='/settings' className='inline-flex min-w-[120px] items-center justify-center rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2 text-[13px] leading-5 text-[#4f4f4f] transition hover:bg-[#f9f9f9]'>
                    去设置调整 OCR
                  </Link>
                </div>

                <div className='rounded-[10px] border border-[#ececec] bg-[#fafafa] px-3 py-2 text-[12px] leading-5 text-[#666666]'>
                  {message}
                </div>
              </div>

              {captureDisabledReason ? (
                <div className='mt-2 rounded-[10px] border border-[#e3d7b6] bg-[#fbf7ec] px-3 py-2 text-[13px] leading-5 text-[#7a6931]'>
                  {captureDisabledReason}
                </div>
              ) : null}

              {captureOcrWarning ? (
                <div className='mt-2 rounded-[10px] border border-[#e3c8c1] bg-[#fdf1ee] px-3 py-2 text-[13px] leading-5 text-[#955448]'>
                  {captureOcrWarning}
                </div>
              ) : null}

              {recentCaptureIssue ? (
                <div className='mt-2 rounded-[10px] border border-[#e3c8c1] bg-[#fdf1ee] px-3 py-2 text-[13px] leading-5 text-[#955448]'>
                  {recentCaptureIssue}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {showPermissionOnboarding ? (
          <PermissionOnboarding
            capabilities={capabilities ?? null}
            refreshing={refreshing}
            onRefreshAction={onRefreshCapabilitiesAction}
            onOpenAccessibilitySettingsAction={onOpenAccessibilitySettingsAction}
            onOpenScreenRecordingSettingsAction={onOpenScreenRecordingSettingsAction}
          />
        ) : null}
      </div>

      <section className='overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-[#dddddd] px-3 py-2'>
          <div className='text-[15px] font-medium text-[#111111]'>识别与翻译结果</div>
          <div className='flex flex-wrap gap-2 text-[11px] text-[#6a6a6a]'>
            {resultModeLabel ? <span>模式：{resultModeLabel}</span> : null}
            {overlay?.provider ? <span>来源：{getProviderLabel(overlay.provider)}</span> : null}
            <span>目标语言：{languageLabels[targetLang] ?? targetLang}</span>
            {overlay ? <span>文本区域：{resultRegionCount}</span> : null}
          </div>
        </div>

        <div className='p-2'>
          {overlay ? (
            <div className='grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
              <section className='rounded-[12px] border border-[#d8d8d8] bg-white'>
                <div className='border-b border-[#ececec] px-3 py-2'>
                  <div className='text-[13px] font-medium text-[#111111]'>识别文本</div>
                  <div className='mt-1 text-[12px] text-[#666666]'>截图中识别出的原文会按顺序列在这里。</div>
                </div>
                <div className='max-h-[520px] overflow-auto px-3 py-3'>
                  <div className='whitespace-pre-wrap break-words rounded-[10px] bg-[#fafafa] px-3 py-2 text-[14px] leading-6 text-[#171717]'>
                    {recognizedText || '这次截图没有识别到可展示的原文。'}
                  </div>
                </div>
              </section>

              <section className='rounded-[12px] border border-[#d8d8d8] bg-white'>
                <div className='border-b border-[#ececec] px-3 py-2'>
                  <div className='text-[13px] font-medium text-[#111111]'>翻译文本</div>
                  <div className='mt-1 text-[12px] text-[#666666]'>直接给你可复制、可检查的译文结果。</div>
                </div>
                <div className='max-h-[520px] overflow-auto px-3 py-3'>
                  <div className='whitespace-pre-wrap break-words rounded-[10px] bg-[#fafafa] px-3 py-2 text-[14px] leading-6 text-[#171717]'>
                    {translatedText || '这次截图还没有可展示的译文。'}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className='rounded-[12px] border border-dashed border-[#d0d0d0] bg-white px-4 py-5'>
              <div className='text-sm font-medium text-[#111111]'>{overlayEmptyState?.title}</div>
              <div className='mt-1.5 text-[13px] leading-5 text-[#666666]'>{overlayEmptyState?.detail}</div>
            </div>
          )}
        </div>

        {overlay?.warning ? (
          <div className='border-t border-[#dddddd] bg-[#fbf7ec] px-3.5 py-2.5 text-[13px] leading-5 text-[#7a6931]'>
            {overlay.warning}
          </div>
        ) : null}
      </section>
    </div>
  );
}
