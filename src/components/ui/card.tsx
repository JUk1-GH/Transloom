import type { ReactNode } from "react";
import clsx from "clsx";

export function Card({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm",
        className,
      )}
    >
      {eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p> : null}
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">{title}</h2>
      <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}
