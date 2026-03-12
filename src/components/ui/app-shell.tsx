'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { label: '翻译文本', href: '/', match: ['/', '/translate'] },
  { label: '截图翻译', href: '/capture', match: ['/capture'] },
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
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className='min-h-screen bg-[#ececec] text-[#111111]'>
      <div className='flex min-h-screen w-full flex-col bg-[#ececec]'>
        <header className='flex h-12 items-center gap-4 border-b border-black/10 bg-[#121212] px-4 text-white'>

          <nav className='hidden min-w-0 items-center gap-1 overflow-x-auto md:flex'>
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

          <div className='ml-auto hidden items-center gap-2 md:flex'>
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

        <div className='border-b border-[#d5dbe3] bg-[#dce6f4] px-4 py-2 text-xs text-[#42536f]'>
          {description}
        </div>

        <div className='border-b border-[#d7d7d7] bg-[#ececec] px-4 py-2 md:hidden'>
          <nav className='flex gap-2 overflow-x-auto pb-1'>
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
          <div className='min-h-full p-4 md:p-5'>{children}</div>
        </main>
      </div>
    </div>
  );
}
