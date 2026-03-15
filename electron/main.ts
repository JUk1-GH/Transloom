import { app, BrowserWindow, ipcMain, screen } from 'electron';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CaptureSelectionPayload } from '@/domain/capture/types';
import { settingsChannels } from './ipc/settings';
import { createAccessibilityService } from './services/accessibility.service';
import { createHotkeyService } from './services/hotkey.service';
import { createPopupStateService } from './services/popup-state.service';
import { createRegionCaptureService } from './services/region-capture.service';
import { createSecureConfigService, type SecureSettingsData, type RuntimeMode } from './services/secure-config.service';
import { createSelectedTextService } from './services/selected-text.service';
import {
  TENCENT_CLOUD_ACTION,
  TENCENT_CLOUD_DEFAULT_REGION,
  TENCENT_CLOUD_ENDPOINT,
  testTencentCloudConnection,
} from './services/tencent-cloud.service';
import { createWindowManager } from './services/window-manager.service';
import { createWorkspaceDraftService } from './services/workspace-draft.service';

const PROD_PORT = 3232;
const DEV_WEB_PORT = process.env.TRANSLOOM_WEB_PORT ?? '3003';
const HARNESS_ENABLED = process.env.TRANSLOOM_HARNESS === '1';
const HARNESS_DEFAULT_SETTINGS: SecureSettingsData = {
  provider: {
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    region: TENCENT_CLOUD_DEFAULT_REGION,
    projectId: '0',
  },
  defaultTargetLang: 'zh-CN',
  shortcut: 'CommandOrControl+Shift+2',
};
const HARNESS_PORT = (() => {
  const value = Number(process.env.TRANSLOOM_HARNESS_PORT ?? '37731');
  return Number.isFinite(value) && value > 0 ? value : 37731;
})();

let rendererServer: ChildProcess | null = null;
let harnessServer: Server | null = null;
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
let shortcutRegistrationIssue: string | null = null;
let harnessSettings: SecureSettingsData = cloneHarnessSettings();

function cloneHarnessSettings(): SecureSettingsData {
  return {
    provider: { ...HARNESS_DEFAULT_SETTINGS.provider },
    defaultTargetLang: HARNESS_DEFAULT_SETTINGS.defaultTargetLang,
    shortcut: HARNESS_DEFAULT_SETTINGS.shortcut,
  };
}

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

function getEffectiveProvider(provider: SecureSettingsData['provider']) {
  return {
    kind: provider.kind,
    baseUrl: provider.kind === 'tencent' ? TENCENT_CLOUD_ENDPOINT : provider.baseUrl,
    model: provider.kind === 'tencent' ? TENCENT_CLOUD_ACTION : provider.model,
    apiKey: provider.apiKey?.trim() || undefined,
    secretId: provider.secretId?.trim() || undefined,
    secretKey: provider.secretKey?.trim() || undefined,
    region: provider.region.trim() || TENCENT_CLOUD_DEFAULT_REGION,
    projectId: provider.projectId?.trim() || '0',
  };
}

function hasProviderCredential(provider: ReturnType<typeof getEffectiveProvider>) {
  return provider.kind === 'tencent'
    ? Boolean(provider.secretId && provider.secretKey)
    : Boolean(provider.apiKey);
}

function hasCompleteProvider(provider: ReturnType<typeof getEffectiveProvider>) {
  return provider.kind === 'tencent'
    ? Boolean(provider.region && provider.secretId && provider.secretKey)
    : Boolean(provider.baseUrl.trim() && provider.model.trim() && provider.apiKey);
}

function buildProviderSummary(provider: SecureSettingsData['provider']) {
  const effectiveProvider = getEffectiveProvider(provider);
  const hasCredential = hasProviderCredential(effectiveProvider);

  return {
    kind: effectiveProvider.kind,
    baseUrl: effectiveProvider.baseUrl,
    model: effectiveProvider.model,
    apiKeyMasked: maskApiKey(provider.apiKey),
    hasApiKey: hasCredential,
    secretId: provider.secretId ?? '',
    secretKeyMasked: maskApiKey(provider.secretKey),
    hasSecretKey: Boolean(provider.secretKey),
    region: effectiveProvider.region,
    projectId: effectiveProvider.projectId,
  };
}

