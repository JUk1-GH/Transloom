'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { desktopClient } from '@/lib/ipc/desktop-client';

type NavIconProps = {
  active?: boolean;
};

function TranslateIcon({ active = false }: NavIconProps) {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M2.5 3.5H8.5' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M5.5 3.5V4.2C5.5 6.85 4.15 9.35 2 10.85' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' strokeLinejoin='round' />
      <path d='M3.3 7.75C4 8.75 4.95 9.65 6.1 10.35' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' strokeLinejoin='round' />
      <path d='M9.5 3L12.8 12.8' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M8.55 10.15H13.45' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
    </svg>
  );
}

function GlossaryIcon({ active = false }: NavIconProps) {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M4 2.5H11.2C12.08 2.5 12.8 3.22 12.8 4.1V13.5H4.8C4.14 13.5 3.6 12.96 3.6 12.3V3.7C3.6 3.04 4.14 2.5 4.8 2.5H11.2Z' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinejoin='round' />
      <path d='M5.6 5.2H10.4' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M5.6 7.9H9.6' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M3.6 12H12.8' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
    </svg>
  );
}

function HistoryIcon({ active = false }: NavIconProps) {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M3.1 7.9A4.9 4.9 0 1 0 4.6 4.4' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' strokeLinejoin='round' />
      <path d='M2.6 2.9V5.4H5.1' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' strokeLinejoin='round' />
      <path d='M8 5.25V8.15L9.95 9.35' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function SettingsIcon({ active = false }: NavIconProps) {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 4.95A3.05 3.05 0 1 0 8 11.05A3.05 3.05 0 1 0 8 4.95Z' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} />
      <path d='M8 2V3.2' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M8 12.8V14' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M14 8H12.8' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M3.2 8H2' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M11.9 4.1L11.05 4.95' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M4.95 11.05L4.1 11.9' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M11.9 11.9L11.05 11.05' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
      <path d='M4.95 4.95L4.1 4.1' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
    </svg>
  );
}

function PermissionIcon({ active = false }: NavIconProps) {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 2.3L12 3.8V7.65C12 10.15 10.47 12.33 8 13.6C5.53 12.33 4 10.15 4 7.65V3.8L8 2.3Z' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinejoin='round' />
      <path d='M6.25 7.95L7.35 9.05L9.9 6.45' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function AccountIcon({ active = false }: NavIconProps) {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 8A2.25 2.25 0 1 0 8 3.5A2.25 2.25 0 1 0 8 8Z' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} />
      <path d='M3.3 13.1C3.95 11.45 5.7 10.4 8 10.4C10.3 10.4 12.05 11.45 12.7 13.1' stroke='currentColor' strokeWidth={active ? '1.8' : '1.5'} strokeLinecap='round' />
    </svg>
  );
}

const navItems = [
  { label: '翻译', href: '/', match: ['/', '/translate'], icon: TranslateIcon },
  { label: '术语表', href: '/glossary', match: ['/glossary'], icon: GlossaryIcon },
  { label: '历史记录', href: '/history', match: ['/history'], icon: HistoryIcon },
  { label: '设置', href: '/settings', match: ['/settings'], icon: SettingsIcon },
  { label: '权限', href: '/permissions', match: ['/permissions'], icon: PermissionIcon },
] as const;

const utilityItems = [
  { label: '账户', href: '/account', icon: AccountIcon },
] as const;

function isActive(pathname: string, candidates: readonly string[]) {
  return candidates.some((candidate) => (candidate === '/' ? pathname === '/' || pathname === '/translate' : pathname.startsWith(candidate)));
}

