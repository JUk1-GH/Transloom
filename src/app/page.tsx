'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayDocument, PopupTranslationState, WorkspaceDraftState } from '@/domain/capture/types';
import { PermissionOnboarding, type DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { AppShell } from '@/components/ui/app-shell';
import { TextTranslationWorkspace } from '@/components/workspace/text-translation-workspace';
import { desktopClient } from '@/lib/ipc/desktop-client';

export default function Home() {
  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraftState | null>(null);
  const [popupState, setPopupState] = useState<PopupTranslationState | null>(null);
  const [latestCapture, setLatestCapture] = useState<{ filePath: string; capturedAt: string } | null>(null);
  const [captureOverlay, setCaptureOverlay] = useState<OverlayDocument | null>(null);
  const [captureMessage, setCaptureMessage] = useState('截图结果会直接回到当前工作区。');
  const [captureLoading, setCaptureLoading] = useState(false);
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
            message: '当前是浏览器预览环境。桌面权限和系统级截图只在 Electron 中可用。',
            canOpenSettings: false,
          },
          screenRecording: {
            granted: false,
            status: 'not-granted',
            message: '浏览器预览环境不支持系统级区域截图。',
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

  function scrollToWorkspace() {
    requestAnimationFrame(() => {
      workspaceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleOpenCaptureFromWorkspace() {
    scrollToWorkspace();

    if (!desktopClient.isAvailable()) {
      setCaptureMessage('当前是浏览器预览环境，请先使用 Mock Overlay。');
      return;
    }

    await desktopClient.showCaptureWindow();
  }

  return (
    <AppShell title='翻译文本' description='输入、截图和小窗结果都回到同一个工作区。'>
      <div ref={workspaceSectionRef}>
        <TextTranslationWorkspace
          initialSource=''
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
            onPreviewMockOverlay: !capabilities?.desktopAvailable
              ? () => {
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
                  scrollToWorkspace();
                }
              : undefined,
            actionDisabledReason: !capabilities?.desktopAvailable
              ? '当前是浏览器预览环境，系统级截图仅在 Electron 桌面端可用。'
              : !capabilities?.screenRecording?.granted
                ? '还没有“屏幕录制”权限。'
                : null,
            desktopAvailable: Boolean(capabilities?.desktopAvailable),
          }}
          sidebarBottom={(
            <PermissionOnboarding
              capabilities={capabilities}
              refreshing={refreshing}
              onRefresh={() => void handleRefreshCapabilities()}
              onOpenAccessibilitySettings={() => void desktopClient.openAccessibilitySettings()}
              onOpenScreenRecordingSettings={() => void desktopClient.openScreenRecordingSettings()}
              prominent
            />
          )}
        />
      </div>
    </AppShell>
  );
}
