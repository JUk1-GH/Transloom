import clsx from 'clsx';
import type { TextareaHTMLAttributes } from 'react';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'min-h-40 w-full rounded-[12px] border border-[#d1d1d1] bg-white px-4 py-3 text-sm text-[#111111] outline-none placeholder:text-[#8d8d8d] transition focus:border-[#8cb3f5]',
        className,
      )}
      {...props}
    />
  );
}
