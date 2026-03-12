import { AppShell } from '@/components/ui/app-shell';
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
  const providerCount = new Set(records.map((record) => record.provider)).size;

  return (
    <AppShell title='历史记录' description='所有文本翻译和截图翻译都会按时间排在这里。'>
      <section className='grid gap-px overflow-hidden rounded-[14px] border border-[#d4d4d4] bg-[#d4d4d4] md:grid-cols-4'>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>总记录</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{summary.total}</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>文本翻译</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{summary.text}</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>截图翻译</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{summary.screenshot}</div>
        </div>
        <div className='bg-white px-4 py-4'>
          <div className='text-xs text-[#7a7a7a]'>Provider 数量</div>
          <div className='mt-2 text-2xl font-medium text-[#111111]'>{providerCount}</div>
        </div>
      </section>

      <section className='overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-[#dddddd] px-4 py-3'>
          <div className='text-[15px] font-medium text-[#111111]'>最近翻译</div>
          <div className='text-sm text-[#666666]'>本地优先存储</div>
        </div>

        {records.length === 0 ? (
          <div className='px-4 py-8 text-sm text-[#666666]'>还没有历史记录，先去跑一条翻译试试看。</div>
        ) : (
          <div className='divide-y divide-[#dddddd]'>
            {records.map((record) => (
              <article key={record.id} className='grid gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]'>
                <div className='space-y-2 text-sm text-[#555555]'>
                  <div className='font-medium text-[#111111]'>{record.mode === 'screenshot' ? '截图翻译' : '文本翻译'}</div>
                  <div>{formatDate(record.createdAt)}</div>
                  <div>{record.provider}</div>
                  <div>{record.success ? '成功' : '失败'}</div>
                </div>

                <div>
                  <div className='text-xs text-[#7a7a7a]'>原文</div>
                  <div className='mt-2 text-sm leading-6 text-[#333333]'>{truncate(record.sourceText, 240)}</div>
                </div>

                <div>
                  <div className='text-xs text-[#7a7a7a]'>译文</div>
                  <div className='mt-2 text-sm leading-6 text-[#333333]'>{truncate(record.translatedText, 240)}</div>
                  <div className='mt-3 flex flex-wrap gap-2 text-xs text-[#6d6d6d]'>
                    <span>{record.sourceLang ?? '自动检测'}</span>
                    <span>→</span>
                    <span>{record.targetLang ?? '未设置'}</span>
                    <span>·</span>
                    <span>{record.charactersUsed ?? record.translatedText.length} 字</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