function buildProviderSecret(provider: SecureSettingsData['provider']) {
  const effectiveProvider = getEffectiveProvider(provider);

  return {
    kind: effectiveProvider.kind,
    baseUrl: effectiveProvider.baseUrl,
    model: effectiveProvider.model,
    apiKey: provider.apiKey ?? null,
    secretId: provider.secretId ?? null,
    secretKey: provider.secretKey ?? null,
    region: effectiveProvider.region,
    projectId: effectiveProvider.projectId,
  };
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
    return process.env.ELECTRON_START_URL ?? `http://127.0.0.1:${DEV_WEB_PORT}`;
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
  if (HARNESS_ENABLED) {
    const runtimeSnapshot = getHarnessRuntimeMode();
    return {
      shortcut: harnessSettings.shortcut,
      desktopMode: true,
      defaultTargetLang: harnessSettings.defaultTargetLang,
      runtimeMode: runtimeSnapshot.runtimeMode,
      provider: buildProviderSummary(harnessSettings.provider),
    };
  }

  const settings = await secureConfigService.getSettings();
  const runtimeSnapshot = await secureConfigService.getRuntimeMode();
  currentShortcut = settings.shortcut || hotkeyService.defaultShortcut;

  return {
    shortcut: currentShortcut,
    desktopMode: true,
    defaultTargetLang: settings.defaultTargetLang,
    runtimeMode: runtimeSnapshot.runtimeMode,
    provider: buildProviderSummary(settings.provider),
  };
}

function getHarnessRuntimeMode() {
  const provider = getEffectiveProvider(harnessSettings.provider);
  const hasApiKey = hasProviderCredential(provider);
  return {
    runtimeMode: (hasCompleteProvider(provider) ? 'real' : 'mock') as RuntimeMode,
    baseUrl: provider.baseUrl || null,
    model: provider.model || null,
    hasApiKey,
    provider: {
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      hasApiKey,
      region: provider.region,
      projectId: provider.projectId,
    },
  };
}

function getHarnessProviderSecret() {
  return buildProviderSecret(harnessSettings.provider);
}

function applyHarnessSettings(payload: {
  shortcut?: string;
  defaultTargetLang?: string;
  provider?: {
    kind?: SecureSettingsData['provider']['kind'];
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    secretId?: string;
    secretKey?: string;
    region?: string;
    projectId?: string;
  };
}) {
  harnessSettings = {
    provider: {
      kind: payload.provider?.kind ?? harnessSettings.provider.kind ?? HARNESS_DEFAULT_SETTINGS.provider.kind,
      baseUrl: payload.provider?.baseUrl?.trim() || harnessSettings.provider.baseUrl || HARNESS_DEFAULT_SETTINGS.provider.baseUrl,
      model: payload.provider?.model?.trim() || harnessSettings.provider.model || HARNESS_DEFAULT_SETTINGS.provider.model,
      apiKey: payload.provider?.apiKey === undefined
        ? harnessSettings.provider.apiKey
        : payload.provider.apiKey?.trim() || undefined,
      secretId: payload.provider?.secretId === undefined
        ? harnessSettings.provider.secretId
        : payload.provider.secretId?.trim() || undefined,
      secretKey: payload.provider?.secretKey === undefined
        ? harnessSettings.provider.secretKey
        : payload.provider.secretKey?.trim() || undefined,
      region: payload.provider?.region?.trim() || harnessSettings.provider.region || HARNESS_DEFAULT_SETTINGS.provider.region,
      projectId: payload.provider?.projectId?.trim() || harnessSettings.provider.projectId || HARNESS_DEFAULT_SETTINGS.provider.projectId,
    },
    defaultTargetLang: payload.defaultTargetLang?.trim() || harnessSettings.defaultTargetLang || HARNESS_DEFAULT_SETTINGS.defaultTargetLang,
    shortcut: payload.shortcut?.trim() || harnessSettings.shortcut || HARNESS_DEFAULT_SETTINGS.shortcut,
  };
  currentShortcut = harnessSettings.shortcut;
  return harnessSettings;
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

function serializeWindow(window: BrowserWindow | null) {
  if (!window || window.isDestroyed()) {
    return {
      exists: false,
      visible: false,
      bounds: null,
    };
  }

  return {
    exists: true,
    visible: window.isVisible(),
    focused: window.isFocused(),
    bounds: window.getBounds(),
  };
}

function getHarnessState(rendererUrl: string) {
  return {
    ready: true,
    rendererUrl,
    latestCapture,
    shortcutRegistrationIssue,
    mainWindow: serializeWindow(windowManager.getMainWindow()),
    captureWindow: serializeWindow(windowManager.getCaptureWindow()),
    popupWindow: serializeWindow(windowManager.getPopupWindow()),
  };
}

function electronScreenSnapshot() {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    id: primaryDisplay.id,
    bounds: primaryDisplay.bounds,
    workArea: primaryDisplay.workArea,
    scaleFactor: primaryDisplay.scaleFactor,
  };
}

