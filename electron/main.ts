import { app, BrowserWindow, ipcMain } from 'electron';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureSelectionPayload } from '@/domain/capture/types';
import { settingsChannels } from './ipc/settings';
import { createAccessibilityService } from './services/accessibility.service';
import { createHotkeyService } from './services/hotkey.service';
import { createPopupStateService } from './services/popup-state.service';
import { createRegionCaptureService } from './services/region-capture.service';
import { createSecureConfigService } from './services/secure-config.service';
import { createSelectedTextService } from './services/selected-text.service';
import { createWindowManager } from './services/window-manager.service';
import { createWorkspaceDraftService } from './services/workspace-draft.service';

const PROD_PORT = 3232;

let rendererServer: ChildProcess | null = null;
const secureConfigService = createSecureConfigService();
const accessibilityService = createAccessibilityService();
const hotkeyService = createHotkeyService();
const regionCaptureService = createRegionCaptureService();
const selectedTextService = createSelectedTextService();
const popupStateService = createPopupStateService();
const workspaceDraftService = createWorkspaceDraftService();
const windowManager = createWindowManager(path.join(__dirname, 'preload.js'));
let currentShortcut = hotkeyService.defaultShortcut;
let latestCapture: { filePath: string; capturedAt: string } | null = null;

function isDevelopment() {
  return process.env.NODE_ENV === 'development' || Boolean(process.env.ELECTRON_START_URL);
}

function maskApiKey(apiKey?: string) {
  if (!apiKey) {
    return undefined;
  }

  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }

  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
}

async function ensureLocalDatabase() {
  const targetDir = app.getPath('userData');
  const targetDb = path.join(targetDir, 'transloom.db');
  const bundledDb = isDevelopment()
    ? path.join(app.getAppPath(), 'prisma', 'transloom.db')
    : path.join(process.resourcesPath, 'app-dist', 'prisma', 'transloom.db');

  await mkdir(targetDir, { recursive: true });

  try {
    await access(targetDb);
  } catch {
    try {
      await copyFile(bundledDb, targetDb);
    } catch {
      // ignore; prisma will create the db on demand if schema exists
    }
  }

  process.env.TRANSLOOM_DATA_DIR = targetDir;
}

async function waitForServer(url: string, timeoutMs = 20000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Renderer server did not start in time: ${url}`);
}

async function getRendererUrl() {
  if (isDevelopment()) {
    return process.env.ELECTRON_START_URL ?? 'http://localhost:3000';
  }

  const appDistRoot = path.join(process.resourcesPath, 'app-dist');
  const serverScript = path.join(appDistRoot, '.next', 'standalone', 'server.js');
  const serverUrl = `http://127.0.0.1:${PROD_PORT}`;

  if (!rendererServer) {
    rendererServer = spawn(process.execPath, [serverScript], {
      cwd: appDistRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(PROD_PORT),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        TRANSLOOM_DATA_DIR: app.getPath('userData'),
      },
      stdio: 'ignore',
    });
  }

  await waitForServer(serverUrl);
  return serverUrl;
}

function getDesktopCapabilities() {
  const accessibility = accessibilityService.getSnapshot();
  const screenRecording = accessibilityService.getScreenRecordingSnapshot();

  return {
    desktopAvailable: true,
    accessibility,
    screenRecording,
    selectedTextTrigger: {
      available: accessibility.granted,
      requiresShortcut: true,
    },
  };
}

async function getDesktopSettings() {
  const settings = await secureConfigService.getSettings();
  const runtimeSnapshot = await secureConfigService.getRuntimeMode();
  currentShortcut = settings.shortcut || hotkeyService.defaultShortcut;

  return {
    shortcut: currentShortcut,
    desktopMode: true,
    defaultTargetLang: settings.defaultTargetLang,
    runtimeMode: runtimeSnapshot.runtimeMode,
    provider: {
      baseUrl: settings.provider.baseUrl,
      model: settings.provider.model,
      apiKeyMasked: maskApiKey(settings.provider.apiKey),
      hasApiKey: Boolean(settings.provider.apiKey),
    },
  };
}

function notifyCaptureWindowClosed(reason: 'closed' | 'blurred', message?: string) {
  const payload = { reason, message };
  const captureWindow = windowManager.getCaptureWindow();
  const mainWindow = windowManager.getMainWindow();

  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.send(settingsChannels.captureWindowClosed, payload);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(settingsChannels.captureWindowClosed, payload);
  }
}

