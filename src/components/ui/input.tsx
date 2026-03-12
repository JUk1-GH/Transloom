import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'h-10 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-sm text-[#111111] outline-none placeholder:text-[#8d8d8d] transition focus:border-[#8cb3f5] focus:bg-white',
        className,
      )}
      {...props}
    />
  );
}
