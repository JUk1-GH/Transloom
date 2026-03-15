import { BrowserWindow, screen } from 'electron';

export function createWindowManager(preloadPath: string) {
  let rendererBaseUrl = '';
  let mainWindow: BrowserWindow | null = null;
  let captureWindow: BrowserWindow | null = null;
  let popupWindow: BrowserWindow | null = null;
  let captureWindowCloseListener: ((reason: 'closed' | 'blurred') => void) | null = null;

  function emitCaptureWindowClosed(reason: 'closed' | 'blurred') {
    captureWindowCloseListener?.(reason);
  }

  function createCaptureWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    captureWindow = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,
      frame: false,
      transparent: true,
      show: false,
      movable: false,
      resizable: false,
      alwaysOnTop: true,
      fullscreenable: false,
      hasShadow: false,
      skipTaskbar: true,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    captureWindow.on('blur', () => {
      if (captureWindow && !captureWindow.isDestroyed() && captureWindow.isVisible()) {
        captureWindow.hide();
        emitCaptureWindowClosed('blurred');
      }
    });

    captureWindow.on('closed', () => {
      captureWindow = null;
      emitCaptureWindowClosed('closed');
    });

    void captureWindow.loadURL(`${rendererBaseUrl}/internal/capture-overlay`);
    return captureWindow;
  }

  function createPopupWindow() {
    popupWindow = new BrowserWindow({
      width: 420,
      height: 520,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#f8fafc',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    popupWindow.on('closed', () => {
      popupWindow = null;
    });

    void popupWindow.loadURL(`${rendererBaseUrl}/popup`);
    return popupWindow;
  }

  return {
    setRendererBaseUrl(url: string) {
      rendererBaseUrl = url;
    },
    onCaptureWindowClosed(listener: (reason: 'closed' | 'blurred') => void) {
      captureWindowCloseListener = listener;
    },
    attachMainWindow(window: BrowserWindow) {
      mainWindow = window;
    },
    getMainWindow() {
      return mainWindow;
    },
    getCaptureWindow() {
      return captureWindow;
    },
    getPopupWindow() {
      return popupWindow;
    },
    showMainWindow() {
      mainWindow?.show();
      mainWindow?.focus();
      return { visible: true };
    },
    showCaptureWindow() {
      const targetDisplay = mainWindow && !mainWindow.isDestroyed()
        ? screen.getDisplayMatching(mainWindow.getBounds())
        : screen.getPrimaryDisplay();
      const window = captureWindow && !captureWindow.isDestroyed() ? captureWindow : createCaptureWindow();
      window.setBounds(targetDisplay.bounds);
      window.show();
      window.focus();
      return { visible: true };
    },
    hideCaptureWindow() {
      captureWindow?.hide();
      return { visible: false };
    },
    showPopupWindow() {
      const window = popupWindow && !popupWindow.isDestroyed() ? popupWindow : createPopupWindow();
      window.show();
      window.focus();
      return { visible: true };
    },
    hidePopupWindow() {
      popupWindow?.hide();
      return { visible: false };
    },
  };
}
