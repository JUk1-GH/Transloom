'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayDocument, PopupTranslationState, WorkspaceDraftState } from '@/domain/capture/types';
import { PermissionOnboarding, type DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextTranslationWorkspace } from '@/components/workspace/text-translation-workspace';
import { desktopClient } from '@/lib/ipc/desktop-client';

export default function Home() {
  function formatRecentTime(value: string) {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return '时间未知';
    }

    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  }

  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [workspaceFocus, setWorkspaceFocus] = useState<'text' | 'capture'>('text');
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraftState | null>(null);
  const [popupState, setPopupState] = useState<PopupTranslationState | null>(null);
  const [latestCapture, setLatestCapture] = useState<{ filePath: string; capturedAt: string } | null>(null);
  const [captureOverlay, setCaptureOverlay] = useState<OverlayDocument | null>(null);
  const [captureMessage, setCaptureMessage] = useState('点击“打开框选窗口”开始截图。');
  const [captureLoading, setCaptureLoading] = useState(false);
  const [dismissedResumeIds, setDismissedResumeIds] = useState<string[]>([]);
  const [showAllResumeItems, setShowAllResumeItems] = useState(false);
  const workspaceSectionRef = useRef<HTMLDivElement | null>(null);

  const mapOverlayToWorkspaceDraft = useCallback((overlay: OverlayDocument, capturedAt?: string): WorkspaceDraftState => {
    const sourceText = overlay.regions.map((region) => region.sourceText).filter(Boolean).join('\n');
    const translatedText = overlay.regions.map((region) => region.translatedText).filter(Boolean).join('\n');

    return {
      sourceText,
      translatedText,
      targetLang: workspaceDraft?.targetLang ?? popupState?.targetLang ?? 'zh-CN',
      warning: overlay.warning,
      updatedAt: new Date().toISOString(),
      sourceType: 'capture',
      capture: {
        imagePath: overlay.imagePath,
        overlay,
        regionCount: overlay.regions.length,
        capturedAt,
      },
    };
  }, [popupState?.targetLang, workspaceDraft?.targetLang]);

  const runCaptureTranslation = useCallback(async (imagePath: string, capturedAt?: string) => {
    setWorkspaceFocus('capture');
    setCaptureOverlay(null);
    setCaptureLoading(true);
    setCaptureMessage('正在执行 OCR 与翻译...');

    try {
      const providerSecret = desktopClient.isAvailable() ? await desktopClient.getProviderSecret() : undefined;
      const targetLang = workspaceDraft?.targetLang ?? popupState?.targetLang ?? 'zh-CN';
      const response = await fetch('/api/capture/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePath,
          targetLang,
          providerId: 'openai-compatible',
          providerConfig: {
            baseUrl: providerSecret?.baseUrl,
            model: providerSecret?.model,
            apiKey: providerSecret?.apiKey ?? undefined,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setCaptureMessage(payload.message ?? payload.code ?? '截屏翻译失败。');
        return;
      }

      const nextOverlay = payload as OverlayDocument;
      const nextDraft = mapOverlayToWorkspaceDraft(nextOverlay, capturedAt);
      setCaptureOverlay(nextOverlay);
      setWorkspaceDraft(nextDraft);
      setCaptureMessage(nextOverlay.warning ?? (nextOverlay.mode === 'mock' ? '已使用 Mock 截图翻译完成。' : '截图翻译完成。'));
      requestAnimationFrame(() => {
        workspaceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (error) {
      setCaptureMessage(error instanceof Error ? error.message : '截屏翻译失败。');
    } finally {
      setCaptureLoading(false);
    }
  }, [mapOverlayToWorkspaceDraft, popupState?.targetLang, workspaceDraft?.targetLang]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!desktopClient.isAvailable()) {
        setCapabilities({
          desktopAvailable: false,
          accessibility: {
            granted: false,
            status: 'not-granted',
            message: '当前是浏览器预览环境。辅助功能授权、选中文本弹窗与系统级区域截图仅在 Electron 桌面端可用。',
            canOpenSettings: false,
          },
          screenRecording: {
            granted: false,
            status: 'not-granted',
            message: '浏览器预览环境不支持系统级区域截图，桌面端授权后可用。',
            canOpenSettings: false,
          },
          selectedTextTrigger: {
            available: false,
            requiresShortcut: true,
          },
        });
        return;
      }
      const [nextCapabilities, nextWorkspaceDraft, nextPopupState, nextLatestCapture] = await Promise.all([
        desktopClient.getCapabilities(),
        desktopClient.getWorkspaceDraft(),
        desktopClient.getPopupState(),
        desktopClient.getLatestCapture(),
      ]);
      if (!cancelled) {
        if (nextCapabilities) {
          setCapabilities(nextCapabilities);
        }
        setWorkspaceDraft(nextWorkspaceDraft ?? null);
        setPopupState(nextPopupState ?? null);
        setLatestCapture(nextLatestCapture ?? null);
      }
    }
    void bootstrap();

    if (!desktopClient.isAvailable()) {
      return () => {
        cancelled = true;
      };
    }

    const disposeWorkspaceDraft = desktopClient.onWorkspaceDraftUpdated((draft) => {
      if (!cancelled) {
        setWorkspaceDraft(draft);
      }
    });
    const disposePopupState = desktopClient.onPopupStateUpdated((state) => {
      if (!cancelled) {
        setPopupState(state);
      }
    });
    const disposeCaptureCompleted = desktopClient.onCaptureCompleted((payload) => {
      if (!cancelled) {
        setLatestCapture(payload);
        void runCaptureTranslation(payload.filePath, payload.capturedAt);
      }
    });

    return () => {
      cancelled = true;
      disposeWorkspaceDraft();
      disposePopupState();
      disposeCaptureCompleted();
    };
  }, [runCaptureTranslation]);

  async function handleRefreshCapabilities() {
    setRefreshing(true);
    try {
      const nextCapabilities = await desktopClient.refreshCapabilities();
      if (nextCapabilities) {
        setCapabilities(nextCapabilities);
      }
    } finally {
      setRefreshing(false);
    }
  }

  function focusWorkspace(focusTarget: 'text' | 'capture') {
    setWorkspaceFocus(focusTarget);
    requestAnimationFrame(() => {
      workspaceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleOpenCaptureFromWorkspace() {
    focusWorkspace('capture');
    if (!desktopClient.isAvailable()) {
      setCaptureMessage('当前是浏览器预览环境，请使用 Mock Overlay 预览截图结果。');
      return;
    }
    await desktopClient.showCaptureWindow();
  }

  const activeWorkspaceSummary = workspaceFocus === 'capture'
    ? {
        eyebrow: 'Capture Input',
        title: '当前焦点是截图输入：从框选结果进入 OCR、翻译，并回到同一双栏继续编辑。',
        detail: '适合软件界面、本地图片和文档片段的快速翻译。',
      }
    : {
        eyebrow: 'Text Input',
        title: '当前焦点是文本输入：直接输入、粘贴或接住桌面侧写入的草稿。',
        detail: '适合连续翻译、比对术语和验证 provider 配置。',
      };

  const recentItems = [
    workspaceDraft
      ? {
          id: 'workspace-draft',
          eyebrow: 'Text Draft',
          sourceLabel: '来自主工作台',
          statusLabel: '待继续',
          statusTone: 'violet',
          title: '继续主工作台草稿',
          detail: workspaceDraft.sourceText.slice(0, 72) || '已有未完成文本草稿。',
          updatedAt: workspaceDraft.updatedAt,
          updatedAtLabel: `最近更新于 ${formatRecentTime(workspaceDraft.updatedAt)}`,
          actionLabel: '继续编辑',
          action: () => focusWorkspace('text'),
        }
      : null,
    popupState?.sourceText
      ? {
          id: 'popup-state',
          eyebrow: 'Popup',
          sourceLabel: '来自快捷键小窗',
          statusLabel: popupState.isLoading ? '翻译中' : '待继续',
          statusTone: popupState.isLoading ? 'amber' : 'violet',
          title: popupState.isLoading ? '小窗正在翻译中' : '恢复小窗上下文',
          detail: popupState.sourceText.slice(0, 72),
          updatedAt: popupState.updatedAt,
          updatedAtLabel: `最近更新于 ${formatRecentTime(popupState.updatedAt)}`,
          actionLabel: '恢复到工作区',
          action: () => focusWorkspace('text'),
        }
      : null,
    latestCapture
      ? {
          id: 'latest-capture',
          eyebrow: 'Capture',
          sourceLabel: '来自最近截图',
          statusLabel: '最近完成',
          statusTone: 'emerald',
          title: '继续最近截图任务',
          detail: latestCapture.filePath.split('/').pop() ?? latestCapture.filePath,
          updatedAt: latestCapture.capturedAt,
          updatedAtLabel: `捕获于 ${formatRecentTime(latestCapture.capturedAt)}`,
          actionLabel: '继续处理截图',
          action: () => focusWorkspace('capture'),
        }
      : null,
  ].filter((item): item is {
    id: string;
    eyebrow: string;
    sourceLabel: string;
    statusLabel: string;
    statusTone: 'violet' | 'amber' | 'emerald';
    title: string;
    detail: string;
    updatedAt: string;
    updatedAtLabel: string;
    actionLabel: string;
    action: () => void;
  } => item !== null)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const visibleRecentItems = recentItems.filter((item) => !dismissedResumeIds.includes(item.id));
  const collapsedRecentItems = showAllResumeItems ? visibleRecentItems : visibleRecentItems.slice(0, 2);
  const hiddenRecentItemCount = Math.max(visibleRecentItems.length - collapsedRecentItems.length, 0);

  return (
    <AppShell title='Transloom Unified Workspace' description='把文本翻译、区域截图和小窗联动收敛到一个更接近产品态的桌面工作区。'>
      <section className='grid gap-2 xl:grid-cols-[minmax(0,1.7fr)_280px]'>
        <Card title='统一翻译工作区' eyebrow='Translator' className='overflow-hidden border-slate-300 bg-white'>
          <div className='space-y-2 text-sm leading-6 text-slate-700'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div className='space-y-1'>
                <div className='flex flex-wrap gap-2'>
                  <span className='inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700'>{activeWorkspaceSummary.eyebrow}</span>
                  <span className='inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600'>{capabilities?.desktopAvailable ? 'Electron desktop' : 'Browser preview'}</span>
                </div>
                <p className='max-w-2xl text-sm leading-6 text-slate-600'>文本、小窗与截图结果都并入同一套双栏翻译体验。</p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button size='sm' onClick={() => focusWorkspace('text')} variant={workspaceFocus === 'text' ? 'primary' : 'secondary'} className='justify-center'>文本输入</Button>
                <Button size='sm' onClick={() => focusWorkspace('capture')} variant={workspaceFocus === 'capture' ? 'primary' : 'secondary'} className='justify-center'>截图输入</Button>
                <button
                  type='button'
                  onClick={() => {
                    if (desktopClient.isAvailable()) {
                      void desktopClient.showPopupWindow();
                      return;
                    }
                    window.open('/popup', '_blank', 'noopener,noreferrer');
                  }}
                  className='inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700'
                >
                  打开小窗
                </button>
                <Link href='/settings' className='inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:text-violet-700'>本机设置</Link>
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'>
              <span className='text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400'>Next</span>
              <span>{workspaceFocus === 'capture' ? '先确认屏幕录制权限，再把截图结果并入双栏。' : '先确认 provider 与目标语言，再开始翻译。'}</span>
            </div>
          </div>
        </Card>

        <Card title='继续最近任务' eyebrow='Resume'>
          <div className='space-y-3'>
            {recentItems.length > 0 ? (
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-500'>
                当前显示 {collapsedRecentItems.length} / 共 {visibleRecentItems.length} 项{dismissedResumeIds.length > 0 ? `，另有 ${dismissedResumeIds.length} 项已隐藏` : ''}。
              </div>
            ) : null}
            {(dismissedResumeIds.length > 0 || hiddenRecentItemCount > 0 || (showAllResumeItems && visibleRecentItems.length > 2)) ? (
              <div className='flex flex-wrap gap-2'>
                {dismissedResumeIds.length > 0 ? (
                  <Button variant='secondary' size='sm' onClick={() => setDismissedResumeIds([])} className='justify-center'>恢复已隐藏项目</Button>
                ) : null}
                {hiddenRecentItemCount > 0 ? (
                  <Button variant='secondary' size='sm' onClick={() => setShowAllResumeItems(true)} className='justify-center'>展开其余 {hiddenRecentItemCount} 项</Button>
                ) : null}
                {showAllResumeItems && visibleRecentItems.length > 2 ? (
                  <Button variant='ghost' size='sm' onClick={() => setShowAllResumeItems(false)} className='justify-center'>仅显示最近 2 项</Button>
                ) : null}
              </div>
            ) : null}
            {collapsedRecentItems.length > 0 ? collapsedRecentItems.map((item) => (
              <div key={item.id} className='rounded-2xl border border-slate-200 bg-slate-50 p-4 transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md active:translate-y-0 active:shadow-sm'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'>{item.eyebrow}</div>
                  <button type='button' onClick={() => setDismissedResumeIds((current) => current.includes(item.id) ? current : [...current, item.id])} className='rounded-full px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200'>隐藏</button>
                </div>
                <div className='mt-2 flex items-center justify-between gap-3'>
                  <div className='text-sm font-semibold text-slate-900'>{item.title}</div>
                  <div className='flex flex-wrap items-center justify-end gap-2'>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] ${item.statusTone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : item.statusTone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>{item.statusLabel}</span>
                    <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500'>{item.sourceLabel}</span>
                  </div>
                </div>
                <div className='mt-1 line-clamp-3 text-sm leading-6 text-slate-600'>{item.detail}</div>
                <div className='mt-2 text-xs text-slate-400'>{item.updatedAtLabel}</div>
                <Button variant='secondary' onClick={item.action} className='mt-3 w-full justify-center'>{item.actionLabel}</Button>
              </div>
            )) : (
              <div className='rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500'>
                {recentItems.length > 0 ? '当前会话已将这些恢复项隐藏。你可以点击上方按钮重新显示。' : '还没有可恢复的最近任务。先完成一次文本翻译、截图翻译或小窗翻译后，这里会出现快速恢复入口。'}
              </div>
            )}
          </div>
        </Card>
      </section>

      <div ref={workspaceSectionRef}>
        <TextTranslationWorkspace
          workspaceDraft={workspaceDraft}
          capture={{
            message: captureMessage,
            overlay: captureOverlay,
            isLoading: captureLoading,
            latestCapturePath: latestCapture?.filePath ?? null,
            onOpenCapture: () => void handleOpenCaptureFromWorkspace(),
            onRetranslateLatest: () => {
              if (latestCapture?.filePath) {
                void runCaptureTranslation(latestCapture.filePath, latestCapture.capturedAt);
              }
            },
            onPreviewMockOverlay: !capabilities?.desktopAvailable ? () => {
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
              setCaptureOverlay(mockOverlay);
              setWorkspaceDraft(mapOverlayToWorkspaceDraft(mockOverlay));
              setCaptureMessage('当前为浏览器预览，已加载内置 mock overlay。');
              focusWorkspace('capture');
            } : undefined,
            actionDisabledReason: !capabilities?.desktopAvailable
              ? '当前是浏览器预览环境，系统级区域截图仅在 Electron 桌面端可用。'
              : !capabilities?.screenRecording?.granted
                ? '尚未获得“屏幕录制”权限，因此不能打开框选窗口。'
                : null,
            desktopAvailable: Boolean(capabilities?.desktopAvailable),
          }}
          hero={
            <div className='rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-600'>
              <div className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'>Flow</div>
              <div className='mt-1'>输入文本、接收桌面草稿或截图结果，都在同一套双栏里继续翻译；下方 inspector 只负责校验 overlay。</div>
            </div>
          }
          sidebarBottom={
            <PermissionOnboarding
              capabilities={capabilities}
              refreshing={refreshing}
              onRefresh={() => void handleRefreshCapabilities()}
              onOpenAccessibilitySettings={() => void desktopClient.openAccessibilitySettings()}
              onOpenScreenRecordingSettings={() => void desktopClient.openScreenRecordingSettings()}
              prominent
            />
          }
        />
      </div>
    </AppShell>
  );
}
