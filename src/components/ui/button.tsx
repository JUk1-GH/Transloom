import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "default" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-[#1d4ed8] bg-[#2563eb] text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] hover:border-[#1d4ed8] hover:bg-[#1d4ed8]",
  secondary:
    "border border-[rgba(15,23,42,0.08)] bg-white/92 text-slate-700 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_8px_24px_rgba(15,23,42,0.05)] hover:border-[rgba(15,23,42,0.14)] hover:bg-white",
  ghost:
    "border border-transparent bg-transparent text-slate-500 hover:border-[rgba(15,23,42,0.06)] hover:bg-white/80 hover:text-slate-900",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 rounded-[13px] px-4 text-sm",
  sm: "h-8 rounded-[11px] px-3 text-[13px]",
};

export function Button({
  className,
  variant = "primary",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[-0.01em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
