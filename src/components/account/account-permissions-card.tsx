'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { desktopClient } from '@/lib/ipc/desktop-client';
import type { DesktopCapabilities } from '@/components/desktop/permission-onboarding';

function CheckIcon() {
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
      <circle cx='7' cy='7' r='5.7' stroke='currentColor' strokeWidth='1.2' />
      <path d='M4.8 7.1L6.3 8.6L9.2 5.7' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

type PermissionRowProps = {
  accent: string;
  title: string;
  description: string;
  granted: boolean;
  grantedLabel: string;
  pendingLabel: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
};

function PermissionRow({
  accent,
  title,
  description,
  granted,
  grantedLabel,
  pendingLabel,
  actionLabel,
  onAction,
  actionDisabled,
}: PermissionRowProps) {
  return (
    <div className='flex items-center justify-between gap-4 py-3'>
      <div className='flex min-w-0 items-start gap-3'>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} />
        <div className='min-w-0'>
          <div className='text-[15px] font-medium text-[#2b2f36]'>{title}</div>
          <div className='mt-0.5 text-[13px] leading-5 text-[#7c838f]'>{description}</div>
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-3'>
        <div
          className={
            granted
              ? 'inline-flex items-center gap-1 rounded-full bg-[#eefbf4] px-3 py-1 text-[13px] font-medium text-[#00a86b]'
              : 'inline-flex items-center rounded-full bg-[#fff6e8] px-3 py-1 text-[13px] font-medium text-[#c17a14]'
          }
        >
          {granted ? (
            <>
              <CheckIcon />
              <span>{grantedLabel}</span>
            </>
          ) : (
            <span>{pendingLabel}</span>
          )}
        </div>

        {actionLabel ? (
          <Button
            variant='secondary'
            size='sm'
            onClick={onAction}
            disabled={actionDisabled}
            className='h-10 rounded-[10px] border-[#d8dbe2] bg-[#f6f6f8] px-4 text-[14px] text-[#6c737f] hover:bg-white'
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function AccountPermissionsCard() {
  const [capabilities, setCapabilities] = useState<DesktopCapabilities | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!desktopClient.isAvailable()) {
        setCapabilities({
          desktopAvailable: false,
          accessibility: {
            granted: false,
            status: 'not-granted',
            message: '桌面权限仅在 Electron 桌面应用中可用。',
          },
          screenRecording: {
            granted: false,
            status: 'not-granted',
            message: '桌面权限仅在 Electron 桌面应用中可用。',
          },
          selectedTextTrigger: {
            available: false,
            requiresShortcut: false,
          },
        });
        return;
      }

      const nextCapabilities = await desktopClient.getCapabilities();
      if (!cancelled && nextCapabilities) {
        setCapabilities(nextCapabilities);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefresh() {
    if (!desktopClient.isAvailable()) {
      return;
    }

    setIsRefreshing(true);
    try {
      const nextCapabilities = await desktopClient.refreshCapabilities();
      if (nextCapabilities) {
        setCapabilities(nextCapabilities);
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  const screenGranted = capabilities?.screenRecording?.granted ?? false;
  const accessibilityGranted = capabilities?.accessibility.granted ?? false;
  const desktopAvailable = capabilities?.desktopAvailable ?? false;
  const screenCanOpenSettings = desktopAvailable && capabilities?.screenRecording?.canOpenSettings !== false;
  const accessibilityCanOpenSettings = desktopAvailable && capabilities?.accessibility?.canOpenSettings !== false;
  const visibleMessage = !screenGranted
    ? capabilities?.screenRecording?.message
    : !accessibilityGranted
      ? capabilities?.accessibility?.message
      : null;

  return (
    <section className='rounded-[22px] border border-[#d9dbe1] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h2 className='text-[18px] font-semibold text-[#2a2e35]'>桌面权限</h2>
        </div>

        <Button
          variant='secondary'
          size='sm'
          onClick={() => void handleRefresh()}
          disabled={!desktopAvailable || isRefreshing}
          className='h-10 rounded-[10px] border-[#d8dbe2] bg-[#f6f6f8] px-4 text-[14px] text-[#6c737f] hover:bg-white'
        >
          {isRefreshing ? '刷新中...' : '刷新'}
        </Button>
      </div>

      <div className='mt-5 divide-y divide-[#eceef2]'>
        <PermissionRow
          accent='bg-[#10c67e]'
          title='屏幕录制'
          description='截图翻译需要此权限。'
          granted={screenGranted}
          grantedLabel='已授予'
          pendingLabel='需要处理'
          actionLabel={!screenGranted ? '打开系统设置' : undefined}
          onAction={() => void desktopClient.openScreenRecordingSettings()}
          actionDisabled={!screenCanOpenSettings}
        />

        <PermissionRow
          accent='bg-[#ff9c00]'
          title='辅助功能'
          description='在其他应用中划词翻译需要此权限。'
          granted={accessibilityGranted}
          grantedLabel='已授予'
          pendingLabel='需要处理'
          actionLabel={!accessibilityGranted ? '打开系统设置' : undefined}
          onAction={() => void desktopClient.openAccessibilitySettings()}
          actionDisabled={!accessibilityCanOpenSettings}
        />
      </div>

      {desktopAvailable && capabilities?.appIdentity ? (
        <div className='mt-4 rounded-[14px] border border-[#e5e8ec] bg-[#fafafa] px-4 py-3 text-[12px] leading-6 text-[#6f7682]'>
          <div>
            当前检测对象：{capabilities.appIdentity.isPackaged ? capabilities.appIdentity.appName : 'Electron（开发模式）'}
          </div>
          <div className='break-all text-[#8a909a]'>{capabilities.appIdentity.appPath}</div>
          <div className='mt-1 text-[#8a909a]'>
            如果你在 macOS 里授权的是另一份副本、旧版本，或者不是这一路径下的应用，这里仍然会显示未授权。
          </div>
        </div>
      ) : null}

      {!desktopAvailable ? (
        <div className='mt-4 rounded-[14px] border border-[#e5e8ec] bg-[#fafafa] px-4 py-3 text-[13px] leading-6 text-[#69717d]'>
          请以桌面应用方式打开 Transloom，这样才能检查权限状态并跳转到 macOS 系统设置。
        </div>
      ) : (
        <div className='mt-4 rounded-[14px] border border-[#e5e8ec] bg-[#fafafa] px-4 py-3 text-[12px] leading-5 text-[#8a909a]'>
          权限状态会从当前运行中的桌面应用同步。如果你刚刚改过 macOS 开关，点一次“刷新”即可。
        </div>
      )}

      {visibleMessage ? (
        <div className='mt-4 rounded-[14px] border border-[#f0e1bf] bg-[#fff8ea] px-4 py-3 text-[13px] leading-6 text-[#8f6b1b]'>
          {visibleMessage}
        </div>
      ) : null}
    </section>
  );
}
