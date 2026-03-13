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
    <main className='min-h-screen bg-[#f4f2ee] p-2.5 text-slate-900'>
      <div className='mx-auto grid max-w-[440px] gap-2.5'>
        <section className='overflow-hidden rounded-[22px] border border-[#d7d2ca] bg-[#fbfaf8] shadow-[0_18px_48px_rgba(15,23,42,0.12)]'>
          <div className='flex items-center justify-between border-b border-[#e7e1d8] px-3.5 py-2.5'>
            <div className='min-w-0'>
              <div className='text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8176]'>快速翻译</div>
              <div className='mt-0.5 text-[15px] font-medium tracking-[-0.02em] text-[#18181b]'>选中文本后会直接回到这里</div>
            </div>
            <Button variant='ghost' size='sm' onClick={() => void desktopClient.hidePopupWindow()} className='h-8 rounded-full border border-[#ddd6cd] bg-white px-3 text-[#4f4a43]'>关闭</Button>
          </div>

          <div className='space-y-2.5 p-3.5'>
            {popupState?.error ? <div className='rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700'>{popupState.error}</div> : null}
            {popupState?.warning ? <div className='rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700'>{popupState.warning}</div> : null}

            <div className='grid gap-2 rounded-[18px] border border-[#e5e0d8] bg-white p-3'>
              <div className='grid gap-2'>
                <div className='rounded-[14px] bg-[#f7f4ef] px-3 py-2.5'>
                  <div className='mb-1.5 text-[11px] font-medium tracking-[0.08em] text-[#8a8176]'>原文</div>
                  <div className='whitespace-pre-wrap text-[14px] leading-6 text-[#5b544c]'>
                    {popupState?.sourceText || '先在任意应用里选中文本，再用快捷键呼出弹窗。'}
                  </div>
                </div>
                <div className='rounded-[14px] bg-[#fcf8ef] px-3 py-2.5'>
                  <div className='mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium tracking-[0.08em] text-[#8a6d2f]'>
                    <span>译文</span>
                    <span>{popupState?.isLoading ? '翻译中' : copied ? '已复制' : popupState?.targetLang ?? '目标语言'}</span>
                  </div>
                  <div className='whitespace-pre-wrap text-[16px] leading-7 text-[#18181b]'>
                    {popupState?.isLoading ? '正在翻译选中文本…' : popupState?.translatedText || '翻译结果会显示在这里。'}
                  </div>
                </div>
              </div>

              <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(2,auto)]'>
                <Button onClick={() => void desktopClient.promotePopupToWorkspace()} className='justify-center' disabled={popupState?.isLoading}>回主窗口继续编辑</Button>
                <Button variant='secondary' onClick={() => void handleCopy()} disabled={!popupState?.translatedText || popupState?.isLoading} className='justify-center whitespace-nowrap'>
                  {copied ? '已复制' : '复制译文'}
                </Button>
                <Button variant='secondary' onClick={() => void desktopClient.openAccessibilitySettings()} disabled={!desktopClient.isAvailable() || !capabilities?.accessibility.canOpenSettings} className='justify-center whitespace-nowrap'>系统权限</Button>
              </div>
            </div>
          </div>
        </section>

        {!capabilities?.accessibility.granted ? (
          <PermissionOnboarding
            capabilities={capabilities}
            onRefreshAction={() => {
              void (async () => {
                const next = await desktopClient.refreshCapabilities();
                if (next) {
                  setCapabilities(next);
                }
              })();
            }}
            onOpenAccessibilitySettingsAction={() => void desktopClient.openAccessibilitySettings()}
            onOpenScreenRecordingSettingsAction={() => void desktopClient.openScreenRecordingSettings()}
          />
        ) : null}
      </div>
    </main>
  );
}
