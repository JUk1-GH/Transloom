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
        "rounded-[24px] border border-[rgba(148,163,184,0.16)] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl",
        className,
      )}
    >
      {eyebrow ? <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p> : null}
      <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-slate-900">{title}</h2>
      <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}
