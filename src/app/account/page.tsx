import Link from 'next/link';
import { AppShell } from '@/components/ui/app-shell';
import { getGlossarySummary } from '@/server/glossary/service';
import { getHistorySummary } from '@/server/history/service';
import { getUsageSummary } from '@/server/usage/service';

export default async function AccountPage() {
  const [historySummary, glossarySummary, usageSummary] = await Promise.all([
    getHistorySummary(),
    getGlossarySummary(),
    getUsageSummary(),
  ]);

  return (
    <AppShell title='账户'>
      <section className='flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-white'>
        <div className='flex shrink-0 items-center justify-between gap-3 border-b border-[#ececec] px-4 py-3'>
          <div className='min-w-0'>
            <div className='text-[15px] font-medium text-[#111111]'>本地账户</div>
            <div className='mt-1 text-sm text-[#5f5f5f]'>单用户、本机只读摘要、无真实登录链路。</div>
          </div>
          <div className='shrink-0 rounded-full border border-[#d7d7d7] bg-[#f5f5f5] px-3 py-1 text-[11px] font-medium text-[#666666]'>local mode</div>
        </div>

        <div className='grid shrink-0 gap-px border-b border-[#ececec] bg-[#e7e7e7] sm:grid-cols-2 xl:grid-cols-4'>
          <div className='bg-[#fbfbfb] px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]'>Identity</div>
            <div className='mt-1.5 truncate text-[15px] font-medium text-[#111111]'>local@transloom.app</div>
          </div>
          <div className='bg-[#fbfbfb] px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]'>History</div>
            <div className='mt-1.5 text-[21px] font-medium leading-none text-[#111111]'>{historySummary.total}</div>
          </div>
          <div className='bg-[#fbfbfb] px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]'>Glossary</div>
            <div className='mt-1.5 text-[21px] font-medium leading-none text-[#111111]'>{glossarySummary.entries}</div>
          </div>
          <div className='bg-[#fbfbfb] px-4 py-3'>
            <div className='text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]'>Usage</div>
            <div className='mt-1.5 text-sm font-medium text-[#111111]'>
              {usageSummary.monthlyCharacters} 字符 / {usageSummary.requestCount} 次
            </div>
          </div>
        </div>

        <div className='grid min-h-0 flex-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)]'>
          <section className='flex min-h-0 flex-col rounded-[12px] border border-[#e6e6e6] bg-[#fafafa]'>
            <div className='flex items-center justify-between gap-2 border-b border-[#ececec] px-3 py-2.5'>
              <div className='text-sm font-medium text-[#111111]'>当前边界</div>
              <div className='text-[11px] uppercase tracking-[0.12em] text-[#767676]'>本地优先</div>
            </div>
            <div className='space-y-3 px-3 py-3 text-sm text-[#555555]'>
              <p className='leading-6 text-[#4f4f4f]'>账户页只保留本机数据摘要，不承接 SaaS 登录、团队席位或订阅管理。</p>
              <div className='grid gap-2 sm:grid-cols-3'>
                <div className='rounded-[10px] border border-[#ebebeb] bg-white px-3 py-2.5'>历史记录：{historySummary.total} 条</div>
                <div className='rounded-[10px] border border-[#ebebeb] bg-white px-3 py-2.5'>术语表：{glossarySummary.glossaries} 个 / {glossarySummary.entries} 条</div>
                <div className='rounded-[10px] border border-[#ebebeb] bg-white px-3 py-2.5'>BYOK：按 Provider 单独配置</div>
              </div>
              <div className='grid gap-2 text-[13px] text-[#505050] sm:grid-cols-3'>
                <div className='rounded-[10px] border border-[#e8e8e8] bg-[#f5f5f5] px-3 py-2'>无登录、无团队、无远程同步。</div>
                <div className='rounded-[10px] border border-[#e8e8e8] bg-[#f5f5f5] px-3 py-2'>历史、术语表与用量均来自当前设备。</div>
                <div className='rounded-[10px] border border-[#e8e8e8] bg-[#f5f5f5] px-3 py-2'>切换 provider 与保存密钥请前往设置页。</div>
              </div>
            </div>
          </section>

          <section className='flex min-h-0 flex-col rounded-[12px] border border-[#e6e6e6] bg-[#f7f7f7]'>
            <div className='border-b border-[#e7e7e7] px-3 py-2.5 text-sm font-medium text-[#111111]'>继续前往</div>
            <div className='grid gap-2 px-3 py-3 text-sm text-[#555555]'>
              <Link href='/history' className='flex items-center justify-between rounded-[10px] border border-[#dddddd] bg-white px-3 py-2.5 transition hover:bg-[#fcfcfc]'>
                <span>查看历史</span>
                <span className='text-[12px] text-[#8a8a8a]'>{historySummary.total} 条</span>
              </Link>
              <Link href='/glossary' className='flex items-center justify-between rounded-[10px] border border-[#dddddd] bg-white px-3 py-2.5 transition hover:bg-[#fcfcfc]'>
                <span>查看术语表</span>
                <span className='text-[12px] text-[#8a8a8a]'>{glossarySummary.glossaries} 组</span>
              </Link>
              <Link href='/billing' className='flex items-center justify-between rounded-[10px] border border-[#dddddd] bg-white px-3 py-2.5 transition hover:bg-[#fcfcfc]'>
                <span>查看用量</span>
                <span className='text-[12px] text-[#8a8a8a]'>{usageSummary.requestCount} 次</span>
              </Link>
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