export function AppShell({
  title,
  description,
  children,
  contentClassName,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const [headerStatus, setHeaderStatus] = useState<{
    label: string;
    tone: 'success' | 'warning' | 'neutral';
    detail: string;
  }>({
    label: '正常运行',
    tone: 'success',
    detail: '当前桌面运行状态正常。',
  });

  useEffect(() => {
    let cancelled = false;

    async function syncHeaderStatus() {
      if (!desktopClient.isAvailable()) {
        if (!cancelled) {
          setHeaderStatus({
            label: '浏览器预览',
            tone: 'neutral',
            detail: '当前是浏览器预览环境，系统权限检测只在 Electron 桌面端可用。',
          });
        }
        return;
      }

      const capabilitiesRequest = desktopClient.getCapabilities();
      const capabilities = capabilitiesRequest ? await capabilitiesRequest.catch(() => null) : null;
      if (cancelled || !capabilities) {
        return;
      }

      const missingAccessibility = !capabilities.accessibility.granted;
      const missingScreenRecording = !capabilities.screenRecording?.granted;

      if (missingAccessibility || missingScreenRecording) {
        setHeaderStatus({
          label: '未开启权限',
          tone: 'warning',
          detail: '检测到系统权限未开启，部分功能可能不可正常使用。',
        });
        return;
      }

      setHeaderStatus({
        label: '正常运行',
        tone: 'success',
        detail: '当前桌面运行状态正常。',
      });
    }

    void syncHeaderStatus();
    window.addEventListener('focus', syncHeaderStatus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', syncHeaderStatus);
    };
  }, [pathname]);

  return (
    <div className='h-screen overflow-hidden bg-[#fafafa] text-[#111111]'>
      <div className='flex h-screen w-full flex-col bg-[#fafafa]'>
        <header className='drag-region flex h-10 items-center justify-between border-b border-[#d9d9d9] bg-[rgba(250,250,250,0.82)] px-4 text-[#4c4c4c] backdrop-blur-md'>
          <div className='flex items-center pl-[78px]'>
            <span className='text-[12px] font-medium text-[#666666]'>Transloom</span>
          </div>

          <div
            className={clsx(
              'no-drag flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium',
              headerStatus.tone === 'warning'
                ? 'border-[#efc1bc] bg-[#fff1ef] text-[#be4b44]'
                : headerStatus.tone === 'neutral'
                  ? 'border-[#d9d9d9] bg-white text-[#6a6a6a]'
                  : 'border-[#cae9d5] bg-[#effaf3] text-[#27895b]',
            )}
            title={headerStatus.detail}
          >
            <span className='relative flex h-2 w-2 items-center justify-center'>
              <span
                className={clsx(
                  'absolute inline-flex h-2 w-2 rounded-full',
                  headerStatus.tone === 'warning'
                    ? 'bg-[#f4c1bc]'
                    : headerStatus.tone === 'neutral'
                      ? 'bg-[#d9d9d9]'
                      : 'bg-[#b8efc6]',
                )}
              />
              <span
                className={clsx(
                  'relative inline-flex h-[6px] w-[6px] rounded-full',
                  headerStatus.tone === 'warning'
                    ? 'bg-[#de5b54]'
                    : headerStatus.tone === 'neutral'
                      ? 'bg-[#8f8f8f]'
                      : 'bg-[#19b86d]',
                )}
              />
            </span>
            {headerStatus.label}
          </div>
        </header>

        <div className='flex min-h-0 flex-1'>
          <aside className='hidden w-[200px] shrink-0 flex-col border-r border-[#d9d9d9] bg-[#f5f5f5] px-3 py-4 md:flex'>
            <nav className='no-drag flex flex-col gap-1'>
              {navItems.map((item) => {
                const active = isActive(pathname, item.match);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-[8px] border px-3 py-2 text-[14px] font-medium transition-colors duration-150',
                      active
                        ? 'border-[#d5d5d5] bg-[#e9e9eb] text-[#191919] shadow-[0_1px_1px_rgba(0,0,0,0.04)]'
                        : 'border-transparent text-[#585c63] hover:bg-[#ececed] hover:text-[#202226]',
                    )}
                  >
                    <span className='flex h-4 w-4 items-center justify-center text-current'>
                      <Icon active={active} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className='no-drag mt-auto flex flex-col gap-1 pt-5'>
              {utilityItems.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-[8px] border px-3 py-2 text-[14px] font-medium transition-colors duration-150',
                      active
                        ? 'border-[#d5d5d5] bg-[#e9e9eb] text-[#191919] shadow-[0_1px_1px_rgba(0,0,0,0.04)]'
                        : 'border-transparent text-[#585c63] hover:bg-[#ececed] hover:text-[#202226]',
                    )}
                  >
                    <span className='flex h-4 w-4 items-center justify-center text-current'>
                      <Icon active={active} />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
            <div className='border-b border-[#d9d9d9] bg-[#f5f5f5] px-4 py-2 md:hidden'>
              <nav className='no-drag flex gap-2 overflow-x-auto pb-1'>
                {[...navItems, ...utilityItems].map((item) => {
                  const active = 'match' in item ? isActive(pathname, item.match) : pathname.startsWith(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href as never}
                      className={clsx(
                        'inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border px-3 py-1.5 text-sm font-medium transition',
                        active
                          ? 'border-[#d0d0d0] bg-white text-[#1e1e1f]'
                          : 'border-[#e0e0e0] bg-[#fafafa] text-[#565a61] hover:bg-white',
                      )}
                    >
                      <span className='flex h-4 w-4 items-center justify-center text-current'>
                        <Icon active={active} />
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {description ? (
              <div className='border-b border-[#e0e4ea] bg-[#eef4fb] px-5 py-2 text-[11px] text-[#48607f]'>
                {description}
              </div>
            ) : null}

            <main aria-label={title} className='app-scrollbar flex-1 overflow-auto bg-white'>
              <div className={clsx('h-full p-5 md:p-6', contentClassName)}>{children}</div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
