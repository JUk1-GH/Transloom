import { AppShell } from '@/components/ui/app-shell';
import { Card } from '@/components/ui/card';
import { getHistorySummary, listHistoryRecords } from '@/server/history/service';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function truncate(value: string, length: number) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length)}…`;
}

export default async function HistoryPage() {
  const [summary, records] = await Promise.all([getHistorySummary(), listHistoryRecords()]);
  const latestRecord = records[0] ?? null;
  const successfulCount = records.filter((record) => record.success).length;
  const providerCount = new Set(records.map((record) => record.provider)).size;

  return (
    <AppShell title='历史记录' description='把文本翻译和截屏翻译放在同一个时间线里查看，优先展示当前本地数据。'>
      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <div className='rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm'>
          <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>Total runs</p>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{summary.total}</p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm'>
          <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>Text translations</p>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{summary.text}</p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm'>
          <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>Screenshot runs</p>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{summary.screenshot}</p>
        </div>
        <div className='rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm'>
          <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>Providers seen</p>
          <p className='mt-2 text-2xl font-semibold text-slate-900'>{providerCount}</p>
        </div>
      </section>

      <section className='grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_340px]'>
        <Card title='最近翻译时间线' eyebrow='Timeline'>
          <div className='space-y-3'>
            {records.length === 0 ? (
              <div className='rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-slate-500'>
                还没有本地翻译历史。先去文本翻译或截屏翻译页面跑一条记录。
              </div>
            ) : null}
            {records.map((record) => (
              <article key={record.id} className='rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='flex flex-wrap items-center gap-2 text-xs text-slate-500'>
                    <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700'>
                      {record.mode === 'screenshot' ? 'Screenshot' : 'Text'}
                    </span>
                    <span>{record.provider}</span>
                    <span>{record.success ? 'Success' : 'Failed'}</span>
                  </div>
                  <p className='text-xs text-slate-400'>{formatDate(record.createdAt)}</p>
                </div>

                <div className='mt-3 grid gap-3 lg:grid-cols-2'>
                  <div>
                    <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>Source</p>
                    <p className='mt-2 text-sm leading-6 text-slate-700'>{truncate(record.sourceText, 180)}</p>
                  </div>
                  <div>
                    <p className='text-xs uppercase tracking-[0.16em] text-slate-500'>Translation</p>
                    <p className='mt-2 text-sm leading-6 text-slate-700'>{truncate(record.translatedText, 180)}</p>
                  </div>
                </div>

                <div className='mt-3 flex flex-wrap gap-2 text-xs text-slate-500'>
                  <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>{record.sourceLang ?? 'Auto detect'}</span>
                  <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>{record.targetLang ?? 'Target pending'}</span>
                  <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>{record.charactersUsed ?? record.translatedText.length} chars</span>
                  {record.screenshotPath ? <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>Overlay asset ready</span> : null}
                </div>
              </article>
            ))}
          </div>
        </Card>

        <div className='grid gap-5'>
          <Card title='历史摘要' eyebrow='Snapshot'>
            <div className='space-y-3 text-sm text-slate-600'>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>Latest run：{latestRecord ? formatDate(latestRecord.createdAt) : 'No records'}</div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>Successful：{successfulCount}</div>
              <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3'>Storage mode：Local-first</div>
            </div>
          </Card>

          <Card title='下一步可扩展能力' eyebrow='Roadmap'>
            <ul className='space-y-3'>
              <li>- 增加按 provider、模式、语言对历史筛选。</li>
              <li>- 为截图翻译补充缩略图和 overlay 元数据。</li>
              <li>- 增加收藏、重译与历史检索。</li>
            </ul>
          </Card>
        </div>
      </section>
    </AppShell>
  );
}
