'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OverlayDocument, PopupTranslationState, WorkspaceDraftState } from '@/domain/capture/types';
import type { DesktopCapabilities } from '@/components/desktop/permission-onboarding';
import { AppShell } from '@/components/ui/app-shell';
import { TextTranslationWorkspace } from '@/components/workspace/text-translation-workspace';
import { desktopClient } from '@/lib/ipc/desktop-client';
import {
  OCR_ENDPOINT_STORAGE_KEY,
  OCR_ENGINE_STORAGE_KEY,
  isLocalScreenshotOcrEngine,
  normalizeLocalOcrEndpoint,
  type ScreenshotOcrEngine,
} from '@/lib/ocr/local-ocr-config';

const mockCaptureOverlay: OverlayDocument = {
  imagePath: 'mock://overlay-preview',
  imageWidth: 960,
  imageHeight: 600,
  mode: 'mock',
  provider: 'openai-compatible',
  regions: [
    { id: 'region-1', sourceText: 'Settings', translatedText: '设置', box: { x: 72, y: 94, width: 180, height: 52 }, backgroundColor: 'rgba(255,255,255,0.88)', fontSize: 18 },
    { id: 'region-2', sourceText: 'Start translating', translatedText: '开始翻译', box: { x: 118, y: 190, width: 240, height: 56 }, backgroundColor: 'rgba(196,181,253,0.9)', fontSize: 18 },
  ],
  warning: '当前为浏览器预览，展示的是内置模拟截图结果。',
};

export default function Home() {
  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null);
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraftState | null>(null);
  const [popupState, setPopupState] = useState<PopupTranslationState | null>(null);
  const [latestCapture, setLatestCapture] = useState<{ filePath: string; capturedAt: string } | null>(null);
  const [captureOverlay, setCaptureOverlay] = useState<OverlayDocument | null>(null);
  const [captureMessage, setCaptureMessage] = useState('截图会直接回到当前工作区。');
  const [captureLoading, setCaptureLoading] = useState(false);
  const workspaceSectionRef = useRef<HTMLDivElement | null>(null);
  const missingAccessibility = Boolean(capabilities?.desktopAvailable && !capabilities?.accessibility.granted);
  const missingScreenRecording = Boolean(capabilities?.desktopAvailable && !capabilities?.screenRecording?.granted);
  const showPermissionWarning = missingAccessibility || missingScreenRecording;
  const permissionWarningMessage = missingAccessibility && missingScreenRecording
    ? '未开启辅助功能和屏幕录制权限，部分功能可能不可正常使用。请前往“权限”页面完成授权。'
    : missingScreenRecording
      ? '未开启屏幕录制权限，截图相关功能可能不可正常使用。请前往“权限”页面完成授权。'
      : missingAccessibility
        ? '未开启辅助功能权限，划词翻译相关功能可能不可正常使用。请前往“权限”页面完成授权。'
        : null;

  const readCaptureOcrSettings = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        ocrEngine: 'cloud-vision' as ScreenshotOcrEngine,
        localOcrEndpoint: undefined,
      };
    }

    const savedEngine = window.localStorage.getItem(OCR_ENGINE_STORAGE_KEY);
    const ocrEngine: ScreenshotOcrEngine = savedEngine === 'local-paddleocr' || savedEngine === 'rapidocr' || savedEngine === 'apple-vision'
      ? savedEngine
      : 'cloud-vision';
    const savedEndpoint = window.localStorage.getItem(OCR_ENDPOINT_STORAGE_KEY);

    return {
      ocrEngine,
      localOcrEndpoint: isLocalScreenshotOcrEngine(ocrEngine)
        ? normalizeLocalOcrEndpoint(savedEndpoint)
        : undefined,
    };
  }, []);

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
    setCaptureMessage('正在处理截图…');

    try {
      const providerSecret = desktopClient.isAvailable() ? await desktopClient.getProviderSecret() : undefined;
      const targetLang = workspaceDraft?.targetLang ?? popupState?.targetLang ?? 'zh-CN';
      const captureOcrSettings = readCaptureOcrSettings();
      const response = await fetch('/api/capture/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePath,
          targetLang,
          ocrEngine: captureOcrSettings.ocrEngine,
          localOcrEndpoint: captureOcrSettings.localOcrEndpoint,
          providerId: providerSecret?.kind ?? 'openai-compatible',
          providerConfig: {
            kind: providerSecret?.kind,
            baseUrl: providerSecret?.baseUrl,
            model: providerSecret?.model,
            apiKey: providerSecret?.apiKey ?? undefined,
            secretId: providerSecret?.secretId ?? undefined,
            secretKey: providerSecret?.secretKey ?? undefined,
            region: providerSecret?.region,
            projectId: providerSecret?.projectId,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setCaptureMessage(payload.message ?? payload.code ?? '截图处理失败。');
        return;
      }

      const nextOverlay = payload as OverlayDocument;
      const nextDraft = mapOverlayToWorkspaceDraft(nextOverlay, capturedAt);
      setCaptureOverlay(nextOverlay);
      setWorkspaceDraft(nextDraft);
      setCaptureMessage(nextOverlay.warning ?? (nextOverlay.mode === 'mock' ? '已载入模拟截图结果。' : '截图结果已更新。'));
      requestAnimationFrame(() => {
        workspaceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (error) {
      setCaptureMessage(error instanceof Error ? error.message : '截图处理失败。');
    } finally {
      setCaptureLoading(false);
    }
  }, [mapOverlayToWorkspaceDraft, popupState?.targetLang, readCaptureOcrSettings, workspaceDraft?.targetLang]);

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

  function scrollToWorkspace() {
    requestAnimationFrame(() => {
      workspaceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleOpenCaptureFromWorkspace() {
    scrollToWorkspace();

    if (!desktopClient.isAvailable()) {
      setCaptureOverlay(mockCaptureOverlay);
      setWorkspaceDraft(mapOverlayToWorkspaceDraft(mockCaptureOverlay));
      setCaptureMessage('当前为浏览器预览，已载入示例截图识别结果。');
      return;
    }

    await desktopClient.showCaptureWindow();
  }

  async function handleOpenQuickPopupFromWorkspace() {
    if (!desktopClient.isAvailable()) {
      return;
    }

    await desktopClient.showPopupWindow();
  }

  return (
    <AppShell title='翻译文本'>
      <div ref={workspaceSectionRef} className='h-full'>
        <TextTranslationWorkspace
          initialSource=''
          workspaceDraft={workspaceDraft}
          hero={showPermissionWarning ? (
            <div className='rounded-[12px] border border-[#f0c1be] bg-[#fff3f1] px-4 py-3 text-[13px] font-medium leading-5 text-[#b84a43] shadow-[0_1px_2px_rgba(184,74,67,0.08)]'>
              {permissionWarningMessage}
            </div>
          ) : null}
          capture={{
            message: captureMessage,
            overlay: captureOverlay,
            isLoading: captureLoading,
            latestCapturePath: latestCapture?.filePath ?? null,
            onOpenCapture: () => void handleOpenCaptureFromWorkspace(),
            actionDisabledReason: capabilities?.desktopAvailable
              ? !capabilities?.screenRecording?.granted
                ? '还没有“屏幕录制”权限。'
                : null
              : null,
            desktopAvailable: Boolean(capabilities?.desktopAvailable),
          }}
          popup={{
            onOpen: () => void handleOpenQuickPopupFromWorkspace(),
            desktopAvailable: Boolean(capabilities?.desktopAvailable),
            state: popupState,
          }}
        />
      </div>
    </AppShell>
  );
}