function createDefaultHarnessSelection(): CaptureSelectionPayload {
  const primaryDisplay = screen.getPrimaryDisplay();
  const width = Math.max(320, Math.round(primaryDisplay.workArea.width * 0.28));
  const height = Math.max(220, Math.round(primaryDisplay.workArea.height * 0.24));
  const x = primaryDisplay.workArea.x + Math.round((primaryDisplay.workArea.width - width) / 2);
  const y = primaryDisplay.workArea.y + Math.round((primaryDisplay.workArea.height - height) / 2);

  return {
    x,
    y,
    width,
    height,
    scaleFactor: primaryDisplay.scaleFactor,
    displayId: primaryDisplay.id,
  };
}

function isCaptureSelectionPayload(value: unknown): value is CaptureSelectionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CaptureSelectionPayload>;
  return ['x', 'y', 'width', 'height', 'scaleFactor'].every((key) => Number.isFinite(candidate[key as keyof CaptureSelectionPayload] as number));
}

async function executeCaptureSelection(payload: CaptureSelectionPayload) {
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
}

function emitCaptureCancelled(message: string) {
  const captureWindow = windowManager.getCaptureWindow();
  const mainWindow = windowManager.getMainWindow();
  const payload = { filePath: null, message };

  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.send(settingsChannels.captureCancelled, payload);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(settingsChannels.captureCancelled, payload);
  }
}

async function startNativeCaptureSelection() {
  const mainWindow = windowManager.getMainWindow();
  const popupWindow = windowManager.getPopupWindow();

  popupWindow?.hide();
  mainWindow?.hide();

  await new Promise((resolve) => setTimeout(resolve, 120));

  try {
    const result = await regionCaptureService.captureNativeSelection();
    latestCapture = result;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(settingsChannels.captureCompleted, result);
    }

    return result;
  } catch (error) {
    const isCancelled = typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'SCREENSHOT_CAPTURE_CANCELLED';

    if (isCancelled) {
      emitCaptureCancelled('截图已取消。');
      return null;
    }

    throw error;
  } finally {
    windowManager.showMainWindow();
  }
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

async function captureWindowPng(window: BrowserWindow | null) {
  if (!window || window.isDestroyed()) {
    throw new Error('window is not available');
  }

  const image = await window.webContents.capturePage();
  return image.toPNG();
}

async function startHarnessServer(rendererUrl: string) {
  if (!HARNESS_ENABLED || harnessServer) {
    return;
  }

  harnessServer = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      console.log(`[harness] ${request.method ?? 'GET'} ${url.pathname}`);

      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, getHarnessState(rendererUrl));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/capture/show') {
        windowManager.showCaptureWindow();
        sendJson(response, 200, getHarnessState(rendererUrl));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/capture/hide') {
        windowManager.hideCaptureWindow();
        sendJson(response, 200, getHarnessState(rendererUrl));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/capture/simulate') {
        const body = await readJsonBody(request);
        const payload = isCaptureSelectionPayload((body as { selection?: unknown }).selection)
          ? (body as { selection: CaptureSelectionPayload }).selection
          : createDefaultHarnessSelection();

        try {
          const result = await executeCaptureSelection(payload);
          sendJson(response, 200, {
            status: 'passed',
            selection: payload,
            result,
            state: getHarnessState(rendererUrl),
          });
        } catch (error) {
          const capabilities = getDesktopCapabilities();
          const message = error instanceof Error ? error.message : 'unknown capture failure';
          sendJson(response, capabilities.screenRecording.granted ? 500 : 200, {
            status: capabilities.screenRecording.granted ? 'failed' : 'blocked',
            selection: payload,
            reason: message,
            capabilities,
            state: getHarnessState(rendererUrl),
          });
        }
        return;
      }

      if (request.method === 'GET' && url.pathname === '/window/main/screenshot') {
        const png = await captureWindowPng(windowManager.getMainWindow());
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(png);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/window/capture/screenshot') {
        const png = await captureWindowPng(windowManager.getCaptureWindow());
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(png);
        return;
      }

      sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'unknown harness error' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    harnessServer?.once('error', reject);
    harnessServer?.listen(HARNESS_PORT, '127.0.0.1', () => resolve());
  });

  console.log(`[harness] desktop smoke control listening on http://127.0.0.1:${HARNESS_PORT}`);
}

