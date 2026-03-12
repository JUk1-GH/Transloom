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
    <AppShell title='账户' description='当前是本地单用户模式，没有真实登录链路。'>
      <section className='grid gap-px overflow-hidden rounded-[14px] border border-[#d4d4d4] bg-[#d4d4d4] md:grid-cols-3'>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>身份</div>
          <div className='mt-2 text-lg font-medium text-[#111111]'>local@transloom.app</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>翻译记录</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{historySummary.total}</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>术语条目</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{glossarySummary.entries}</div>
        </div>
      </section>

      <section className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]'>
        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>当前策略</div>
          <div className='space-y-3 px-4 py-4 text-sm text-[#555555]'>
            <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3'>
              这不是 SaaS 登录页。账户只是本地数据的一个阅读边界。
            </div>
            <div>历史记录：{historySummary.total} 条</div>
            <div>术语表：{glossarySummary.glossaries} 个，{glossarySummary.entries} 条条目</div>
            <div>当月用量：{usageSummary.monthlyCharacters} 字符 / {usageSummary.requestCount} 次请求</div>
          </div>
        </section>

        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>快捷入口</div>
          <div className='space-y-2 px-4 py-4 text-sm text-[#555555]'>
            <Link href='/history' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>查看历史</Link>
            <Link href='/glossary' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>查看术语表</Link>
            <Link href='/billing' className='block rounded-[10px] border border-[#d1d1d1] bg-white px-3 py-2.5 transition hover:bg-[#fafafa]'>查看用量</Link>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
