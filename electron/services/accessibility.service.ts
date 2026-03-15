import { shell, systemPreferences } from 'electron';

export type AccessibilityStatus = 'granted' | 'not-granted';
export type MediaPermissionStatus = 'granted' | 'not-granted';

export interface AccessibilitySnapshot {
  granted: boolean;
  status: AccessibilityStatus;
  message: string;
  canOpenSettings: boolean;
}

export interface ScreenRecordingSnapshot {
  granted: boolean;
  status: MediaPermissionStatus;
  message: string;
  canOpenSettings: boolean;
}

function buildAccessibilityMessage(granted: boolean) {
  if (granted) {
    return '已授予辅助功能权限，可使用选中文本后按快捷键弹出翻译小窗。';
  }

  return '未授予辅助功能权限。选中文本后按快捷键弹窗翻译暂不可用，但文本翻译与区域截图仍可继续使用。如果你刚刚已在系统设置中允许 Transloom，请完全退出并重新打开应用后再检查。';
}

function buildScreenRecordingMessage(granted: boolean) {
  if (granted) {
    return '已授予屏幕录制权限，可使用应用内区域框选截图。';
  }

  return '未授予屏幕录制权限。区域截图暂不可用；请先到系统设置中允许 Transloom 进行屏幕录制。';
}

export function createAccessibilityService() {
  return {
    getSnapshot(): AccessibilitySnapshot {
      if (process.platform !== 'darwin') {
        return {
          granted: false,
          status: 'not-granted',
          message: '当前平台未接入辅助功能权限检测；文本翻译与区域截图仍可使用。',
          canOpenSettings: false,
        };
      }

      const granted = systemPreferences.isTrustedAccessibilityClient(false);
      return {
        granted,
        status: granted ? 'granted' : 'not-granted',
        message: buildAccessibilityMessage(granted),
        canOpenSettings: true,
      };
    },
    getScreenRecordingSnapshot(): ScreenRecordingSnapshot {
      if (process.platform !== 'darwin') {
        return {
          granted: false,
          status: 'not-granted',
          message: '当前平台未接入屏幕录制权限检测；区域截图可能不可用。',
          canOpenSettings: false,
        };
      }

      const status = systemPreferences.getMediaAccessStatus('screen');
      const granted = status === 'granted';
      return {
        granted,
        status: granted ? 'granted' : 'not-granted',
        message: buildScreenRecordingMessage(granted),
        canOpenSettings: true,
      };
    },
    async openSettings() {
      if (process.platform !== 'darwin') {
        return { opened: false };
      }

      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return { opened: true };
    },
    async openScreenRecordingSettings() {
      if (process.platform !== 'darwin') {
        return { opened: false };
      }

      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      return { opened: true };
    },
  };
}
