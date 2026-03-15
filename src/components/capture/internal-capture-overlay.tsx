'use client';

import { useEffect, useState } from 'react';
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

export function InternalCaptureOverlay() {
  const [selection, setSelection] = useState<DragSelection | null>(null);
  const [message, setMessage] = useState('拖拽选择要翻译的区域，松开后自动截图。');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBackground = html.style.background;
    const previousBodyBackground = body.style.background;

    html.style.background = 'transparent';
    body.style.background = 'transparent';

    return () => {
      html.style.background = previousHtmlBackground;
      body.style.background = previousBodyBackground;
    };
  }, []);

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
      className='relative h-screen w-screen cursor-crosshair overflow-hidden bg-transparent'
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => void handlePointerUp()}
    >
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
          className='absolute border-2 border-[#8cb3f5] bg-[#0b67d1]/8'
          style={{ left: selectionBox.left, top: selectionBox.top, width: selectionBox.width, height: selectionBox.height }}
        />
      ) : null}
    </main>
  );
}
