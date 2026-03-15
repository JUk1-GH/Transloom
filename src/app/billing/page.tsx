import Link from 'next/link';
import { AppShell } from '@/components/ui/app-shell';
import { getBillingSummary } from '@/server/billing/service';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export default async function BillingPage() {
  const summary = await getBillingSummary();
  const compactStatusItems = [
    { label: 'Plan', value: summary.plan },
    { label: '请求', value: formatNumber(summary.requestCount) },
    { label: '字符', value: formatNumber(summary.monthlyCharacters) },
    { label: 'BYOK', value: summary.byokEnabled ? '已启用' : '未启用' },
    { label: 'Checkout', value: summary.checkoutReady ? '可用' : '只读' },
  ];
  const quickLinks: Array<{
    href: '/settings' | '/history';
    label: string;
    description: string;
    hint: string;
  }> = [
    { href: '/settings', label: 'Provider 设置', description: '检查密钥与运行时', hint: '密钥 / 运行时' },
    { href: '/history', label: '历史记录', description: '查看本地请求痕迹', hint: '请求 / 结果' },
  ];
  const compactNotes = [
    '只确认本机是否仍在记录字符数与请求次数。',
    '字符数异常时先核对 provider 密钥，再确认最近请求是否真正落盘。',
  ];

  return (
    <AppShell title='用量' contentClassName='md:px-3 md:py-3'>
      <div className='flex h-full min-h-0 flex-col gap-1'>
        <section className='grid shrink-0 gap-px overflow-hidden rounded-[14px] border border-[#d9d9d9] bg-[#d9d9d9] md:grid-cols-3'>
          <div className='bg-white px-3 py-1.5'>
            <div className='text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a]'>Plan</div>
            <div className='mt-0.5 text-[18px] font-medium leading-none text-[#111111]'>{summary.plan}</div>
          </div>
          <div className='bg-white px-3 py-1.5'>
            <div className='text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a]'>Monthly chars</div>
            <div className='mt-0.5 text-[18px] font-medium leading-none text-[#111111]'>{formatNumber(summary.monthlyCharacters)}</div>
          </div>
          <div className='bg-white px-3 py-1.5'>
            <div className='text-[10px] uppercase tracking-[0.12em] text-[#7a7a7a]'>Requests</div>
            <div className='mt-0.5 text-[18px] font-medium leading-none text-[#111111]'>{formatNumber(summary.requestCount)}</div>
          </div>
        </section>

        <section className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#d9d9d9] bg-white'>
          <div className='flex shrink-0 items-center justify-between gap-3 border-b border-[#ececec] px-3 py-2'>
            <div className='min-w-0'>
              <div className='text-[14px] font-medium text-[#111111]'>本地用量视图</div>
              <div className='mt-0.5 text-[11px] text-[#666666]'>保留统计、provider 边界与排查入口，不再展开成多块仪表盘。</div>
            </div>
            <div className='shrink-0 rounded-full border border-[#d7d7d7] bg-[#f7f7f7] px-2 py-0.5 text-[10px] font-medium text-[#666666]'>local only</div>
          </div>

          <div className='custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2'>
            <div className='grid gap-1.5'>
              <div className='flex flex-wrap items-center gap-1.5 rounded-[12px] border border-[#ece2c5] bg-[#faf6ec] px-3 py-1.5'>
                <div className='rounded-full border border-[#dfd1ab] bg-[#fffaf0] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[#7a6538]'>Checkout boundary</div>
                <div className='min-w-0 flex-1 text-[12px] leading-5 text-[#6d5a2d]'>`/api/billing/checkout` 固定返回 `410`，桌面版继续保留本地统计，不再承接在线结账。</div>
                <div className='shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#8c7440]'>read only</div>
              </div>

              <div className='rounded-[12px] border border-[#ececec] bg-[#fbfbfb] px-3 py-2'>
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='text-[13px] font-medium text-[#111111]'>当前边界</div>
                    <div className='mt-0.5 text-[11px] text-[#6e6e6e]'>只保留本地统计与两个排查入口，避免用量页再长成网页式后台。</div>
                  </div>
                  <div className='text-[10px] uppercase tracking-[0.12em] text-[#7b7b7b]'>local first</div>
                </div>

                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {compactStatusItems.map((item) => (
                    <div key={item.label} className='rounded-full border border-[#dddddd] bg-white px-2.5 py-1 text-[11px] text-[#565656]'>
                      <span className='text-[#8a8a8a]'>{item.label}</span>
                      <span className='mx-1 text-[#cdcdcd]'>·</span>
                      <span className='font-medium text-[#202020]'>{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className='mt-2 grid gap-1.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
                  <div className='grid gap-1'>
                    {compactNotes.map((note) => (
                      <div key={note} className='flex items-start gap-2 rounded-[10px] border border-[#ececec] bg-white px-2.5 py-1.5 text-[12px] leading-5 text-[#5e5e5e]'>
                        <span className='mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c6c6c6]' />
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>

                  <div className='grid gap-1.5 sm:grid-cols-2'>
                    {quickLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className='rounded-[10px] border border-[#dddddd] bg-white px-3 py-2 text-sm text-[#555555] transition hover:bg-[#fcfcfc]'
                      >
                        <div className='flex items-center gap-2'>
                          <div className='font-medium text-[#202020]'>{link.label}</div>
                          <div className='rounded-full border border-[#e5e5e5] bg-[#f8f8f8] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[#7d7d7d]'>
                            {link.hint}
                          </div>
                        </div>
                        <div className='mt-0.5 flex items-center justify-between gap-2 text-[11px] text-[#8a8a8a]'>
                          <span>{link.description}</span>
                          <span className='text-[12px] text-[#9a9a9a]'>→</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
