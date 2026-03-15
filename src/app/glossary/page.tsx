'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return {
    message: text.trim() || `接口返回了 ${response.status}，但没有可读取的 JSON 内容。`,
  };
}

type GlossarySummary = {
  id: string;
  name: string;
  entries: number;
  sourceLang: string;
  targetLang: string;
  updatedAt: string;
};

type GlossaryEntry = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceLang: string;
  targetLang: string;
  sourceTerm: string;
  targetTerm: string;
};

type StatusTone = 'neutral' | 'success' | 'error';

const defaultCreateForm = {
  name: '软件界面',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  sourceTerm: 'Settings',
  targetTerm: '设置',
};

const defaultRuleForm = {
  sourceTerm: '',
  targetTerm: '',
};

const languageLabels: Record<string, string> = {
  en: '英语',
  'zh-CN': '中文',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
};

function formatLanguageLabel(value: string) {
  const normalized = value.trim();
  return languageLabels[normalized] ?? (normalized || '未知');
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || '刚刚';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

function SearchIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <circle cx='7.1' cy='7.1' r='4.85' stroke='currentColor' strokeWidth='1.4' />
      <path d='M10.6 10.6L13.5 13.5' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 3.2V12.8' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
      <path d='M3.2 8H12.8' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width='15' height='15' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M13.2 5.7V2.9H10.4' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M13 7.2A5 5 0 1 0 8.1 13' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width='12' height='12' viewBox='0 0 12 12' fill='none' aria-hidden='true'>
      <circle cx='6' cy='6' r='4.8' stroke='currentColor' strokeWidth='1.2' />
      <path d='M4.05 6.15L5.35 7.45L7.95 4.75' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
      <path d='M2.3 11.7L4.9 11.1L10.75 5.25L8.75 3.25L2.9 9.1L2.3 11.7Z' stroke='currentColor' strokeWidth='1.2' strokeLinejoin='round' />
      <path d='M7.95 4.05L9.95 6.05' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>
      <path d='M2.9 4.1H11.1' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M5.1 2.7H8.9' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M4.3 4.1V10.4C4.3 10.84 4.66 11.2 5.1 11.2H8.9C9.34 11.2 9.7 10.84 9.7 10.4V4.1' stroke='currentColor' strokeWidth='1.2' strokeLinejoin='round' />
      <path d='M5.9 5.8V9.4' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
      <path d='M8.1 5.8V9.4' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
    </svg>
  );
}

function getStatusClassName(tone: StatusTone) {
  switch (tone) {
    case 'success':
      return 'border-[#d5eadc] bg-[#f3fbf6] text-[#256443]';
    case 'error':
      return 'border-[#ecd2d2] bg-[#fff5f5] text-[#9a3e3e]';
    default:
      return 'border-[#e2e4e8] bg-[#fafafa] text-[#5f6672]';
  }
}

