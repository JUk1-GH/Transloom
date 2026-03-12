import Link from 'next/link';
import { AppShell } from '@/components/ui/app-shell';
import { getBillingSummary } from '@/server/billing/service';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export default async function BillingPage() {
  const summary = await getBillingSummary();

  return (
    <AppShell title='用量' description='本地版不走在线结账，只保留用量和 BYOK 边界。'>
      <section className='grid gap-px overflow-hidden rounded-[14px] border border-[#d4d4d4] bg-[#d4d4d4] md:grid-cols-3'>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>计划</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{summary.plan}</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>月字符数</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{formatNumber(summary.monthlyCharacters)}</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>请求次数</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{formatNumber(summary.requestCount)}</div>
        </div>
      </section>

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]'>
        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>本地版边界</div>
          <div className='space-y-3 px-4 py-4 text-sm text-[#555555]'>
            <div className='rounded-[10px] border border-[#e3d7b6] bg-[#fbf7ec] px-3 py-3 text-[#7a6931]'>
              `/api/billing/checkout` 会返回 `410`，避免误连到旧的在线结账链路。
            </div>
            <div>订阅状态：{summary.subscriptionStatus}</div>
            <div>BYOK：{summary.byokEnabled ? '已启用' : '未启用'}</div>
            <div>Checkout：{summary.checkoutReady ? '可用' : '不可用'}</div>
          </div>
        </section>

        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>下一步</div>
          <div className='space-y-2 px-4 py-4 text-sm text-[#555555]'>
            <Link href='/settings' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>查看 Provider 设置</Link>
            <Link href='/history' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>查看历史记录</Link>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