function clearLatestCapture() {
  latestCapture = null;
}

function createMainWindow(rendererUrl: string) {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const revealWindow = () => {
    if (mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once('ready-to-show', revealWindow);
  mainWindow.webContents.once('did-finish-load', revealWindow);
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error('Main window failed to load', { errorCode, errorDescription, validatedUrl });
  });

  windowManager.attachMainWindow(mainWindow);
  void mainWindow.loadURL(rendererUrl);
}

async function translateSelectedText() {
  const mainWindow = windowManager.getMainWindow();
  windowManager.showPopupWindow();
  const popupWindow = windowManager.getPopupWindow();
  const settings = await secureConfigService.getSettings();

  try {
    const sourceText = await selectedTextService.readSelectedText();
    const loadingState = popupStateService.setState({
      sourceText,
      translatedText: '',
      targetLang: settings.defaultTargetLang,
      isLoading: true,
      updatedAt: new Date().toISOString(),
    });

    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send(settingsChannels.popupStateUpdated, loadingState);
    }
    mainWindow?.webContents.send(settingsChannels.popupStateUpdated, loadingState);

    const response = await fetch(`${await getRendererUrl()}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sourceText,
        targetLang: settings.defaultTargetLang,
        providerId: 'openai-compatible',
        providerConfig: {
          baseUrl: settings.provider.baseUrl,
          model: settings.provider.model,
          apiKey: settings.provider.apiKey,
        },
      }),
    });

    const result = await response.json();
    const nextState = popupStateService.setState({
      sourceText,
      translatedText: result.text ?? '',
      targetLang: settings.defaultTargetLang,
      sourceLang: result.detectedSourceLang,
      warning: response.ok ? result.warning : undefined,
      error: response.ok ? undefined : (result.message ?? '选中文本翻译失败。'),
      isLoading: false,
      updatedAt: new Date().toISOString(),
    });

    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send(settingsChannels.popupStateUpdated, nextState);
    }
    mainWindow?.webContents.send(settingsChannels.popupStateUpdated, nextState);
  } catch (error) {
    const nextState = popupStateService.setState({
      sourceText: '',
      translatedText: '',
      targetLang: settings.defaultTargetLang,
      error: error instanceof Error ? error.message : '选中文本翻译失败。',
      isLoading: false,
      updatedAt: new Date().toISOString(),
    });

    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send(settingsChannels.popupStateUpdated, nextState);
    }
    mainWindow?.webContents.send(settingsChannels.popupStateUpdated, nextState);
  }
}

function registerShortcut(shortcut: string) {
  hotkeyService.register(shortcut, async () => {
    const capabilities = getDesktopCapabilities();

    if (capabilities.accessibility.granted) {
      await translateSelectedText();
      return;
    }

    windowManager.showCaptureWindow();
  });
}

app.whenReady().then(async () => {
  await ensureLocalDatabase();
  const rendererUrl = await getRendererUrl();
  windowManager.setRendererBaseUrl(rendererUrl);
  windowManager.onCaptureWindowClosed((reason) => {
    notifyCaptureWindowClosed(reason, reason === 'blurred' ? '截图窗口失焦，已结束本次框选。' : '截图窗口已关闭。');
  });

  createMainWindow(rendererUrl);

  const initialSettings = await secureConfigService.getSettings();
  currentShortcut = initialSettings.shortcut || hotkeyService.defaultShortcut;
  registerShortcut(currentShortcut);

  ipcMain.handle(settingsChannels.get, async () => getDesktopSettings());
  ipcMain.handle(settingsChannels.getRuntimeMode, async () => secureConfigService.getRuntimeMode());
  ipcMain.handle(settingsChannels.getProviderSecret, async () => {
    const settings = await secureConfigService.getSettings();
    return {
      baseUrl: settings.provider.baseUrl,
      model: settings.provider.model,
      apiKey: settings.provider.apiKey ?? null,
    };
  });
  ipcMain.handle(settingsChannels.getCapabilities, async () => getDesktopCapabilities());
  ipcMain.handle(settingsChannels.refreshCapabilities, async () => getDesktopCapabilities());
  ipcMain.handle(settingsChannels.openAccessibilitySettings, async () => accessibilityService.openSettings());
  ipcMain.handle(settingsChannels.openScreenRecordingSettings, async () => accessibilityService.openScreenRecordingSettings());

  ipcMain.handle(
    settingsChannels.saveSettings,
    async (
      _event,
      payload: {
        shortcut?: string;
        defaultTargetLang?: string;
        provider?: {
          baseUrl?: string;
          model?: string;
          apiKey?: string;
        };
      },
    ) => {
      const saved = await secureConfigService.saveSettings(payload);
      const runtimeSnapshot = await secureConfigService.getRuntimeMode();

      if (payload.shortcut && payload.shortcut !== currentShortcut) {
        currentShortcut = payload.shortcut || hotkeyService.defaultShortcut;
        registerShortcut(currentShortcut);
      }

      return {
        shortcut: saved.shortcut,
        desktopMode: true,
        defaultTargetLang: saved.defaultTargetLang,
        runtimeMode: runtimeSnapshot.runtimeMode,
        provider: {
          baseUrl: saved.provider.baseUrl,
          model: saved.provider.model,
          apiKeyMasked: maskApiKey(saved.provider.apiKey),
          hasApiKey: Boolean(saved.provider.apiKey),
        },
      };
    },
  );

  ipcMain.handle(settingsChannels.testProviderConnection, async (_event, payload) => secureConfigService.testProviderConnection(payload));

  ipcMain.handle(settingsChannels.setShortcut, async (_event, shortcut: string) => {
    currentShortcut = shortcut || hotkeyService.defaultShortcut;
    await secureConfigService.saveSettings({ shortcut: currentShortcut });
    registerShortcut(currentShortcut);
    return { shortcut: currentShortcut };
  });

  ipcMain.handle(settingsChannels.showOverlay, () => windowManager.showCaptureWindow());
  ipcMain.handle(settingsChannels.showMainWindow, () => {
    windowManager.hidePopupWindow();
    return windowManager.showMainWindow();
  });
  ipcMain.handle(settingsChannels.hidePopupWindow, () => windowManager.hidePopupWindow());
  ipcMain.handle(settingsChannels.showPopupWindow, () => windowManager.showPopupWindow());
  ipcMain.handle(settingsChannels.showCaptureWindow, () => windowManager.showCaptureWindow());
  ipcMain.handle(settingsChannels.getLatestCapture, async () => {
    if (!latestCapture?.filePath) {
      return null;
    }

    try {
      await access(latestCapture.filePath);
      return latestCapture;
    } catch {
      clearLatestCapture();
      return null;
    }
  });
  ipcMain.handle(settingsChannels.getPopupState, () => popupStateService.getState());
  ipcMain.handle(settingsChannels.getWorkspaceDraft, () => workspaceDraftService.getDraft());
  ipcMain.handle(settingsChannels.promotePopupToWorkspace, () => {
    const popupState = popupStateService.getState();
    if (!popupState || popupState.isLoading) {
      return workspaceDraftService.getDraft();
    }
    const draft = workspaceDraftService.setDraft({
      sourceText: popupState.sourceText,
      translatedText: popupState.translatedText,
      targetLang: popupState.targetLang,
      sourceLang: popupState.sourceLang,
      warning: popupState.warning,
      updatedAt: new Date().toISOString(),
    });
    windowManager.getMainWindow()?.webContents.send(settingsChannels.workspaceDraftUpdated, draft);
    windowManager.hidePopupWindow();
    windowManager.showMainWindow();
    return draft;
  });
  ipcMain.handle(settingsChannels.cancelCaptureSelection, () => {
    windowManager.hideCaptureWindow();
    windowManager.getCaptureWindow()?.webContents.send(settingsChannels.captureCancelled, { filePath: null, message: '截图已取消。' });
    notifyCaptureWindowClosed('closed', '截图窗口已关闭。');
    return { visible: false };
  });
  ipcMain.handle(settingsChannels.submitCaptureSelection, async (_event, payload: CaptureSelectionPayload) => {
    const result = await regionCaptureService.captureSelection(payload);
    latestCapture = result;
    const captureWindow = windowManager.getCaptureWindow();
    const mainWindow = windowManager.getMainWindow();

    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.webContents.send(settingsChannels.captureCompleted, result);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(settingsChannels.captureCompleted, result);
    }

    windowManager.hideCaptureWindow();
    notifyCaptureWindowClosed('closed', '截图窗口已完成并关闭。');
    windowManager.showMainWindow();
    return result;
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextRendererUrl = await getRendererUrl();
      windowManager.setRendererBaseUrl(nextRendererUrl);
      createMainWindow(nextRendererUrl);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (rendererServer) {
    rendererServer.kill();
    rendererServer = null;
  }
});

app.on('will-quit', () => {
  hotkeyService.unregisterAll();
});
