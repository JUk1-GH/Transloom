import type { CaptureSelectionPayload, PopupTranslationState, WorkspaceDraftState } from '@/domain/capture/types';
import type { ProviderKind } from '@/domain/translation/provider';

type RuntimeStatus = 'ready' | 'provider-missing' | 'model-missing' | 'api-key-missing' | 'mock-fallback';

export interface DesktopProviderSummary {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKeyMasked?: string;
  hasApiKey: boolean;
  secretId?: string;
  secretKeyMasked?: string;
  hasSecretKey?: boolean;
  region?: string;
  projectId?: string;
}

export interface DesktopRuntimeSnapshot {
  runtimeMode: 'real' | 'mock';
  status?: RuntimeStatus;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  provider?: {
    kind: ProviderKind;
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    enabled?: boolean;
    label?: string;
    region?: string;
    projectId?: string;
  };
}

export interface DesktopProviderSecret {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  secretId: string | null;
  secretKey: string | null;
  region: string;
  projectId: string;
}

export interface DesktopSettingsPayload {
  shortcut: string;
  desktopMode: boolean;
  defaultTargetLang: string;
  runtimeMode: 'real' | 'mock';
  provider: DesktopProviderSummary;
}

export interface DesktopSettingsUpdate {
  shortcut?: string;
  defaultTargetLang?: string;
  provider?: {
    kind?: Extract<ProviderKind, 'openai-compatible' | 'tencent'>;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    secretId?: string;
    secretKey?: string;
    region?: string;
    projectId?: string;
  };
}

declare global {
  interface Window {
    transloomDesktop?: {
      getSettings: () => Promise<DesktopSettingsPayload>;
      getRuntimeMode: () => Promise<DesktopRuntimeSnapshot>;
      getProviderSecret: () => Promise<DesktopProviderSecret>;
      getCapabilities: () => Promise<{
        desktopAvailable: boolean;
        appIdentity?: {
          appName: string;
          appPath: string;
          isPackaged: boolean;
        };
        accessibility: {
          granted: boolean;
          status: 'granted' | 'not-granted';
          message: string;
          canOpenSettings?: boolean;
        };
        screenRecording: {
          granted: boolean;
          status: 'granted' | 'not-granted';
          message: string;
          canOpenSettings?: boolean;
        };
        selectedTextTrigger: {
          available: boolean;
          requiresShortcut: boolean;
        };
      }>;
      refreshCapabilities: () => Promise<{
        desktopAvailable: boolean;
        appIdentity?: {
          appName: string;
          appPath: string;
          isPackaged: boolean;
        };
        accessibility: {
          granted: boolean;
          status: 'granted' | 'not-granted';
          message: string;
          canOpenSettings?: boolean;
        };
        screenRecording: {
          granted: boolean;
          status: 'granted' | 'not-granted';
          message: string;
          canOpenSettings?: boolean;
        };
        selectedTextTrigger: {
          available: boolean;
          requiresShortcut: boolean;
        };
      }>;
      relaunchApp: () => Promise<{ relaunching: boolean }>;
      openAccessibilitySettings: () => Promise<{ opened: boolean }>;
      openScreenRecordingSettings: () => Promise<{ opened: boolean }>;
      saveSettings: (payload: DesktopSettingsUpdate) => Promise<DesktopSettingsPayload>;
      testProviderConnection: (payload?: DesktopSettingsUpdate['provider']) => Promise<{
        ok: boolean;
        code: string;
        message: string;
        runtimeMode: 'real' | 'mock';
      }>;
      setShortcut: (shortcut: string) => Promise<{ shortcut: string }>;
      showOverlay: () => Promise<{ visible: boolean }>;
      showMainWindow: () => Promise<{ visible: boolean }>;
      hidePopupWindow: () => Promise<{ visible: boolean }>;
      showPopupWindow: () => Promise<{ visible: boolean }>;
      showCaptureWindow: () => Promise<{ visible: boolean }>;
      submitCaptureSelection: (payload: CaptureSelectionPayload) => Promise<{ filePath: string; capturedAt: string }>;
      cancelCaptureSelection: () => Promise<{ visible: boolean }>;
      getLatestCapture: () => Promise<{ filePath: string; capturedAt: string } | null>;
      getPopupState: () => Promise<PopupTranslationState | null>;
      getWorkspaceDraft: () => Promise<WorkspaceDraftState | null>;
      promotePopupToWorkspace: () => Promise<WorkspaceDraftState | null>;
      onCaptureCompleted: (callback: (payload: { filePath: string; capturedAt: string }) => void) => () => void;
      onCaptureCancelled: (callback: (payload: { filePath: null; message?: string }) => void) => () => void;
      onCaptureWindowClosed: (callback: (payload: { reason: 'closed' | 'blurred'; message?: string }) => void) => () => void;
      onPopupStateUpdated: (callback: (payload: PopupTranslationState) => void) => () => void;
      onWorkspaceDraftUpdated: (callback: (payload: WorkspaceDraftState) => void) => () => void;
    };
  }
}

