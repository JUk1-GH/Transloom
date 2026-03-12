'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { AppShell } from '@/components/ui/app-shell';
import { desktopClient } from '@/lib/ipc/desktop-client';
import { CaptureTranslationWorkspace } from '@/components/workspace/capture-translation-workspace';

type DragSelection = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

function toSelectionPayload(selection: DragSelection) {
  const x = Math.min(selection.startX, selection.currentX);
  const y = Math.min(selection.startY, selection.currentY);
  const width = Math.abs(selection.currentX - selection.startX);
  const height = Math.abs(selection.currentY - selection.startY);

  return {
    x: Math.round(window.screenX + x),
    y: Math.round(window.screenY + y),
    width,
    height,
    scaleFactor: window.devicePixelRatio,
  };
}

function CaptureOverlayMode() {
  const [selection, setSelection] = useState<DragSelection | null>(null);
  const [message, setMessage] = useState('拖拽选择要翻译的屏幕区域，松开鼠标后自动截图。');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isSubmitting) {
      return;
    }
    setSelection({ startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!selection) {
      return;
    }
    setSelection((current) => current ? { ...current, currentX: event.clientX, currentY: event.clientY } : current);
  }

  async function handlePointerUp() {
    if (!selection) {
      return;
    }
    const payload = toSelectionPayload(selection);
    if (payload.width < 8 || payload.height < 8) {
      setSelection(null);
      setMessage('框选区域过小，请重新拖拽。');
      return;
    }
    setIsSubmitting(true);
    setMessage('正在截取选定区域...');
    try {
      await desktopClient.submitCaptureSelection(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '截图失败。');
      setIsSubmitting(false);
      setSelection(null);
    }
  }

  useEffect(() => {
    const disposeCancelled = desktopClient.onCaptureCancelled((payload) => {
      setMessage(payload.message ?? '截图已取消。');
      setIsSubmitting(false);
      setSelection(null);
    });
    return () => disposeCancelled();
  }, []);

  const selectionBox = selection ? {
    left: Math.min(selection.startX, selection.currentX),
    top: Math.min(selection.startY, selection.currentY),
    width: Math.abs(selection.currentX - selection.startX),
    height: Math.abs(selection.currentY - selection.startY),
  } : null;

  return (
    <main className='relative h-screen w-screen cursor-crosshair overflow-hidden bg-slate-950/20' onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => void handlePointerUp()}>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_30%)]' />
      <div className='absolute left-6 top-6 max-w-sm rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white/90 backdrop-blur'>{message}</div>
      <button type='button' className='absolute right-6 top-6 rounded-xl border border-white/15 bg-slate-950/55 px-3 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-slate-900/70' onClick={() => void desktopClient.cancelCaptureSelection()}>取消</button>
      {selectionBox ? <div className='absolute border-2 border-violet-300 bg-violet-400/20 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]' style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }} /> : <div className='absolute inset-0 shadow-[0_0_0_9999px_rgba(2,6,23,0.35)]' />}
    </main>
  );
}

function CaptureWorkspacePage() {
  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!desktopClient.isAvailable()) {
        return;
      }
      const nextCapabilities = await desktopClient.getCapabilities();
      if (!cancelled && nextCapabilities) {
        setCapabilities(nextCapabilities);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshCapabilities() {
    setRefreshing(true);
    try {
      const next = await desktopClient.refreshCapabilities();
      if (next) {
        setCapabilities(next);
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppShell title='区域截图翻译' description='桌面端使用独立全屏框选窗口采集截图，再复用现有 OCR 与 overlay 翻译后半段。'>
      <CaptureTranslationWorkspace
        capabilities={capabilities}
        refreshing={refreshing}
        onRefreshCapabilities={() => void handleRefreshCapabilities()}
        onOpenAccessibilitySettings={() => void desktopClient.openAccessibilitySettings()}
        onOpenScreenRecordingSettings={() => void desktopClient.openScreenRecordingSettings()}
      />
    </AppShell>
  );
}

function CapturePageContent() {
  const searchParams = useSearchParams();
  return searchParams.get('mode') === 'overlay' ? <CaptureOverlayMode /> : <CaptureWorkspacePage />;
}

export default function CapturePage() {
  return (
    <Suspense fallback={<CaptureWorkspacePage />}>
      <CapturePageContent />
    </Suspense>
  );
}
