import { contextBridge, ipcRenderer } from 'electron';

const settingsChannels = {
  get: 'desktop:get-settings',
  getRuntimeMode: 'desktop:get-runtime-mode',
  getProviderSecret: 'desktop:get-provider-secret',
  saveSettings: 'desktop:save-settings',
  testProviderConnection: 'desktop:test-provider-connection',
  setShortcut: 'desktop:set-shortcut',
  showOverlay: 'desktop:show-overlay',
  showMainWindow: 'desktop:show-main-window',
  hidePopupWindow: 'desktop:hide-popup-window',
  showPopupWindow: 'desktop:show-popup-window',
  getCapabilities: 'desktop:get-capabilities',
  refreshCapabilities: 'desktop:refresh-capabilities',
  openAccessibilitySettings: 'desktop:open-accessibility-settings',
  openScreenRecordingSettings: 'desktop:open-screen-recording-settings',
  showCaptureWindow: 'desktop:show-capture-window',
  submitCaptureSelection: 'desktop:submit-capture-selection',
  cancelCaptureSelection: 'desktop:cancel-capture-selection',
  getLatestCapture: 'desktop:get-latest-capture',
  getPopupState: 'desktop:get-popup-state',
  getWorkspaceDraft: 'desktop:get-workspace-draft',
  promotePopupToWorkspace: 'desktop:promote-popup-to-workspace',
  popupStateUpdated: 'popup:state-updated',
  workspaceDraftUpdated: 'workspace:draft-updated',
  captureCompleted: 'capture:completed',
  captureCancelled: 'capture:cancelled',
} as const;

contextBridge.exposeInMainWorld('transloomDesktop', {
  getSettings: () => ipcRenderer.invoke(settingsChannels.get),
  getRuntimeMode: () => ipcRenderer.invoke(settingsChannels.getRuntimeMode),
  getProviderSecret: () => ipcRenderer.invoke(settingsChannels.getProviderSecret),
  getCapabilities: () => ipcRenderer.invoke(settingsChannels.getCapabilities),
  refreshCapabilities: () => ipcRenderer.invoke(settingsChannels.refreshCapabilities),
  openAccessibilitySettings: () => ipcRenderer.invoke(settingsChannels.openAccessibilitySettings),
  openScreenRecordingSettings: () => ipcRenderer.invoke(settingsChannels.openScreenRecordingSettings),
  saveSettings: (payload: unknown) => ipcRenderer.invoke(settingsChannels.saveSettings, payload),
  testProviderConnection: (payload: unknown) => ipcRenderer.invoke(settingsChannels.testProviderConnection, payload),
  setShortcut: (shortcut: string) => ipcRenderer.invoke(settingsChannels.setShortcut, shortcut),
  showOverlay: () => ipcRenderer.invoke(settingsChannels.showOverlay),
  showMainWindow: () => ipcRenderer.invoke(settingsChannels.showMainWindow),
  hidePopupWindow: () => ipcRenderer.invoke(settingsChannels.hidePopupWindow),
  showPopupWindow: () => ipcRenderer.invoke(settingsChannels.showPopupWindow),
  showCaptureWindow: () => ipcRenderer.invoke(settingsChannels.showCaptureWindow),
  submitCaptureSelection: (payload: unknown) => ipcRenderer.invoke(settingsChannels.submitCaptureSelection, payload),
  cancelCaptureSelection: () => ipcRenderer.invoke(settingsChannels.cancelCaptureSelection),
  getLatestCapture: () => ipcRenderer.invoke(settingsChannels.getLatestCapture),
  getPopupState: () => ipcRenderer.invoke(settingsChannels.getPopupState),
  getWorkspaceDraft: () => ipcRenderer.invoke(settingsChannels.getWorkspaceDraft),
  promotePopupToWorkspace: () => ipcRenderer.invoke(settingsChannels.promotePopupToWorkspace),
  onCaptureCompleted: (callback: (payload: { filePath: string; capturedAt: string }) => void) => {
    const listener = (_event: unknown, payload: { filePath: string; capturedAt: string }) => callback(payload);
    ipcRenderer.on(settingsChannels.captureCompleted, listener);
    return () => ipcRenderer.removeListener(settingsChannels.captureCompleted, listener);
  },
  onCaptureCancelled: (callback: (payload: { filePath: null; message?: string }) => void) => {
    const listener = (_event: unknown, payload: { filePath: null; message?: string }) => callback(payload);
    ipcRenderer.on(settingsChannels.captureCancelled, listener);
    return () => ipcRenderer.removeListener(settingsChannels.captureCancelled, listener);
  },
  onPopupStateUpdated: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on(settingsChannels.popupStateUpdated, listener);
    return () => ipcRenderer.removeListener(settingsChannels.popupStateUpdated, listener);
  },
  onWorkspaceDraftUpdated: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on(settingsChannels.workspaceDraftUpdated, listener);
    return () => ipcRenderer.removeListener(settingsChannels.workspaceDraftUpdated, listener);
  },
});
