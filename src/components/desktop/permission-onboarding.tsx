'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { desktopClient } from '@/lib/ipc/desktop-client';

export type DesktopCapabilities = {
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
  screenRecording?: {
    granted: boolean;
    status: 'granted' | 'not-granted';
    message: string;
    canOpenSettings?: boolean;
  };
  selectedTextTrigger: {
    available: boolean;
    requiresShortcut: boolean;
  };
};

export function PermissionOnboarding({
  capabilities,
  refreshing,
  onRefreshAction,
  onOpenAccessibilitySettingsAction,
  onOpenScreenRecordingSettingsAction,
  prominent = false,
}: {
  capabilities: DesktopCapabilities | null;
  refreshing?: boolean;
  onRefreshAction?: () => void;
  onOpenAccessibilitySettingsAction?: () => void;
  onOpenScreenRecordingSettingsAction?: () => void;
  prominent?: boolean;
}) {
  const isDevelopmentShell = process.env.NODE_ENV !== 'production';
  const accessibilityGranted = capabilities?.accessibility.granted ?? false;
  const screenRecordingGranted = capabilities?.screenRecording?.granted ?? false;
  const missingPermission = !accessibilityGranted ? 'accessibility' : !screenRecordingGranted ? 'screen-recording' : null;
  const isBrowserPreview = capabilities?.desktopAvailable === false;
  const requiresRelaunch = missingPermission === 'accessibility' && Boolean(capabilities?.desktopAvailable);
  const requiresManualRestart = requiresRelaunch && isDevelopmentShell;
  const canRelaunchInApp = requiresRelaunch && !requiresManualRestart;
  const primaryMessage = missingPermission === 'screen-recording'
    ? (capabilities?.screenRecording?.message ?? '正在检测屏幕录制权限。')
    : (capabilities?.accessibility.message ?? '正在检测辅助功能权限。');
  const canOpenSettings = missingPermission === 'screen-recording'
    ? capabilities?.screenRecording?.canOpenSettings
    : capabilities?.accessibility.canOpenSettings;
  const handleOpenSettings = missingPermission === 'screen-recording'
    ? onOpenScreenRecordingSettingsAction
    : onOpenAccessibilitySettingsAction;

  if (isBrowserPreview) {
    return (
      <div className='flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#d8d8d8] bg-[#f6f6f4] px-3 py-2 text-sm text-[#5f5f5f]'>
        <div className='min-w-0'>
          <span className='font-medium text-[#202020]'>浏览器预览：</span>
          系统级截图、权限检测和打开系统设置只在 Electron 桌面端可用。
        </div>
        <div className='rounded-full border border-[#d8d8d8] bg-white px-2.5 py-0.5 text-[11px] font-medium tracking-[0.08em] text-[#6b6b6b]'>
          Electron only
        </div>
      </div>
    );
  }

  return (
    <Card
      title={missingPermission === 'screen-recording' ? '屏幕录制权限' : '辅助功能权限'}
      eyebrow='权限'
      className='overflow-hidden'
    >
      <div className='space-y-2.5'>
        <div className='rounded-[10px] border border-[#ded7c2] bg-[#fbf7ec] px-3 py-2 text-sm text-[#6b5d2e]'>
          {primaryMessage}
        </div>

        <div className='grid gap-1.5 text-sm text-[#505050] sm:grid-cols-2'>
          <span>1. 打开系统设置</span>
          <span>2. {missingPermission === 'screen-recording' ? '启用屏幕录制' : '启用辅助功能'}</span>
          <span>3. 返回 Transloom</span>
          <span>4. {requiresManualRestart ? '回终端重启' : requiresRelaunch ? '重新打开应用' : '刷新状态'}</span>
        </div>

        {prominent ? (
          <div className='text-sm text-[#555555]'>建议先完成权限设置，再体验完整桌面链路。</div>
        ) : null}

        {requiresRelaunch ? (
          <div className='text-sm text-[#555555]'>
            {requiresManualRestart
              ? '当前是开发模式。请关闭应用后回到终端重新运行 npm run dev:desktop，再检查辅助功能权限状态。'
              : 'macOS 的辅助功能授权在运行中的应用里可能不会立刻刷新，重新打开应用后状态会更准确。'}
          </div>
        ) : null}

        {requiresManualRestart ? (
          <div className='text-sm text-[#555555]'>
            开发模式下系统里需要授权的是 Electron，不是打包后的 Transloom。
          </div>
        ) : null}

        <div className='flex flex-wrap gap-2'>
          {onRefreshAction ? (
            <Button variant='secondary' onClick={onRefreshAction} disabled={refreshing || !capabilities?.desktopAvailable}>
              {refreshing ? '刷新中...' : '刷新状态'}
            </Button>
          ) : null}
          {handleOpenSettings ? (
            <Button onClick={handleOpenSettings} disabled={!capabilities?.desktopAvailable || !canOpenSettings}>
              打开系统设置
            </Button>
          ) : null}
          {canRelaunchInApp ? (
            <Button variant='secondary' onClick={() => void desktopClient.relaunchApp()} disabled={!capabilities?.desktopAvailable}>
              重新打开应用
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
