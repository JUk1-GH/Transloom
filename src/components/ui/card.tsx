import type { ReactNode } from 'react';
import clsx from 'clsx';

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
    <section className={clsx('rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]', className)}>
      <div className='border-b border-[#dddddd] px-4 py-3'>
        {eyebrow ? <p className='text-[11px] text-[#787878]'>{eyebrow}</p> : null}
        <h2 className='mt-0.5 text-[15px] font-medium text-[#111111]'>{title}</h2>
      </div>
      <div className='px-4 py-4 text-sm leading-6 text-[#535353]'>{children}</div>
    </section>
  );
}
