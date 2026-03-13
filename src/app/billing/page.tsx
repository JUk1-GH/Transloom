import Link from 'next/link';
import { AppShell } from '@/components/ui/app-shell';
import { getBillingSummary } from '@/server/billing/service';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export default async function BillingPage() {
  const summary = await getBillingSummary();

  return (
    <AppShell title='用量'>
      <div className='flex h-full min-h-0 flex-col gap-2.5'>
        <section className='grid shrink-0 gap-px overflow-hidden rounded-[14px] border border-[#d4d4d4] bg-[#d4d4d4] md:grid-cols-3'>
          <div className='bg-white px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]'>计划</div>
            <div className='mt-1 text-[27px] font-medium leading-none text-[#111111]'>{summary.plan}</div>
          </div>
          <div className='bg-white px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]'>月字符数</div>
            <div className='mt-1 text-[27px] font-medium leading-none text-[#111111]'>{formatNumber(summary.monthlyCharacters)}</div>
          </div>
          <div className='bg-white px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]'>请求次数</div>
            <div className='mt-1 text-[27px] font-medium leading-none text-[#111111]'>{formatNumber(summary.requestCount)}</div>
          </div>
        </section>

        <section className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='flex shrink-0 items-center justify-between gap-2 border-b border-[#dddddd] px-4 py-2.5'>
            <div>
              <div className='text-[15px] font-medium text-[#111111]'>本地版边界</div>
              <div className='mt-0.5 text-[12px] text-[#666666]'>保留本地用量与 BYOK 状态，不再连接旧的在线结账流程。</div>
            </div>
            <div className='rounded-full border border-[#d7d7d7] bg-white px-2.5 py-1 text-[11px] text-[#666666]'>本地优先</div>
          </div>

          <div className='custom-scrollbar min-h-0 flex-1 overflow-y-auto'>
            <div className='grid gap-2.5 p-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.9fr)]'>
              <section className='rounded-[12px] border border-[#d8d8d8] bg-white px-4 py-3.5'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <div className='text-sm font-medium text-[#111111]'>当前边界</div>
                    <div className='mt-1 text-[13px] leading-5 text-[#666666]'>桌面版只展示本地统计与 Provider 状态，在线订阅与 Checkout 已完全收口。</div>
                  </div>
                </div>

                <div className='mt-3 rounded-[10px] border border-[#e3d7b6] bg-[#fbf7ec] px-3 py-2 text-[13px] leading-5 text-[#7a6931]'>
                  `/api/billing/checkout` 固定返回 `410`，避免误连到旧的在线结账链路。
                </div>

                <div className='mt-3 grid gap-2 sm:grid-cols-3'>
                  <div className='rounded-[10px] bg-[#f6f6f6] px-3 py-2.5'>
                    <div className='text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]'>订阅</div>
                    <div className='mt-1 text-sm text-[#2f2f2f]'>{summary.subscriptionStatus}</div>
                  </div>
                  <div className='rounded-[10px] bg-[#f6f6f6] px-3 py-2.5'>
                    <div className='text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]'>BYOK</div>
                    <div className='mt-1 text-sm text-[#2f2f2f]'>{summary.byokEnabled ? '已启用' : '未启用'}</div>
                  </div>
                  <div className='rounded-[10px] bg-[#f6f6f6] px-3 py-2.5'>
                    <div className='text-[11px] uppercase tracking-[0.08em] text-[#7a7a7a]'>Checkout</div>
                    <div className='mt-1 text-sm text-[#2f2f2f]'>{summary.checkoutReady ? '可用' : '不可用'}</div>
                  </div>
                </div>
              </section>

              <section className='rounded-[12px] border border-[#d8d8d8] bg-white px-3 py-3'>
                <div className='text-sm font-medium text-[#111111]'>相关入口</div>
                <div className='mt-2 space-y-2 text-sm text-[#555555]'>
                  <Link href='/settings' className='flex items-center justify-between rounded-[10px] border border-[#dcdcdc] bg-[#fafafa] px-3 py-2.5 transition hover:bg-white'>
                    <span>Provider 设置</span>
                    <span className='text-[12px] text-[#8a8a8a]'>检查密钥与能力</span>
                  </Link>
                  <Link href='/history' className='flex items-center justify-between rounded-[10px] border border-[#dcdcdc] bg-[#fafafa] px-3 py-2.5 transition hover:bg-white'>
                    <span>历史记录</span>
                    <span className='text-[12px] text-[#8a8a8a]'>查看本地请求痕迹</span>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
