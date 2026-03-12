import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'sm';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border border-[#0b67d1] bg-[#0b67d1] text-white hover:border-[#0957b1] hover:bg-[#0957b1]',
  secondary: 'border border-[#d1d1d1] bg-[#f5f5f5] text-[#202020] hover:bg-white',
  ghost: 'border border-transparent bg-transparent text-[#5a5a5a] hover:bg-[#ededed] hover:text-[#111111]',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 rounded-[10px] px-3.5 text-sm',
  sm: 'h-8 rounded-[9px] px-3 text-[13px]',
};

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition disabled:cursor-not-allowed disabled:opacity-55',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
