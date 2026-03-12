"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

function iconClassName(className?: string) {
  return className ?? "h-4 w-4";
}

function LayoutDashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect x="14" y="10" width="7" height="11" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function LanguagesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)} aria-hidden="true">
      <path d="M4 5h8" />
      <path d="M8 5c0 6-2 10-5 12" />
      <path d="M5 11c1.5 0 4.5.5 7 3" />
      <path d="M15 5h5" />
      <path d="M17.5 5c0 5 1.5 9 3.5 12" />
      <path d="M14 17h8" />
    </svg>
  );
}

function ScanTextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)} aria-hidden="true">
      <path d="M4 7V6a2 2 0 0 1 2-2h1" />
      <path d="M20 7V6a2 2 0 0 0-2-2h-1" />
      <path d="M4 17v1a2 2 0 0 0 2 2h1" />
      <path d="M20 17v1a2 2 0 0 1-2 2h-1" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)} aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BookOpenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)} aria-hidden="true">
      <path d="M12 7v14" />
      <path d="M3 18.5A2.5 2.5 0 0 1 5.5 16H12" />
      <path d="M12 16h6.5A2.5 2.5 0 0 1 21 18.5" />
      <path d="M5.5 4H12v12H5.5A2.5 2.5 0 0 1 3 13.5v-7A2.5 2.5 0 0 1 5.5 4Z" />
      <path d="M18.5 4H12v12h6.5a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 18.5 4Z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={iconClassName(className)} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1 .2l-.2.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1l-.1-.2a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.2-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.7" />
    </svg>
  );
}

const navItems = [
  { label: "首页", href: "/", icon: LayoutDashboardIcon },
  { label: "文本翻译", href: "/translate", icon: LanguagesIcon },
  { label: "截屏翻译", href: "/capture", icon: ScanTextIcon },
  { label: "历史", href: "/history", icon: HistoryIcon },
  { label: "术语表", href: "/glossary", icon: BookOpenIcon },
  { label: "设置", href: "/settings", icon: SettingsIcon },
] as const;

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
    <div className="min-h-screen px-3 py-3 md:px-4 md:py-4">
      <div className="shell-frame mx-auto flex min-h-[calc(100vh-1.25rem)] w-full max-w-[1440px] overflow-hidden rounded-[22px] md:min-h-[calc(100vh-1.5rem)]">
        <aside className="hidden w-full max-w-[208px] flex-col border-r border-slate-200 bg-slate-50/40 md:flex">
          <div className="border-b border-slate-200 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-violet-700 text-white shadow-sm">
                <LanguagesIcon className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-slate-900">Transloom</span>
                <span className="text-[11px] text-slate-500">Desktop translation suite</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-2 py-2.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-violet-50/80 text-violet-700"
                      : "text-slate-500 hover:bg-white hover:text-slate-900",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 px-4 py-2.5 text-xs leading-5 text-slate-500">
            聚焦文本翻译、截屏翻译、历史记录与术语管理。
          </div>
        </aside>

        <main className="flex flex-1 flex-col overflow-y-auto bg-[linear-gradient(180deg,#fafafa_0%,#f8fafc_100%)] custom-scrollbar">
          <div className="flex flex-1 flex-col p-3.5 md:p-4.5">
            <nav className="mb-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
              {navItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-violet-200 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mb-3 border-b border-slate-200 px-1 pb-2.5">
              <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-slate-900">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
            </div>

            <div className="grid gap-5">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