function createMainWindow(rendererUrl: string) {
  const mainWindow = new BrowserWindow({
    width: 985,
    height: 713,
    minWidth: 920,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#121212',
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
        providerId: settings.provider.kind,
        providerConfig: buildProviderSecret(settings.provider),
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
  try {
    hotkeyService.register(shortcut, async () => {
      const capabilities = getDesktopCapabilities();
      const shouldTrySelectedText = capabilities.accessibility.granted || isDevelopment();

      if (shouldTrySelectedText) {
        await translateSelectedText();
        return;
      }

      await startNativeCaptureSelection();
    });
    shortcutRegistrationIssue = null;
    return true;
  } catch (error) {
    shortcutRegistrationIssue = error instanceof Error ? error.message : 'Unable to register global shortcut.';
    console.warn(`[shortcut] ${shortcutRegistrationIssue}`);
    return false;
  }
}

app.whenReady().then(async () => {
  try {
    await ensureLocalDatabase();
    const rendererUrl = await getRendererUrl();
    windowManager.setRendererBaseUrl(rendererUrl);
    windowManager.onCaptureWindowClosed((reason) => {
      notifyCaptureWindowClosed(reason, reason === 'blurred' ? '截图窗口失焦，已结束本次框选。' : '截图窗口已关闭。');
    });

    createMainWindow(rendererUrl);
    await startHarnessServer(rendererUrl);

    if (HARNESS_ENABLED) {
      harnessSettings = cloneHarnessSettings();
      currentShortcut = harnessSettings.shortcut;
    } else {
      const initialSettings = await secureConfigService.getSettings();
      currentShortcut = initialSettings.shortcut || hotkeyService.defaultShortcut;
      registerShortcut(currentShortcut);
    }

    ipcMain.handle(settingsChannels.get, async () => getDesktopSettings());
    ipcMain.handle(settingsChannels.getRuntimeMode, async () => (HARNESS_ENABLED ? getHarnessRuntimeMode() : secureConfigService.getRuntimeMode()));
    ipcMain.handle(settingsChannels.getProviderSecret, async () => {
      if (HARNESS_ENABLED) {
        return getHarnessProviderSecret();
      }

      const settings = await secureConfigService.getSettings();
      return buildProviderSecret(settings.provider);
    });
    ipcMain.handle(settingsChannels.getCapabilities, async () => getDesktopCapabilities());
    ipcMain.handle(settingsChannels.refreshCapabilities, async () => getDesktopCapabilities());
    ipcMain.handle(settingsChannels.relaunchApp, async () => {
      setImmediate(() => {
        app.relaunch();
        app.quit();
      });

      return { relaunching: true };
    });
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
            kind?: SecureSettingsData['provider']['kind'];
            baseUrl?: string;
            model?: string;
            apiKey?: string;
            secretId?: string;
            secretKey?: string;
            region?: string;
            projectId?: string;
          };
        },
      ) => {
        if (HARNESS_ENABLED) {
          const saved = applyHarnessSettings(payload);
          const runtimeSnapshot = getHarnessRuntimeMode();
          return {
            shortcut: saved.shortcut,
            desktopMode: true,
            defaultTargetLang: saved.defaultTargetLang,
            runtimeMode: runtimeSnapshot.runtimeMode,
            provider: buildProviderSummary(saved.provider),
          };
        }

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
          provider: buildProviderSummary(saved.provider),
        };
      },
    );

    ipcMain.handle(settingsChannels.testProviderConnection, async (_event, payload) => {
      if (!HARNESS_ENABLED) {
        return secureConfigService.testProviderConnection(payload);
      }

      const provider = {
        ...harnessSettings.provider,
        ...payload,
        kind: payload?.kind ?? harnessSettings.provider.kind,
        baseUrl: payload?.baseUrl?.trim() || harnessSettings.provider.baseUrl,
        model: payload?.model?.trim() || harnessSettings.provider.model,
        apiKey: payload?.apiKey === undefined ? harnessSettings.provider.apiKey : payload.apiKey?.trim() || undefined,
        secretId: payload?.secretId === undefined ? harnessSettings.provider.secretId : payload.secretId?.trim() || undefined,
        secretKey: payload?.secretKey === undefined ? harnessSettings.provider.secretKey : payload.secretKey?.trim() || undefined,
        region: payload?.region?.trim() || harnessSettings.provider.region,
        projectId: payload?.projectId?.trim() || harnessSettings.provider.projectId,
      };
      const effectiveProvider = getEffectiveProvider(provider);

      if (effectiveProvider.kind === 'tencent') {
        if (!effectiveProvider.secretId || !effectiveProvider.secretKey) {
          return {
            ok: false,
            code: 'CONFIG_INCOMPLETE',
            message: '请先填写 SecretId、SecretKey 和 Region。',
            runtimeMode: 'mock' as RuntimeMode,
          };
        }

        return testTencentCloudConnection({
          secretId: effectiveProvider.secretId,
          secretKey: effectiveProvider.secretKey,
          region: effectiveProvider.region,
          projectId: effectiveProvider.projectId,
        });
      }

      if (!effectiveProvider.baseUrl?.trim() || !effectiveProvider.model?.trim() || !effectiveProvider.apiKey?.trim()) {
        return {
          ok: false,
          code: 'CONFIG_INCOMPLETE',
          message: '请先填写 Base URL、Model 和 API Key。',
          runtimeMode: 'mock' as RuntimeMode,
        };
      }

      try {
        const response = await fetch(`${effectiveProvider.baseUrl.replace(/\/$/, '')}/models`, {
          headers: {
            Authorization: `Bearer ${effectiveProvider.apiKey}`,
          },
        });

        if (!response.ok) {
          return {
            ok: false,
            code: `HTTP_${response.status}`,
            message: `连接失败，服务返回 ${response.status}`,
            runtimeMode: 'mock' as RuntimeMode,
          };
        }

        return {
          ok: true,
          code: 'OK',
          message: '连接成功。',
          runtimeMode: 'real' as RuntimeMode,
        };
      } catch (error) {
        return {
          ok: false,
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '连接失败。',
          runtimeMode: 'mock' as RuntimeMode,
        };
      }
    });

    ipcMain.handle(settingsChannels.setShortcut, async (_event, shortcut: string) => {
      if (HARNESS_ENABLED) {
        currentShortcut = shortcut || hotkeyService.defaultShortcut;
        applyHarnessSettings({ shortcut: currentShortcut });
        return { shortcut: currentShortcut };
      }

      currentShortcut = shortcut || hotkeyService.defaultShortcut;
      await secureConfigService.saveSettings({ shortcut: currentShortcut });
      registerShortcut(currentShortcut);
      return { shortcut: currentShortcut };
    });

    ipcMain.handle(settingsChannels.showOverlay, async () => {
      await startNativeCaptureSelection();
      return { visible: false };
    });
    ipcMain.handle(settingsChannels.showMainWindow, () => {
      windowManager.hidePopupWindow();
      return windowManager.showMainWindow();
    });
    ipcMain.handle(settingsChannels.hidePopupWindow, () => windowManager.hidePopupWindow());
    ipcMain.handle(settingsChannels.showPopupWindow, () => windowManager.showPopupWindow());
    ipcMain.handle(settingsChannels.showCaptureWindow, async () => {
      await startNativeCaptureSelection();
      return { visible: false };
    });
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
      const cancelled = regionCaptureService.cancelNativeSelection();
      windowManager.hideCaptureWindow();
      if (cancelled) {
        return { visible: false };
      } else {
        windowManager.getCaptureWindow()?.webContents.send(settingsChannels.captureCancelled, { filePath: null, message: '截图已取消。' });
      }
      notifyCaptureWindowClosed('closed', '截图窗口已关闭。');
      windowManager.showMainWindow();
      return { visible: false };
    });
    ipcMain.handle(settingsChannels.submitCaptureSelection, async (_event, payload: CaptureSelectionPayload) => executeCaptureSelection(payload));

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const nextRendererUrl = await getRendererUrl();
        windowManager.setRendererBaseUrl(nextRendererUrl);
        createMainWindow(nextRendererUrl);
      }
    });
  } catch (error) {
    console.error('[bootstrap] Electron startup failed', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  harnessServer?.close();
  harnessServer = null;
  if (rendererServer) {
    rendererServer.kill();
    rendererServer = null;
  }
});

app.on('will-quit', () => {
  hotkeyService.unregisterAll();
});
