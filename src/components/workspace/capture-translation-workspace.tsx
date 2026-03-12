'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { OverlayDocument } from '@/domain/capture/types';
import { PermissionOnboarding, type DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { TranslationOverlay } from '@/components/overlay/TranslationOverlay';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  const [message, setMessage] = useState('点击“打开框选窗口”开始截图。');
  const [latestCapturePath, setLatestCapturePath] = useState<string | null>(null);
  const [recentCaptureIssue, setRecentCaptureIssue] = useState<string | null>(null);
  const [captureWindowState, setCaptureWindowState] = useState<'idle' | 'open'>('idle');
  const [targetLang, setTargetLang] = useState('zh-CN');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const desktopAvailable = desktopClient.isAvailable();
  const captureDisabledReason = !desktopAvailable
    ? '当前是浏览器预览环境，系统级区域截图仅在 Electron 桌面端可用。'
    : isBootstrapping
      ? '正在读取桌面运行时与最近截图状态，请稍候。'
      : !capabilities?.screenRecording?.granted
        ? '尚未获得“屏幕录制”权限，因此不能打开框选窗口。'
        : isTranslating
          ? '当前正在处理截图翻译，请等待本轮完成。'
          : null;
  const captureButtonLabel = captureDisabledReason ? '打开框选窗口（暂不可用）' : '打开框选窗口';

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
            setRecentCaptureIssue('最近截图不可用，可能已被移动、删除或尚未完成捕获。');
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
      setMessage(payload.message ?? '截图已取消，未写入历史。');
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
    setMessage('框选窗口已打开，请拖拽选择屏幕区域。');
    await desktopClient.showCaptureWindow();
  }

  const overlayEmptyState = overlay
    ? null
    : isTranslating
      ? {
          title: '正在生成 overlay',
          detail: '已收到截图，正在执行 OCR 与翻译，请稍候查看覆盖层结果。',
        }
      : latestCapturePath
        ? {
            title: '等待重新生成结果',
            detail: '已记录最近截图，但当前尚未拿到新的 overlay 输出。你可以重新发起翻译。',
          }
        : recentCaptureIssue
          ? {
              title: '最近截图不可恢复',
              detail: `${recentCaptureIssue} 请重新打开框选窗口获取新的截图。`,
            }
          : !desktopAvailable
          ? {
              title: '浏览器预览模式',
              detail: '当前无法进行系统级截图；可以先点击“预览 Mock Overlay”查看覆盖层效果。',
            }
          : {
              title: '尚未开始截图',
              detail: '点击“打开框选窗口”选择屏幕区域后，overlay 结果会显示在这里。',
            };

  return (
    <div className={compact ? 'grid gap-5' : 'grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]'}>
      <div className='grid gap-5'>
        <Card title='运行摘要' eyebrow='Summary'>
          <div className='space-y-3'>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>环境：{desktopAvailable ? 'Electron desktop' : 'Browser preview'}</div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>模式：{isBootstrapping ? '读取中...' : runtime?.runtimeMode === 'real' ? 'Real' : 'Mock'}</div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>目标语言：{languageLabels[targetLang] ?? targetLang}</div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>截图窗口：{captureWindowState === 'open' ? '已打开，等待框选' : '空闲'}</div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>{message}</div>
            <Button onClick={() => void handleOpenCaptureWindow()} disabled={Boolean(captureDisabledReason)} className='w-full justify-center'>{captureButtonLabel}</Button>
            {captureDisabledReason ? <div className='rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800'>{captureDisabledReason}</div> : null}
            {recentCaptureIssue ? <div className='rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700'>{recentCaptureIssue}</div> : null}
            <Button variant='secondary' onClick={() => latestCapturePath && void runCaptureTranslation(latestCapturePath)} disabled={!latestCapturePath || isTranslating} className='w-full justify-center'>重新翻译最近截图</Button>
            {!desktopAvailable ? <Button variant='secondary' onClick={handlePreviewMockOverlay} className='w-full justify-center'>预览 Mock Overlay</Button> : null}
            <Link href='/settings' className='flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700'><span>回到设置页</span><span>→</span></Link>
          </div>
        </Card>

        {!capabilities?.screenRecording?.granted && capabilities ? (
          <PermissionOnboarding
            capabilities={capabilities}
            refreshing={refreshing}
            onRefresh={onRefreshCapabilities}
            onOpenAccessibilitySettings={onOpenAccessibilitySettings}
            onOpenScreenRecordingSettings={onOpenScreenRecordingSettings}
          />
        ) : null}
      </div>

      <Card title='覆盖层结果' eyebrow='Overlay'>
        <div className='space-y-4'>
          {overlay ? (
            <TranslationOverlay overlay={overlay} />
          ) : (
            <div className='rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6'>
              <div className='text-sm font-semibold text-slate-900'>{overlayEmptyState?.title}</div>
              <div className='mt-2 text-sm leading-6 text-slate-500'>{overlayEmptyState?.detail}</div>
            </div>
          )}
          {overlay?.warning ? <div className='rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-700'>{overlay.warning}</div> : null}
          <div className='flex flex-wrap gap-2 text-xs text-slate-500'>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1'>模式：{overlay?.mode ?? 'pending'}</span>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1'>Provider：{overlay?.provider ?? 'pending'}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