export default function GlossaryPage() {
  const [summaries, setSummaries] = useState<GlossarySummary[]>([]);
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGlossaryId, setSelectedGlossaryId] = useState('');
  const [message, setMessage] = useState('正在加载本地术语表...');
  const [statusTone, setStatusTone] = useState<StatusTone>('neutral');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [showCreateComposer, setShowCreateComposer] = useState(false);
  const [showRuleComposer, setShowRuleComposer] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [ruleForm, setRuleForm] = useState(defaultRuleForm);

  async function loadGlossary() {
    const response = await fetch('/api/glossary', { cache: 'no-store' });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(payload.message ?? payload.code ?? '加载术语表失败');
    }

    return {
      summaries: payload.summaries ?? [],
      entries: payload.entries ?? [],
    };
  }

  const refreshGlossary = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const payload = await loadGlossary();
      setSummaries(payload.summaries);
      setEntries(payload.entries);
      setStatusTone('success');
      setMessage(payload.summaries.length > 0 ? '术语表已同步到本地。' : '还没有术语表，先创建一个吧。');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : '加载术语表失败。';
      setSummaries([]);
      setEntries([]);
      setLoadError(nextMessage);
      setStatusTone('error');
      setMessage(nextMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGlossary();
  }, [refreshGlossary]);

  useEffect(() => {
    if (!summaries.length) {
      if (selectedGlossaryId) {
        setSelectedGlossaryId('');
      }
      return;
    }

    const hasCurrentSelection = summaries.some((summary) => summary.id === selectedGlossaryId);
    if (!selectedGlossaryId || !hasCurrentSelection) {
      setSelectedGlossaryId(summaries[0].id);
    }
  }, [selectedGlossaryId, summaries]);

  const filteredSummaries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return summaries;
    }

    return summaries.filter((summary) => {
      const haystack = [
        summary.name,
        formatLanguageLabel(summary.sourceLang),
        formatLanguageLabel(summary.targetLang),
        summary.sourceLang,
        summary.targetLang,
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }, [searchQuery, summaries]);

  const activeSummary = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredSummaries.find((summary) => summary.id === selectedGlossaryId) ?? filteredSummaries[0] ?? null;
    }

    return summaries.find((summary) => summary.id === selectedGlossaryId) ?? summaries[0] ?? null;
  }, [filteredSummaries, searchQuery, selectedGlossaryId, summaries]);

  const activeEntries = useMemo(() => {
    if (!activeSummary) {
      return [];
    }

    return entries.filter((entry) => entry.glossaryId === activeSummary.id);
  }, [activeSummary, entries]);

  const totalRulesLabel = activeSummary ? `${activeSummary.entries} 条规则` : '0 条规则';
  const hasSearchResults = filteredSummaries.length > 0;

  function handleToggleCreateComposer() {
    setLoadError(null);
    setShowCreateComposer((current) => !current);
    setShowRuleComposer(false);
    setMessage('创建一个新术语表，并同时添加第一条规则。');
    setStatusTone('neutral');
  }

  function handleToggleRuleComposer() {
    setLoadError(null);
    setShowRuleComposer((current) => !current);
    setShowCreateComposer(false);
    setMessage('为当前术语表新增一条精确匹配规则。');
    setStatusTone('neutral');
  }

  async function handleCreateGlossary() {
    const payload = {
      name: createForm.name.trim(),
      sourceLang: createForm.sourceLang.trim(),
      targetLang: createForm.targetLang.trim(),
      sourceTerm: createForm.sourceTerm.trim(),
      targetTerm: createForm.targetTerm.trim(),
    };

    if (!payload.name || !payload.sourceLang || !payload.targetLang || !payload.sourceTerm || !payload.targetTerm) {
      setLoadError(null);
      setStatusTone('error');
      setMessage('术语表名称、语言对和第一条规则都是必填项。');
      return;
    }

    setIsSubmitting(true);
    setLoadError(null);

    try {
      const response = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message ?? result.code ?? '创建术语表失败');
      }

      setSummaries(result.summaries ?? []);
      setEntries(result.entries ?? []);
      setSelectedGlossaryId(result.created?.id ?? result.summaries?.[0]?.id ?? '');
      setCreateForm(defaultCreateForm);
      setShowCreateComposer(false);
      setLoadError(null);
      setStatusTone('success');
      setMessage(`已创建“${payload.name}”，并添加第一条规则。`);
    } catch (error) {
      setLoadError(null);
      setStatusTone('error');
      setMessage(error instanceof Error ? error.message : '创建术语表失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddRule() {
    if (!activeSummary) {
      setLoadError(null);
      setStatusTone('error');
      setMessage('请先选择一个术语表，再添加新规则。');
      return;
    }

    const payload = {
      glossaryId: activeSummary.id,
      sourceTerm: ruleForm.sourceTerm.trim(),
      targetTerm: ruleForm.targetTerm.trim(),
    };

    if (!payload.sourceTerm || !payload.targetTerm) {
      setLoadError(null);
      setStatusTone('error');
      setMessage('原文术语和译文术语都不能为空。');
      return;
    }

    setIsAddingRule(true);
    setLoadError(null);

    try {
      const response = await fetch('/api/glossary/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(result.message ?? result.code ?? '新增术语规则失败');
      }

      setSummaries(result.summaries ?? []);
      setEntries(result.entries ?? []);
      setRuleForm(defaultRuleForm);
      setShowRuleComposer(false);
      setLoadError(null);
      setStatusTone('success');
      setMessage(`已将“${payload.sourceTerm}”添加到 ${activeSummary.name}。`);
    } catch (error) {
      setLoadError(null);
      setStatusTone('error');
      setMessage(error instanceof Error ? error.message : '新增术语规则失败。');
    } finally {
      setIsAddingRule(false);
    }
  }

  function handleImportPlaceholder() {
    setLoadError(null);
    setStatusTone('neutral');
    setMessage('JSON/CSV 导入入口已预留，下一步可以继续接线。');
  }

  function handleRowAction(action: 'edit' | 'delete') {
    setLoadError(null);
    setStatusTone('neutral');
    setMessage(action === 'edit' ? '术语规则的行内编辑还在下一步完善。' : '删除功能暂未接线，所以你的数据不会被改动。');
  }

  return (
    <AppShell title='术语表'>
      <div className='flex h-full min-h-0 flex-col'>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-4'>
          <div>
            <h1 className='text-[24px] font-semibold tracking-[-0.03em] text-[#262626]'>术语表</h1>
          </div>

          <Button
            onClick={handleToggleCreateComposer}
            className='rounded-[12px] border-[#2b2d31] bg-[#2b2d31] px-4 text-[14px] text-white hover:border-[#1f2023] hover:bg-[#1f2023]'
          >
            <PlusIcon />
            新建术语表
          </Button>
        </div>

        <div className='grid min-h-0 flex-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]'>
          <section className='flex min-h-[580px] flex-col rounded-[18px] border border-[#d9dbe1] bg-[#fafafa] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
            <div className='mb-4 flex h-12 items-center rounded-[12px] border border-[#d8dbe2] bg-white px-3 text-[#9ba1ab] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]'>
              <SearchIcon />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder='搜索术语表...'
                className='h-full border-0 bg-transparent px-2 text-[15px] text-[#30343b] shadow-none focus:border-0 focus-visible:ring-0'
              />
            </div>

            {showCreateComposer ? (
              <div className='mb-4 rounded-[14px] border border-[#d9dbe1] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
                <div className='mb-3'>
                  <div className='text-[14px] font-medium text-[#1f2329]'>创建术语表</div>
                  <div className='mt-1 text-[12px] text-[#7a818c]'>一步创建术语表，并同时录入第一条精确匹配规则。</div>
                </div>

                <div className='grid gap-2'>
                  <Input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder='术语表名称'
                    className='h-10 rounded-[10px] border-[#d8dbe2]'
                  />

                  <div className='grid gap-2 sm:grid-cols-2'>
                    <Input
                      value={createForm.sourceLang}
                      onChange={(event) => setCreateForm((current) => ({ ...current, sourceLang: event.target.value }))}
                      placeholder='源语言'
                      className='h-10 rounded-[10px] border-[#d8dbe2]'
                    />
                    <Input
                      value={createForm.targetLang}
                      onChange={(event) => setCreateForm((current) => ({ ...current, targetLang: event.target.value }))}
                      placeholder='目标语言'
                      className='h-10 rounded-[10px] border-[#d8dbe2]'
                    />
                  </div>

                  <div className='grid gap-2 sm:grid-cols-2'>
                    <Input
                      value={createForm.sourceTerm}
                      onChange={(event) => setCreateForm((current) => ({ ...current, sourceTerm: event.target.value }))}
                      placeholder='原文术语'
                      className='h-10 rounded-[10px] border-[#d8dbe2]'
                    />
                    <Input
                      value={createForm.targetTerm}
                      onChange={(event) => setCreateForm((current) => ({ ...current, targetTerm: event.target.value }))}
                      placeholder='译文术语'
                      className='h-10 rounded-[10px] border-[#d8dbe2]'
                    />
                  </div>

                  <div className='flex items-center justify-end gap-2 pt-1'>
                    <Button variant='ghost' onClick={handleToggleCreateComposer}>
                      取消
                    </Button>
                    <Button
                      onClick={() => void handleCreateGlossary()}
                      disabled={isSubmitting}
                      className='rounded-[10px] border-[#2b2d31] bg-[#2b2d31] text-white hover:border-[#1f2023] hover:bg-[#1f2023]'
                    >
                      {isSubmitting ? '创建中...' : '创建'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className='app-scrollbar min-h-0 flex-1 space-y-2 overflow-auto pr-1'>
              {isLoading ? (
                <div className='rounded-[14px] border border-[#d9dbe1] bg-white px-4 py-3 text-[13px] text-[#7a818c]'>
                  正在加载术语表...
                </div>
              ) : null}

              {!isLoading && !hasSearchResults ? (
                <div className='rounded-[14px] border border-dashed border-[#d9dbe1] bg-white px-4 py-5 text-[13px] text-[#7a818c]'>
                  {searchQuery.trim() ? '没有匹配当前搜索的术语表。' : '还没有术语表，点击“新建术语表”开始添加。'}
                </div>
              ) : null}

              {!isLoading ? filteredSummaries.map((summary) => {
                const active = summary.id === activeSummary?.id;

                return (
                  <button
                    key={summary.id}
                    type='button'
                    onClick={() => {
                      setSelectedGlossaryId(summary.id);
                      setShowRuleComposer(false);
                    }}
                    className={
                      active
                        ? 'w-full rounded-[14px] border border-[#d9dbe1] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                        : 'w-full rounded-[14px] border border-transparent px-4 py-3 text-left transition hover:border-[#e0e2e7] hover:bg-white'
                    }
                  >
                    <div className='text-[15px] font-medium text-[#20242b]'>{summary.name}</div>
                    <div className='mt-1 text-[13px] text-[#636975]'>
                      {formatLanguageLabel(summary.sourceLang)} {'→'} {formatLanguageLabel(summary.targetLang)}
                    </div>
                    <div className='mt-3 text-[12px] text-[#a0a5ae]'>{summary.entries} 条规则</div>
                  </button>
                );
              }) : null}
            </div>
          </section>

          <section className='flex min-h-[580px] min-w-0 flex-col rounded-[18px] border border-[#d9dbe1] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
            {activeSummary ? (
              <>
                <div className='flex flex-wrap items-start justify-between gap-4'>
                  <div className='min-w-0'>
                    <h2 className='truncate text-[18px] font-semibold text-[#262a31]'>{activeSummary.name}</h2>
                    <div className='mt-2 flex flex-wrap items-center gap-3 text-[13px] text-[#696f7a]'>
                      <span>{formatLanguageLabel(activeSummary.sourceLang)} {'→'} {formatLanguageLabel(activeSummary.targetLang)}</span>
                      <span className='text-[#c1c5cc]'>•</span>
                      <span>最近更新 {formatUpdatedAt(activeSummary.updatedAt)}</span>
                      <button
                        type='button'
                        onClick={() => void refreshGlossary()}
                        className='inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#8b919b] transition hover:bg-[#f3f4f6] hover:text-[#2b2f36]'
                        aria-label='刷新术语表'
                      >
                        <RefreshIcon />
                      </button>
                    </div>
                  </div>

                  <Button
                    variant='secondary'
                    onClick={handleImportPlaceholder}
                    className='h-auto min-h-[56px] rounded-[12px] border-[#d8dbe2] bg-[#fafafa] px-5 py-2 text-[13px] leading-tight text-[#2b2f36] hover:bg-white'
                  >
                    <span className='text-center'>
                      导入
                      <br />
                      JSON/CSV
                    </span>
                  </Button>
                </div>

                <div className='mt-4 h-px bg-[#e6e8ec]' />

                {showRuleComposer ? (
                  <div className='mt-4 rounded-[14px] border border-[#d9dbe1] bg-[#fafafa] p-3'>
                    <div className='mb-3 text-[14px] font-medium text-[#1f2329]'>新增规则</div>
                    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
                      <Input
                        value={ruleForm.sourceTerm}
                        onChange={(event) => setRuleForm((current) => ({ ...current, sourceTerm: event.target.value }))}
                        placeholder='原文术语'
                        className='h-10 rounded-[10px] border-[#d8dbe2]'
                      />
                      <Input
                        value={ruleForm.targetTerm}
                        onChange={(event) => setRuleForm((current) => ({ ...current, targetTerm: event.target.value }))}
                        placeholder='译文术语'
                        className='h-10 rounded-[10px] border-[#d8dbe2]'
                      />
                      <div className='flex items-center gap-2'>
                        <Button variant='ghost' onClick={handleToggleRuleComposer}>
                          取消
                        </Button>
                        <Button onClick={() => void handleAddRule()} disabled={isAddingRule}>
                          {isAddingRule ? '保存中...' : '保存规则'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className='mt-5 min-h-0 flex-1 overflow-hidden rounded-[16px] border border-[#d9dbe1] bg-[#fafafa]'>
                  <div className='grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_120px_96px] border-b border-[#dde0e6] bg-[#f6f7f8] px-4 py-3 text-[11px] uppercase tracking-[0.08em] text-[#6e7480]'>
                    <div>原文术语</div>
                    <div>译文术语</div>
                    <div>状态</div>
                    <div className='text-right'>操作</div>
                  </div>

                  <div className='app-scrollbar h-full overflow-auto'>
                    {activeEntries.length > 0 ? activeEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className='grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_120px_96px] items-center border-b border-[#eceef2] px-4 py-3 text-[14px] text-[#2d3138] last:border-b-0'
                      >
                        <div className='truncate pr-4'>{entry.sourceTerm}</div>
                        <div className='truncate pr-4'>{entry.targetTerm}</div>
                        <div>
                          <span className='inline-flex items-center gap-1 rounded-full border border-[#bfe5cf] bg-[#ecfbf2] px-2.5 py-1 text-[12px] text-[#23945c]'>
                            <CheckIcon />
                            生效中
                          </span>
                        </div>
                        <div className='flex items-center justify-end gap-1'>
                          <button
                            type='button'
                            onClick={() => handleRowAction('edit')}
                            className='inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#959ba6] transition hover:bg-white hover:text-[#2d3138]'
                            aria-label='编辑规则'
                          >
                            <EditIcon />
                          </button>
                          <button
                            type='button'
                            onClick={() => handleRowAction('delete')}
                            className='inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#959ba6] transition hover:bg-white hover:text-[#2d3138]'
                            aria-label='删除规则'
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className='px-4 py-8 text-[14px] text-[#737a86]'>
                        还没有规则，先为这个术语表添加第一条。
                      </div>
                    )}
                  </div>
                </div>

                <div className='mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px]'>
                  <span className='text-[#7a818c]'>显示 {activeEntries.length} / {activeSummary.entries} 条规则</span>
                  <button
                    type='button'
                    onClick={handleToggleRuleComposer}
                    className='font-medium text-[#1659ff] transition hover:text-[#0d44c8]'
                  >
                    新增规则
                  </button>
                </div>
              </>
            ) : (
              <div className='flex h-full items-center justify-center rounded-[16px] border border-dashed border-[#d9dbe1] bg-[#fafafa] px-6 text-center'>
                <p className='text-[14px] text-[#727985]'>请选择一个术语表来编辑它的规则。</p>
              </div>
            )}

            <div className={`mt-4 rounded-[12px] border px-3.5 py-2.5 text-[13px] ${getStatusClassName(statusTone)}`}>
              {loadError ?? message}
            </div>
          </section>
        </div>

        <div className='mt-4 flex items-center justify-between gap-3 text-[12px] text-[#8a909a]'>
          <span>{summaries.length} 个术语表</span>
          <span>共 {entries.length} 条规则</span>
        </div>
      </div>
    </AppShell>
  );
}
