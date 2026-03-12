'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { OverlayDocument } from '@/domain/capture/types';
import { PermissionOnboarding, type DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { TranslationOverlay } from '@/components/overlay/TranslationOverlay';
import { Button } from '@/components/ui/button';
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
  warning: '当前为浏览器预览，展示的是内置 mock overlay。',
};

const selectClassName = 'h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-sm text-[#111111] outline-none transition focus:border-[#8cb3f5]';

export function CaptureTranslationWorkspace({
  capabilities,
  refreshing,
  onRefreshCapabilities,
  onOpenAccessibilitySettings,
  onOpenScreenRecordingSettings,
  compact = false,
}: {
  capabilities?: DesktopCapabilities | null;
  refreshing?: boolean;
  onRefreshCapabilities?: () => void;
  onOpenAccessibilitySettings?: () => void;
  onOpenScreenRecordingSettings?: () => void;
  compact?: boolean;
}) {
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [overlay, setOverlay] = useState<OverlayDocument | null>(null);
  const [message, setMessage] = useState('点击“开始截图”选择屏幕区域。');
  const [latestCapturePath, setLatestCapturePath] = useState<string | null>(null);
  const [recentCaptureIssue, setRecentCaptureIssue] = useState<string | null>(null);
  const [captureWindowState, setCaptureWindowState] = useState<'idle' | 'open'>('idle');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const desktopAvailable = desktopClient.isAvailable();
  const captureDisabledReason = !desktopAvailable
    ? '浏览器预览环境不能做系统级截图。'
    : isBootstrapping
      ? '正在读取桌面运行时和最近截图。'
      : !capabilities?.screenRecording?.granted
        ? '还没有屏幕录制权限。'
        : isTranslating
          ? '当前正在处理截图翻译。'
          : null;

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
          providerId: 'openai-compatible',
          providerConfig: {
            baseUrl: providerSecret?.baseUrl ?? runtime?.provider?.baseUrl,
            model: providerSecret?.model ?? runtime?.provider?.model,
            apiKey: providerSecret?.apiKey ?? undefined,
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
  }, [runtime, targetLang]);

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

  function handlePreviewMockOverlay() {
    setOverlay(mockOverlay);
    setRecentCaptureIssue(null);
    setMessage('当前为浏览器预览，已加载内置 mock overlay。');
  }

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
            title: '可以重新翻译最近截图',
            detail: '最近一张截图还在，你可以直接重新生成 overlay。',
          }
        : recentCaptureIssue
          ? {
              title: '最近截图不可恢复',
              detail: `${recentCaptureIssue} 请重新开始一次截图。`,
            }
          : !desktopAvailable
            ? {
                title: '浏览器预览模式',
                detail: '你可以先用内置 mock overlay 看效果。',
              }
            : {
                title: '尚未开始截图',
                detail: '打开框选窗口后，结果会显示在这里。',
              };

  const showPermissionOnboarding = Boolean(capabilities && (!capabilities.accessibility.granted || !capabilities.screenRecording?.granted));

  return (
    <div className={compact ? 'space-y-4' : 'grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]'}>
      <div className='space-y-4'>
        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3'>
            <div className='text-[15px] font-medium text-[#111111]'>截图翻译</div>
          </div>

          <div className='space-y-4 px-4 py-4'>
            <div className='grid gap-px overflow-hidden rounded-[10px] border border-[#d8d8d8] bg-[#d8d8d8]'>
              <div className='bg-white px-3 py-2 text-sm text-[#555555]'>环境：{desktopAvailable ? 'Electron desktop' : 'Browser preview'}</div>
              <div className='bg-white px-3 py-2 text-sm text-[#555555]'>模式：{isBootstrapping ? '读取中' : runtime?.runtimeMode === 'real' ? 'Real' : 'Mock'}</div>
              <div className='bg-white px-3 py-2 text-sm text-[#555555]'>截图窗口：{captureWindowState === 'open' ? '已打开' : '空闲'}</div>
            </div>

            <div className='space-y-2'>
              <label htmlFor='capture-target-lang' className='text-xs text-[#777777]'>目标语言</label>
              <select id='capture-target-lang' value={targetLang} onChange={(event) => setTargetLang(event.target.value)} className={selectClassName}>
                {Object.entries(languageLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3 text-sm text-[#555555]'>
              {message}
            </div>

            {captureDisabledReason ? (
              <div className='rounded-[10px] border border-[#e3d7b6] bg-[#fbf7ec] px-3 py-3 text-sm text-[#7a6931]'>
                {captureDisabledReason}
              </div>
            ) : null}

            {recentCaptureIssue ? (
              <div className='rounded-[10px] border border-[#e3c8c1] bg-[#fdf1ee] px-3 py-3 text-sm text-[#955448]'>
                {recentCaptureIssue}
              </div>
            ) : null}

            <div className='flex flex-wrap gap-2'>
              <Button onClick={() => void handleOpenCaptureWindow()} disabled={Boolean(captureDisabledReason)} className='flex-1 justify-center'>
                开始截图
              </Button>
              <Button variant='secondary' onClick={() => latestCapturePath && void runCaptureTranslation(latestCapturePath)} disabled={!latestCapturePath || isTranslating} className='flex-1 justify-center'>
                重新翻译
              </Button>
            </div>

            {!desktopAvailable ? (
              <Button variant='secondary' onClick={handlePreviewMockOverlay} className='w-full justify-center'>
                预览 Mock Overlay
              </Button>
            ) : null}

            <Link href='/settings' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 text-sm text-[#4f4f4f] transition hover:bg-[#f9f9f9]'>
              打开设置，检查 provider 与权限
            </Link>
          </div>
        </section>

        {showPermissionOnboarding ? (
          <PermissionOnboarding
            capabilities={capabilities ?? null}
            refreshing={refreshing}
            onRefresh={onRefreshCapabilities}
            onOpenAccessibilitySettings={onOpenAccessibilitySettings}
            onOpenScreenRecordingSettings={onOpenScreenRecordingSettings}
          />
        ) : null}
      </div>

      <section className='overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-[#dddddd] px-4 py-3'>
          <div className='text-[15px] font-medium text-[#111111]'>覆盖层结果</div>
          <div className='flex flex-wrap gap-2 text-xs text-[#6a6a6a]'>
            <span>模式：{overlay?.mode ?? 'pending'}</span>
            <span>Provider：{overlay?.provider ?? 'pending'}</span>
            <span>目标语言：{languageLabels[targetLang] ?? targetLang}</span>
          </div>
        </div>

        <div className='p-4'>
          {overlay ? (
            <TranslationOverlay overlay={overlay} />
          ) : (
            <div className='rounded-[12px] border border-dashed border-[#d0d0d0] bg-white px-4 py-6'>
              <div className='text-sm font-medium text-[#111111]'>{overlayEmptyState?.title}</div>
              <div className='mt-2 text-sm leading-6 text-[#666666]'>{overlayEmptyState?.detail}</div>
            </div>
          )}
        </div>

        {overlay?.warning ? (
          <div className='border-t border-[#dddddd] bg-[#fbf7ec] px-4 py-3 text-sm text-[#7a6931]'>
            {overlay.warning}
          </div>
        ) : null}
      </section>
    </div>
  );
}
