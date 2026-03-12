import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-10 w-full rounded-[14px] border border-[rgba(148,163,184,0.18)] bg-[rgba(255,255,255,0.94)] px-3.5 text-sm text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_10px_24px_rgba(15,23,42,0.04)] outline-none ring-0 placeholder:text-slate-400 transition focus:border-[#93c5fd] focus:bg-white focus:shadow-[0_0_0_4px_rgba(191,219,254,0.55),0_16px_32px_rgba(15,23,42,0.07)]",
        className,
      )}
      {...props}
    />
  );
}
