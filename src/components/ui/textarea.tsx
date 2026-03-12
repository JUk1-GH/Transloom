import clsx from "clsx";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "min-h-40 w-full rounded-[22px] border border-[rgba(148,163,184,0.18)] bg-[rgba(255,255,255,0.92)] px-4 py-3 text-sm text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.92)_inset,0_12px_30px_rgba(15,23,42,0.05)] outline-none placeholder:text-slate-400 transition focus:border-[#93c5fd] focus:shadow-[0_0_0_4px_rgba(191,219,254,0.55),0_18px_36px_rgba(15,23,42,0.08)]",
        className,
      )}
      {...props}
    />
  );
}
