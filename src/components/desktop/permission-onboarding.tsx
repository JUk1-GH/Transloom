'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type DesktopCapabilities = {
  desktopAvailable: boolean;
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
  onRefresh,
  onOpenAccessibilitySettings,
  onOpenScreenRecordingSettings,
  prominent = false,
}: {
  capabilities: DesktopCapabilities | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenAccessibilitySettings?: () => void;
  onOpenScreenRecordingSettings?: () => void;
  prominent?: boolean;
}) {
  const accessibilityGranted = capabilities?.accessibility.granted ?? false;
  const screenRecordingGranted = capabilities?.screenRecording?.granted ?? false;
  const missingPermission = !accessibilityGranted ? 'accessibility' : !screenRecordingGranted ? 'screen-recording' : null;
  const primaryMessage = missingPermission === 'screen-recording'
    ? (capabilities?.screenRecording?.message ?? '正在检测屏幕录制权限。')
    : (capabilities?.accessibility.message ?? '正在检测辅助功能权限。');
  const canOpenSettings = missingPermission === 'screen-recording'
    ? capabilities?.screenRecording?.canOpenSettings
    : capabilities?.accessibility.canOpenSettings;
  const handleOpenSettings = missingPermission === 'screen-recording'
    ? onOpenScreenRecordingSettings
    : onOpenAccessibilitySettings;

  return (
    <Card title={missingPermission === 'screen-recording' ? '屏幕录制权限' : '辅助功能权限'} eyebrow='权限'>
      <div className='space-y-4'>
        <div className='rounded-[10px] border border-[#ded7c2] bg-[#fbf7ec] px-3.5 py-3 text-sm text-[#6b5d2e]'>
          {primaryMessage}
        </div>

        <ol className='space-y-2 text-sm text-[#505050]'>
          <li>1. 打开系统设置里的“隐私与安全性”。</li>
          <li>2. 启用辅助功能后，才能读取选中文本并拉起小窗。</li>
          <li>3. 启用屏幕录制后，才能进行区域截图翻译。</li>
          <li>4. 回到 Transloom 后点击刷新，确认状态已生效。</li>
        </ol>

        {prominent ? (
          <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3.5 py-3 text-sm text-[#555555]'>
            建议先把权限处理完，再体验完整桌面链路。
          </div>
        ) : null}

        <div className='flex flex-wrap gap-2'>
          {onRefresh ? (
            <Button variant='secondary' onClick={onRefresh} disabled={refreshing || !capabilities?.desktopAvailable}>
              {refreshing ? '刷新中...' : '刷新状态'}
            </Button>
          ) : null}
          {handleOpenSettings ? (
            <Button onClick={handleOpenSettings} disabled={!capabilities?.desktopAvailable || !canOpenSettings}>
              打开系统设置
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
