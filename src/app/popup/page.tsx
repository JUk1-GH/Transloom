'use client';

import { useEffect, useState } from 'react';
import type { PopupTranslationState } from '@/domain/capture/types';
import { PermissionOnboarding, type DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { Button } from '@/components/ui/button';
import { desktopClient } from '@/lib/ipc/desktop-client';

export default function PopupPage() {
  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null);
  const [popupState, setPopupState] = useState<PopupTranslationState | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!desktopClient.isAvailable()) {
        return;
      }

      const [nextCapabilities, nextPopupState] = await Promise.all([
        desktopClient.getCapabilities(),
        desktopClient.getPopupState(),
      ]);
      if (!cancelled) {
        if (nextCapabilities) {
          setCapabilities(nextCapabilities);
        }
        setPopupState(nextPopupState ?? null);
      }
    }

    void bootstrap();
    const dispose = desktopClient.onPopupStateUpdated((payload) => {
      if (!cancelled) {
        setCopied(false);
        setPopupState(payload);
      }
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  async function handleCopy() {
    if (!popupState?.translatedText) {
      return;
    }

    await navigator.clipboard.writeText(popupState.translatedText);
    setCopied(true);
  }

  return (
    <main className='min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#fff7ed_42%,#f8fafc_100%)] p-3 text-slate-900'>
      <div className='mx-auto grid max-w-[460px] gap-3'>
        <section className='overflow-hidden rounded-[26px] border border-slate-300/80 bg-[linear-gradient(180deg,#ffffff_0%,#fffaf4_100%)] shadow-[0_30px_80px_rgba(15,23,42,0.16)]'>
          <div className='flex items-center justify-between border-b border-slate-200 px-4 py-3'>
            <div>
              <div className='text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400'>Transloom Popup</div>
              <div className='mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-900'>Quick Translate</div>
            </div>
            <Button variant='ghost' size='sm' onClick={() => void desktopClient.hidePopupWindow()} className='rounded-full border border-slate-200 bg-white px-3'>关闭</Button>
          </div>

          <div className='space-y-3 p-4'>
            {popupState?.error ? <div className='rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700'>{popupState.error}</div> : null}
            {popupState?.warning ? <div className='rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-700'>{popupState.warning}</div> : null}

            <div className='grid gap-3 rounded-[22px] border border-slate-200 bg-white p-4'>
              <div>
                <div className='mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-400'>Source</div>
                <div className='whitespace-pre-wrap text-[15px] leading-7 text-slate-700'>
                  {popupState?.sourceText || '先在任意应用中选中文本，再按快捷键触发弹窗。'}
                </div>
              </div>
              <div className='h-px bg-slate-100' />
              <div>
                <div className='mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-amber-700/80'>
                  <span>Translation</span>
                  <span>{popupState?.isLoading ? 'Translating' : copied ? 'Copied' : popupState?.targetLang ?? 'Target'}</span>
                </div>
                <div className='whitespace-pre-wrap text-[18px] leading-8 text-slate-900'>
                  {popupState?.isLoading ? '正在翻译选中文本…' : popupState?.translatedText || '翻译结果会显示在这里。'}
                </div>
              </div>
            </div>

            <div className='grid gap-2 sm:grid-cols-3'>
              <Button onClick={() => void desktopClient.promotePopupToWorkspace()} className='justify-center' disabled={popupState?.isLoading}>回主窗口继续编辑</Button>
              <Button variant='secondary' onClick={() => void handleCopy()} disabled={!popupState?.translatedText || popupState?.isLoading} className='justify-center'>
                {copied ? '已复制' : '复制译文'}
              </Button>
              <Button variant='secondary' onClick={() => void desktopClient.openAccessibilitySettings()} disabled={!desktopClient.isAvailable() || !capabilities?.accessibility.canOpenSettings} className='justify-center'>权限设置</Button>
            </div>
          </div>
        </section>

        {!capabilities?.accessibility.granted ? (
          <PermissionOnboarding
            capabilities={capabilities}
            onRefresh={() => {
              void (async () => {
                const next = await desktopClient.refreshCapabilities();
                if (next) {
                  setCapabilities(next);
                }
              })();
            }}
            onOpenAccessibilitySettings={() => void desktopClient.openAccessibilitySettings()}
            onOpenScreenRecordingSettings={() => void desktopClient.openScreenRecordingSettings()}
          />
        ) : null}
      </div>
    </main>
  );
}
