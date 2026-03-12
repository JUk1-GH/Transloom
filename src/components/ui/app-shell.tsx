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
      <div className="shell-frame mx-auto flex min-h-[calc(100vh-1.25rem)] w-full max-w-[1500px] overflow-hidden rounded-[30px] md:min-h-[calc(100vh-1.5rem)]">
        <aside className="hidden w-full max-w-[228px] flex-col border-r border-[rgba(148,163,184,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(248,250,252,0.92)_100%)] md:flex">
          <div className="border-b border-[rgba(148,163,184,0.14)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#3b82f6_0%,#1d4ed8_100%)] text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)]">
                <LanguagesIcon className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[15px] font-semibold tracking-[-0.03em] text-slate-900">Transloom</span>
                <span className="text-[11px] text-slate-500">Desktop translator</span>
              </div>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="rounded-[20px] border border-[rgba(148,163,184,0.12)] bg-white/72 p-2 shadow-[0_14px_32px_rgba(15,23,42,0.04)] backdrop-blur-xl">
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium tracking-[-0.01em] transition-all duration-150",
                        active
                          ? "bg-[linear-gradient(180deg,rgba(239,246,255,0.98)_0%,rgba(219,234,254,0.96)_100%)] text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.12)]"
                          : "text-slate-500 hover:bg-white hover:text-slate-900",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="mt-auto px-5 pb-5">
            <div className="rounded-[20px] border border-[rgba(148,163,184,0.14)] bg-white/70 px-4 py-3 text-xs leading-5 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
              聚焦文本翻译、截屏翻译与桌面端高频操作。
            </div>
          </div>
        </aside>

        <main className="flex flex-1 flex-col overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.72)_0%,rgba(241,245,249,0.92)_100%)] custom-scrollbar">
          <div className="sticky top-0 z-20 border-b border-[rgba(148,163,184,0.14)] bg-[rgba(250,252,255,0.7)] px-3.5 py-3 backdrop-blur-xl md:px-5">
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
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-[rgba(148,163,184,0.18)] bg-white/90 text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[24px] font-semibold tracking-[-0.04em] text-slate-950 md:text-[28px]">{title}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-[rgba(148,163,184,0.16)] bg-white/80 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.04)] md:flex">
                <span>Focused workspace</span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col p-3.5 md:p-5">
            <div className="grid gap-5">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
