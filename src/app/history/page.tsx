import { AppShell } from '@/components/ui/app-shell';
import { listHistoryRecords, type HistoryRecord } from '@/server/history/service';

const PROVIDER_LABELS: Record<string, string> = {
  mock: '内置模拟',
  'openai-compatible': '当前服务',
  tencent: '腾讯云',
};

const MODE_FILTERS = [
  { value: 'all', label: '全部模式', icon: 'all' },
  { value: 'text', label: '文本', icon: 'text' },
  { value: 'screenshot', label: '截图', icon: 'screenshot' },
  { value: 'popup', label: '弹窗', icon: 'popup' },
] as const;

const STATUS_FILTERS = [
  { value: 'all', label: '全部状态' },
  { value: 'success', label: '仅成功' },
  { value: 'failed', label: '仅失败' },
] as const;

type HistorySearchParams = {
  mode?: string;
  provider?: string;
  status?: string;
  q?: string;
  filters?: string;
};

function buildHistoryHref(params: {
  mode?: string;
  provider?: string;
  status?: string;
  q?: string;
  filters?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.mode && params.mode !== 'all') {
    searchParams.set('mode', params.mode);
  }

  if (params.provider && params.provider !== 'all') {
    searchParams.set('provider', params.provider);
  }

  if (params.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }

  if (params.q?.trim()) {
    searchParams.set('q', params.q.trim());
  }

  if (params.filters === '1') {
    searchParams.set('filters', '1');
  }

  const query = searchParams.toString();
  return query ? `/history?${query}` : '/history';
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function truncate(value: string, length: number) {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length)}...`;
}

function getFileName(path?: string) {
  if (!path) {
    return '';
  }

  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? path;
}

function getProviderLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function normalizePreviewText(record: HistoryRecord, value: string, kind: 'source' | 'translated') {
  if (record.provider !== 'mock') {
    return value;
  }

  const cleanedValue = value.replace(/^【Mock[^】]*】/, '').trim();

  if (record.mode === 'screenshot' && cleanedValue.startsWith('Mock OCR content from ')) {
    const fileName = cleanedValue.slice('Mock OCR content from '.length).trim();
    return kind === 'source' ? `来自 ${fileName} 的 OCR 预览` : '截图翻译预览';
  }

  return cleanedValue || value;
}

function formatLanguageLabel(value?: string) {
  if (!value) {
    return '自动';
  }

  return value
    .replace('zh-CN', '中文')
    .replace('en', '英文')
    .replace('ja', '日文')
    .replace('ko', '韩文');
}

function getModeLabel(mode: HistoryRecord['mode'] | 'popup') {
  if (mode === 'screenshot') {
    return '截图';
  }

  if (mode === 'popup') {
    return '弹窗';
  }

  return '文本';
}

function ClockIcon() {
  return (
    <svg width='15' height='15' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='8' cy='8' r='6.2' stroke='currentColor' strokeWidth='1.3' />
      <path d='M8 4.6V8L10.3 9.35' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='7.1' cy='7.1' r='4.85' stroke='currentColor' strokeWidth='1.4' />
      <path d='M10.6 10.6L13.5 13.5' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M2.7 3.3H13.3L9.2 8V12.3L6.8 11.1V8L2.7 3.3Z' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
    </svg>
  );
}

function TextModeIcon() {
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
      <rect x='2' y='2.4' width='10' height='3.2' rx='0.8' stroke='currentColor' strokeWidth='1.2' />
      <rect x='2' y='8.2' width='4.2' height='3.2' rx='0.8' stroke='currentColor' strokeWidth='1.2' />
      <rect x='7.8' y='8.2' width='4.2' height='3.2' rx='0.8' stroke='currentColor' strokeWidth='1.2' />
    </svg>
  );
}

function ScreenshotModeIcon() {
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
      <path d='M3 4.7V3.4C3 2.96 3.36 2.6 3.8 2.6H5.1' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M8.9 2.6H10.2C10.64 2.6 11 2.96 11 3.4V4.7' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M11 9.3V10.6C11 11.04 10.64 11.4 10.2 11.4H8.9' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M5.1 11.4H3.8C3.36 11.4 3 11.04 3 10.6V9.3' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
    </svg>
  );
}

function PopupModeIcon() {
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
      <path d='M4.2 2.8V4.55' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M9.8 9.45V11.2' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M2.8 4.2H4.55' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M9.45 9.8H11.2' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M9.45 4.2H11.2' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M2.8 9.8H4.55' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M4.2 9.45V11.2' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M9.8 2.8V4.55' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
    </svg>
  );
}

function ModeIcon({ mode }: { mode: 'all' | HistoryRecord['mode'] | 'popup' }) {
  if (mode === 'screenshot') {
    return <ScreenshotModeIcon />;
  }

  if (mode === 'popup') {
    return <PopupModeIcon />;
  }

  return <TextModeIcon />;
}

function SuccessIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='1.3' />
      <path d='M5.2 8.1L7.05 9.95L10.8 6.2' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='1.3' />
      <path d='M6.1 6.1L9.9 9.9' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <path d='M9.9 6.1L6.1 9.9' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
    </svg>
  );
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<HistorySearchParams>;
}) {
  const [records, resolvedSearchParams] = await Promise.all([
    listHistoryRecords(),
    searchParams ?? Promise.resolve<HistorySearchParams>({}),
  ]);

  const providers = Array.from(new Set(records.map((record) => record.provider))).sort((left, right) =>
    left.localeCompare(right, 'en-US'),
  );

  const selectedMode = MODE_FILTERS.some((option) => option.value === resolvedSearchParams.mode)
    ? resolvedSearchParams.mode ?? 'all'
    : 'all';
  const selectedStatus = STATUS_FILTERS.some((option) => option.value === resolvedSearchParams.status)
    ? resolvedSearchParams.status ?? 'all'
    : 'all';
  const selectedProvider =
    resolvedSearchParams.provider && providers.includes(resolvedSearchParams.provider)
      ? resolvedSearchParams.provider
      : 'all';
  const searchQuery = resolvedSearchParams.q?.trim() ?? '';
  const filtersOpen = resolvedSearchParams.filters === '1';

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

    if (!searchQuery) {
      return true;
    }

    const haystack = [
      record.sourceText,
      record.translatedText,
      record.sourceLang ?? '',
      record.targetLang ?? '',
      getProviderLabel(record.provider),
      getFileName(record.screenshotPath),
      getModeLabel(record.mode),
    ].join(' ').toLowerCase();

    return haystack.includes(searchQuery.toLowerCase());
  });

  const filterToggleHref = buildHistoryHref({
    mode: selectedMode,
    provider: selectedProvider,
    status: selectedStatus,
    q: searchQuery,
    filters: filtersOpen ? undefined : '1',
  });

  return (
    <AppShell title='历史记录'>
      <div className='flex h-full min-h-0 flex-col'>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-4'>
          <div>
            <h1 className='text-[24px] font-semibold tracking-[-0.03em] text-[#262626]'>历史记录</h1>
          </div>

          <div className='flex flex-wrap items-center gap-3'>
            <form action='/history' className='flex items-center gap-3'>
              <input type='hidden' name='mode' value={selectedMode} />
              <input type='hidden' name='provider' value={selectedProvider} />
              <input type='hidden' name='status' value={selectedStatus} />
              {filtersOpen ? <input type='hidden' name='filters' value='1' /> : null}

              <label className='flex h-10 w-[260px] items-center rounded-[12px] border border-[#d9dbe1] bg-white px-3 text-[#9ba1ab] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
                <SearchIcon />
                <input
                  name='q'
                  defaultValue={searchQuery}
                  placeholder='搜索历史记录...'
                  className='h-full w-full border-0 bg-transparent px-2 text-[15px] text-[#30343b] outline-none placeholder:text-[#9ba1ab]'
                />
              </label>
            </form>

            <a
              href={filterToggleHref}
              className='inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#d9dbe1] bg-white px-4 text-[15px] font-medium text-[#424752] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[#cfd3da] hover:bg-[#fafafa]'
            >
              <FilterIcon />
              筛选
            </a>
          </div>
        </div>

        <div className='mb-4 flex flex-wrap items-center gap-2'>
          {MODE_FILTERS.map((option) => {
            const active = selectedMode === option.value;
            const href = buildHistoryHref({
              mode: option.value,
              provider: selectedProvider,
              status: selectedStatus,
              q: searchQuery,
              filters: filtersOpen ? '1' : undefined,
            });

            return (
              <a
                key={option.value}
                href={href}
                className={
                  active
                    ? 'inline-flex h-9 items-center gap-2 rounded-[11px] bg-[#242529] px-4 text-[14px] font-medium text-white'
                    : 'inline-flex h-9 items-center gap-2 rounded-[11px] px-3 text-[14px] font-medium text-[#4c525d] transition hover:bg-[#f3f4f6] hover:text-[#22262d]'
                }
              >
                {option.value === 'all' ? null : <ModeIcon mode={option.value} />}
                {option.label}
              </a>
            );
          })}
        </div>

        {filtersOpen ? (
          <form action='/history' className='mb-4 grid gap-3 rounded-[14px] border border-[#d9dbe1] bg-[#fafafa] p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-end'>
            <input type='hidden' name='mode' value={selectedMode} />
            <input type='hidden' name='q' value={searchQuery} />
            <input type='hidden' name='filters' value='1' />

            <label className='grid gap-1.5 text-[12px] font-medium text-[#6e7480]'>
              服务
              <select
                name='provider'
                defaultValue={selectedProvider}
                className='h-10 rounded-[10px] border border-[#d8dbe2] bg-white px-3 text-[14px] text-[#2c3138] outline-none'
              >
                <option value='all'>全部服务</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {getProviderLabel(provider)}
                  </option>
                ))}
              </select>
            </label>

            <label className='grid gap-1.5 text-[12px] font-medium text-[#6e7480]'>
              状态
              <select
                name='status'
                defaultValue={selectedStatus}
                className='h-10 rounded-[10px] border border-[#d8dbe2] bg-white px-3 text-[14px] text-[#2c3138] outline-none'
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className='flex items-center gap-2 md:justify-end'>
              <button
                type='submit'
                className='inline-flex h-10 items-center justify-center rounded-[11px] bg-[#242529] px-4 text-[14px] font-medium text-white transition hover:bg-[#191a1d]'
              >
                应用
              </button>
              <a
                href={buildHistoryHref({ mode: selectedMode, q: searchQuery, filters: '1' })}
                className='inline-flex h-10 items-center justify-center rounded-[11px] border border-[#d8dbe2] bg-white px-4 text-[14px] font-medium text-[#4f5560] transition hover:bg-[#fafafa]'
              >
                重置
              </a>
            </div>
          </form>
        ) : null}

        <div className='mb-4 h-px bg-[#e6e8ec]' />

        <div className='min-h-0 flex-1 overflow-hidden rounded-[18px] border border-[#d9dbe1] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
          <div className='grid grid-cols-[156px_148px_minmax(320px,1fr)_160px_120px] border-b border-[#dfe2e8] bg-[#f7f7f8] px-6 py-4 text-[11px] uppercase tracking-[0.08em] text-[#6b717c]'>
            <div>时间</div>
            <div>模式</div>
            <div>内容</div>
            <div>服务</div>
            <div>状态</div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className='flex h-full min-h-[320px] items-center justify-center px-6 text-center text-[15px] text-[#707782]'>
              {selectedMode === 'popup'
                ? '弹窗翻译区域已预留，但目前还没有弹窗记录。'
                : '当前搜索条件和筛选条件下没有匹配的历史记录。'}
            </div>
          ) : (
            <div className='app-scrollbar h-full overflow-auto'>
              {filteredRecords.map((record) => {
                const modeLabel = getModeLabel(record.mode);
                const sourcePreview = truncate(normalizePreviewText(record, record.sourceText, 'source'), 110);
                const translatedPreview = truncate(normalizePreviewText(record, record.translatedText, 'translated'), 110);
                const languagePair = `${formatLanguageLabel(record.sourceLang)} → ${formatLanguageLabel(record.targetLang)}`;

                return (
                  <article
                    key={record.id}
                    className='grid grid-cols-[156px_148px_minmax(320px,1fr)_160px_120px] items-start border-b border-[#edf0f3] px-6 py-4 text-[#2b2f36] last:border-b-0'
                  >
                    <div className='flex items-center gap-2 pr-4 text-[14px] text-[#7b818d]'>
                      <ClockIcon />
                      <span>{formatDate(record.createdAt)}</span>
                    </div>

                    <div className='pr-4'>
                      <span className='inline-flex items-center gap-1.5 rounded-full border border-[#e3e5e9] bg-[#f7f7f8] px-3 py-1 text-[13px] text-[#4b5160]'>
                        <ModeIcon mode={record.mode} />
                        {modeLabel}
                      </span>
                    </div>

                    <div className='min-w-0'>
                      <div className='truncate text-[15px] font-medium leading-6 text-[#262a31]'>
                        {sourcePreview}
                      </div>
                      <div className='mt-1 truncate text-[14px] leading-6 text-[#767d89]'>
                        {translatedPreview}
                      </div>
                      <div className='mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa0aa]'>
                        <span>{languagePair}</span>
                        {record.success ? null : <span className='text-[#ba5c5c]'>失败</span>}
                        {record.mode === 'screenshot' && record.screenshotPath ? (
                          <span className='normal-case font-normal tracking-normal text-[#a2a8b2]'>{getFileName(record.screenshotPath)}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className='truncate pr-4 text-[13px] text-[#636a76]'>
                      {getProviderLabel(record.provider)}
                    </div>

                    <div>
                      {record.success ? (
                        <span className='inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1c9c61]'>
                          <SuccessIcon />
                          成功
                        </span>
                      ) : (
                        <span className='inline-flex items-center gap-1.5 text-[13px] font-medium text-[#c05f5f]'>
                          <FailedIcon />
                          失败
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
