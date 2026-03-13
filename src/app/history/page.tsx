import { AppShell } from '@/components/ui/app-shell';
import { getHistorySummary, listHistoryRecords } from '@/server/history/service';

const MODE_FILTERS = [
  { value: 'all', label: '全部模式' },
  { value: 'text', label: '文本翻译' },
  { value: 'screenshot', label: '截图翻译' },
] as const;

const STATUS_FILTERS = [
  { value: 'all', label: '全部状态' },
  { value: 'success', label: '仅成功' },
  { value: 'failed', label: '仅失败' },
] as const;

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

type HistorySearchParams = {
  mode?: string;
  provider?: string;
  status?: string;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<HistorySearchParams>;
}) {
  const [summary, records, resolvedSearchParams] = await Promise.all([
    getHistorySummary(),
    listHistoryRecords(),
    searchParams ?? Promise.resolve<HistorySearchParams>({}),
  ]);
  const providerCount = new Set(records.map((record) => record.provider)).size;
  const providers = Array.from(new Set(records.map((record) => record.provider))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  );
  const selectedMode = MODE_FILTERS.some((option) => option.value === resolvedSearchParams.mode)
    ? resolvedSearchParams.mode
    : 'all';
  const selectedStatus = STATUS_FILTERS.some((option) => option.value === resolvedSearchParams.status)
    ? resolvedSearchParams.status
    : 'all';
  const selectedProvider =
    resolvedSearchParams.provider && providers.includes(resolvedSearchParams.provider)
      ? resolvedSearchParams.provider
      : 'all';
  const filteredRecords = records.filter((record) => {
    if (selectedMode !== 'all' && record.mode !== selectedMode) {
      return false;
    }

    if (selectedProvider !== 'all' && record.provider !== selectedProvider) {
      return false;
    }

    if (selectedStatus === 'success' && !record.success) {
      return false;
    }

    if (selectedStatus === 'failed' && record.success) {
      return false;
    }

    return true;
  });

  return (
    <AppShell title='历史记录'>
      <div className='flex h-full min-h-0 flex-col'>
        <section className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#dddddd] px-3 py-2'>
            <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
              <div className='text-[14px] font-medium text-[#111111]'>最近翻译</div>
              <div className='rounded-full border border-[#d7d7d7] bg-white px-2 py-0.5 text-[10px] text-[#666666]'>当前 {filteredRecords.length} 条</div>
            </div>
            <div className='flex flex-wrap items-center gap-1 text-[10px] text-[#5f5f5f]'>
              <div className='rounded-full border border-[#d7d7d7] bg-white px-2 py-0.5'>总 {summary.total}</div>
              <div className='rounded-full border border-[#d7d7d7] bg-white px-2 py-0.5'>文本 {summary.text}</div>
              <div className='rounded-full border border-[#d7d7d7] bg-white px-2 py-0.5'>截图 {summary.screenshot}</div>
              <div className='rounded-full border border-[#d7d7d7] bg-white px-2 py-0.5'>Provider {providerCount}</div>
            </div>
          </div>

          <form className='grid shrink-0 grid-cols-2 gap-1.5 border-b border-[#dddddd] bg-white px-3 py-2 text-[11px] text-[#666666] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-center'>
            <label className='flex min-w-0 items-center gap-1'>
              <span className='sr-only'>模式</span>
              <select
                name='mode'
                defaultValue={selectedMode}
                className='h-7 w-full min-w-0 rounded-[9px] border border-[#d8d8d8] bg-[#fafafa] px-2.5 text-[12px] text-[#111111] outline-none transition focus:border-[#b8b8b8]'
              >
                {MODE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className='flex min-w-0 items-center gap-1'>
              <span className='sr-only'>Provider</span>
              <select
                name='provider'
                defaultValue={selectedProvider}
                className='h-7 w-full min-w-0 rounded-[9px] border border-[#d8d8d8] bg-[#fafafa] px-2.5 text-[12px] text-[#111111] outline-none transition focus:border-[#b8b8b8]'
              >
                <option value='all'>全部 Provider</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>

            <label className='col-span-2 flex min-w-0 items-center gap-1 md:col-span-1'>
              <span className='sr-only'>状态</span>
              <select
                name='status'
                defaultValue={selectedStatus}
                className='h-7 w-full min-w-0 rounded-[9px] border border-[#d8d8d8] bg-[#fafafa] px-2.5 text-[12px] text-[#111111] outline-none transition focus:border-[#b8b8b8]'
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type='submit'
              className='h-7 rounded-[9px] bg-[#111111] px-3 text-[12px] font-medium text-white transition hover:bg-[#222222]'
            >
              筛选
            </button>

            <a
              href='/history'
              className='inline-flex h-7 items-center justify-center rounded-[9px] border border-[#d8d8d8] px-3 text-[12px] text-[#555555] transition hover:border-[#bcbcbc] hover:text-[#111111]'
            >
              清除
            </a>
          </form>

          {filteredRecords.length === 0 ? (
            <div className='px-4 py-8 text-sm text-[#666666]'>当前筛选下没有记录，换个条件试试看。</div>
          ) : (
            <>
              <div className='shrink-0 border-b border-[#dddddd] bg-[#fbfbfb] px-4 py-1 text-[11px] text-[#7a7a7a]'>
                {selectedMode === 'all' && selectedProvider === 'all' && selectedStatus === 'all'
                  ? `显示全部 ${filteredRecords.length} 条记录`
                  : `筛选后显示 ${filteredRecords.length} 条记录`}
              </div>
              <div className='custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2'>
                <div className='grid gap-2 lg:grid-cols-2'>
                  {filteredRecords.map((record) => (
                    <article
                      key={record.id}
                      className='grid gap-2 rounded-[12px] border border-[#dddddd] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                    >
                      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#555555]'>
                        <div className='font-medium text-[#111111]'>{record.mode === 'screenshot' ? '截图翻译' : '文本翻译'}</div>
                        <div>{formatDate(record.createdAt)}</div>
                        <div className='rounded-full border border-[#e0e0e0] bg-[#f7f7f7] px-1.5 py-0.5 text-[10px] text-[#5d5d5d]'>
                          {record.provider}
                        </div>
                        <div
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            record.success
                              ? 'bg-[#eef6ee] text-[#2f6b3b]'
                              : 'bg-[#fbecec] text-[#9f3c3c]'
                          }`}
                        >
                          {record.success ? '成功' : '失败'}
                        </div>
                      </div>

                      <div className='grid gap-2 md:grid-cols-2'>
                        <div className='space-y-1'>
                          <div className='text-[11px] text-[#7a7a7a]'>原文</div>
                          <div className='rounded-[10px] bg-[#f7f7f7] px-2.5 py-2 text-[12px] leading-5 text-[#333333]'>
                            {truncate(record.sourceText, 96)}
                          </div>
                        </div>

                        <div className='space-y-1'>
                          <div className='text-[11px] text-[#7a7a7a]'>译文</div>
                          <div className='rounded-[10px] bg-[#f7f7f7] px-2.5 py-2 text-[12px] leading-5 text-[#333333]'>
                            {truncate(record.translatedText, 96)}
                          </div>
                        </div>
                      </div>

                      <div className='flex flex-wrap gap-1.5 text-[11px] text-[#6d6d6d]'>
                        <span>{record.sourceLang ?? '自动检测'}</span>
                        <span>→</span>
                        <span>{record.targetLang ?? '未设置'}</span>
                        <span>·</span>
                        <span>{record.charactersUsed ?? record.translatedText.length} 字</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
