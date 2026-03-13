'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { label: '翻译工作区', href: '/', match: ['/', '/translate', '/capture'] },
  { label: '历史记录', href: '/history', match: ['/history'] },
  { label: '术语表', href: '/glossary', match: ['/glossary'] },
  { label: '设置', href: '/settings', match: ['/settings'] },
] as const;

const utilityItems = [
  { label: '用量', href: '/billing' },
  { label: '账户', href: '/account' },
] as const;

function isActive(pathname: string, candidates: readonly string[]) {
  return candidates.some((candidate) => (candidate === '/' ? pathname === '/' || pathname === '/translate' : pathname.startsWith(candidate)));
}

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className='h-screen overflow-hidden bg-[#ececec] text-[#111111]'>
      <div className='flex h-screen w-full flex-col bg-[#ececec]'>
        <header className='drag-region flex h-11 items-center gap-3 border-b border-black/10 bg-[#121212] px-4 pr-4 text-white md:pl-[88px]'>

          <nav className='no-drag hidden min-w-0 items-center gap-1 overflow-x-auto md:flex'>
            {navItems.map((item) => {
              const active = isActive(pathname, item.match);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'rounded-[10px] px-3 py-1.5 text-sm transition',
                    active
                      ? 'bg-[#eff5ff] text-[#0b67d1]'
                      : 'text-white/78 hover:bg-white/8 hover:text-white',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className='no-drag ml-auto hidden items-center gap-2 md:flex'>
            {utilityItems.map((item) => {
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'rounded-[10px] px-3 py-1.5 text-sm transition',
                    active ? 'bg-white/12 text-white' : 'text-white/64 hover:bg-white/8 hover:text-white',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className='ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#0b67d1] text-sm font-semibold'>
              T
            </div>
          </div>
        </header>

        {description ? (
          <div className='border-b border-[#d5dbe3] bg-[#dce6f4] px-4 py-1.5 text-[11px] text-[#42536f]'>
            {description}
          </div>
        ) : null}

        <div className='border-b border-[#d7d7d7] bg-[#ececec] px-4 py-2 md:hidden'>
          <nav className='no-drag flex gap-2 overflow-x-auto pb-1'>
            {navItems.map((item) => {
              const active = isActive(pathname, item.match);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'whitespace-nowrap rounded-[10px] border px-3 py-1.5 text-sm transition',
                    active
                      ? 'border-[#b9c7da] bg-white text-[#0b67d1]'
                      : 'border-[#d0d0d0] bg-[#f4f4f4] text-[#545454] hover:bg-white',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main aria-label={title} className='app-scrollbar flex-1 overflow-auto bg-[#ebebeb]'>
          <div className='h-full p-3 md:p-4'>{children}</div>
        </main>
      </div>
    </div>
  );
}
