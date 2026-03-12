'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { AppShell } from '@/components/ui/app-shell';
import { CaptureTranslationWorkspace } from '@/components/workspace/capture-translation-workspace';
import { desktopClient } from '@/lib/ipc/desktop-client';

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
  const [message, setMessage] = useState('拖拽选择要翻译的区域，松开后自动截图。');
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
      setMessage('框选区域太小，请重新拖拽。');
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

    const disposeClosed = desktopClient.onCaptureWindowClosed((payload) => {
      setMessage(payload.message ?? '截图窗口已关闭。');
      setIsSubmitting(false);
      setSelection(null);
    });

    return () => {
      disposeCancelled();
      disposeClosed();
    };
  }, []);

  const selectionBox = selection ? {
    left: Math.min(selection.startX, selection.currentX),
    top: Math.min(selection.startY, selection.currentY),
    width: Math.abs(selection.currentX - selection.startX),
    height: Math.abs(selection.currentY - selection.startY),
  } : null;

  return (
    <main
      className='relative h-screen w-screen cursor-crosshair overflow-hidden bg-black/20'
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => void handlePointerUp()}
    >
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(11,103,209,0.16),transparent_30%)]' />

      <div className='absolute left-4 right-4 top-4 flex items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-black/70 px-4 py-3 text-white backdrop-blur'>
        <div className='text-sm'>{message}</div>
        <button
          type='button'
          className='rounded-[10px] border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/16'
          onClick={() => void desktopClient.cancelCaptureSelection()}
        >
          取消
        </button>
      </div>

      {selectionBox ? (
        <div
          className='absolute border-2 border-[#8cb3f5] bg-[#0b67d1]/16 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]'
          style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }}
        />
      ) : (
        <div className='absolute inset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]' />
      )}
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
    <AppShell title='截图翻译' description='保留真实截图链路，但把界面收敛成更直接的桌面工具形态。'>
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