export const desktopClient = {
  isAvailable() {
    return typeof window !== 'undefined' && Boolean(window.transloomDesktop);
  },
  getSettings() {
    return window.transloomDesktop?.getSettings();
  },
  getRuntimeMode() {
    return window.transloomDesktop?.getRuntimeMode();
  },
  getProviderSecret() {
    return window.transloomDesktop?.getProviderSecret();
  },
  getCapabilities() {
    return window.transloomDesktop?.getCapabilities();
  },
  refreshCapabilities() {
    return window.transloomDesktop?.refreshCapabilities();
  },
  relaunchApp() {
    return window.transloomDesktop?.relaunchApp();
  },
  openAccessibilitySettings() {
    return window.transloomDesktop?.openAccessibilitySettings();
  },
  openScreenRecordingSettings() {
    return window.transloomDesktop?.openScreenRecordingSettings();
  },
  saveSettings(payload: DesktopSettingsUpdate) {
    return window.transloomDesktop?.saveSettings(payload);
  },
  testProviderConnection(payload?: DesktopSettingsUpdate['provider']) {
    return window.transloomDesktop?.testProviderConnection(payload);
  },
  setShortcut(shortcut: string) {
    return window.transloomDesktop?.setShortcut(shortcut);
  },
  showOverlay() {
    return window.transloomDesktop?.showOverlay();
  },
  showMainWindow() {
    return window.transloomDesktop?.showMainWindow();
  },
  hidePopupWindow() {
    return window.transloomDesktop?.hidePopupWindow();
  },
  showPopupWindow() {
    return window.transloomDesktop?.showPopupWindow();
  },
  showCaptureWindow() {
    return window.transloomDesktop?.showCaptureWindow();
  },
  submitCaptureSelection(payload: CaptureSelectionPayload) {
    return window.transloomDesktop?.submitCaptureSelection(payload);
  },
  cancelCaptureSelection() {
    return window.transloomDesktop?.cancelCaptureSelection();
  },
  getLatestCapture() {
    return window.transloomDesktop?.getLatestCapture();
  },
  getPopupState() {
    return window.transloomDesktop?.getPopupState();
  },
  getWorkspaceDraft() {
    return window.transloomDesktop?.getWorkspaceDraft();
  },
  promotePopupToWorkspace() {
    return window.transloomDesktop?.promotePopupToWorkspace();
  },
  onCaptureCompleted(callback: (payload: { filePath: string; capturedAt: string }) => void) {
    return window.transloomDesktop?.onCaptureCompleted(callback) ?? (() => undefined);
  },
  onCaptureCancelled(callback: (payload: { filePath: null; message?: string }) => void) {
    return window.transloomDesktop?.onCaptureCancelled(callback) ?? (() => undefined);
  },
  onCaptureWindowClosed(callback: (payload: { reason: 'closed' | 'blurred'; message?: string }) => void) {
    return window.transloomDesktop?.onCaptureWindowClosed(callback) ?? (() => undefined);
  },
  onPopupStateUpdated(callback: (payload: PopupTranslationState) => void) {
    return window.transloomDesktop?.onPopupStateUpdated(callback) ?? (() => undefined);
  },
  onWorkspaceDraftUpdated(callback: (payload: WorkspaceDraftState) => void) {
    return window.transloomDesktop?.onWorkspaceDraftUpdated(callback) ?? (() => undefined);
  },
};
